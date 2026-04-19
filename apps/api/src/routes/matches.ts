/**
 * Match sync routes
 *
 * POST /api/matches/sync-m11c — sync player points directly from M11C (via Netlify blob cache)
 * POST /api/matches/sync      — legacy: fetch CricAPI scorecards, compute points manually
 * GET  /api/matches           — list synced matches for a league
 * PUT  /api/matches/:num/override — manual points override (commissioner only)
 */

import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '@fantasy/db';
import {
  matchScores,
  players,
  leagues,
  leagueMembers,
} from '@fantasy/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseScorecardToStats, calcPlayerPoints, normaliseName } from '@fantasy/scoring';
import type { CricApiScorecard } from '@fantasy/scoring';

// ─── Netlify blob helpers ─────────────────────────────────────────────────────

const NETLIFY_BASE = 'https://auctionipl2026.netlify.app/api/store';
const BLOB_STORE   = 'ipl26a';

async function netlifyGet<T>(key: string): Promise<T | null> {
  const url = `${NETLIFY_BASE}?action=get&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob GET ${key} → ${res.status}`);
  const json = await res.json() as { data?: T };
  return json.data ?? null;
}

// ─── M11C name → our DB player name aliases ───────────────────────────────────
// M11C sometimes uses a slightly different name spelling from our player seed.
const M11C_ALIASES: Record<string, string> = {
  'Lungi Ngidi':           'Lungisani Ngidi',
  'AM Ghazanfar':          'Allah Ghazanfar',
  'Vaibhav Sooryavanshi':  'Vaibhav Suryavanshi',
  'Ryan Rickelton':        'Ryan Rickleton',
  'Digvesh Singh Rathi':   'Digvesh Singh',
  'Philip Salt':           'Phil Salt',
};

interface PlayerRecord {
  id: string;
  name: string;
  role: 'WK' | 'BAT' | 'AR' | 'BOWL' | null;
  aliases: string[];
}

function buildPlayerMap(allPlayers: PlayerRecord[]): Map<string, PlayerRecord> {
  const map = new Map<string, PlayerRecord>();
  for (const p of allPlayers) {
    map.set(p.name.toLowerCase(), p);
    for (const alias of p.aliases) map.set(alias.toLowerCase(), p);
  }
  return map;
}

function resolveM11cPlayer(m11cName: string, playerMap: Map<string, PlayerRecord>): PlayerRecord | undefined {
  const aliased = M11C_ALIASES[m11cName] ?? m11cName;
  return playerMap.get(aliased.toLowerCase()) ?? playerMap.get(m11cName.toLowerCase());
}

export const matchesRouter: Router = Router();

// ─── CricAPI helpers ──────────────────────────────────────────────────────────

const CRICAPI_BASE = 'https://api.cricapi.com/v1';

async function cricFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env['CRICAPI_KEY'];
  if (!key) throw new Error('CRICAPI_KEY env var not set');

  const url = new URL(`${CRICAPI_BASE}/${endpoint}`);
  url.searchParams.set('apikey', key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`CricAPI ${endpoint} returned ${res.status}`);
  const json = await res.json() as { status?: string; data?: T };
  if (json.status && json.status !== 'success') {
    throw new Error(`CricAPI error: ${json.status}`);
  }
  return json.data as T;
}

/** Parse "6th Match" → 6, "1st Match" → 1, etc. */
function extractMatchNumber(name: string): number | null {
  const m = name.match(/(\d+)(?:st|nd|rd|th)\s+Match/i);
  return m ? parseInt(m[1]!, 10) : null;
}

/** Brief sleep to respect CricAPI rate limits between scorecard fetches */
function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// ─── CricAPI player resolver (uses @fantasy/scoring normaliseName) ────────────

function resolvePlayer(
  cricapiName: string,
  playerMap: Map<string, PlayerRecord>,
): PlayerRecord | undefined {
  // 1. Apply built-in scoring package aliases first
  const normalised = normaliseName(cricapiName);
  // 2. Try exact (case-insensitive) match
  return (
    playerMap.get(normalised.toLowerCase()) ??
    playerMap.get(cricapiName.toLowerCase())
  );
}

