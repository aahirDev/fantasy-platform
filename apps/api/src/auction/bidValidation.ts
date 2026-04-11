import {
  type AuctionMember,
  type AuctionPlayer,
  type BidValidationResult,
  type SquadEntry,
  SQUAD_RULES,
  getMinNextBid,
} from './types.js';

export function validateBid(
  member: AuctionMember,
  player: AuctionPlayer,
  bidAmount: number,
  currentBid: number,
  currentBidderId: string | null,
  squadSize: number,
  minOpeningBid: number,
  allowHolderRebid = false,
): BidValidationResult {
  if (member.id === currentBidderId && !allowHolderRebid) {
    return { valid: false, reason: 'You already hold the top bid' };
  }

  if (member.squad.length >= squadSize) {
    return { valid: false, reason: 'Your squad is full' };
  }

  if (currentBid === 0) {
    if (bidAmount < minOpeningBid) {
      return { valid: false, reason: `Minimum opening bid is ${minOpeningBid}` };
    }
  } else {
    const maxBid = computeMaxBid(member, squadSize, minOpeningBid);
    const isAllInAttempt = bidAmount === maxBid;
    if (!isAllInAttempt || bidAmount !== currentBid) {
      const minNext = getMinNextBid(currentBid);
      if (bidAmount < minNext) {
        return { valid: false, reason: `Minimum bid is ${minNext}` };
      }
    }
  }

  const slotsRemaining = squadSize - member.squad.length;
  const reserveForRemaining = (slotsRemaining - 1) * minOpeningBid;
  const maxAffordable = member.budgetRemainingLakhs - reserveForRemaining;

  if (bidAmount > maxAffordable) {
    return { valid: false, reason: `Insufficient budget (must reserve ${minOpeningBid} per remaining slot)` };
  }

  if (player.isOverseas) {
    const overseasCount = member.squad.filter(s => s.isOverseas).length;
    if (overseasCount >= SQUAD_RULES.MAX_OVERSEAS) {
      return { valid: false, reason: 'Maximum overseas players (4) already reached' };
    }
  }

  const compositionCheck = checkSquadComposition(member.squad, player, squadSize);
  if (!compositionCheck.valid) return compositionCheck;

  const isAllIn = bidAmount === maxAffordable;
  return { valid: true, isAllIn };
}

export function checkSquadComposition(
  currentSquad: SquadEntry[],
  newPlayer: AuctionPlayer,
  squadSize: number,
): BidValidationResult {
  const hypothetical = [
    ...currentSquad,
    {
      playerId: newPlayer.id,
      playerName: newPlayer.name,
      role: newPlayer.role,
      isOverseas: newPlayer.isOverseas,
      isUncapped: newPlayer.isUncapped,
      acquisitionPriceLakhs: 0,
    },
  ];

  const slotsAfter = squadSize - hypothetical.length;
  const roleCounts: Record<string, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  let overseasCount = 0;
  let uncappedCount = 0;

  for (const entry of hypothetical) {
    roleCounts[entry.role] = (roleCounts[entry.role] ?? 0) + 1;
    if (entry.isOverseas) overseasCount++;
    if (entry.isUncapped) uncappedCount++;
  }

  if (overseasCount > SQUAD_RULES.MAX_OVERSEAS) {
    return { valid: false, reason: 'Would exceed maximum overseas players (4)' };
  }

  for (const [role, maxAllowed] of Object.entries(SQUAD_RULES.MAX_PER_ROLE)) {
    if ((roleCounts[role] ?? 0) > maxAllowed) {
      return { valid: false, reason: `Maximum ${role} players (${maxAllowed}) already reached` };
    }
  }

  let minimumSlotsNeeded = 0;
  for (const [role, minRequired] of Object.entries(SQUAD_RULES.MIN_PER_ROLE)) {
    const deficit = minRequired - (roleCounts[role] ?? 0);
    if (deficit > 0) minimumSlotsNeeded += deficit;
  }

  if (minimumSlotsNeeded > slotsAfter) {
    return { valid: false, reason: 'Cannot buy this player — remaining slots needed to satisfy role minimums' };
  }

  const uncappedDeficit = SQUAD_RULES.MIN_UNCAPPED - uncappedCount;
  if (uncappedDeficit > slotsAfter) {
    return { valid: false, reason: `Must include at least ${SQUAD_RULES.MIN_UNCAPPED} uncapped player — reserve a slot` };
  }

  return { valid: true };
}

export function canNominatePlayer(
  member: AuctionMember,
  player: AuctionPlayer,
  squadSize: number,
  minOpeningBid: number,
): boolean {
  return validateBid(member, player, minOpeningBid, 0, null, squadSize, minOpeningBid).valid;
}

export function getEligiblePlayersForNomination(
  member: AuctionMember,
  pool: AuctionPlayer[],
  squadSize: number,
  minOpeningBid: number,
): AuctionPlayer[] {
  return pool.filter(p => canNominatePlayer(member, p, squadSize, minOpeningBid));
}

export function computeMaxBid(
  member: AuctionMember,
  squadSize: number,
  minOpeningBid: number,
): number {
  const slotsRemaining = squadSize - member.squad.length;
  if (slotsRemaining <= 0) return 0;
  const reserveForRemaining = (slotsRemaining - 1) * minOpeningBid;
  return member.budgetRemainingLakhs - reserveForRemaining;
}
