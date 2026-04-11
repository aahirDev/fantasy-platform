import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuction } from '../hooks/useAuction';
import { CountdownRing } from '../components/auction/CountdownRing';
import { useAuthStore } from '../store/auth';
import { apiFetch } from '../lib/api';
import type { League } from '../hooks/useLeagues';
import type { AuctionMember, AuctionPlayer, AuctionSnapshot } from '../types/auction';

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

// ── SOLD / UNSOLD overlay ─────────────────────────────────────────────────────

function ResultOverlay({ snapshot }: { snapshot: AuctionSnapshot }) {
  const lot = snapshot.currentLot;
  if (!lot || lot.status === 'ACTIVE') return null;

  const sold = lot.status === 'SOLD';
  const winner = sold ? snapshot.members.find(m => m.id === lot.currentBidderId) : null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
      <div
        className={`text-6xl font-black tracking-widest mb-2 ${sold ? 'text-green-400' : 'text-red-400'}`}
        style={{ textShadow: sold ? '0 0 32px #22c55e' : '0 0 32px #ef4444' }}
      >
        {sold ? 'SOLD!' : 'UNSOLD'}
      </div>
      {sold && winner && (
        <div className="text-xl text-white/80 mt-1">
          To <span className="font-bold text-white">{winner.teamName}</span>
          {' '}for <span className="font-bold text-green-400">{lot.currentBidLakhs} pts</span>
        </div>
      )}
      <div className="mt-3 text-2xl font-semibold text-white/60">{lot.player.name}</div>
    </div>
  );
}

// ── Nomination overlay ────────────────────────────────────────────────────────

function NominationOverlay({
  snapshot,
  myMember,
  nominate,
}: {
  snapshot: AuctionSnapshot;
  myMember: AuctionMember | null;
  nominate: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const isMyTurn = !!myMember && snapshot.currentNominatorId === myMember.id && !snapshot.currentLot;
  if (!isMyTurn) return null;

  // Eligible players = phase2Pool filtered by eligiblePlayerIds
  const eligible = snapshot.phase2Pool.filter(p => snapshot.eligiblePlayerIds.includes(p.id));
  const filtered = eligible.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute inset-0 z-20 flex flex-col rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}>
      <div className="p-4 border-b border-white/10">
        <p className="text-amber-400 font-bold text-center">Your turn to nominate a player</p>
        <input
          autoFocus
          className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => nominate(p.id)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition-colors"
          >
            <RoleBadge role={p.role} />
            <span className="flex-1 text-white text-sm font-medium">{p.name}</span>
            {p.teamCode && <span className="text-white/40 text-xs">{p.teamCode}</span>}
            <span className="text-white/60 text-xs">{p.basePriceLakhs} pts</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-white/30 text-sm py-8">No eligible players</p>
        )}
      </div>
    </div>
  );
}

// ── Phase transition overlay ──────────────────────────────────────────────────

