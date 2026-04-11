import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type AuctionPhase = 1 | 2;
export type LotStatus = 'PENDING' | 'ACTIVE' | 'SOLD' | 'UNSOLD';
export type PlayerRole = 'WK' | 'BAT' | 'AR' | 'BOWL';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AuctionConfig {
  leagueId: string;
  numTeams: number;
  squadSize: number;
  totalBudgetLakhs: number;
  bidTimerSeconds: number;
  minOpeningBidLakhs: number;
  /** Bid increment below 100L */
  incrementSmallLakhs: number;
  /** Bid increment at or above 100L */
  incrementLargeLakhs: number;
  /** Role constraints */
  roleConstraints: RoleConstraints;
  /** Max overseas players per squad */
  maxOverseas: number;
  /** Min uncapped players per squad */
  minUncapped: number;
}

export interface RoleConstraints {
  min: Record<PlayerRole, number>;
  max: Record<PlayerRole, number>;
}

export const DEFAULT_CRICKET_ROLE_CONSTRAINTS: RoleConstraints = {
  min: { WK: 1, BAT: 3, AR: 1, BOWL: 3 },
  max: { WK: 4, BAT: 5, AR: 4, BOWL: 5 },
};

// ─── State ────────────────────────────────────────────────────────────────────

export interface AuctionPlayer {
  id: string;
  name: string;
  role: PlayerRole;
  isOverseas: boolean;
  isUncapped: boolean;
  basePriceLakhs: number;
  playerPoolGroup?: string; // A/B/C/D for phase ordering
}

export interface AuctionMember {
  id: string;
  userId: string;
  teamName: string;
  budgetRemainingLakhs: number;
  squad: AuctionSquadSlot[];
  isOnline: boolean;
  isReady: boolean;
}

export interface AuctionSquadSlot {
  playerId: string;
  role: PlayerRole;
  isOverseas: boolean;
  isUncapped: boolean;
  acquisitionPriceLakhs: number;
}

export interface ActiveLot {
  lotId: string;
  playerId: string;
  player: AuctionPlayer;
  phase: AuctionPhase;
  currentBidLakhs: number;
  currentBidderId: string | null;
  timerEndsAt: number; // Unix ms
  isAllIn: boolean;
}

export interface AuctionSnapshot {
  leagueId: string;
  phase: AuctionPhase;
  activeLot: ActiveLot | null;
  members: AuctionMember[];
  remainingPlayerCount: number;
  /** ISO timestamp */
  snapshotAt: string;
}

// ─── Events (Socket.io payloads) ──────────────────────────────────────────────

export const PlaceBidPayload = z.object({
  lotId: z.string().uuid(),
  amountLakhs: z.number().int().positive(),
  isAllIn: z.boolean().default(false),
});
export type PlaceBidPayload = z.infer<typeof PlaceBidPayload>;

export const NominatePlayerPayload = z.object({
  playerId: z.string().uuid(),
  openingBidLakhs: z.number().int().positive(),
});
export type NominatePlayerPayload = z.infer<typeof NominatePlayerPayload>;

// ─── Validation errors ────────────────────────────────────────────────────────

export type BidValidationError =
  | 'INSUFFICIENT_BUDGET'
  | 'BID_TOO_LOW'
  | 'SQUAD_FULL'
  | 'ROLE_LIMIT_EXCEEDED'
  | 'OVERSEAS_LIMIT_EXCEEDED'
  | 'CANNOT_AFFORD_REMAINING_SQUAD'
  | 'LOT_NOT_ACTIVE'
  | 'MEMBER_NOT_FOUND';
