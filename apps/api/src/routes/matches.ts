/**
 * Match sync routes
 *
 * POST /api/matches/sync   — fetch completed IPL matches from CricAPI, parse
 *                            scorecards, compute fantasy points, upsert match_scores
 * GET  /api/matches        — list synced matches for a league
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

// ─── Build player name → DB record lookup map ─────────────────────────────────

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
    for (const alias of p.aliases) {
      map.set(alias.toLowerCase(), p);
    }
  }
  return map;
}

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
