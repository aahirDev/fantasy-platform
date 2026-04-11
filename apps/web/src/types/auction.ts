// Mirrors apps/api/src/auction/types.ts — keep in sync

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

export interface SquadEntry {
  playerId: string;
  playerName: string;
  role: PlayerRole;
  isOverseas: boolean;
  isUncapped: boolean;
  acquisitionPriceLakhs: number;
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
  /** Absolute epoch ms when the current timer expires. Null before first bid. */
  timerEndsAt: number | null;
  presentedAt: number;
  matchBidders: string[];
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
  remainingPlayerCount: number;
  allotmentsSinceLastUndo: number;
}
