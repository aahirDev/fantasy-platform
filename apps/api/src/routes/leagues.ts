import { Router, type Router as RouterType } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '@fantasy/db';
import { leagues, leagueMembers, squadPlayers, players, users, captainAssignments, matchScores } from '@fantasy/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from '../lib/nanoid.js';
import { AuctionStateManager, getAuction } from '../auction/AuctionStateManager.js';

// ─── Netlify blob helper (for roster sync) ───────────────────────────────────
const NETLIFY_BASE = 'https://auctionipl2026.netlify.app/api/store';

async function netlifyGet<T>(key: string): Promise<T | null> {
  const url = `${NETLIFY_BASE}?action=get&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob GET ${key} → ${res.status}`);
  const json = await res.json() as { data?: T };
  return json.data ?? null;
}

// M11C/roster name aliases → our DB player name
const PLAYER_ALIASES: Record<string, string> = {
  'Lungi Ngidi':          'Lungisani Ngidi',
  'AM Ghazanfar':         'Allah Ghazanfar',
  'Vaibhav Sooryavanshi': 'Vaibhav Suryavanshi',
  'Ryan Rickelton':       'Ryan Rickleton',
  'Digvesh Singh Rathi':  'Digvesh Singh',
  'Philip Salt':          'Phil Salt',
};

export const leaguesRouter: RouterType = Router();

leaguesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.internalUserId) { res.json([]); return; }
    const db = getDb();
    const userId = req.internalUserId;
    // Leagues where user is commissioner OR a member
    const rows = await db
      .selectDistinct({ league: leagues })
      .from(leagues)
      .leftJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
      .where(
        eq(leagues.commissionerId, userId)
      )
      .union(
        db
          .selectDistinct({ league: leagues })
          .from(leagues)
          .innerJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
          .where(eq(leagueMembers.userId, userId))
      );
    res.json(rows.map(r => r.league));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

leaguesRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const { name, sport, numTeams, totalBudgetLakhs, squadSize, bidTimerSeconds, seasonName } = req.body as Record<string, unknown>;
    const db = getDb();
    const [league] = await db
      .insert(leagues)
      .values({
        name: String(name),
        sport: sport as 'CRICKET_T20',
        commissionerId: req.internalUserId!,
        numTeams: Number(numTeams ?? 8),
        totalBudgetLakhs: Number(totalBudgetLakhs ?? 1000),
        squadSize: Number(squadSize ?? 11),
        bidTimerSeconds: Number(bidTimerSeconds ?? 30),
        seasonName: seasonName ? String(seasonName) : null,
        inviteCode: nanoid(8),
      })
      .returning();
    res.status(201).json(league);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

leaguesRouter.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const [league] = await db.select().from(leagues).where(eq(leagues.id, req.params['id']!));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }
    res.json(league);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

leaguesRouter.post('/:id/start', async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const leagueId = String(req.params['id']);
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }
    if (league.commissionerId !== req.internalUserId) { res.status(403).json({ error: 'Only the commissioner can start the auction' }); return; }
    if (league.status !== 'LOBBY') { res.status(409).json({ error: 'Auction already started' }); return; }

    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, league.id));
    if (members.length < 2) { res.status(409).json({ error: 'Need at least 2 teams to start' }); return; }

    if (getAuction(league.id)) { res.status(409).json({ error: 'Auction already running' }); return; }

    await db.update(leagues).set({ status: 'AUCTION_PHASE1' }).where(eq(leagues.id, league.id));

    const manager = new AuctionStateManager(league.id, {
      phase1Count: 0, // will be recalculated in initialize()
      squadSize: league.squadSize,
      totalBudgetLakhs: league.totalBudgetLakhs,
      minOpeningBidLakhs: league.minOpeningBidLakhs,
      bidTimerSeconds: league.bidTimerSeconds,
      commissionerId: league.commissionerId,
    });

    // Fire-and-forget: initialize runs async and drives the auction via socket events
    void manager.initialize().catch(err => console.error('[auction] initialize error:', err));

    res.json({ started: true });
  } catch (err) {
    console.error('[leagues/start]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

leaguesRouter.post('/join', async (req: AuthenticatedRequest, res) => {
  try {
    const { inviteCode, teamName } = req.body as Record<string, unknown>;
    if (!inviteCode || !teamName) {
      res.status(400).json({ error: 'inviteCode and teamName are required' });
      return;
    }
    const db = getDb();
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, String(inviteCode)));
    if (!league) { res.status(404).json({ error: 'Invalid invite code' }); return; }

    // Check not already a member
    const [existing] = await db
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, req.internalUserId!)));
    if (existing) { res.status(409).json({ error: 'Already a member of this league' }); return; }

    // Check league not full
    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, league.id));
    if (members.length >= league.numTeams) {
      res.status(409).json({ error: 'League is full' }); return;
    }

    const [member] = await db
      .insert(leagueMembers)
      .values({
        leagueId: league.id,
        userId: req.internalUserId!,
        teamName: String(teamName),
        budgetRemainingLakhs: league.totalBudgetLakhs,
      })
      .returning();
    res.status(201).json({ league, member });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/leagues/:id/squads
 * Returns all members with their full squads, points, and captain assignments.
 * Points are 0 if no match scores have been synced yet.
 */
