import { Router, type Router as RouterType } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '@fantasy/db';
import { leagues, leagueMembers } from '@fantasy/db/schema';
import { eq, and } from 'drizzle-orm';
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
