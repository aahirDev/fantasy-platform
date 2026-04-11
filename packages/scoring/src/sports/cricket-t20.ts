/**
 * My11Circle Season-Long T20 Fantasy Scoring Engine
 *
 * Ported from ipl-fantasy-2026/public/js/engine.js
 * Scoring rules validated against 10+ matches of CricAPI data.
 */

import type {
  CricketPlayerStats,
  CricApiScorecard,
  CricApiBattingRow,
} from '../types';

// ─── Name aliases: CricAPI name → canonical roster name ──────────────────────

const PLAYER_ALIASES: Record<string, string> = {
  'Lungi Ngidi': 'Lungisani Ngidi',
  'Philip Salt': 'Phil Salt',
  'Ryan Rickelton': 'Ryan Rickleton',
  'Vaibhav Sooryavanshi': 'Vaibhav Suryavanshi',
  'AM Ghazanfar': 'Allah Ghazanfar',
  'Digvesh Singh Rathi': 'Digvesh Singh',
};

const REVERSE_ALIASES = Object.fromEntries(
  Object.entries(PLAYER_ALIASES).map(([api, roster]) => [roster, api]),
);

export function normaliseName(name: string, customAliases?: Record<string, string>): string {
  const aliases = { ...PLAYER_ALIASES, ...(customAliases ?? {}) };
  return aliases[name] ?? name;
}

// ─── Core scoring ─────────────────────────────────────────────────────────────

/**
 * Calculate raw fantasy points from a player's match stats.
 * Rules: My11Circle Season-Long Fantasy T20 scoring.
 */
export function calcPlayerPoints(stats: CricketPlayerStats): number {
  if (!stats.played) return 0;
  let pts = 4; // playing XI bonus

  // ── BATTING ──────────────────────────────────────────────────────────────
  const { runs: r, balls, fours, sixes } = stats;
  pts += r;          // 1pt per run
  pts += fours;      // 1pt boundary bonus per four
  pts += sixes * 2;  // 2pt boundary bonus per six

  // Milestone bonuses
  if (r >= 100) pts += 16;
  else if (r >= 50) pts += 8;
  else if (r >= 30) pts += 4;

  // Duck penalty (exempt for pure bowlers)
  if (r === 0 && stats.batted && !stats.pureBowler) pts -= 2;

  // Strike rate bonus/penalty (min 20 runs OR 10 balls for eligibility)
  if (balls > 0) {
    const sr = (r / balls) * 100;
    const eligible46 = r >= 20 || balls >= 10;
    const eligible2 = r >= 30;
    if (eligible46 && sr >= 170) pts += 6;
    else if (eligible46 && sr > 150) pts += 4;
    else if (eligible2 && sr > 130) pts += 2;
    if (balls >= 10 && sr < 60) pts -= 4;
  }

  // ── BOWLING ───────────────────────────────────────────────────────────────
  const { wickets, lbwBowled, maidens, ballsBowled, runsConceded } = stats;
  pts += wickets * 25;
  pts += lbwBowled * 8;
  pts += maidens * 12;

  if (wickets >= 5) pts += 12;
  else if (wickets >= 4) pts += 8;
  else if (wickets >= 3) pts += 4;

  // Economy rate bonus/penalty (min 2 overs = 12 legal balls)
  if (ballsBowled >= 12) {
    const econ = (runsConceded / ballsBowled) * 6;
    if (econ < 5) pts += 6;
    else if (econ < 6) pts += 4;
    else if (econ < 7) pts += 2;
    else if (econ >= 12) pts -= 6;
    else if (econ >= 11) pts -= 4;
    else if (econ >= 10) pts -= 2;
  }

  // ── FIELDING ───────────────────────────────────────────────────────────────
  const { catches, stumpings, runOutDirect, runOutIndirect } = stats;
  pts += catches * 8;
  if (catches >= 3) pts += 4; // 3-catch bonus
  pts += stumpings * 12;
  pts += runOutDirect * 12;
  pts += runOutIndirect * 6;

  return pts;
}

// ─── Scorecard parser ─────────────────────────────────────────────────────────

function makeBlankStats(isBowler = false): CricketPlayerStats {
  return {
    played: true, batted: false, pureBowler: false, isBowler,
    runs: 0, balls: 0, fours: 0, sixes: 0,
    wickets: 0, lbwBowled: 0, maidens: 0, ballsBowled: 0, runsConceded: 0, dotBalls: 0,
    catches: 0, stumpings: 0, runOutDirect: 0, runOutIndirect: 0,
  };
}

/**
 * Convert a CricAPI scorecard response into per-player stats.
 * Pass customAliases to override or extend the default name map.
 */
