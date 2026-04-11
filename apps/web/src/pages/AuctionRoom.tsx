import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuction } from '../hooks/useAuction';
import { CountdownRing } from '../components/auction/CountdownRing';
import { useAuthStore } from '../store/auth';
import type { AuctionMember, AuctionPlayer, AuctionSnapshot } from '../types/auction';

// ── Role badge colours ────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  BATSMAN: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BOWLER: 'bg-red-500/20 text-red-300 border-red-500/30',
  ALL_ROUNDER: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  WICKET_KEEPER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const ROLE_LABEL: Record<string, string> = {
  BATSMAN: 'BAT',
  BOWLER: 'BOWL',
  ALL_ROUNDER: 'AR',
  WICKET_KEEPER: 'WK',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ROLE_COLOR[role] ?? 'bg-white/10 text-white/60 border-white/10'}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

// ── Overlay: SOLD / UNSOLD ────────────────────────────────────────────────────
function ResultOverlay({ snapshot }: { snapshot: AuctionSnapshot }) {
  const lot = snapshot.currentLot;
  if (!lot || lot.status === 'ACTIVE') return null;

  const sold = lot.status === 'SOLD';
  const winner = sold
    ? snapshot.members.find(m => m.id === lot.activeBid?.bidderId)
    : null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
      <div className={`text-6xl font-black tracking-widest mb-2 ${sold ? 'text-green-400' : 'text-red-400'}`}
        style={{ textShadow: sold ? '0 0 32px #22c55e' : '0 0 32px #ef4444' }}>
        {sold ? 'SOLD!' : 'UNSOLD'}
      </div>
      {sold && winner && (
        <div className="text-xl text-white/80 mt-1">
          To <span className="font-bold text-white">{winner.teamName}</span>
          {' '}for{' '}
          <span className="font-bold text-green-400">{lot.activeBid!.amountLakhs} pts</span>
        </div>
      )}
      <div className="mt-3 text-2xl font-semibold text-white/60">{lot.player.name}</div>
    </div>
  );
}

