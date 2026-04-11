import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { League } from '../hooks/useLeagues';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: league, isLoading } = useQuery<League>({
    queryKey: ['league', id],
    queryFn: () => apiFetch(`/api/leagues/${id}`),
  });

  useEffect(() => {
    if (league && (league.status === 'AUCTION_PHASE1' || league.status === 'AUCTION_PHASE2')) {
      navigate(`/league/${id}/auction`, { replace: true });
    }
  }, [league, id, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white/30">
        Loading league...
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">League not found</p>
          <Link to="/" className="mt-2 text-white/50 hover:text-white text-sm underline block">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white px-4 py-8 max-w-2xl mx-auto">
      <Link to="/" className="text-white/40 hover:text-white text-sm flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>
      <h1 className="text-3xl font-black mb-1">{league.name}</h1>
      {league.seasonName && <p className="text-white/50 text-sm mb-6">{league.seasonName}</p>}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
        <p className="text-white/50 text-sm">Status: <span className="text-white font-semibold">{league.status}</span></p>
        <p className="text-white/40 text-sm mt-1">Invite code: <span className="font-mono text-white">{league.inviteCode}</span></p>
      </div>
    </div>
  );
}