export function parseScorecardToStats(
  scorecard: CricApiScorecard,
  customAliases?: Record<string, string>,
): Record<string, CricketPlayerStats> {
  const playerStats: Record<string, CricketPlayerStats> = {};

  function init(name: string, isBowler = false) {
    if (!playerStats[name]) playerStats[name] = makeBlankStats(isBowler);
    return playerStats[name]!;
  }

  for (const inning of scorecard.scorecard ?? []) {
    // ── Batting ───────────────────────────────────────────────────────────
    for (const b of inning.batting ?? []) {
      const name = normaliseName(b.batsman?.name ?? '', customAliases);
      if (!name) continue;
      const p = init(name, false);
      p.batted = true;
      p.runs += Number(b.r) || 0;
      p.balls += Number(b.b) || 0;
      p.fours += Number(b['4s']) || 0;
      p.sixes += Number(b['6s']) || 0;

      const dismissal = (b.dismissal ?? '').toLowerCase();
      if (p.runs === 0 && dismissal && dismissal !== 'not out' && dismissal !== 'dnb') {
        p.duck = true;
      }

      // LBW / Bowled bonus — credit to bowler
      if (dismissal === 'lbw' || dismissal === 'bowled') {
        const bowlerName = normaliseName(b.bowler?.name ?? '', customAliases);
        if (bowlerName) init(bowlerName, true).lbwBowled++;
      }

      // Catches
      if (dismissal === 'catch' || dismissal === 'caught' || dismissal === 'cb') {
        let catcherName = normaliseName(b.catcher?.name ?? '', customAliases);
        if (!catcherName) {
          const text = b['dismissal-text'] ?? '';
          const cbMatch = text.match(/^c\s*(?:&|and)\s*b\s+(.+)/i);
          const cMatch = !cbMatch && text.match(/^c\s+(?!(?:&|and)\b)(.+?)\s+b\s+/i);
          if (cbMatch) catcherName = normaliseName(cbMatch[1]!.trim(), customAliases);
          else if (cMatch) catcherName = normaliseName(cMatch[1]!.trim(), customAliases);
        }
        if (catcherName) init(catcherName, false).catches++;
      }
    }

    // ── Bowling ───────────────────────────────────────────────────────────
    for (const bwl of inning.bowling ?? []) {
      const name = normaliseName(bwl.bowler?.name ?? '', customAliases);
      if (!name) continue;
      const p = init(name, true);
      p.isBowler = true;
      p.wickets += Number(bwl.w) || 0;
      p.maidens += Number(bwl.m) || 0;

      const oFloat = parseFloat(String(bwl.o ?? 0));
      const oversFull = Math.floor(oFloat);
      const oversPart = Math.round((oFloat % 1) * 10);
      const legalBalls = oversFull * 6 + oversPart;
      const runs = Number(bwl.r) || 0;
      const wides = Number(bwl.wd) || 0;
      const noBalls = Number(bwl.nb) || 0;

      p.ballsBowled += legalBalls;
      p.runsConceded += runs;
      const runsOffBat = runs - wides - noBalls;
      p.dotBalls += Math.max(0, legalBalls - runsOffBat);
    }

    // ── Fielding (from catching[]) ────────────────────────────────────────
    for (const c of inning.catching ?? []) {
      const name = normaliseName(c.catcher?.name ?? '', customAliases);
      if (!name) continue;
      const p = init(name, false);
      p.stumpings += Number(c.stumped) || 0;
      p.runOutIndirect += Number(c.runout) || 0;
    }
  }

  // ── Re-classify run-outs from dismissal-text ──────────────────────────────
  for (const inning of scorecard.scorecard ?? []) {
    for (const b of inning.batting ?? []) {
      if (b.dismissal !== 'runout') continue;
      const text = b['dismissal-text'] ?? '';
      const m = text.match(/run out \(([^)]+)\)/i);
      if (!m?.[1]) continue;
      const parts = m[1].split('/').map((s: string) => s.trim()).filter(Boolean);

      if (parts.length === 1) {
        const fielderName = normaliseName(b.catcher?.name ?? parts[0]!, customAliases);
        const p = fielderName ? playerStats[fielderName] : undefined;
        if (p && p.runOutIndirect > 0) {
          p.runOutIndirect--;
          p.runOutDirect++;
        }
      } else {
        const catcherName = normaliseName(b.catcher?.name ?? '', customAliases);
        for (const fielderStr of parts) {
          const fielderName = normaliseName(fielderStr, customAliases);
          if (!fielderName || fielderName === catcherName) continue;
          init(fielderName, false).runOutIndirect++;
        }
      }
    }
  }

  return playerStats;
}

// ─── Captain multiplier ───────────────────────────────────────────────────────

export function applyMultiplier(
  basePoints: number,
  role: 'CAPTAIN' | 'VICE_CAPTAIN' | null,
): number {
  if (role === 'CAPTAIN') return basePoints * 2;
  if (role === 'VICE_CAPTAIN') return basePoints * 1.5;
  return basePoints;
}
