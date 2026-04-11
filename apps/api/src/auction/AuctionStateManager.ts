import crypto from 'crypto';
import { getDb } from '@fantasy/db';
import { players, leagueMembers, leagues, auctionLots, bids, squadPlayers, users } from '@fantasy/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getIO } from '../socket.js';
import { validateBid, computeMaxBid, getEligiblePlayersForNomination, canNominatePlayer } from './bidValidation.js';
import {
  type AuctionPlayer,
  type AuctionMember,
  type ActiveBid,
  type LotState,
  type UndoEntry,
  type NominationState,
  type AuctionSnapshot,
  type AuctionPhase,
  SQUAD_RULES,
} from './types.js';

// ── Registry ──────────────────────────────────────────────────────────────────

const activeAuctions = new Map<string, AuctionStateManager>();

export function getAuction(leagueId: string): AuctionStateManager | undefined {
  return activeAuctions.get(leagueId);
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class AuctionStateManager {
  leagueId: string;
  phase: AuctionPhase = 'PHASE1';
  isPaused = false;
  pauseReason: string | null = null;

  playerQueue: AuctionPlayer[] = [];
  currentQueueIndex = 0;
  phase1Count: number;
  squadSize: number;
  totalBudgetLakhs: number;
  minOpeningBidLakhs: number;
  bidTimerSeconds: number;

  members: AuctionMember[] = [];
  currentLot: LotState | null = null;

  phase2Pool: AuctionPlayer[] = [];
  nomination: NominationState | null = null;

  undoBuffer: UndoEntry | null = null;
  totalSold = 0;
  totalUnsold = 0;
  transitionEndsAt: number | null = null;
  private lotOrderCounter = 0;

  private timerRef: ReturnType<typeof setInterval> | null = null;
  private presentTimeoutRef: ReturnType<typeof setTimeout> | null = null;
  commissionerId: string;

  constructor(
    leagueId: string,
    config: {
      phase1Count: number;
      squadSize: number;
      totalBudgetLakhs: number;
      minOpeningBidLakhs: number;
      bidTimerSeconds: number;
      commissionerId: string;
    },
  ) {
    this.leagueId = leagueId;
    this.phase1Count = config.phase1Count;
    this.squadSize = config.squadSize;
    this.totalBudgetLakhs = config.totalBudgetLakhs;
    this.minOpeningBidLakhs = config.minOpeningBidLakhs;
    this.bidTimerSeconds = config.bidTimerSeconds;
    this.commissionerId = config.commissionerId;
    activeAuctions.set(leagueId, this);
  }

  async initialize(): Promise<void> {
    await this.loadMembers();
    const numTeams = this.members.length;
    this.phase1Count = Math.min(Math.ceil(0.8 * this.squadSize * numTeams), 95);
    console.log(`[auction:${this.leagueId}] phase1Count=${this.phase1Count} (${numTeams} teams)`);
    await this.buildPlayerQueue();
    this.presentNextPlayer();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private async loadMembers(): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({
        id: leagueMembers.id,
        userId: leagueMembers.userId,
        teamName: leagueMembers.teamName,
        budgetRemainingLakhs: leagueMembers.budgetRemainingLakhs,
        isOnline: leagueMembers.isOnline,
        username: users.username,
      })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, this.leagueId));

    this.members = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      teamName: r.teamName,
      budgetRemainingLakhs: r.budgetRemainingLakhs,
      isOnline: r.isOnline,
      username: r.username,
      squad: [],
    }));
  }

  private async buildPlayerQueue(): Promise<void> {
    const db = getDb();
    const allPlayers = await db.select().from(players);

    const poolA = allPlayers.filter(p => p.playerPool === 'A');
    const poolB = allPlayers.filter(p => p.playerPool === 'B');
    const poolC = allPlayers.filter(p => p.playerPool === 'C');
    const poolD = allPlayers.filter(p => p.playerPool === 'D');
    const poolNone = allPlayers.filter(p => !p.playerPool);

    shuffle(poolA); shuffle(poolB); shuffle(poolC); shuffle(poolD); shuffle(poolNone);

    const queue: AuctionPlayer[] = [];
    for (const pool of [poolA, poolB, poolC, poolNone]) {
      for (const p of pool) {
        queue.push(toAuctionPlayer(p));
        if (queue.length >= this.phase1Count) break;
      }
      if (queue.length >= this.phase1Count) break;
    }

    this.playerQueue = queue;

    const usedIds = new Set(queue.map(p => p.id));
    const remaining = [...poolA, ...poolB, ...poolC, ...poolD, ...poolNone]
      .filter(p => !usedIds.has(p.id))
      .map(toAuctionPlayer);
    shuffle(remaining);
    this.phase2Pool = remaining;
  }

  // ── Lot lifecycle ──────────────────────────────────────────────────────────

  private presentNextPlayer(): void {
    if (this.phase === 'PHASE1') {
      if (this.currentQueueIndex >= this.playerQueue.length) {
        this.endPhase1(); return;
      }
      void this.startLot(this.playerQueue[this.currentQueueIndex]!);
    } else {
      this.advanceNomination();
    }
  }

  private async startLot(player: AuctionPlayer): Promise<void> {
    const db = getDb();
    const [lotRow] = await db
      .insert(auctionLots)
      .values({
        leagueId: this.leagueId,
        playerId: player.id,
        phase: this.phase === 'PHASE1' ? 1 : 2,
        lotOrder: ++this.lotOrderCounter,
        status: 'ACTIVE',
        startedAt: new Date(),
      })
      .returning();

    this.currentLot = {
      lotId: lotRow!.id,
      player,
      status: 'ACTIVE',
      bids: [],
      currentBidLakhs: 0,
      currentBidderId: null,
      timerEndsAt: null, // set by startTimer()
      presentedAt: Date.now(),
      matchBidders: [],
    };

    this.emit('auction:player_presented', {
      lot: this.serializeLot(),
      phase: this.phase,
      queueIndex: this.currentQueueIndex,
      queueTotal: this.phase === 'PHASE1' ? this.playerQueue.length : undefined,
    });

    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    if (!this.currentLot) return;
    this.currentLot.timerEndsAt = Date.now() + this.bidTimerSeconds * 1000;
    this.timerRef = setInterval(() => {
      if (this.isPaused || !this.currentLot || !this.currentLot.timerEndsAt) return;
      const remaining = this.currentLot.timerEndsAt - Date.now();
      this.emit('auction:timer_tick', { timerEndsAt: this.currentLot.timerEndsAt });
      if (remaining <= 0) {
        this.clearTimer();
        void this.onTimerExpiry();
      }
    }, 500);
  }

  private clearTimer(): void {
    if (this.timerRef) { clearInterval(this.timerRef); this.timerRef = null; }
  }

  private clearPresentTimeout(): void {
    if (this.presentTimeoutRef) { clearTimeout(this.presentTimeoutRef); this.presentTimeoutRef = null; }
  }

  private async onTimerExpiry(): Promise<void> {
    if (!this.currentLot) return;
    if (this.currentLot.currentBidderId) {
      if (this.phase === 'PHASE2') {
        const tieResult = this.checkAllInTie();
        if (tieResult) { await this.handleSpinWheel(tieResult); return; }
      }
      await this.sellPlayer();
    } else {
      await this.unsoldPlayer();
    }
  }

  // ── Bidding ────────────────────────────────────────────────────────────────

  async placeBid(memberId: string, amount: number): Promise<{ success: boolean; reason?: string }> {
    if (this.isPaused) return { success: false, reason: 'Auction is paused' };
    if (!this.currentLot || this.currentLot.status !== 'ACTIVE') return { success: false, reason: 'No active lot' };

    const member = this.members.find(m => m.id === memberId);
    if (!member) return { success: false, reason: 'Member not found' };

    const result = validateBid(
      member, this.currentLot.player, amount,
      this.currentLot.currentBidLakhs, this.currentLot.currentBidderId,
      this.squadSize, this.minOpeningBidLakhs,
      this.currentLot.matchBidders.length > 0,
    );

    if (!result.valid) return { success: false, reason: result.reason ?? 'Bid rejected' };

    const isMatchBid =
      result.isAllIn &&
      amount === this.currentLot.currentBidLakhs &&
      this.currentLot.currentBidderId !== null;

    const bid: ActiveBid = {
      memberId: member.id,
      userId: member.userId,
      teamName: member.teamName,
      amountLakhs: amount,
      isAllIn: result.isAllIn ?? false,
      timestamp: Date.now(),
    };

    this.currentLot.bids.push(bid);

    if (isMatchBid) {
      if (!this.currentLot.matchBidders.includes(memberId)) {
        this.currentLot.matchBidders.push(memberId);
      }
    } else {
      this.currentLot.matchBidders = [];
      this.currentLot.currentBidLakhs = amount;
      this.currentLot.currentBidderId = memberId;

      const db = getDb();
      const lotId = this.currentLot.lotId;
      db.insert(bids).values({ lotId, memberId, amountLakhs: amount, isWinning: true, isAllIn: bid.isAllIn })
        .then(() => db.update(bids).set({ isWinning: false }).where(
          and(eq(bids.lotId, lotId), sql`${bids.memberId} != ${memberId}`),
        ))
        .catch(err => console.error('[auction] bid persist error:', err));

      this.clearTimer();
      this.startTimer(); // resets timerEndsAt
    }

    const allInInfo = this.members.map(m => ({
      memberId: m.id,
      maxBid: computeMaxBid(m, this.squadSize, this.minOpeningBidLakhs),
      isAllIn: computeMaxBid(m, this.squadSize, this.minOpeningBidLakhs) === amount,
    }));

    this.emit('bid:placed', {
      lot: this.serializeLot(),
      bid: { memberId: bid.memberId, teamName: bid.teamName, amount: bid.amountLakhs, isAllIn: bid.isAllIn, isMatchBid },
      allInInfo,
    });

    return { success: true };
  }

  async placeAllIn(memberId: string): Promise<{ success: boolean; reason?: string }> {
    const member = this.members.find(m => m.id === memberId);
    if (!member) return { success: false, reason: 'Member not found' };
    const maxBid = computeMaxBid(member, this.squadSize, this.minOpeningBidLakhs);
    if (maxBid < (this.currentLot?.currentBidLakhs ?? 0)) {
      return { success: false, reason: 'Cannot go all-in — budget too low' };
    }
    return this.placeBid(memberId, maxBid);
  }

  // ── Sale / unsold ──────────────────────────────────────────────────────────

  private async sellPlayer(): Promise<void> {
    if (!this.currentLot || !this.currentLot.currentBidderId) return;

    const lot = this.currentLot;
    const winnerId = lot.currentBidderId;
    if (!winnerId) return;
    const finalPrice = lot.currentBidLakhs;
    const winner = this.members.find(m => m.id === winnerId);
    if (!winner) return;

    winner.budgetRemainingLakhs -= finalPrice;
    winner.squad.push({
      playerId: lot.player.id,
      playerName: lot.player.name,
      role: lot.player.role,
      isOverseas: lot.player.isOverseas,
      isUncapped: lot.player.isUncapped,
      acquisitionPriceLakhs: finalPrice,
    });

    this.undoBuffer = {
      lotId: lot.lotId,
      player: lot.player,
      winnerId: winner.userId,
      winnerMemberId: winner.id,
      finalPriceLakhs: finalPrice,
      allotmentIndex: this.totalSold,
    };
    this.totalSold++;
    lot.status = 'SOLD';

    void this.persistSale(lot.lotId, winnerId, finalPrice, lot.player.id, winner);

    this.emit('auction:player_sold', {
      lot: this.serializeLot(),
      winner: { memberId: winner.id, teamName: winner.teamName, finalPrice },
      members: this.serializeMembers(),
      undoAvailable: true,
    });

    this.currentLot = null;
    this.broadcastSnapshot(); // snapshot with null lot for the "sold" interstitial

    if (this.checkAuctionComplete()) { this.endAuction(); return; }

    if (this.phase === 'PHASE1') this.currentQueueIndex++;
    else if (this.nomination) this.nomination.currentIndex++;

    this.presentTimeoutRef = setTimeout(() => {
      this.presentTimeoutRef = null;
      this.presentNextPlayer();
    }, 2000);
  }

  private async unsoldPlayer(): Promise<void> {
    if (!this.currentLot) return;
    const lot = this.currentLot;
    lot.status = 'UNSOLD';
    this.totalUnsold++;

    if (this.phase === 'PHASE1') this.phase2Pool.push(lot.player);

    const db = getDb();
    db.update(auctionLots)
      .set({ status: 'UNSOLD', closedAt: new Date() })
      .where(eq(auctionLots.id, lot.lotId))
      .catch(err => console.error('[auction] unsold persist error:', err));

    this.emit('auction:player_unsold', { lot: this.serializeLot() });
    this.currentLot = null;
    this.broadcastSnapshot(); // snapshot with null lot

    if (this.phase === 'PHASE1') this.currentQueueIndex++;
    else if (this.nomination) this.nomination.currentIndex++;

    this.presentTimeoutRef = setTimeout(() => {
      this.presentTimeoutRef = null;
      this.presentNextPlayer();
    }, 2000);
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  skipToPhase2(): { success: boolean; reason?: string } {
    if (this.phase !== 'PHASE1') return { success: false, reason: 'Not in Phase 1' };

    this.clearPresentTimeout();
    this.clearTimer();

    if (this.currentLot) {
      const db = getDb();
      db.update(auctionLots)
        .set({ status: 'UNSOLD', closedAt: new Date() })
        .where(eq(auctionLots.id, this.currentLot.lotId))
        .catch(err => console.error('[auction] skip close lot error:', err));
      this.totalUnsold++;
      this.phase2Pool.push(this.currentLot.player);
      this.currentLot = null;
      this.currentQueueIndex++;
    }

    const existingIds = new Set(this.phase2Pool.map(p => p.id));
    for (let i = this.currentQueueIndex; i < this.playerQueue.length; i++) {
      const player = this.playerQueue[i]!;
      if (!existingIds.has(player.id)) { this.phase2Pool.push(player); existingIds.add(player.id); }
    }

    this.endPhase1();
    return { success: true };
  }

  private endPhase1(): void {
    this.transitionEndsAt = Date.now() + SQUAD_RULES.PHASE_TRANSITION_SECONDS * 1000;

    this.emit('auction:phase1_complete', {
      transitionSeconds: SQUAD_RULES.PHASE_TRANSITION_SECONDS,
      transitionEndsAt: this.transitionEndsAt,
      totalSold: this.totalSold,
      totalUnsold: this.totalUnsold,
      phase2PoolSize: this.phase2Pool.length,
    });

    const db = getDb();
    db.update(leagues)
      .set({ status: 'AUCTION_PHASE2' })
      .where(eq(leagues.id, this.leagueId))
      .catch(err => console.error('[auction] phase update error:', err));

    setTimeout(() => {
      this.transitionEndsAt = null;
      this.phase = 'PHASE2';
      this.startPhase2();
    }, SQUAD_RULES.PHASE_TRANSITION_SECONDS * 1000);
  }

  private startPhase2(): void {
    const memberIds = this.members.map(m => m.id);
    shuffle(memberIds);

    this.nomination = { order: memberIds, currentIndex: 0, graceTimerRef: null };

    const nominationOrder = this.nomination.order.map(mid => {
      const m = this.members.find(mm => mm.id === mid);
      return { memberId: mid, teamName: m?.teamName ?? '' };
    });

    let firstNominatorId: string | null = null;
    let firstEligiblePlayerIds: string[] = [];
    for (let i = 0; i < this.nomination.order.length; i++) {
      const mid = this.nomination.order[i]!;
      const nominator = this.members.find(m => m.id === mid);
      if (nominator && nominator.squad.length < this.squadSize) {
        const eligible = getEligiblePlayersForNomination(nominator, this.phase2Pool, this.squadSize, this.minOpeningBidLakhs);
        if (eligible.length > 0) {
          firstNominatorId = mid;
          firstEligiblePlayerIds = eligible.map(p => p.id);
          this.nomination.currentIndex = i;
          break;
        }
      }
    }

    this.emit('auction:phase2_start', { nominationOrder, firstNominatorId, firstEligiblePlayerIds });
    setTimeout(() => this.advanceNomination(), 2000);
  }

  private advanceNomination(): void {
    if (!this.nomination) return;
    if (this.checkAuctionComplete() || this.phase2Pool.length === 0) { this.endAuction(); return; }

    let attempts = 0;
    const totalMembers = this.members.length;

    while (attempts < totalMembers) {
      const idx = this.nomination.currentIndex % this.nomination.order.length;
      const nominatorId = this.nomination.order[idx]!;
      const nominator = this.members.find(m => m.id === nominatorId);

      if (nominator && nominator.squad.length < this.squadSize) {
        const eligible = getEligiblePlayersForNomination(nominator, this.phase2Pool, this.squadSize, this.minOpeningBidLakhs);
        if (eligible.length > 0) {
          this.emit('auction:nomination_turn', {
            nominatorId,
            teamName: nominator.teamName,
            eligiblePlayerIds: eligible.map(p => p.id),
            isOnline: nominator.isOnline,
          });

          if (!nominator.isOnline) {
            this.nomination.graceTimerRef = setTimeout(() => this.skipNomination(), SQUAD_RULES.PHASE2_NOMINATION_TIMEOUT_MS);
          }
          return;
        }
      }

      this.nomination.currentIndex++;
      attempts++;
    }

    this.endAuction();
  }

  async nominate(memberId: string, playerId: string): Promise<{ success: boolean; reason?: string }> {
    if (!this.nomination) return { success: false, reason: 'Not in nomination phase' };
    if (this.isPaused) return { success: false, reason: 'Auction is paused' };

    const idx = this.nomination.currentIndex % this.nomination.order.length;
    if (this.nomination.order[idx] !== memberId) return { success: false, reason: 'Not your turn to nominate' };

    const member = this.members.find(m => m.id === memberId);
    if (!member) return { success: false, reason: 'Member not found' };

    const playerIndex = this.phase2Pool.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { success: false, reason: 'Player not in eligible pool' };

    const player = this.phase2Pool[playerIndex]!;
    if (!canNominatePlayer(member, player, this.squadSize, this.minOpeningBidLakhs)) {
      return { success: false, reason: 'Cannot nominate this player (budget/role constraints)' };
    }

    if (this.nomination.graceTimerRef) { clearTimeout(this.nomination.graceTimerRef); this.nomination.graceTimerRef = null; }

    this.phase2Pool.splice(playerIndex, 1);
    await this.startLot(player);
    this.placeNominationAutoBid(member);
    return { success: true };
  }

  private placeNominationAutoBid(member: AuctionMember): void {
    if (!this.currentLot) return;
    const amount = this.minOpeningBidLakhs;
    const isAllIn = computeMaxBid(member, this.squadSize, this.minOpeningBidLakhs) === amount;

    const bid: ActiveBid = {
      memberId: member.id, userId: member.userId, teamName: member.teamName,
      amountLakhs: amount, isAllIn, timestamp: Date.now(),
    };

    this.currentLot.bids.push(bid);
    this.currentLot.currentBidLakhs = amount;
    this.currentLot.currentBidderId = member.id;

    const db = getDb();
    db.insert(bids).values({ lotId: this.currentLot.lotId, memberId: member.id, amountLakhs: amount, isWinning: true, isAllIn })
      .catch(err => console.error('[auction] nomination auto-bid persist error:', err));

    this.emit('bid:placed', {
      lot: this.serializeLot(),
      bid: { memberId: member.id, teamName: member.teamName, amount, isAllIn, isNominationBid: true },
      allInInfo: this.members.map(m => ({
        memberId: m.id,
        maxBid: computeMaxBid(m, this.squadSize, this.minOpeningBidLakhs),
        isAllIn: computeMaxBid(m, this.squadSize, this.minOpeningBidLakhs) === amount,
      })),
    });

    this.clearTimer();
    this.startTimer();
  }

  private skipNomination(): void {
    if (!this.nomination) return;
    const idx = this.nomination.currentIndex % this.nomination.order.length;
    const nominatorId = this.nomination.order[idx]!;
    if (this.nomination.graceTimerRef) { clearTimeout(this.nomination.graceTimerRef); this.nomination.graceTimerRef = null; }
    this.emit('auction:nomination_skipped', { nominatorId, reason: 'offline_timeout' });
    this.nomination.currentIndex++;
    setTimeout(() => this.advanceNomination(), 1000);
  }

  // ── All-in tie / spin wheel ────────────────────────────────────────────────

  private checkAllInTie(): { tiedBidders: string[]; amount: number } | null {
    if (!this.currentLot?.currentBidderId || this.currentLot.matchBidders.length === 0) return null;
    return {
      tiedBidders: [this.currentLot.currentBidderId, ...this.currentLot.matchBidders],
      amount: this.currentLot.currentBidLakhs,
    };
  }

  private async handleSpinWheel(tieData: { tiedBidders: string[]; amount: number }): Promise<void> {
    const winnerIndex = crypto.randomInt(0, tieData.tiedBidders.length);
    const winnerId = tieData.tiedBidders[winnerIndex]!;

    const SPIN_COLORS = [
      '#004BA0', '#F9CD05', '#EC1C24', '#3A225D', '#17479E',
      '#FF822A', '#EA1A85', '#D4A840', '#59C1E8', '#10b981',
      '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#f59e0b',
    ];

    this.emit('auction:spin_wheel', {
      tiedBidders: tieData.tiedBidders.map((mid, idx) => {
        const m = this.members.find(mm => mm.id === mid);
        const memberIdx = this.members.findIndex(mm => mm.id === mid);
        return {
          memberId: mid,
          teamName: m?.teamName ?? '',
          color: SPIN_COLORS[(memberIdx >= 0 ? memberIdx : idx) % SPIN_COLORS.length],
        };
      }),
      amount: tieData.amount,
      winnerId,
    });

    if (this.currentLot) this.currentLot.currentBidderId = winnerId;
    setTimeout(() => { void this.sellPlayer(); }, SQUAD_RULES.SPIN_WHEEL_DELAY_MS);
  }

  // ── Admin controls ─────────────────────────────────────────────────────────

  pause(reason = 'admin'): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.pauseReason = reason;
    this.emit('auction:paused', { reason });
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pauseReason = null;
    this.emit('auction:resumed', {});
  }

  async skipCurrentPlayer(): Promise<{ success: boolean; reason?: string }> {
    if (!this.currentLot) return { success: false, reason: 'No active lot' };
    this.clearTimer();
    await this.unsoldPlayer();
    return { success: true };
  }

  async undoLastAllotment(): Promise<{ success: boolean; reason?: string }> {
    if (!this.undoBuffer) return { success: false, reason: 'Nothing to undo' };

    const salesAfterBuffer = this.totalSold - this.undoBuffer.allotmentIndex - 1;
    if (salesAfterBuffer >= 2) return { success: false, reason: 'Undo window closed (2+ allotments after this sale)' };

    const undo = this.undoBuffer;
    const member = this.members.find(m => m.id === undo.winnerMemberId);
    if (!member) return { success: false, reason: 'Winner member not found' };

    this.clearPresentTimeout();
    this.clearTimer();

    const db = getDb();

    if (this.currentLot) {
      db.update(auctionLots)
        .set({ status: 'UNSOLD', closedAt: new Date() })
        .where(eq(auctionLots.id, this.currentLot.lotId))
        .catch(err => console.error('[auction] undo cancel lot error:', err));
      this.currentLot = null;
    }

    member.budgetRemainingLakhs += undo.finalPriceLakhs;
    member.squad = member.squad.filter(s => s.playerId !== undo.player.id);
    this.totalSold--;

    if (this.phase === 'PHASE1') {
      this.currentQueueIndex = Math.max(0, this.currentQueueIndex - 1);
    } else {
      this.phase2Pool.unshift(undo.player);
    }

    db.update(auctionLots)
      .set({ status: 'UNSOLD', soldToMemberId: null, finalPriceLakhs: null, closedAt: null })
      .where(eq(auctionLots.id, undo.lotId))
      .catch(err => console.error('[auction] undo lot error:', err));

    db.delete(squadPlayers)
      .where(and(eq(squadPlayers.memberId, undo.winnerMemberId), eq(squadPlayers.playerId, undo.player.id)))
      .catch(err => console.error('[auction] undo squad error:', err));

    db.update(leagueMembers)
      .set({ budgetRemainingLakhs: member.budgetRemainingLakhs })
      .where(eq(leagueMembers.id, member.id))
      .catch(err => console.error('[auction] undo budget error:', err));

    this.emit('auction:undo_allotment', {
      player: undo.player,
      refundedTo: { memberId: member.id, teamName: member.teamName, refundAmount: undo.finalPriceLakhs },
      members: this.serializeMembers(),
      undoAvailable: false,
    });

    this.undoBuffer = null;

    this.presentTimeoutRef = setTimeout(() => {
      this.presentTimeoutRef = null;
      void this.startLot(undo.player);
    }, 500);

    return { success: true };
  }

  // ── Online presence ────────────────────────────────────────────────────────

  updateMemberOnlineStatus(userId: string, isOnline: boolean): void {
    const member = this.members.find(m => m.userId === userId);
    if (!member) return;

    member.isOnline = isOnline;
    this.emit('participant:status_changed', { memberId: member.id, isOnline });

    if (isOnline && this.nomination && !this.currentLot) {
      const idx = this.nomination.currentIndex % this.nomination.order.length;
      if (this.nomination.order[idx] === member.id && this.nomination.graceTimerRef) {
        clearTimeout(this.nomination.graceTimerRef);
        this.nomination.graceTimerRef = null;
      }
    }

    if (!isOnline && this.currentLot?.currentBidderId === member.id) {
      this.pause('participant_offline');
    }

    if (!isOnline && member.userId === this.commissionerId) {
      this.pause('admin_offline');
    }
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  getSnapshot(): AuctionSnapshot {
    const nominatorId = this.nomination && !this.currentLot
      ? (this.nomination.order[this.nomination.currentIndex % this.nomination.order.length] ?? null)
      : null;

    const eligiblePlayerIds = (() => {
      if (!this.nomination || this.currentLot || !nominatorId) return [];
      const nominator = this.members.find(m => m.id === nominatorId);
      if (!nominator) return [];
      return getEligiblePlayersForNomination(nominator, this.phase2Pool, this.squadSize, this.minOpeningBidLakhs).map(p => p.id);
    })();

    const remainingPlayerCount = this.phase === 'PHASE1'
      ? Math.max(0, this.playerQueue.length - this.currentQueueIndex)
      : this.phase2Pool.length;

    return {
      leagueId: this.leagueId,
      phase: this.phase,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      currentLot: this.currentLot ? { ...this.currentLot } : null,
      members: this.members.map(m => ({ ...m, squad: [...m.squad] })),
      playerQueue: this.phase === 'PHASE1' ? this.playerQueue : [],
      currentQueueIndex: this.currentQueueIndex,
      phase1Count: this.phase1Count,
      phase2Pool: this.phase2Pool.map(p => ({ ...p })),
      nomination: this.nomination
        ? { order: this.nomination.order, currentIndex: this.nomination.currentIndex }
        : null,
      currentNominatorId: nominatorId,
      eligiblePlayerIds,
      undoAvailable: !!this.undoBuffer && (this.totalSold - (this.undoBuffer.allotmentIndex) - 1) < 2,
      totalSold: this.totalSold,
      totalUnsold: this.totalUnsold,
      remainingPlayerCount,
      allotmentsSinceLastUndo: this.undoBuffer ? this.totalSold - this.undoBuffer.allotmentIndex - 1 : 0,
      transitionEndsAt: this.transitionEndsAt,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private checkAuctionComplete(): boolean {
    return this.members.every(m => m.squad.length >= this.squadSize);
  }

  private endAuction(): void {
    this.clearTimer();
    const db = getDb();
    db.update(leagues)
      .set({ status: 'COMPLETE' })
      .where(eq(leagues.id, this.leagueId))
      .catch(err => console.error('[auction] complete update error:', err));

    this.emit('auction:complete', { members: this.serializeMembers(), totalSold: this.totalSold });
    activeAuctions.delete(this.leagueId);
  }

  private emit(event: string, data: unknown): void {
    try {
      const io = getIO();
      io.to(`league:${this.leagueId}`).emit(event, data);
      // Broadcast full snapshot after every state change (skip timer ticks to avoid flooding)
      if (event !== 'auction:timer_tick') {
        io.to(`league:${this.leagueId}`).emit('auction:state_snapshot', this.getSnapshot());
      }
    } catch {
      // socket not yet initialized
    }
  }

  /** Broadcast a fresh snapshot without an accompanying named event. */
  private broadcastSnapshot(): void {
    try {
      getIO().to(`league:${this.leagueId}`).emit('auction:state_snapshot', this.getSnapshot());
    } catch {
      // socket not yet initialized
    }
  }

  private serializeLot(): LotState {
    return { ...this.currentLot! };
  }

  private serializeMembers() {
    return this.members.map(m => ({
      id: m.id,
      userId: m.userId,
      teamName: m.teamName,
      budgetRemainingLakhs: m.budgetRemainingLakhs,
      squadCount: m.squad.length,
      squad: m.squad,
      isOnline: m.isOnline,
    }));
  }

  private async persistSale(lotId: string, memberId: string, finalPriceLakhs: number, playerId: string, winner: AuctionMember): Promise<void> {
    const db = getDb();
    try {
      await db.update(auctionLots)
        .set({ status: 'SOLD', soldToMemberId: memberId, finalPriceLakhs, closedAt: new Date() })
        .where(eq(auctionLots.id, lotId));

      await db.insert(squadPlayers).values({ memberId, playerId, acquisitionPriceLakhs: finalPriceLakhs });

      await db.update(leagueMembers)
        .set({ budgetRemainingLakhs: winner.budgetRemainingLakhs })
        .where(eq(leagueMembers.id, memberId));
    } catch (err) {
      console.error('[auction] persistSale error:', err);
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function toAuctionPlayer(p: typeof players.$inferSelect): AuctionPlayer {
  return {
    id: p.id,
    name: p.name,
    teamCode: p.teamCode,
    role: (p.role ?? 'BAT') as AuctionPlayer['role'],
    playerPool: p.playerPool,
    isOverseas: p.isOverseas,
    isUncapped: p.isUncapped,
    basePriceLakhs: p.basePriceLakhs,
  };
}
