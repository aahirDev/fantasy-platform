// Internal types for AuctionStateManager — not the same as @fantasy/auction package types

export const SQUAD_RULES = {
  MIN_PER_ROLE: { WK: 1, BAT: 3, AR: 1, BOWL: 3 } as Record<string, number>,
  MAX_PER_ROLE: { WK: 4, BAT: 5, AR: 4, BOWL: 5 } as Record<string, number>,
  MAX_OVERSEAS: 4,
  MIN_UNCAPPED: 1,
  PHASE2_NOMINATION_TIMEOUT_MS: 10_000,
  PHASE_TRANSITION_SECONDS: 30,
  SPIN_WHEEL_DELAY_MS: 5000,
};

export type PlayerRole = 'WK' | 'BAT' | 'AR' | 'BOWL';
export type AuctionPhase = 'PHASE1' | 'PHASE2';
export type LotStatus = 'ACTIVE' | 'SOLD' | 'UNSOLD';

export interface AuctionPlayer {
  id: string;
  name: string;
  teamCode: string | null;
  role: PlayerRole;
  playerPool: string | null;
  isOverseas: boolean;
  isUncapped: boolean;
  basePriceLakhs: number;
}

export interface AuctionMember {
  id: string;
  userId: string;
  teamName: string;
  budgetRemainingLakhs: number;
  isOnline: boolean;
  username: string;
  squad: SquadEntry[];
}

export interface SquadEntry {
  playerId: string;
  playerName: string;
  role: PlayerRole;
  isOverseas: boolean;
  isUncapped: boolean;
  acquisitionPriceLakhs: number;
}

export interface ActiveBid {
  memberId: string;
  userId: string;
  teamName: string;
  amountLakhs: number;
  isAllIn: boolean;
  timestamp: number;
}

export interface LotState {
  lotId: string;
  player: AuctionPlayer;
  status: LotStatus;
  bids: ActiveBid[];
  currentBidLakhs: number;
  currentBidderId: string | null;
  timerSeconds: number;
  presentedAt: number;
  matchBidders: string[];
}

export interface UndoEntry {
  lotId: string;
  player: AuctionPlayer;
  winnerId: string;
  winnerMemberId: string;
  finalPriceLakhs: number;
  allotmentIndex: number;
}

export interface NominationState {
  order: string[];
  currentIndex: number;
  graceTimerRef: ReturnType<typeof setTimeout> | null;
}

export interface AuctionSnapshot {
  leagueId: string;
  phase: AuctionPhase;
  isPaused: boolean;
  pauseReason: string | null;
  currentLot: LotState | null;
  members: AuctionMember[];
  playerQueue: AuctionPlayer[];
  currentQueueIndex: number;
  phase1Count: number;
  phase2Pool: AuctionPlayer[];
  nomination: { order: string[]; currentIndex: number } | null;
  currentNominatorId: string | null;
  eligiblePlayerIds: string[];
  undoAvailable: boolean;
  totalSold: number;
  totalUnsold: number;
  allotmentsSinceLastUndo: number;
}

export interface BidValidationResult {
  valid: boolean;
  reason?: string;
  isAllIn?: boolean;
}

export function getBidIncrement(currentBidLakhs: number): number {
  return currentBidLakhs < 100 ? 10 : 20;
}

export function getMinNextBid(currentBidLakhs: number): number {
  return currentBidLakhs + getBidIncrement(currentBidLakhs);
}