leaguesRouter.get('/:id/squads', async (req, res) => {
  try {
    const db = getDb();
    const leagueId = req.params['id']!;

    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }

    // Members + usernames
    const members = await db
      .select({
        id: leagueMembers.id,
        userId: leagueMembers.userId,
        teamName: leagueMembers.teamName,
        budgetRemainingLakhs: leagueMembers.budgetRemainingLakhs,
        isOnline: leagueMembers.isOnline,
        username: users.username,
        displayName: users.displayName,
      })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, leagueId));

    // Squad players + player details for each member
    const squadRows = await db
      .select({
        memberId: squadPlayers.memberId,
        playerId: players.id,
        playerName: players.name,
        role: players.role,
        teamCode: players.teamCode,
        isOverseas: players.isOverseas,
        isUncapped: players.isUncapped,
        acquisitionPriceLakhs: squadPlayers.acquisitionPriceLakhs,
        rosterConfig: squadPlayers.rosterConfig,
      })
      .from(squadPlayers)
      .innerJoin(players, eq(squadPlayers.playerId, players.id))
      .innerJoin(leagueMembers, eq(squadPlayers.memberId, leagueMembers.id))
      .where(eq(leagueMembers.leagueId, leagueId));

    // Captain assignments per member
    const captains = await db
      .select({
        memberId: captainAssignments.memberId,
        playerId: captainAssignments.playerId,
        role: captainAssignments.role,
        fromMatch: captainAssignments.fromMatch,
      })
      .from(captainAssignments)
      .innerJoin(leagueMembers, eq(captainAssignments.memberId, leagueMembers.id))
      .where(eq(leagueMembers.leagueId, leagueId));

    // Fetch all raw per-match scores for this league (not aggregated).
    // This lets us apply transfer windows (fromMatch/toMatch) and per-match captain
    // multipliers correctly in JS.
    const rawMatchScores = await db
      .select({
        playerId: matchScores.playerId,
        matchNumber: matchScores.matchNumber,
        fantasyPoints: matchScores.fantasyPoints,
        manualOverridePoints: matchScores.manualOverridePoints,
      })
      .from(matchScores)
      .where(eq(matchScores.leagueId, leagueId));

    // playerId → matchNumber → effective points (manual override takes priority)
    const scoreMap = new Map<string, Map<number, number>>();
    const uniqueMatchNums = new Set<number>();
    for (const s of rawMatchScores) {
      uniqueMatchNums.add(s.matchNumber);
      if (!scoreMap.has(s.playerId)) scoreMap.set(s.playerId, new Map());
      scoreMap.get(s.playerId)!.set(s.matchNumber, s.manualOverridePoints ?? s.fantasyPoints ?? 0);
    }
    const matchesPlayed = uniqueMatchNums.size;

    // Group squads by member
    const squadsByMember = squadRows.reduce<Record<string, typeof squadRows>>((acc, row) => {
      (acc[row.memberId] ??= []).push(row);
      return acc;
    }, {});

    const captainsByMember = captains.reduce<Record<string, typeof captains>>((acc, row) => {
      (acc[row.memberId] ??= []).push(row);
      return acc;
    }, {});

    const result = members.map(m => {
      // Captain history sorted newest-first (for resolving captain per match)
      const memberCaptains = (captainsByMember[m.id] ?? [])
        .slice()
        .sort((a, b) => b.fromMatch - a.fromMatch);
      // Current captain/VC = the latest assignment
      const captainPlayerId     = memberCaptains.find(c => c.role === 'CAPTAIN')?.playerId ?? null;
      const viceCaptainPlayerId = memberCaptains.find(c => c.role === 'VICE_CAPTAIN')?.playerId ?? null;

      const squad = (squadsByMember[m.id] ?? []).map(p => {
        const rc = p.rosterConfig as { fromMatch?: number; toMatch?: number | null } | null;
        const fromMatch = rc?.fromMatch ?? 1;
        const toMatch   = rc?.toMatch ?? null;   // null = still in squad

        // Sum points only within this player's active transfer window,
        // applying the captain multiplier that was in effect for each match.
        let playerTotal = 0;
        const playerScores = scoreMap.get(p.playerId) ?? new Map<number, number>();
        for (const [matchNum, pts] of playerScores) {
          if (matchNum < fromMatch) continue;
          if (toMatch !== null && matchNum > toMatch) continue;
          // Captain in effect for this match
          const captM = memberCaptains.find(c => c.role === 'CAPTAIN'      && c.fromMatch <= matchNum);
          const vcM   = memberCaptains.find(c => c.role === 'VICE_CAPTAIN' && c.fromMatch <= matchNum);
          const mult  = p.playerId === captM?.playerId ? 2.0
                      : p.playerId === vcM?.playerId   ? 1.5
                      : 1.0;
          playerTotal += Math.round(pts * mult);
        }

        return {
          playerId: p.playerId,
          playerName: p.playerName,
          role: p.role,
          teamCode: p.teamCode,
          isOverseas: p.isOverseas,
          isUncapped: p.isUncapped,
          acquisitionPriceLakhs: p.acquisitionPriceLakhs,
          rosterConfig: p.rosterConfig,
          fantasyPoints: playerTotal,
          isCaptain:    p.playerId === captainPlayerId,
          isViceCaptain: p.playerId === viceCaptainPlayerId,
        };
      });

      const totalSpent  = league.totalBudgetLakhs - m.budgetRemainingLakhs;
      const totalPoints = squad.reduce((sum, p) => sum + p.fantasyPoints, 0);

      return {
        id: m.id,
        userId: m.userId,
        teamName: m.teamName,
        username: m.username,
        displayName: m.displayName,
        budgetRemainingLakhs: m.budgetRemainingLakhs,
        totalSpent,
        totalPoints,
        isOnline: m.isOnline,
        captainPlayerId,
        viceCaptainPlayerId,
        squad: squad.sort((a, b) => {
          const roleOrder = { WK: 0, BAT: 1, AR: 2, BOWL: 3 };
          return (roleOrder[a.role as keyof typeof roleOrder] ?? 9) - (roleOrder[b.role as keyof typeof roleOrder] ?? 9);
        }),
        captainAssignments: captainsByMember[m.id] ?? [],
      };
    });

    res.json({
      league,
      members: result.sort((a, b) => b.totalPoints - a.totalPoints),
      matchesPlayed,
    });
  } catch (err) {
    console.error('[leagues/squads]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/leagues/:id/captain
 * Assign (or update) captain and vice-captain for the calling user's squad.
 * Body: { captainPlayerId: string; viceCaptainPlayerId: string }
 */
leaguesRouter.post('/:id/captain', async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const leagueId = req.params['id'] as string;
    const { captainPlayerId, viceCaptainPlayerId } = req.body as {
      captainPlayerId: string;
      viceCaptainPlayerId: string;
    };

    if (!captainPlayerId || !viceCaptainPlayerId) {
      res.status(400).json({ error: 'captainPlayerId and viceCaptainPlayerId are required' });
      return;
    }
    if (captainPlayerId === viceCaptainPlayerId) {
      res.status(400).json({ error: 'Captain and vice-captain must be different players' });
      return;
    }

    // Find this user's member record in the league
    const [member] = await db
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, req.internalUserId!)));

    if (!member) {
      res.status(403).json({ error: 'You are not a member of this league' });
      return;
    }

    // Verify both players are in the member's squad
    const squadPlayerIds = await db
      .select({ playerId: squadPlayers.playerId })
      .from(squadPlayers)
      .where(eq(squadPlayers.memberId, member.id));

    const squadSet = new Set(squadPlayerIds.map(r => r.playerId));
    if (!squadSet.has(captainPlayerId)) {
      res.status(400).json({ error: 'Captain player is not in your squad' });
      return;
    }
    if (!squadSet.has(viceCaptainPlayerId)) {
      res.status(400).json({ error: 'Vice-captain player is not in your squad' });
      return;
    }

    // Replace all captain assignments for this member
    await db.delete(captainAssignments).where(eq(captainAssignments.memberId, member.id));
    const inserted = await db
      .insert(captainAssignments)
      .values([
        { memberId: member.id, playerId: captainPlayerId,    role: 'CAPTAIN',      fromMatch: 1 },
        { memberId: member.id, playerId: viceCaptainPlayerId, role: 'VICE_CAPTAIN', fromMatch: 1 },
      ])
      .returning();

    res.json({ captainAssignments: inserted });
  } catch (err) {
    console.error('[leagues/captain]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/leagues/:id/members/:memberId/breakdown
 * Per-match fantasy points breakdown for a member.
 * Respects transfer windows (fromMatch/toMatch) and captain history.
 */
leaguesRouter.get('/:id/members/:memberId/breakdown', async (req, res) => {
  try {
    const db = getDb();
    const leagueId = req.params['id']!;
    const memberId = req.params['memberId']!;

    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }

    // Get member + user info
    const [memberRow] = await db
      .select({
        id: leagueMembers.id,
        teamName: leagueMembers.teamName,
        userId: leagueMembers.userId,
        username: users.username,
        displayName: users.displayName,
      })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(and(eq(leagueMembers.id, memberId), eq(leagueMembers.leagueId, leagueId)));
    if (!memberRow) { res.status(404).json({ error: 'Member not found' }); return; }

    // Squad players with roster config
    const squadRows = await db
      .select({
        playerId: players.id,
        playerName: players.name,
        role: players.role,
        teamCode: players.teamCode,
        rosterConfig: squadPlayers.rosterConfig,
      })
      .from(squadPlayers)
      .innerJoin(players, eq(squadPlayers.playerId, players.id))
      .where(eq(squadPlayers.memberId, memberId));

    // Captain assignments for this member (sorted newest-first)
    const captainRows = await db
      .select({
        playerId: captainAssignments.playerId,
        role: captainAssignments.role,
        fromMatch: captainAssignments.fromMatch,
      })
      .from(captainAssignments)
      .where(eq(captainAssignments.memberId, memberId));
    captainRows.sort((a, b) => b.fromMatch - a.fromMatch);

    // All match scores for this member's players
    const playerIds = squadRows.map(p => p.playerId);
    const allScores = playerIds.length > 0
      ? await db
          .select({
            playerId: matchScores.playerId,
            matchNumber: matchScores.matchNumber,
            fantasyPoints: matchScores.fantasyPoints,
            manualOverridePoints: matchScores.manualOverridePoints,
          })
          .from(matchScores)
          .where(and(eq(matchScores.leagueId, leagueId), inArray(matchScores.playerId, playerIds)))
      : [];

    // Score map: playerId → matchNum → effective points
    const scoreMap = new Map<string, Map<number, number>>();
    for (const s of allScores) {
      if (!scoreMap.has(s.playerId)) scoreMap.set(s.playerId, new Map());
      scoreMap.get(s.playerId)!.set(s.matchNumber, s.manualOverridePoints ?? s.fantasyPoints ?? 0);
    }

    // Roster window per player
    const rosterMap = new Map<string, { fromMatch: number; toMatch: number | null }>();
    for (const p of squadRows) {
      const rc = p.rosterConfig as { fromMatch?: number; toMatch?: number | null } | null;
      rosterMap.set(p.playerId, { fromMatch: rc?.fromMatch ?? 1, toMatch: rc?.toMatch ?? null });
    }

    // Active match numbers (only matches with at least one score)
    const allMatchNums = [...new Set(allScores.map(s => s.matchNumber))].sort((a, b) => a - b);

    // Per-match breakdown
    const matches = allMatchNums.map(matchNum => {
      // Resolve captain/VC in effect for this match
      const captainPlayerId = captainRows.find(c => c.role === 'CAPTAIN'      && c.fromMatch <= matchNum)?.playerId ?? null;
      const vcPlayerId      = captainRows.find(c => c.role === 'VICE_CAPTAIN' && c.fromMatch <= matchNum)?.playerId ?? null;

      const activePlayers = squadRows
        .filter(p => {
          const rc = rosterMap.get(p.playerId)!;
          return matchNum >= rc.fromMatch && (rc.toMatch === null || matchNum <= rc.toMatch);
        })
        .map(p => {
          const basePoints    = scoreMap.get(p.playerId)?.get(matchNum) ?? 0;
          const isCaptain     = p.playerId === captainPlayerId;
          const isViceCaptain = p.playerId === vcPlayerId;
          const multiplier    = isCaptain ? 2.0 : isViceCaptain ? 1.5 : 1.0;
          const fantasyPoints = Math.round(basePoints * multiplier);
          return { playerId: p.playerId, playerName: p.playerName, role: p.role, teamCode: p.teamCode, basePoints, multiplier, fantasyPoints, isCaptain, isViceCaptain };
        })
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);

      const matchTotal = activePlayers.reduce((sum, p) => sum + p.fantasyPoints, 0);
      return { matchNumber: matchNum, captainPlayerId, vcPlayerId, players: activePlayers, matchTotal };
    });

    const grandTotal = matches.reduce((sum, m) => sum + m.matchTotal, 0);

    res.json({
      member: { id: memberRow.id, teamName: memberRow.teamName, username: memberRow.username, displayName: memberRow.displayName },
      matches,
      grandTotal,
    });
  } catch (err) {
    console.error('[leagues/breakdown]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/leagues/:id/transfers
 * Returns a timeline of player transfer events (IN/OUT) derived from
 * squad_players.rosterConfig (fromMatch / toMatch fields).
 */
leaguesRouter.get('/:id/transfers', async (req, res) => {
  try {
    const db = getDb();
    const leagueId = String(req.params['id'] ?? '');

    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }

    const rows = await db
      .select({
        memberId: leagueMembers.id,
        teamName: leagueMembers.teamName,
        playerId: players.id,
        playerName: players.name,
        role: players.role,
        teamCode: players.teamCode,
        rosterConfig: squadPlayers.rosterConfig,
      })
      .from(squadPlayers)
      .innerJoin(players, eq(squadPlayers.playerId, players.id))
      .innerJoin(leagueMembers, eq(squadPlayers.memberId, leagueMembers.id))
      .where(eq(leagueMembers.leagueId, leagueId));

    type TransferEvent = {
      matchNumber: number;
      type: 'IN' | 'OUT';
      memberId: string;
      teamName: string;
      playerId: string;
      playerName: string;
      role: string | null;
      teamCode: string | null;
    };

    const events: TransferEvent[] = [];
    for (const row of rows) {
      const rc = row.rosterConfig as { fromMatch?: number; toMatch?: number | null } | null;
      const fromMatch = rc?.fromMatch ?? 1;
      const toMatch   = rc?.toMatch ?? null;

      // Transferred IN: player wasn't there from Match 1
      if (fromMatch > 1) {
        events.push({
          matchNumber: fromMatch,
          type: 'IN',
          memberId: row.memberId,
          teamName: row.teamName,
          playerId: row.playerId,
          playerName: row.playerName,
          role: row.role,
          teamCode: row.teamCode,
        });
      }

      // Transferred OUT: toMatch > 0 (0 means never active; null means still active)
      if (toMatch !== null && toMatch > 0) {
        events.push({
          matchNumber: toMatch + 1, // first match they're NOT in
          type: 'OUT',
          memberId: row.memberId,
          teamName: row.teamName,
          playerId: row.playerId,
          playerName: row.playerName,
          role: row.role,
          teamCode: row.teamCode,
        });
      }
    }

    // Sort: ascending match number, OUTs before INs at the same match
    events.sort((a, b) => a.matchNumber - b.matchNumber || (a.type === 'OUT' ? -1 : 1));

    res.json({ transfers: events });
  } catch (err) {
    console.error('[leagues/transfers]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/leagues/:id/sync-roster
 * Commissioner-only: pulls the latest ipl26a:roster_config blob from Netlify
 * and updates squad_players.rosterConfig + captainAssignments in the DB.
 */
leaguesRouter.post('/:id/sync-roster', async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const leagueId = String(req.params['id'] ?? '');

    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) { res.status(404).json({ error: 'League not found' }); return; }
    if (league.commissionerId !== req.internalUserId) {
      res.status(403).json({ error: 'Only the commissioner can sync the roster' }); return;
    }

    // Fetch roster_config blob
    type RosterPlayer = { name: string; fromMatch: number; toMatch: number | null; role?: string };
    type CaptainEntry = { captain: string; vc: string; fromMatch: number };
    type RosterTeam   = { id: string; name?: string; players: RosterPlayer[]; captainHistory?: CaptainEntry[] };
    type RosterConfig = { teams: RosterTeam[] };

    const config = await netlifyGet<RosterConfig>('ipl26auction:roster_config');
    if (!config?.teams) {
      res.status(503).json({ error: 'roster_config blob not found or malformed' }); return;
    }

    // Load all DB players for name resolution
    const allPlayers = await db.select({ id: players.id, name: players.name, aliases: players.aliases }).from(players);
    const playerNameMap = new Map<string, string>(); // normalised name → player.id
    for (const p of allPlayers) {
      playerNameMap.set(p.name.toLowerCase(), p.id);
      for (const a of p.aliases) playerNameMap.set(a.toLowerCase(), p.id);
    }

    function resolvePlayerId(name: string): string | undefined {
      const aliased = PLAYER_ALIASES[name] ?? name;
      return playerNameMap.get(aliased.toLowerCase()) ?? playerNameMap.get(name.toLowerCase());
    }

    // Load all members for this league (keyed by teamId/username)
    const leagueMembers2 = await db
      .select({ id: leagueMembers.id, username: users.username })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, leagueId));

    const memberByUsername = new Map(leagueMembers2.map(m => [m.username, m.id]));

    let rosterUpdates = 0;
    let captainUpdates = 0;

    for (const team of config.teams) {
      const memberId = memberByUsername.get(team.id);
      if (!memberId) continue;

      // Update rosterConfig for each squad player
      for (const p of team.players) {
        const playerId = resolvePlayerId(p.name);
        if (!playerId) continue;

        const rosterConfig = { fromMatch: p.fromMatch, toMatch: p.toMatch ?? null };

        await db
          .update(squadPlayers)
          .set({ rosterConfig })
          .where(and(eq(squadPlayers.memberId, memberId), eq(squadPlayers.playerId, playerId)));

        rosterUpdates++;
      }

      // Rebuild captainAssignments from captainHistory
      if (team.captainHistory?.length) {
        await db.delete(captainAssignments).where(eq(captainAssignments.memberId, memberId));

        const rows: Array<{ memberId: string; playerId: string; role: 'CAPTAIN' | 'VICE_CAPTAIN'; fromMatch: number }> = [];
        for (const entry of team.captainHistory) {
          const cId = resolvePlayerId(entry.captain);
          const vId = resolvePlayerId(entry.vc);
          if (cId) rows.push({ memberId, playerId: cId,  role: 'CAPTAIN',      fromMatch: entry.fromMatch });
          if (vId) rows.push({ memberId, playerId: vId,  role: 'VICE_CAPTAIN', fromMatch: entry.fromMatch });
        }
        if (rows.length) {
          await db.insert(captainAssignments).values(rows);
          captainUpdates += rows.length;
        }
      }
    }

    res.json({
      rosterUpdates,
      captainUpdates,
      message: `Updated ${rosterUpdates} player windows and ${captainUpdates} captain assignments`,
    });
  } catch (err) {
    console.error('[leagues/sync-roster]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});