// ─── POST /api/matches/sync-m11c ─────────────────────────────────────────────
// Pulls player fantasy points directly from M11C (via the Netlify blob cache),
// replacing the CricAPI scorecard download + manual scoring approach.
// Source priority per player-match: M11C popup-cards → manual override in blob.

matchesRouter.post('/sync-m11c', async (req: AuthenticatedRequest, res) => {
  const { leagueId } = req.body as { leagueId?: string };
  if (!leagueId) { res.status(400).json({ error: 'leagueId required' }); return; }

  try {
    const db = getDb();

    // Commissioner check
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }
    if (league.commissionerId !== req.internalUserId) {
      res.status(403).json({ error: 'Only the commissioner can sync scores' }); return;
    }

    // 1. Load all DB players and build lookup map
    const allPlayers = await db
      .select({ id: players.id, name: players.name, role: players.role, aliases: players.aliases })
      .from(players);
    const playerMap = buildPlayerMap(allPlayers);

    // 2. Fetch M11C player index: M11C name → { id, teamId }
    const playerIndex = await netlifyGet<Record<string, { id: number; teamId: number }>>('m11c_player_index');
    if (!playerIndex) {
      res.status(503).json({ error: 'M11C player index not found in blob store' }); return;
    }

    // 3. For each M11C player that maps to one of our DB players,
    //    fetch the per-player popup-card blob: { matches: { "N": pts } }
    const playerScores = new Map<string, Map<number, number>>(); // dbPlayerId → matchNum → pts
    let matched = 0;

    for (const [m11cName, { id: m11cId }] of Object.entries(playerIndex)) {
      const dbPlayer = resolveM11cPlayer(m11cName, playerMap);
      if (!dbPlayer) continue;
      matched++;

      type PlayerBlob = { matches?: Record<string, number> };
      const blob = await netlifyGet<PlayerBlob>(`m11c_player_${m11cId}`);
      if (!blob?.matches) continue;

      const existing = playerScores.get(dbPlayer.id) ?? new Map<number, number>();
      for (const [matchNumStr, pts] of Object.entries(blob.matches)) {
        existing.set(parseInt(matchNumStr, 10), pts);
      }
      playerScores.set(dbPlayer.id, existing);
    }

    // 4. Fetch manual overrides blob: { matchNum: { playerName: { pts } } }
    type OverrideBlob = Record<string, Record<string, { pts: number }>>;
    const overrides = await netlifyGet<OverrideBlob>(`${BLOB_STORE}:manual_overrides`);

    // Build override map: dbPlayerId → matchNum → pts
    const overrideMap = new Map<string, Map<number, number>>();
    if (overrides) {
      for (const [matchNumStr, byPlayer] of Object.entries(overrides)) {
        const matchNum = parseInt(matchNumStr, 10);
        for (const [playerName, { pts }] of Object.entries(byPlayer)) {
          const dbPlayer = resolveM11cPlayer(playerName, playerMap) ?? playerMap.get(playerName.toLowerCase());
          if (!dbPlayer) continue;
          const existing = overrideMap.get(dbPlayer.id) ?? new Map<number, number>();
          existing.set(matchNum, pts);
          overrideMap.set(dbPlayer.id, existing);
        }
      }
    }

    // 5. Collect all unique match numbers across both sources
    const allMatchNums = new Set<number>();
    for (const scores of playerScores.values()) for (const n of scores.keys()) allMatchNums.add(n);
    for (const scores of overrideMap.values()) for (const n of scores.keys()) allMatchNums.add(n);

    if (allMatchNums.size === 0) {
      res.json({ synced: [], matches: 0, players: 0, message: 'No M11C data found in blob store' });
      return;
    }

    // 6. For each match: delete stale rows and insert fresh ones
    const syncedMatches: number[] = [];
    for (const matchNum of [...allMatchNums].sort((a, b) => a - b)) {
      type ScoreRow = {
        leagueId: string; playerId: string; matchNumber: number;
        rawStats: Record<string, unknown>; fantasyPoints: number;
        manualOverridePoints?: number;
      };
      const rows: ScoreRow[] = [];
      const seenPlayerIds = new Set<string>();

      // Players with M11C data for this match
      for (const [playerId, scores] of playerScores) {
        const pts = scores.get(matchNum);
        if (pts === undefined) continue;
        const overridePts = overrideMap.get(playerId)?.get(matchNum);
        rows.push({
          leagueId, playerId, matchNumber: matchNum, rawStats: {},
          fantasyPoints: pts,
          ...(overridePts !== undefined ? { manualOverridePoints: overridePts } : {}),
        });
        seenPlayerIds.add(playerId);
      }

      // Players with only a manual override (no M11C popup-card data)
      for (const [playerId, scores] of overrideMap) {
        if (seenPlayerIds.has(playerId)) continue;
        const overridePts = scores.get(matchNum);
        if (overridePts === undefined) continue;
        rows.push({
          leagueId, playerId, matchNumber: matchNum, rawStats: {},
          fantasyPoints: 0, manualOverridePoints: overridePts,
        });
      }

      if (rows.length === 0) continue;

      await db.delete(matchScores).where(
        and(eq(matchScores.leagueId, leagueId), eq(matchScores.matchNumber, matchNum)),
      );
      await db.insert(matchScores).values(rows);
      syncedMatches.push(matchNum);
    }

    res.json({
      synced: syncedMatches,
      matches: syncedMatches.length,
      players: playerScores.size,
      matched,
      total: Object.keys(playerIndex).length,
      message: `Synced ${syncedMatches.length} matches for ${playerScores.size} players from M11C`,
    });
  } catch (err) {
    console.error('[matches/sync-m11c]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ─── GET /api/matches?leagueId=… ─────────────────────────────────────────────

matchesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const leagueId = req.query['leagueId'] as string | undefined;
  if (!leagueId) {
    res.status(400).json({ error: 'leagueId query param required' });
    return;
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        matchNumber: matchScores.matchNumber,
        syncedAt: matchScores.syncedAt,
      })
      .from(matchScores)
      .where(eq(matchScores.leagueId, leagueId))
      .groupBy(matchScores.matchNumber, matchScores.syncedAt)
      .orderBy(matchScores.matchNumber);

    // Dedupe by matchNumber (take latest syncedAt)
    const byMatch = new Map<number, string>();
    for (const r of rows) {
      byMatch.set(r.matchNumber, r.syncedAt.toISOString());
    }

    res.json({
      matches: Array.from(byMatch.entries()).map(([matchNumber, syncedAt]) => ({
        matchNumber,
        syncedAt,
      })),
    });
  } catch (err) {
    console.error('[matches/get]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/matches/sync ───────────────────────────────────────────────────

interface SyncBody {
  leagueId: string;
}

matchesRouter.post('/sync', async (req: AuthenticatedRequest, res) => {
  const { leagueId } = req.body as SyncBody;
  if (!leagueId) {
    res.status(400).json({ error: 'leagueId required' });
    return;
  }

  try {
    const db = getDb();

    // Commissioner check
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    if (league.commissionerId !== req.internalUserId) {
      res.status(403).json({ error: 'Only the commissioner can sync matches' });
      return;
    }
    if (league.status !== 'ACTIVE' && league.status !== 'COMPLETE') {
      res.status(409).json({ error: 'League must be ACTIVE or COMPLETE to sync matches' });
      return;
    }

    const seriesId = process.env['CRICAPI_SERIES_ID'];
    if (!seriesId) {
      res.status(503).json({ error: 'CRICAPI_SERIES_ID env var not configured' });
      return;
    }

    // 1. Fetch series match list
    interface CricApiMatch {
      id: string;
      name: string;
      matchStarted: boolean;
      matchEnded: boolean;
    }
    interface SeriesInfo {
      matchList?: CricApiMatch[];
    }
    const series = await cricFetch<SeriesInfo>('series_info', { id: seriesId });
    const matchList = series.matchList ?? [];

    // 2. Filter completed matches with parseable match numbers
    const completedMatches = matchList
      .filter(m => m.matchEnded)
      .map(m => ({ ...m, matchNumber: extractMatchNumber(m.name) }))
      .filter((m): m is typeof m & { matchNumber: number } => m.matchNumber !== null)
      .sort((a, b) => a.matchNumber - b.matchNumber);

    if (completedMatches.length === 0) {
      res.json({ synced: [], skipped: [], message: 'No completed matches found' });
      return;
    }

    // 3. Find already-synced match numbers for this league
    const existingRows = await db
      .select({ matchNumber: matchScores.matchNumber })
      .from(matchScores)
      .where(eq(matchScores.leagueId, leagueId));

    const alreadySynced = new Set(existingRows.map(r => r.matchNumber));
    const toSync = completedMatches.filter(m => !alreadySynced.has(m.matchNumber));

    if (toSync.length === 0) {
      res.json({
        synced: [],
        skipped: Array.from(alreadySynced),
        message: 'All completed matches already synced',
      });
      return;
    }

    // 4. Load all players once (for name → DB record lookup)
    const allPlayers = await db
      .select({
        id: players.id,
        name: players.name,
        role: players.role,
        aliases: players.aliases,
      })
      .from(players);

    const playerMap = buildPlayerMap(allPlayers);

    // 5. Sync each new match
    const synced: number[] = [];
    const failed: Array<{ matchNumber: number; error: string }> = [];

    for (const match of toSync) {
      try {
        // Rate-limit: 300ms between fetches
        if (synced.length > 0) await sleep(300);

        // Fetch scorecard
        const scorecard = await cricFetch<CricApiScorecard>('match_scorecard', { id: match.id });

        // Parse stats
        const statsMap = parseScorecardToStats(scorecard);

        // Build DB rows
        const rowsToInsert: Array<{
          leagueId: string;
          playerId: string;
          matchNumber: number;
          rawStats: Record<string, unknown>;
          fantasyPoints: number;
        }> = [];

        for (const [cricapiName, stats] of Object.entries(statsMap)) {
          const dbPlayer = resolvePlayer(cricapiName, playerMap);
          if (!dbPlayer) continue; // Player not in our roster — skip (reserve player etc.)

          // Set pureBowler flag based on roster role
          if (dbPlayer.role === 'BOWL') {
            stats.pureBowler = true;
          }

          const fantasyPoints = calcPlayerPoints(stats);

          rowsToInsert.push({
            leagueId,
            playerId: dbPlayer.id,
            matchNumber: match.matchNumber,
            rawStats: stats as unknown as Record<string, unknown>,
            fantasyPoints,
          });
        }

        if (rowsToInsert.length > 0) {
          // Delete any stale rows for this match+league first (re-sync safety)
          await db
            .delete(matchScores)
            .where(
              and(
                eq(matchScores.leagueId, leagueId),
                eq(matchScores.matchNumber, match.matchNumber),
              ),
            );
          await db.insert(matchScores).values(rowsToInsert);
        }

        synced.push(match.matchNumber);
        console.log(
          `[matches/sync] league=${leagueId} match=${match.matchNumber} players=${rowsToInsert.length}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[matches/sync] match=${match.matchNumber} error:`, msg);
        failed.push({ matchNumber: match.matchNumber, error: msg });
      }
    }

    res.json({
      synced,
      skipped: Array.from(alreadySynced),
      failed,
      message: `Synced ${synced.length} match(es)${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
    });
  } catch (err) {
    console.error('[matches/sync]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ─── PUT /api/matches/:num/override ──────────────────────────────────────────

interface OverrideBody {
  leagueId: string;
  playerId: string;
  points: number;
}

matchesRouter.put('/:matchNumber/override', async (req: AuthenticatedRequest, res) => {
  const matchNumber = parseInt(String(req.params['matchNumber'] ?? ''), 10);
  if (isNaN(matchNumber)) {
    res.status(400).json({ error: 'Invalid match number' });
    return;
  }
  const { leagueId, playerId, points } = req.body as OverrideBody;
  if (!leagueId || !playerId || typeof points !== 'number') {
    res.status(400).json({ error: 'leagueId, playerId, and points (number) required' });
    return;
  }

  try {
    const db = getDb();
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    if (league.commissionerId !== req.internalUserId) {
      res.status(403).json({ error: 'Only the commissioner can override points' });
      return;
    }

    const updated = await db
      .update(matchScores)
      .set({ manualOverridePoints: points, updatedAt: new Date() })
      .where(
        and(
          eq(matchScores.leagueId, leagueId),
          eq(matchScores.playerId, playerId),
          eq(matchScores.matchNumber, matchNumber),
        ),
      )
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: 'No score row found for that match/player/league' });
      return;
    }

    res.json({ updated: updated[0] });
  } catch (err) {
    console.error('[matches/override]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
