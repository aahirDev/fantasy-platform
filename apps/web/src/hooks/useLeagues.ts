import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth';

export interface League {
  id: string;
  name: string;
  sport: string;
  status: 'LOBBY' | 'AUCTION_PHASE1' | 'AUCTION_PHASE2' | 'ACTIVE' | 'COMPLETE';
  commissionerId: string;
  numTeams: number;
  totalBudgetLakhs: number;
  squadSize: number;
  bidTimerSeconds: number;
  seasonName: string | null;
  inviteCode: string | null;
  createdAt: string;
}

export function useLeagues() {
  const internalUserId = useAuthStore((s) => s.internalUserId);
  return useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiFetch<League[]>('/api/leagues'),
    // Only fetch after auth/sync has run and linked our internal user ID.
    // This prevents the race where leagues fires before supabaseUid is written to DB.
    enabled: !!internalUserId,
  });
}

interface CreateLeagueInput {
  name: string;
  sport: string;
  numTeams: number;
  totalBudgetLakhs: number;
  squadSize: number;
  bidTimerSeconds: number;
  seasonName?: string;
}

export function useCreateLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeagueInput) =>
      apiFetch<League>('/api/leagues', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  });
}

export function useJoinLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ inviteCode, teamName }: { inviteCode: string; teamName: string }) =>
      apiFetch('/api/leagues/join', { method: 'POST', body: JSON.stringify({ inviteCode, teamName }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  });
}
