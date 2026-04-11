import type {
  AuctionConfig,
  AuctionMember,
  AuctionPlayer,
  BidValidationError,
  PlayerRole,
} from './types';

export interface BidValidationInput {
  member: AuctionMember;
  player: AuctionPlayer;
  amountLakhs: number;
  currentHighBidLakhs: number;
  config: AuctionConfig;
}

export interface BidValidationResult {
  valid: boolean;
  error?: BidValidationError;
  maxAffordableLakhs: number;
  isAllIn: boolean;
}

/**
 * Calculate the minimum bid the member must reserve for remaining empty squad slots
 * (so they can always fill the squad at base price).
 */
function calcBudgetReserve(member: AuctionMember, config: AuctionConfig): number {
  const filled = member.squad.length;
  const remaining = config.squadSize - filled - 1; // -1 for the current player being bid on
  return Math.max(0, remaining * config.minOpeningBidLakhs);
}

export function validateBid(input: BidValidationInput): BidValidationResult {
  const { member, player, amountLakhs, currentHighBidLakhs, config } = input;

  const reserve = calcBudgetReserve(member, config);
  const maxAffordableLakhs = member.budgetRemainingLakhs - reserve;
  const isAllIn = amountLakhs >= maxAffordableLakhs;

  // Budget check
  if (amountLakhs > maxAffordableLakhs) {
    return { valid: false, error: 'CANNOT_AFFORD_REMAINING_SQUAD', maxAffordableLakhs, isAllIn: false };
  }

  if (amountLakhs > member.budgetRemainingLakhs) {
    return { valid: false, error: 'INSUFFICIENT_BUDGET', maxAffordableLakhs, isAllIn: false };
  }

  // Minimum increment
  const minNext = calcMinNextBid(currentHighBidLakhs, config);
  if (amountLakhs < minNext) {
    return { valid: false, error: 'BID_TOO_LOW', maxAffordableLakhs, isAllIn };
  }

  // Squad full
  if (member.squad.length >= config.squadSize) {
    return { valid: false, error: 'SQUAD_FULL', maxAffordableLakhs, isAllIn };
  }

  // Role constraints
  const roleCount = member.squad.filter(s => s.role === player.role).length;
  const maxForRole = config.roleConstraints.max[player.role];
  if (roleCount >= maxForRole) {
    return { valid: false, error: 'ROLE_LIMIT_EXCEEDED', maxAffordableLakhs, isAllIn };
  }

  // Overseas limit
  if (player.isOverseas) {
    const overseasCount = member.squad.filter(s => s.isOverseas).length;
    if (overseasCount >= config.maxOverseas) {
      return { valid: false, error: 'OVERSEAS_LIMIT_EXCEEDED', maxAffordableLakhs, isAllIn };
    }
  }

  return { valid: true, maxAffordableLakhs, isAllIn };
}

export function calcMinNextBid(current: number, config: AuctionConfig): number {
  if (current === 0) return config.minOpeningBidLakhs;
  const increment = current < 100
    ? config.incrementSmallLakhs
    : config.incrementLargeLakhs;
  return current + increment;
}
