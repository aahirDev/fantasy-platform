import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { League } from './useLeagues';

export interface SyncResult {
  synced: number[];
  skipped: number[];
  failed: Array<{ matchNumber: number; error: string }>;
  message: string;
}

export interface SquadPlayer {
  playerId: string;
  playerName: string;
  role: 'WK' | 'BAT' | 'AR' | 'BOWL';
  teamCode: string | null;
  isOverseas: boolean;
  isUncapped: boolean;
  acquisitionPriceLakhs: number;
  rosterConfig: { fromMatch: number; toMatch: number | null } | null;
  fantasyPoints: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface CaptainAssignment {
  memberId: string;
  playerId: string;
  role: 'CAPTAIN' | 'VICE_CAPTAIN';
  fromMatch: number;
}

export interface LeagueMember {
  id: string;
  userId: string;
  teamName: string;
  username: string;
  displayName: string | null;
  budgetRemainingLakhs: number;
  totalSpent: number;
  totalPoints: number;
  isOnline: boolean;
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
  squad: SquadPlayer[];
  captainAssignments: CaptainAssignment[];
}

export interface LeagueSquadsResponse {
  league: League;
  members: LeagueMember[];
  matchesPlayed: number;
}

export function useLeagueSquads(leagueId: string | undefined) {
  return useQuery<LeagueSquadsResponse>({
    queryKey: ['league-squads', leagueId],
    queryFn: () => apiFetch(`/api/leagues/${leagueId}/squads`),
    enabled: !!leagueId,
    staleTime: 30_000,
  });
}

export function useStartAuction(leagueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/leagues/${leagueId}/start`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['league', leagueId] });
      void qc.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
}

export function useSyncMatches(leagueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<SyncResult>({
    mutationFn: () =>
      apiFetch('/api/matches/sync', {
        method: 'POST',
        body: JSON.stringify({ leagueId }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['league-squads', leagueId] });
    },
  });
}

export function useSetCaptain(leagueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { captainPlayerId: string; viceCaptainPlayerId: string }) =>
      apiFetch(`/api/leagues/${leagueId}/captain`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['league-squads', leagueId] });
    },
  });
}

// ── Per-match breakdown ───────────────────────────────────────────────────────

export interface BreakdownPlayer {
  playerId: string;
  playerName: string;
  role: string;
  teamCode: string | null;
  basePoints: number;
  multiplier: number;
  fantasyPoints: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface MatchBreakdown {
  matchNumber: number;
  captainPlayerId: string | null;
  vcPlayerId: string | null;
  players: BreakdownPlayer[];
  matchTotal: number;
}

export interface MemberBreakdownResponse {
  member: { id: string; teamName: string; username: string; displayName: string | null };
  matches: MatchBreakdown[];
  grandTotal: number;
}

export function useLeagueMemberBreakdown(leagueId: string, memberId: string | null) {
  return useQuery<MemberBreakdownResponse>({
    queryKey: ['league-breakdown', leagueId, memberId],
    queryFn: () => apiFetch(`/api/leagues/${leagueId}/members/${memberId}/breakdown`),
    enabled: !!memberId,
    staleTime: 60_000,
  });
}

export function useLeagueMembers(leagueId: string | undefined) {
  return useQuery<LeagueMember[]>({
    queryKey: ['league-members', leagueId],
    queryFn: async () => {
      const data = await apiFetch<LeagueSquadsResponse>(`/api/leagues/${leagueId}/squads`);
      return data.members;
    },
    enabled: !!leagueId,
    staleTime: 30_000,
  });
}
