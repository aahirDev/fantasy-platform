import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useLeagueSquads, useStartAuction, useSyncMatches, useSetCaptain } from '../hooks/useLeagueSquads';
import type { League } from '../hooks/useLeagues';
import type { LeagueMember, SquadPlayer, SyncResult } from '../hooks/useLeagueSquads';

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  WK:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  BAT:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BOWL: 'bg-red-500/20 text-red-300 border-red-500/30',
  AR:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ROLE_COLOR[role] ?? 'bg-white/10 text-white/60 border-white/10'}`}>
      {role}
    </span>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/70 font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOBBY VIEW
// ══════════════════════════════════════════════════════════════════════════════

function LobbyView({ league, internalUserId }: { league: League; internalUserId: string | null }) {
  const { data: squadsData, isLoading } = useLeagueSquads(league.id);
  const { mutate: startAuction, isPending: starting, error: startError } = useStartAuction(league.id);
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const isCommissioner = internalUserId === league.commissionerId;
  const members = squadsData?.members ?? [];

  function handleStart() {
    startAuction(undefined, {
      onSuccess: () => navigate(`/league/${league.id}/auction`),
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode ?? '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Lobby</p>
        <h1 className="text-3xl font-black text-white">{league.name}</h1>
        {league.seasonName && <p className="text-white/50 text-sm mt-1">{league.seasonName}</p>}
      </div>

      {/* Invite code */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Invite Code</p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold text-white tracking-widest">{league.inviteCode}</span>
          <button
            onClick={copyCode}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-semibold transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-white/30 text-xs mt-2">Share this code so others can join</p>
      </div>

      {/* Config pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Teams', value: `${members.length} / ${league.numTeams}` },
          { label: 'Budget', value: `${league.totalBudgetLakhs} pts` },
          { label: 'Squad size', value: league.squadSize },
          { label: 'Bid timer', value: `${league.bidTimerSeconds}s` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-center">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">{label}</p>
            <p className="text-white font-bold text-sm">{value}</p>
          </div>
        ))}
      </div>

      {/* Members */}
      <div>
        <p className="text-white/40 text-xs uppercase tracking-widest mb-3">
          Teams ({members.length}/{league.numTeams})
        </p>
        {isLoading ? (
          <p className="text-white/20 text-sm">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-white/30 text-sm">No teams yet — share the invite code</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <Avatar name={m.teamName} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{m.teamName}</p>
                  <p className="text-white/40 text-xs">{m.username}</p>
                </div>
                <span className={`w-2 h-2 rounded-full ${m.isOnline ? 'bg-green-400' : 'bg-white/20'}`} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start auction */}
      {isCommissioner && (
        <div className="space-y-2">
          {startError && (
            <p className="text-red-400 text-sm text-center">
              {(startError as Error).message}
            </p>
          )}
          <button
            onClick={handleStart}
            disabled={starting || members.length < 2}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-lg rounded-2xl transition-colors"
          >
            {starting ? 'Starting…' : 'Start Auction'}
          </button>
          {members.length < 2 && (
            <p className="text-white/30 text-xs text-center">Need at least 2 teams to start</p>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HUB VIEW (post-auction tabs)
// ══════════════════════════════════════════════════════════════════════════════

type HubTab = 'standings' | 'squads' | 'players';

// ── Standings tab ─────────────────────────────────────────────────────────────

function StandingsTab({ members, matchesPlayed }: { members: LeagueMember[]; matchesPlayed: number }) {
  return (
    <div className="space-y-3">
      {matchesPlayed === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white/40 text-sm">
          Points will appear here once match scores are synced
        </div>
      )}
      {members.map((m, idx) => {
        const rank = idx + 1;
        const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-white/40';
        return (
          <div key={m.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <span className={`text-xl font-black w-6 text-center ${rankColor}`}>{rank}</span>
            <Avatar name={m.teamName} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{m.teamName}</p>
              <p className="text-white/40 text-xs">{m.username} · {m.squad.length} players</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white font-black text-xl tabular-nums">{m.totalPoints.toLocaleString()}</p>
              <p className="text-white/30 text-xs">pts</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Captain picker modal ──────────────────────────────────────────────────────

function CaptainModal({
  squad,
  currentCaptainId,
  currentVcId,
  onSave,
  onClose,
  saving,
}: {
  squad: SquadPlayer[];
  currentCaptainId: string | null;
  currentVcId: string | null;
  onSave: (captainId: string, vcId: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [captainId, setCaptainId]   = useState(currentCaptainId ?? '');
  const [vcId, setVcId]             = useState(currentVcId ?? '');

  const canSave = captainId && vcId && captainId !== vcId;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#13131a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-bold text-base">Set Captain &amp; Vice-Captain</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Legend */}
          <div className="flex gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-[10px] font-black text-black">C</span> 2× points</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-black text-black">VC</span> 1.5× points</span>
          </div>

          {squad.map(p => {
            const isC  = captainId === p.playerId;
            const isVC = vcId === p.playerId;
            return (
              <div
                key={p.playerId}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  isC ? 'border-amber-400/60 bg-amber-400/10' : isVC ? 'border-slate-300/50 bg-white/5' : 'border-white/5 bg-white/[0.03] hover:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role={p.role} />
                    <span className="text-white text-sm font-medium truncate">{p.playerName}</span>
                  </div>
                  {p.teamCode && <p className="text-white/30 text-xs mt-0.5">{p.teamCode}</p>}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setCaptainId(isC ? '' : p.playerId)}
                    className={`w-8 h-8 rounded-full text-xs font-black transition-colors ${
                      isC ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/40 hover:bg-white/20'
                    }`}
                  >C</button>
                  <button
                    onClick={() => setVcId(isVC ? '' : p.playerId)}
                    className={`w-8 h-8 rounded-full text-xs font-black transition-colors ${
                      isVC ? 'bg-slate-300 text-black' : 'bg-white/10 text-white/40 hover:bg-white/20'
                    }`}
                  >VC</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-white/10">
          <button
            disabled={!canSave || saving}
            onClick={() => canSave && onSave(captainId, vcId)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Squad card ────────────────────────────────────────────────────────────────

function SquadCard({
  member,
  leagueBudget,
  isOwnSquad,
  leagueId,
}: {
  member: LeagueMember;
  leagueBudget: number;
  isOwnSquad: boolean;
  leagueId: string;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [showCaptainModal, setShowCaptainModal] = useState(false);
  const { mutate: setCaptain, isPending: saving } = useSetCaptain(leagueId);

  const spentPct = leagueBudget > 0 ? (member.totalSpent / leagueBudget) * 100 : 0;
  const byRole = member.squad.reduce<Record<string, SquadPlayer[]>>((acc, p) => {
    (acc[p.role] ??= []).push(p);
    return acc;
  }, {});

  const hasCaptain = !!member.captainPlayerId;

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <button
          className="w-full flex items-center gap-4 px-5 py-4 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <Avatar name={member.teamName} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold truncate">{member.teamName}</p>
            <p className="text-white/40 text-xs">{member.username} · {member.squad.length} players</p>
            <div className="mt-1.5 h-1 bg-white/10 rounded-full w-32 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${spentPct}%` }} />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-white font-black text-lg tabular-nums">{member.totalPoints.toLocaleString()}</p>
            <p className="text-white/30 text-[10px]">pts</p>
            <p className="text-white/40 text-xs mt-0.5">{member.budgetRemainingLakhs} left</p>
          </div>
          <svg className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {/* Captain assignment CTA for own squad */}
            {isOwnSquad && (
              <button
                onClick={() => setShowCaptainModal(true)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors ${
                  hasCaptain
                    ? 'border-amber-400/30 bg-amber-400/5 text-amber-300'
                    : 'border-dashed border-white/20 bg-white/[0.02] text-white/40 hover:border-white/40 hover:text-white/70'
                }`}
              >
                <span className="text-sm font-semibold">
                  {hasCaptain ? '✓ Captain assigned — tap to change' : 'Assign Captain &amp; Vice-Captain'}
                </span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {(['WK', 'BAT', 'AR', 'BOWL'] as const).map(role => {
              const group = byRole[role];
              if (!group?.length) return null;
              const labels: Record<string, string> = { WK: 'Wicket-keepers', BAT: 'Batters', AR: 'All-rounders', BOWL: 'Bowlers' };
              return (
                <div key={role}>
                  <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2">
                    <RoleBadge role={role} />
                    <span>{labels[role]}</span>
                  </p>
                  <div className="space-y-1.5">
                    {group.map(p => (
                      <div key={p.playerId} className="flex items-center gap-2">
                        {/* C / VC badge */}
                        {p.isCaptain ? (
                          <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-[9px] font-black text-black flex-shrink-0">C</span>
                        ) : p.isViceCaptain ? (
                          <span className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[9px] font-black text-black flex-shrink-0">VC</span>
                        ) : (
                          <span className="w-5 flex-shrink-0" />
                        )}
                        <span className="flex-1 text-white/80 text-sm font-medium truncate">{p.playerName}</span>
                        {p.teamCode && <span className="text-white/30 text-xs font-mono">{p.teamCode}</span>}
                        {p.isOverseas && <span className="text-[10px] text-sky-400 border border-sky-500/30 bg-sky-500/10 px-1 rounded">OS</span>}
                        <span className="text-white/60 text-xs tabular-nums font-semibold">{p.acquisitionPriceLakhs}p</span>
                        {p.fantasyPoints > 0 && (
                          <span className={`text-xs tabular-nums font-bold ml-1 ${p.isCaptain ? 'text-amber-400' : p.isViceCaptain ? 'text-slate-300' : 'text-green-400'}`}>
                            +{p.fantasyPoints}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCaptainModal && (
        <CaptainModal
          squad={member.squad}
          currentCaptainId={member.captainPlayerId}
          currentVcId={member.viceCaptainPlayerId}
          saving={saving}
          onClose={() => setShowCaptainModal(false)}
          onSave={(captainPlayerId, viceCaptainPlayerId) => {
            setCaptain({ captainPlayerId, viceCaptainPlayerId }, {
              onSuccess: () => setShowCaptainModal(false),
            });
          }}
        />
      )}
    </>
  );
}

function SquadsTab({
  members,
  leagueBudget,
  internalUserId,
  leagueId,
}: {
  members: LeagueMember[];
  leagueBudget: number;
  internalUserId: string | null;
  leagueId: string;
}) {
  return (
    <div className="space-y-3">
      {members.map(m => (
        <SquadCard
          key={m.id}
          member={m}
          leagueBudget={leagueBudget}
          isOwnSquad={m.userId === internalUserId}
          leagueId={leagueId}
        />
      ))}
    </div>
  );
}

// ── Players tab ───────────────────────────────────────────────────────────────

function PlayersTab({ members }: { members: LeagueMember[] }) {
  const [sortBy, setSortBy] = useState<'price' | 'points'>('points');
  const [filterRole, setFilterRole] = useState<string>('ALL');

  // Flatten all squad players with ownership info
  const allPlayers = members.flatMap(m =>
    m.squad.map(p => ({ ...p, teamName: m.teamName, username: m.username }))
  );

  const filtered = allPlayers
    .filter(p => filterRole === 'ALL' || p.role === filterRole)
    .sort((a, b) => sortBy === 'price'
      ? b.acquisitionPriceLakhs - a.acquisitionPriceLakhs
      : b.fantasyPoints - a.fantasyPoints
    );

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {(['points', 'price'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${sortBy === s ? 'bg-white/10 text-white' : 'text-white/40'}`}
            >
              {s === 'points' ? 'By Points' : 'By Price'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {(['ALL', 'WK', 'BAT', 'AR', 'BOWL'] as const).map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterRole === r ? 'bg-white/10 text-white' : 'text-white/40'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-x-3 px-4 py-2 border-b border-white/10">
          <span className="text-white/30 text-[10px] uppercase tracking-wider">#</span>
          <span className="text-white/30 text-[10px] uppercase tracking-wider">Player</span>
          <span className="text-white/30 text-[10px] uppercase tracking-wider text-right">Price</span>
          <span className="text-white/30 text-[10px] uppercase tracking-wider text-right">Pts</span>
        </div>
        {filtered.map((p, i) => (
          <div
            key={`${p.playerId}-${i}`}
            className="grid grid-cols-[2rem_1fr_auto_auto] gap-x-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
          >
            <span className="text-white/30 text-sm tabular-nums">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <RoleBadge role={p.role} />
                {p.isOverseas && <span className="text-[10px] text-sky-400">OS</span>}
                <span className="text-white text-sm font-medium truncate">{p.playerName}</span>
              </div>
              <p className="text-white/30 text-xs mt-0.5">{p.teamName} · {p.teamCode}</p>
            </div>
            <span className="text-white/60 text-sm tabular-nums text-right self-center">{p.acquisitionPriceLakhs}p</span>
            <span className={`text-sm tabular-nums font-bold text-right self-center ${p.fantasyPoints > 0 ? 'text-green-400' : 'text-white/20'}`}>
              {p.fantasyPoints > 0 ? `+${p.fantasyPoints}` : '—'}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-white/30 text-sm text-center py-8">No players</p>
        )}
      </div>
    </div>
  );
}

// ── Hub wrapper ───────────────────────────────────────────────────────────────

function HubView({ league, internalUserId }: { league: League; internalUserId: string | null }) {
  const [tab, setTab] = useState<HubTab>('standings');
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const { data, isLoading } = useLeagueSquads(league.id);
  const { mutate: syncMatches, isPending: syncing } = useSyncMatches(league.id);

  const members = data?.members ?? [];
  const matchesPlayed = data?.matchesPlayed ?? 0;
  const isComplete = league.status === 'COMPLETE';
  const isCommissioner = internalUserId === league.commissionerId;

  function handleSync() {
    setSyncMsg(null);
    syncMatches(undefined, {
      onSuccess: (result: SyncResult) => {
        if (result.synced.length > 0) {
          setSyncMsg(`✓ Synced match${result.synced.length !== 1 ? 'es' : ''} ${result.synced.join(', ')}`);
        } else {
          setSyncMsg(result.message);
        }
      },
      onError: (err: unknown) => {
        setSyncMsg(`✗ ${err instanceof Error ? err.message : 'Sync failed'}`);
      },
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link to="/" className="text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">{league.name}</h1>
            <p className="text-white/40 text-xs">
              {isComplete ? 'Season complete' : 'Season active'}
              {matchesPlayed > 0 && ` · ${matchesPlayed} match${matchesPlayed !== 1 ? 'es' : ''} played`}
            </p>
          </div>
          {isCommissioner && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                title="Fetch latest completed matches from CricAPI and compute fantasy points"
              >
                {syncing ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {syncing ? 'Syncing…' : 'Sync Scores'}
              </button>
              <span className="text-amber-400 text-[10px] font-bold bg-amber-400/10 border border-amber-400/20 rounded px-2 py-1">
                COMMISSIONER
              </span>
            </div>
          )}
        </div>
        {syncMsg && (
          <div className="max-w-2xl mx-auto mt-2">
            <p className={`text-xs px-3 py-1.5 rounded-lg ${syncMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : syncMsg.startsWith('✗') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/5 text-white/50 border border-white/10'}`}>
              {syncMsg}
            </p>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="max-w-2xl mx-auto flex">
          {([
            { id: 'standings', label: 'Standings' },
            { id: 'squads', label: 'Squads' },
            { id: 'players', label: 'Players' },
          ] as { id: HubTab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
                tab === t.id
                  ? 'text-white border-indigo-500'
                  : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-5">
        {isLoading ? (
          <div className="text-center text-white/30 py-16">Loading…</div>
        ) : (
          <>
            {tab === 'standings' && <StandingsTab members={members} matchesPlayed={matchesPlayed} />}
            {tab === 'squads' && <SquadsTab members={members} leagueBudget={league.totalBudgetLakhs} internalUserId={internalUserId} leagueId={league.id} />}
            {tab === 'players' && <PlayersTab members={members} />}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PAGE ENTRY
// ══════════════════════════════════════════════════════════════════════════════

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { internalUserId } = useAuthStore();

  const { data: league, isLoading } = useQuery<League>({
    queryKey: ['league', id],
    queryFn: () => apiFetch(`/api/leagues/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll while in auction phases so we catch transitions
      const status = query.state.data?.status;
      return status === 'AUCTION_PHASE1' || status === 'AUCTION_PHASE2' ? 5000 : false;
    },
  });

  // Redirect mid-auction
  if (league?.status === 'AUCTION_PHASE1' || league?.status === 'AUCTION_PHASE2') {
    navigate(`/league/${id}/auction`, { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white/30 text-sm">
        Loading…
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">League not found</p>
          <Link to="/" className="mt-2 text-white/50 hover:text-white text-sm underline block">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  // LOBBY
  if (league.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/10 px-4 py-3">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <Link to="/" className="text-white/50 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
        </header>
        <LobbyView league={league} internalUserId={internalUserId} />
      </div>
    );
  }

  // ACTIVE or COMPLETE → hub
  return <HubView league={league} internalUserId={internalUserId} />;
}
