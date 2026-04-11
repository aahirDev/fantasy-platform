/**
 * One-time import: drain Netlify Blob match data into match_scores table.
 *
 * Source: https://auctionipl2026.netlify.app (ipl26a store, matches 1–17)
 * Target: match_scores rows in Supabase
 *
 * Usage:
 *   LEAGUE_ID=<uuid> pnpm --filter @fantasy/db import-matches
 *
 * Optional:
 *   NETLIFY_STORE=ipl26a        (default: ipl26a)
 *   MATCH_START=1               (default: 1)
 *   MATCH_END=17                (default: 17)
 *   DRY_RUN=true                (print rows, don't write)
 */

import 'dotenv/config';
import { getDb } from './client.js';
import { matchScores, players } from './schema/index.js';
import { eq, and } from 'drizzle-orm';
import type { CricketPlayerStats } from '@fantasy/scoring';
import { calcPlayerPoints, normaliseName } from '@fantasy/scoring';

// ─── Config ───────────────────────────────────────────────────────────────────

const NETLIFY_BASE = 'https://auctionipl2026.netlify.app/api/store';
const STORE        = process.env['NETLIFY_STORE']  ?? 'ipl26a';
const LEAGUE_ID    = process.env['LEAGUE_ID'];
const MATCH_START  = parseInt(process.env['MATCH_START'] ?? '1', 10);
const MATCH_END    = parseInt(process.env['MATCH_END']   ?? '17', 10);
const DRY_RUN      = process.env['DRY_RUN'] === 'true';

if (!LEAGUE_ID) {
  console.error('Error: LEAGUE_ID env var is required');
  console.error('  e.g.  LEAGUE_ID=<uuid> pnpm --filter @fantasy/db import-matches');
  process.exit(1);
}

// ─── Netlify store helpers ─────────────────────────────────────────────────────

async function blobGet<T>(key: string): Promise<T | null> {
  const url = `${NETLIFY_BASE}?action=get&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob GET ${key} → ${res.status}`);
  const json = await res.json() as { data?: T };
  return json.data ?? null;
}

// ─── Player lookup map ────────────────────────────────────────────────────────

interface PlayerRecord {
  id: string;
  name: string;
  role: 'WK' | 'BAT' | 'AR' | 'BOWL' | null;
  aliases: string[];
}

function buildPlayerMap(all: PlayerRecord[]): Map<string, PlayerRecord> {
  const map = new Map<string, PlayerRecord>();
  for (const p of all) {
    map.set(p.name.toLowerCase(), p);
    for (const alias of p.aliases) map.set(alias.toLowerCase(), p);
  }
  return map;
}

function resolvePlayer(name: string, map: Map<string, PlayerRecord>): PlayerRecord | undefined {
  const normalised = normaliseName(name);
  return map.get(normalised.toLowerCase()) ?? map.get(name.toLowerCase());
}

// ─── Manual overrides ────────────────────────────────────────────────────────

type OverrideMap = Record<string, Record<string, { pts: number; note?: string }>>;

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏏  DraftArena match import`);
  console.log(`   Store  : ${STORE}`);
  console.log(`   Matches: ${MATCH_START}–${MATCH_END}`);
  console.log(`   League : ${LEAGUE_ID}`);
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  const db = getDb();

  // Load all players once
  const allPlayers = await db.select({
    id: players.id,
    name: players.name,
    role: players.role,
    aliases: players.aliases,
  }).from(players);

  const playerMap = buildPlayerMap(allPlayers);
  console.log(`✓ Loaded ${allPlayers.length} players from DB`);

  // Load manual overrides
  const overrides = await blobGet<OverrideMap>(`${STORE}:manual_overrides`);
  const overrideCount = overrides
    ? Object.values(overrides).reduce((n, m) => n + Object.keys(m).length, 0)
    : 0;
  console.log(`✓ Loaded manual overrides (${overrideCount} entries)\n`);

  // Track summary
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalUnmatched = 0;
  const unmatchedNames = new Set<string>();

  for (let matchNum = MATCH_START; matchNum <= MATCH_END; matchNum++) {
    const key = `${STORE}:match_${matchNum}`;
    process.stdout.write(`Match ${String(matchNum).padStart(2, ' ')}  fetching...`);

    const statsMap = await blobGet<Record<string, CricketPlayerStats>>(key);

    if (!statsMap) {
      console.log(`  ⚠  not found (skipped)`);
      continue;
    }

    const entries = Object.entries(statsMap);
    process.stdout.write(`  ${entries.length} players  →  `);

    // Get overrides for this match
    const matchOverrides: Record<string, number> = {};
    if (overrides?.[String(matchNum)]) {
      for (const [playerName, override] of Object.entries(overrides[String(matchNum)]!)) {
        matchOverrides[playerName] = override.pts;
        if (override.note) {
          console.log(`\n     override: ${playerName} → ${override.pts}pts (${override.note})`);
        }
      }
    }

    // Delete existing rows for this match + league (idempotent re-run)
    if (!DRY_RUN) {
      await db.delete(matchScores).where(
        and(
          eq(matchScores.leagueId, LEAGUE_ID!),
          eq(matchScores.matchNumber, matchNum),
        ),
      );
    }

    const rows: Array<{
      leagueId: string;
      playerId: string;
      matchNumber: number;
      rawStats: Record<string, unknown>;
      fantasyPoints: number;
      manualOverridePoints?: number;
    }> = [];

    for (const [cricapiName, stats] of entries) {
      const dbPlayer = resolvePlayer(cricapiName, playerMap);
      if (!dbPlayer) {
        totalUnmatched++;
        unmatchedNames.add(cricapiName);
        continue;
      }

      // Set pureBowler flag from roster role (no duck penalty for BOWL)
      const statsWithRole: CricketPlayerStats = {
        ...stats,
        pureBowler: dbPlayer.role === 'BOWL',
      };

      const fantasyPoints = calcPlayerPoints(statsWithRole);

      // Check manual override (by canonical name or CricAPI name)
      const overridePts =
        matchOverrides[dbPlayer.name] ??
        matchOverrides[cricapiName];

      rows.push({
        leagueId: LEAGUE_ID!,
        playerId: dbPlayer.id,
        matchNumber: matchNum,
        rawStats: statsWithRole as unknown as Record<string, unknown>,
        fantasyPoints,
        ...(overridePts !== undefined ? { manualOverridePoints: overridePts } : {}),
      });
    }

    if (!DRY_RUN && rows.length > 0) {
      await db.insert(matchScores).values(rows);
    }

    totalInserted += rows.length;
    totalSkipped  += entries.length - rows.length;

    console.log(`${rows.length} inserted${rows.length < entries.length ? `, ${entries.length - rows.length} unmatched` : ''}`);

    // Small delay to be polite to the Netlify function
    await new Promise<void>(r => setTimeout(r, 150));
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`✓ Done`);
  console.log(`  Inserted : ${totalInserted} player-match rows`);
  console.log(`  Skipped  : ${totalSkipped} (not in roster)`);

  if (unmatchedNames.size > 0) {
    console.log(`\n⚠  ${unmatchedNames.size} unmatched player names (not in DB roster):`);
    for (const name of [...unmatchedNames].sort()) {
      console.log(`     - ${name}`);
    }
    console.log(`\n  To fix: add the name to the player's "aliases" column in Supabase,`);
    console.log(`  then re-run this script (it deletes+reinserts per match, so it's safe).\n`);
  }

  if (DRY_RUN) {
    console.log(`\n  DRY RUN — no data was written to the database.`);
  }
}

main().catch(err => {
  console.error('\n✗ Import failed:', err);
  process.exit(1);
});