// ── Overlay: Nomination required ──────────────────────────────────────────────
function NominationOverlay({
  snapshot,
  myMember,
  eligiblePlayers,
  nominate,
}: {
  snapshot: AuctionSnapshot;
  myMember: AuctionMember | null;
  eligiblePlayers: AuctionPlayer[];
  nominate: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const isNominating = snapshot.nominatingMemberId === myMember?.id;

  if (!isNominating) return null;

  const filtered = eligiblePlayers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute inset-0 z-20 flex flex-col rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}>
      <div className="p-4 border-b border-white/10">
        <p className="text-amber-400 font-bold text-center">Your turn to nominate a player</p>
        <input
          autoFocus
          className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          placeholder="Search players..."
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

// ── Bid panel (left-center) ───────────────────────────────────────────────────
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
  const isLeading = lot?.activeBid?.bidderId === myMember?.id;
  const minNext = lot ? lot.currentBidLakhs + 1 : 0;

  const handleBid = () => {
    const amt = Number(input);
    if (!isNaN(amt) && amt >= minNext) {
      placeBid(amt);
      setInput('');
    }
  };

  const quickBids = lot
    ? [minNext, minNext + 5, minNext + 10, minNext + 25].filter(
        v => v <= (myMember?.budgetRemainingLakhs ?? 0)
      )
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Current lot */}
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
              {lot.player.teamCode && (
                <p className="text-white/50 text-sm mt-0.5">{lot.player.teamCode}</p>
              )}
            </div>

            {lot.status === 'ACTIVE' && (
              <CountdownRing endsAt={lot.timerEndsAt} totalSeconds={bidTimerSeconds} size={88} />
            )}
          </div>

          {/* Current bid */}
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{lot.currentBidLakhs}</span>
            <span className="text-white/50 text-sm">pts</span>
            {lot.activeBid && (
              <span className="ml-1 text-white/40 text-sm">— {lot.activeBid.bidderName}</span>
            )}
          </div>
          {isLeading && (
            <p className="mt-1 text-green-400 text-xs font-semibold">You are leading</p>
          )}

          {/* Pause banner */}
          {snapshot.pauseReason && (
            <div className="mt-3 text-center text-amber-400 text-sm font-semibold bg-amber-400/10 border border-amber-400/20 rounded-lg py-2">
              {snapshot.pauseReason === 'admin' ? 'Paused by commissioner' : 'Waiting for bidders...'}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center text-white/40">
          {snapshot.phase === 'LOBBY' ? 'Auction not started' :
           snapshot.phase === 'COMPLETE' ? 'Auction complete' :
           'Loading next player...'}
        </div>
      )}

      {/* Bid input */}
      {lot?.status === 'ACTIVE' && myMember && !snapshot.pauseReason && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          {rejectionReason && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {rejectionReason}
            </p>
          )}

          {/* Quick bids */}
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

          {/* Custom bid */}
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-40"
              disabled={!input || Number(input) < minNext}
            >
              Bid
            </button>
          </div>

          {/* All-in */}
          {myMember.budgetRemainingLakhs > lot.currentBidLakhs && (
            <button
              onClick={placeAllIn}
              className="w-full py-2 bg-red-600/20 border border-red-500/30 text-red-300 font-bold rounded-lg text-sm hover:bg-red-600/30 transition-colors"
            >
              ALL IN — {myMember.budgetRemainingLakhs} pts
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bid log ───────────────────────────────────────────────────────────────────
function BidLog({ snapshot }: { snapshot: AuctionSnapshot }) {
  const log = snapshot.currentLot?.bidLog ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 h-48 overflow-y-auto">
      <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Bid Log</p>
      {log.length === 0 ? (
        <p className="text-white/20 text-sm text-center pt-4">No bids yet</p>
      ) : (
        <div className="space-y-1">
          {[...log].reverse().map((entry, i) => (
            <div key={i} className="flex items-baseline justify-between text-sm">
              <span className="text-white/70 font-medium">{entry.bidderName}</span>
              <span className="text-white font-bold">{entry.amountLakhs} pts</span>
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
        const isLeading = snapshot.currentLot?.activeBid?.bidderId === m.id;
        const isExpanded = expanded === m.id;

        return (
          <div
            key={m.id}
            className={`bg-white/5 border rounded-xl overflow-hidden transition-all ${isMe ? 'border-indigo-500/40' : 'border-white/10'}`}
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : m.id)}
            >
              {/* Online dot */}
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
                    <span className="flex-1 text-white/80 truncate">{p.name}</span>
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
        {snapshot.pauseReason ? (
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
        <button onClick={undo} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/10 transition-colors">
          Undo Last
        </button>
        {snapshot.phase === 'AUCTION_PHASE1' && (
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
  const phase = snapshot.phase === 'AUCTION_PHASE1' ? 'Phase 1' :
                snapshot.phase === 'AUCTION_PHASE2' ? 'Phase 2' :
                snapshot.phase === 'COMPLETE' ? 'Complete' : snapshot.phase;

  return (
    <div className="flex items-center gap-4 text-sm text-white/50 flex-wrap">
      <span className="font-semibold text-white/70">{phase}</span>
      <span>·</span>
      <span>{snapshot.remainingPlayerCount} remaining</span>
      <span>·</span>
      <span className="text-green-400">{snapshot.soldPlayerCount} sold</span>
      <span>·</span>
      <span className="text-red-400">{snapshot.unsoldPlayerCount} unsold</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuctionRoom() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'bid' | 'teams'>('bid');

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

  const myMember = snapshot?.members.find(m => m.username === user?.user_metadata?.['username'] || m.userId === user?.id) ?? null;
  const isCommissioner = snapshot ? false : false; // will check via league data

  // Check if we need nomination overlay — only available players are shown, so we pass all from pool
  // We derive eligible players from snapshot (phase 2 / nomination_required)
  // For simplicity, we allow nominating any unassigned player visible in a secondary list
  // The server validates eligibility, so we just emit and let server reject

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
        <h1 className="font-bold text-lg">Auction Room</h1>
        <div className="flex-1" />

        {/* Connection indicator */}
        <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-white/30'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-white/20'}`} />
          {connected ? 'Live' : 'Connecting...'}
        </div>
      </header>

      {/* Loading */}
      {!snapshot && (
        <div className="flex items-center justify-center h-64">
          <div className="text-white/30 text-sm">Connecting to auction...</div>
        </div>
      )}

      {snapshot && (
        <div className="max-w-6xl mx-auto px-4 py-4">
          {/* Stats bar */}
          <div className="mb-4">
            <StatsBar snapshot={snapshot} />
          </div>

          {/* Admin controls (if commissioner — we'll show conditionally via league fetch; for now always shown to me if I match) */}
          {/* TODO: wire commissionerId check from league data */}

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

          {/* Two-column layout on desktop */}
          <div className="grid md:grid-cols-[1fr_320px] gap-4">
            {/* Left: Bid panel + log */}
            <div className={`space-y-4 ${activeTab !== 'bid' ? 'hidden md:block' : ''}`}>
              {/* Nomination overlay wraps bid panel */}
              <div className="relative">
                <NominationOverlay
                  snapshot={snapshot}
                  myMember={myMember}
                  eligiblePlayers={[]} // server-driven, no client-side filtering needed
                  nominate={nominate}
                />
                <BidPanel
                  snapshot={snapshot}
                  myMember={myMember}
                  placeBid={placeBid}
                  placeAllIn={placeAllIn}
                  bidTimerSeconds={30}
                  rejectionReason={rejectionReason}
                />
              </div>
              <BidLog snapshot={snapshot} />
            </div>

            {/* Right: Teams */}
            <div className={`space-y-4 ${activeTab !== 'teams' ? 'hidden md:block' : ''}`}>
              {/* Admin controls */}
              <AdminControls
                snapshot={snapshot}
                pause={pause}
                resume={resume}
                skip={skip}
                undo={undo}
                skipToPhase2={skipToPhase2}
              />
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