function PhaseTransitionOverlay({
  snapshot,
  isCommissioner,
  onSkip,
}: {
  snapshot: AuctionSnapshot;
  isCommissioner: boolean;
  onSkip: () => void;
}) {
  const [secsLeft, setSecsLeft] = useState(() =>
    snapshot.transitionEndsAt ? Math.max(0, Math.ceil((snapshot.transitionEndsAt - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!snapshot.transitionEndsAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((snapshot.transitionEndsAt! - Date.now()) / 1000));
      setSecsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [snapshot.transitionEndsAt]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0a0a0f]">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-8 px-6 text-center">
        {/* Phase badge */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 tracking-widest uppercase">
            Phase 1 Complete
          </span>
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            Phase 2 Starting
          </h1>
          <p className="text-white/40 mt-2 text-base">
            Nomination round — teams pick from the unsold pool
          </p>
        </div>

        {/* Countdown ring */}
        <div className="flex flex-col items-center gap-3">
          <CountdownRing endsAt={snapshot.transitionEndsAt} totalSeconds={30} size={120} stroke={8} />
          <p className="text-white/50 text-sm tabular-nums">
            {secsLeft}s until Phase 2
          </p>
        </div>

        {/* Stats summary */}
        <div className="flex items-center gap-6 bg-white/5 border border-white/10 rounded-2xl px-8 py-5">
          <div className="text-center">
            <p className="text-3xl font-black text-green-400 tabular-nums">{snapshot.totalSold}</p>
            <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Sold</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-center">
            <p className="text-3xl font-black text-red-400 tabular-nums">{snapshot.totalUnsold}</p>
            <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">Unsold</p>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-center">
            <p className="text-3xl font-black text-indigo-400 tabular-nums">{snapshot.phase2Pool.length}</p>
            <p className="text-white/40 text-xs mt-0.5 uppercase tracking-wider">In Pool</p>
          </div>
        </div>

        {/* Commissioner skip */}
        {isCommissioner && (
          <button
            onClick={onSkip}
            className="text-white/30 hover:text-white/60 text-sm underline underline-offset-4 transition-colors"
          >
            Start Phase 2 now
          </button>
        )}
      </div>
    </div>
  );
}

// ── Bid panel ─────────────────────────────────────────────────────────────────

function BidPanel({
  snapshot,
  myMember,
  placeBid,
  placeAllIn,
  bidTimerSeconds,
  rejectionReason,
}: {
  snapshot: AuctionSnapshot;
  myMember: AuctionMember | null;
  placeBid: (n: number) => void;
  placeAllIn: () => void;
  bidTimerSeconds: number;
  rejectionReason: string | null;
}) {
  const [input, setInput] = useState('');
  const lot = snapshot.currentLot;
  const isLeading = !!lot && lot.currentBidderId === myMember?.id;
  const minNext = lot ? lot.currentBidLakhs + 1 : 0;
  const budget = myMember?.budgetRemainingLakhs ?? 0;

  const currentBidderName = lot?.currentBidderId
    ? snapshot.members.find(m => m.id === lot.currentBidderId)?.teamName ?? null
    : null;

  const handleBid = () => {
    const amt = Number(input);
    if (!isNaN(amt) && amt >= minNext) { placeBid(amt); setInput(''); }
  };

  const quickBids = lot
    ? [minNext, minNext + 5, minNext + 10, minNext + 25].filter(v => v <= budget)
    : [];

  return (
    <div className="flex flex-col gap-3">
      {lot ? (
        <div className="relative bg-white/5 border border-white/10 rounded-2xl p-5 overflow-hidden">
          <ResultOverlay snapshot={snapshot} />

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <RoleBadge role={lot.player.role} />
                {lot.player.isOverseas && (
                  <span className="text-[10px] border border-sky-500/30 bg-sky-500/10 text-sky-300 px-1.5 py-0.5 rounded font-bold">OS</span>
                )}
                {lot.player.isUncapped && (
                  <span className="text-[10px] border border-violet-500/30 bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded font-bold">UC</span>
                )}
              </div>
              <h2 className="text-2xl font-black text-white truncate">{lot.player.name}</h2>
              {lot.player.teamCode && <p className="text-white/50 text-sm mt-0.5">{lot.player.teamCode}</p>}
            </div>

            {lot.status === 'ACTIVE' && (
              <CountdownRing endsAt={lot.timerEndsAt} totalSeconds={bidTimerSeconds} size={88} />
            )}
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{lot.currentBidLakhs}</span>
            <span className="text-white/50 text-sm">pts</span>
            {currentBidderName && (
              <span className="ml-1 text-white/40 text-sm">— {currentBidderName}</span>
            )}
          </div>
          {isLeading && <p className="mt-1 text-green-400 text-xs font-semibold">You are leading</p>}

          {snapshot.isPaused && (
            <div className="mt-3 text-center text-amber-400 text-sm font-semibold bg-amber-400/10 border border-amber-400/20 rounded-lg py-2">
              {snapshot.pauseReason === 'admin' ? 'Paused by commissioner' : 'Auction paused'}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center text-white/40">
          {snapshot.phase === 'PHASE2' && snapshot.currentNominatorId
            ? (() => {
                const nominator = snapshot.members.find(m => m.id === snapshot.currentNominatorId);
                return nominator ? `Waiting for ${nominator.teamName} to nominate…` : 'Waiting for nomination…';
              })()
            : 'Loading next player…'}
        </div>
      )}

      {/* Bid input — only when there's an active lot, not paused, and I'm a member */}
      {lot?.status === 'ACTIVE' && myMember && !snapshot.isPaused && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          {rejectionReason && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {rejectionReason}
            </p>
          )}

          {quickBids.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {quickBids.map(v => (
                <button
                  key={v}
                  onClick={() => placeBid(v)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-semibold hover:bg-indigo-500/30 transition-colors"
                >
                  {v} pts
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="number"
              min={minNext}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder={`Min ${minNext} pts`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBid()}
            />
            <button
              onClick={handleBid}
              disabled={!input || Number(input) < minNext}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-40"
            >
              Bid
            </button>
          </div>

          {budget > lot.currentBidLakhs && (
            <button
              onClick={placeAllIn}
              className="w-full py-2 bg-red-600/20 border border-red-500/30 text-red-300 font-bold rounded-lg text-sm hover:bg-red-600/30 transition-colors"
            >
              ALL IN — {budget} pts
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bid log ───────────────────────────────────────────────────────────────────

function BidLog({ snapshot }: { snapshot: AuctionSnapshot }) {
  const bids = snapshot.currentLot?.bids ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bids.length]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 h-48 overflow-y-auto">
      <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Bid Log</p>
      {bids.length === 0 ? (
        <p className="text-white/20 text-sm text-center pt-4">No bids yet</p>
      ) : (
        <div className="space-y-1">
          {[...bids].reverse().map((b, i) => (
            <div key={i} className="flex items-baseline justify-between text-sm">
              <span className="text-white/70 font-medium">
                {b.teamName}
                {b.isAllIn && <span className="ml-1 text-xs text-red-400">ALL IN</span>}
              </span>
              <span className="text-white font-bold">{b.amountLakhs} pts</span>
            </div>
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Teams panel ───────────────────────────────────────────────────────────────

function TeamsPanel({ snapshot, myMember }: { snapshot: AuctionSnapshot; myMember: AuctionMember | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {snapshot.members.map(m => {
        const isMe = m.id === myMember?.id;
        const isLeading = snapshot.currentLot?.currentBidderId === m.id;
        const isExpanded = expanded === m.id;

        return (
          <div key={m.id} className={`bg-white/5 border rounded-xl overflow-hidden transition-all ${isMe ? 'border-indigo-500/40' : 'border-white/10'}`}>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : m.id)}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.isOnline ? 'bg-green-400' : 'bg-white/20'}`} />

              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {m.teamName}
                  {isMe && <span className="ml-1 text-indigo-400 text-xs">(you)</span>}
                </p>
                <p className="text-white/40 text-xs">{m.username} · {m.squad.length} players</p>
              </div>

              {isLeading && (
                <span className="text-green-400 text-xs font-bold bg-green-400/10 border border-green-400/20 rounded px-2 py-0.5">LEADING</span>
              )}

              <div className="text-right flex-shrink-0">
                <p className="text-white font-bold text-sm">{m.budgetRemainingLakhs} pts</p>
                <p className="text-white/40 text-xs">remaining</p>
              </div>

              <svg className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && m.squad.length > 0 && (
              <div className="border-t border-white/10 p-3 space-y-1 max-h-56 overflow-y-auto">
                {m.squad.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <RoleBadge role={p.role} />
                    <span className="flex-1 text-white/80 truncate">{p.playerName}</span>
                    <span className="text-white/40 text-xs">{p.acquisitionPriceLakhs}p</span>
                  </div>
                ))}
              </div>
            )}
            {isExpanded && m.squad.length === 0 && (
              <div className="border-t border-white/10 px-4 py-2 text-white/30 text-xs">No players yet</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Admin controls ────────────────────────────────────────────────────────────

function AdminControls({
  snapshot,
  pause,
  resume,
  skip,
  undo,
  skipToPhase2,
}: {
  snapshot: AuctionSnapshot;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  undo: () => void;
  skipToPhase2: () => void;
}) {
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Commissioner Controls</p>
      <div className="flex flex-wrap gap-2">
        {snapshot.isPaused ? (
          <button onClick={resume} className="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-300 text-sm font-semibold hover:bg-green-600/30 transition-colors">
            Resume
          </button>
        ) : (
          <button onClick={pause} className="px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-300 text-sm font-semibold hover:bg-amber-600/30 transition-colors">
            Pause
          </button>
        )}
        <button onClick={skip} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/10 transition-colors">
          Skip Player
        </button>
        <button onClick={undo} disabled={!snapshot.undoAvailable} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-30">
          Undo Last
        </button>
        {snapshot.phase === 'PHASE1' && (
          <button onClick={skipToPhase2} className="px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-semibold hover:bg-violet-600/30 transition-colors">
            Skip to Phase 2
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ snapshot }: { snapshot: AuctionSnapshot }) {
  const phase = snapshot.phase === 'PHASE1' ? 'Phase 1' : 'Phase 2';
  return (
    <div className="flex items-center gap-4 text-sm text-white/50 flex-wrap">
      <span className="font-semibold text-white/70">{phase}</span>
      <span>·</span>
      <span>{snapshot.remainingPlayerCount} remaining</span>
      <span>·</span>
      <span className="text-green-400">{snapshot.totalSold} sold</span>
      <span>·</span>
      <span className="text-red-400">{snapshot.totalUnsold} unsold</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuctionRoom() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { internalUserId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'bid' | 'teams'>('bid');

  // Fetch league for bidTimerSeconds + commissionerId
  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiFetch(`/api/leagues/${leagueId}`),
  });

  const {
    snapshot,
    connected,
    error,
    placeBid,
    placeAllIn,
    nominate,
    pause,
    resume,
    skip,
    undo,
    skipToPhase2,
    rejectionReason,
  } = useAuction(leagueId!);

  const myMember = snapshot?.members.find(m => m.userId === internalUserId) ?? null;
  const isCommissioner = !!internalUserId && league?.commissionerId === internalUserId;
  const bidTimerSeconds = league?.bidTimerSeconds ?? 30;

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg font-semibold">{error}</p>
          <Link to="/" className="mt-4 text-white/50 hover:text-white text-sm underline block">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Link to="/" className="text-white/50 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-bold text-lg">{league?.name ?? 'Auction Room'}</h1>
        <div className="flex-1" />
        <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-white/30'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-white/20'}`} />
          {connected ? 'Live' : 'Connecting…'}
        </div>
      </header>

      {!snapshot && (
        <div className="flex items-center justify-center h-64">
          <div className="text-white/30 text-sm">Connecting to auction…</div>
        </div>
      )}

      {/* Phase 1 → 2 transition screen */}
      {snapshot?.transitionEndsAt && (
        <PhaseTransitionOverlay
          snapshot={snapshot}
          isCommissioner={isCommissioner}
          onSkip={skipToPhase2}
        />
      )}

      {snapshot && (
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="mb-4">
            <StatsBar snapshot={snapshot} />
          </div>

          {/* Mobile tabs */}
          <div className="flex md:hidden gap-1 mb-4 bg-white/5 rounded-xl p-1">
            {(['bid', 'teams'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-white/10 text-white' : 'text-white/40'}`}
              >
                {tab === 'bid' ? 'Auction' : 'Teams'}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-[1fr_320px] gap-4">
            {/* Left: bid panel + log */}
            <div className={`space-y-4 ${activeTab !== 'bid' ? 'hidden md:block' : ''}`}>
              <div className="relative">
                <NominationOverlay snapshot={snapshot} myMember={myMember} nominate={nominate} />
                <BidPanel
                  snapshot={snapshot}
                  myMember={myMember}
                  placeBid={placeBid}
                  placeAllIn={placeAllIn}
                  bidTimerSeconds={bidTimerSeconds}
                  rejectionReason={rejectionReason}
                />
              </div>
              <BidLog snapshot={snapshot} />
            </div>

            {/* Right: admin + teams */}
            <div className={`space-y-4 ${activeTab !== 'teams' ? 'hidden md:block' : ''}`}>
              {isCommissioner && (
                <AdminControls
                  snapshot={snapshot}
                  pause={pause}
                  resume={resume}
                  skip={skip}
                  undo={undo}
                  skipToPhase2={skipToPhase2}
                />
              )}
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 px-1">Teams</p>
                <TeamsPanel snapshot={snapshot} myMember={myMember} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
