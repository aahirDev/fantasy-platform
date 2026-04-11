export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
export type AuctionPhase = 'LOBBY' | 'AUCTION_PHASE1' | 'AUCTION_PHASE2' | 'COMPLETE';
export type LotStatus = 'ACTIVE' | 'SOLD' | 'UNSOLD';
export type PauseReason = 'admin' | 'no_bidders' | null;

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
  name: string;
  role: PlayerRole;
  teamCode: string | null;
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
  bidderId: string | null;
  bidderName: string | null;
  amountLakhs: number;
}

export interface LotState {
  lotId: string;
  player: AuctionPlayer;
  status: LotStatus;
  currentBidLakhs: number;
  activeBid: ActiveBid | null;
  timerEndsAt: number | null;
  bidLog: Array<{ bidderId: string; bidderName: string; amountLakhs: number; ts: number }>;
}

export interface AuctionSnapshot {
  leagueId: string;
  phase: AuctionPhase;
  currentLot: LotState | null;
  members: AuctionMember[];
  nominatingMemberId: string | null;
  pauseReason: PauseReason;
  remainingPlayerCount: number;
  soldPlayerCount: number;
  unsoldPlayerCount: number;
}
