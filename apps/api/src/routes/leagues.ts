import { Router, type Router as RouterType } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '@fantasy/db';
import { leagues, leagueMembers, squadPlayers, players, users, captainAssignments, matchScores } from '@fantasy/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from '../lib/nanoid.js';
import { AuctionStateManager, getAuction } from '../auction/AuctionStateManager.js';

export const leaguesRouter: RouterType = Router();

leaguesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
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
        commissionerId: req.userId!,
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
    if (league.commissionerId !== req.userId) { res.status(403).json({ error: 'Only the commissioner can start the auction' }); return; }
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
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, req.userId!)));
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
        userId: req.userId!,
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

    // Aggregate fantasy points per member from match_scores
    const memberScores = await db
      .select({
        playerId: matchScores.playerId,
        totalPoints: sql<number>`coalesce(sum(coalesce(${matchScores.manualOverridePoints}, ${matchScores.fantasyPoints}, 0)), 0)`.as('total_points'),
        matchCount: sql<number>`count(*)`.as('match_count'),
      })
      .from(matchScores)
      .where(eq(matchScores.leagueId, leagueId))
      .groupBy(matchScores.playerId);

    const pointsByPlayerId = Object.fromEntries(
      memberScores.map(r => [r.playerId, { totalPoints: Number(r.totalPoints), matchCount: Number(r.matchCount) }])
    );

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
      // Resolve current captain / VC for this member (latest fromMatch wins)
      const memberCaptains = (captainsByMember[m.id] ?? [])
        .slice()
        .sort((a, b) => b.fromMatch - a.fromMatch);
      const captainPlayerId    = memberCaptains.find(c => c.role === 'CAPTAIN')?.playerId ?? null;
      const viceCaptainPlayerId = memberCaptains.find(c => c.role === 'VICE_CAPTAIN')?.playerId ?? null;

      const squad = (squadsByMember[m.id] ?? []).map(p => {
        const basePoints    = pointsByPlayerId[p.playerId]?.totalPoints ?? 0;
        const isCaptain     = p.playerId === captainPlayerId;
        const isViceCaptain = p.playerId === viceCaptainPlayerId;
        const fantasyPoints = isCaptain
          ? Math.round(basePoints * 2)
          : isViceCaptain
            ? Math.round(basePoints * 1.5)
            : basePoints;
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          role: p.role,
          teamCode: p.teamCode,
          isOverseas: p.isOverseas,
          isUncapped: p.isUncapped,
          acquisitionPriceLakhs: p.acquisitionPriceLakhs,
          rosterConfig: p.rosterConfig,
          fantasyPoints,
          isCaptain,
          isViceCaptain,
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
      matchesPlayed: memberScores.length > 0 ? Math.max(...memberScores.map(r => r.matchCount)) : 0,
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
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, req.userId!)));

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
