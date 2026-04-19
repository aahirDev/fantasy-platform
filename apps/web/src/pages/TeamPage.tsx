import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLeagueMemberBreakdown } from '../hooks/useLeagueSquads';
import type { BreakdownPlayer, MatchBreakdown } from '../hooks/useLeagueSquads';

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  WK:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  BAT:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  BOWL: 'bg-red-500/20 text-red-300 border-red-500/30',
  AR:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${ROLE_COLOR[role] ?? 'bg-white/10 text-white/60 border-white/10'}`}>
      {role}
    </span>
  );
}

function CaptainBadge({ type }: { type: 'C' | 'VC' }) {
  return (
    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 ${
      type === 'C' ? 'bg-amber-400 text-black' : 'bg-slate-300 text-black'
    }`}>
      {type}
    </span>
  );
}

// ── Points formula ─────────────────────────────────────────────────────────────

function PointsFormula({ p }: { p: BreakdownPlayer }) {
  if (p.fantasyPoints === 0) {
    return <span className="text-white/20 text-sm tabular-nums">—</span>;
  }
  if (p.multiplier > 1 && p.basePoints > 0) {
    return (
      <span className={`text-sm tabular-nums font-bold ${p.isCaptain ? 'text-amber-400' : 'text-slate-300'}`}>
        {p.basePoints}×{p.multiplier}=<span className="font-black">{p.fantasyPoints}</span>
      </span>
    );
  }
  return (
    <span className="text-sm tabular-nums font-semibold text-green-400">
      +{p.fantasyPoints}
    </span>
  );
}

// ── Per-player season history (expanded panel) ─────────────────────────────────

function PlayerSeasonHistory({
  playerId,
  playerName,
  allMatches,
}: {
  playerId: string;
  playerName: string;
  allMatches: MatchBreakdown[];
}) {
  // Find all matches this player appeared in
  const appearances = allMatches
    .map(m => {
      const p = m.players.find(pl => pl.playerId === playerId);
      return p ? { matchNumber: m.matchNumber, player: p } : null;
    })
    .filter((x): x is { matchNumber: number; player: BreakdownPlayer } => x !== null);

  const seasonTotal = appearances.reduce((s, a) => s + a.player.fantasyPoints, 0);

  if (appearances.length === 0) {
    return <p className="text-white/20 text-xs px-4 py-3">No scores found for this player</p>;
  }

  return (
    <div className="bg-white/[0.03] border-t border-white/8">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-white/40 text-xs uppercase tracking-wider">Season history</p>
        <p className="text-white font-black text-sm tabular-nums">
          {seasonTotal.toLocaleString()} <span className="text-white/30 font-normal text-xs">pts total</span>
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5 px-4 pb-4">
        {appearances.map(({ matchNumber, player: p }) => (
          <div
            key={matchNumber}
            className={`rounded-xl px-2 py-2 text-center ${p.fantasyPoints > 0 ? 'bg-white/5 border border-white/8' : 'bg-white/[0.02] border border-white/5'}`}
          >
            <p className="text-white/30 text-[10px] font-mono">M{matchNumber}</p>
            {p.multiplier > 1 && p.basePoints > 0 ? (
              <p className={`text-xs font-bold tabular-nums mt-0.5 ${p.isCaptain ? 'text-amber-400' : 'text-slate-300'}`}>
                {p.basePoints}×{p.multiplier}
              </p>
            ) : (
              <p className={`text-sm font-black tabular-nums mt-0.5 ${p.fantasyPoints > 0 ? 'text-green-400' : 'text-white/15'}`}>
                {p.fantasyPoints > 0 ? `+${p.fantasyPoints}` : '—'}
              </p>
            )}
            {p.multiplier > 1 && (
              <p className="text-white font-black text-sm tabular-nums">{p.fantasyPoints}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Player row ─────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  allMatches,
  expanded,
  onToggle,
}: {
  player: BreakdownPlayer;
  allMatches: MatchBreakdown[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`border-b border-white/5 last:border-0 transition-colors ${expanded ? 'bg-white/[0.04]' : ''}`}>
      <button
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        {/* C / VC badge or spacer */}
        {player.isCaptain ? (
          <CaptainBadge type="C" />
        ) : player.isViceCaptain ? (
          <CaptainBadge type="VC" />
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        <RoleBadge role={player.role} />

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{player.playerName}</p>
          {player.teamCode && (
            <p className="text-white/25 text-[10px]">{player.teamCode}</p>
          )}
        </div>

        <PointsFormula p={player} />

        <svg
          className={`w-3.5 h-3.5 text-white/20 flex-shrink-0 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <PlayerSeasonHistory
          playerId={player.playerId}
          playerName={player.playerName}
          allMatches={allMatches}
        />
      )}
    </div>
  );
}

// ── Match content panel ────────────────────────────────────────────────────────

function MatchPanel({
  match,
  allMatches,
}: {
  match: MatchBreakdown;
  allMatches: MatchBreakdown[];
}) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const captainName = match.players.find(p => p.isCaptain)?.playerName;
  const vcName      = match.players.find(p => p.isViceCaptain)?.playerName;

  function togglePlayer(id: string) {
    setExpandedPlayerId(prev => (prev === id ? null : id));
  }

  return (
    <div>
      {/* Match summary bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/8">
        <div className="space-y-0.5">
          <p className="text-white font-bold text-sm">Match {match.matchNumber}</p>
          <div className="flex items-center gap-3 text-xs text-white/40">
            {captainName && (
              <span>
                <span className="text-amber-400 font-bold">C</span> {captainName.split(' ').at(-1)}
              </span>
            )}
            {vcName && (
              <span>
                <span className="text-slate-300 font-bold">VC</span> {vcName.split(' ').at(-1)}
              </span>
            )}
            <span>{match.players.length} players</span>
          </div>
        </div>
        <p className={`text-2xl font-black tabular-nums ${match.matchTotal > 0 ? 'text-green-400' : 'text-white/20'}`}>
          {match.matchTotal > 0 ? `+${match.matchTotal}` : '—'}
        </p>
      </div>

      {/* Players */}
      <div>
        {match.players.map(p => (
          <PlayerRow
            key={p.playerId}
            player={p}
            allMatches={allMatches}
            expanded={expandedPlayerId === p.playerId}
            onToggle={() => togglePlayer(p.playerId)}
          />
        ))}
        {match.players.length === 0 && (
          <p className="text-white/20 text-sm text-center py-10">No active players this match</p>
        )}
      </div>
    </div>
  );
}

// ── Match tab bar ──────────────────────────────────────────────────────────────

function MatchTabBar({
  matches,
  selected,
  onSelect,
}: {
  matches: MatchBreakdown[];
  selected: number;
  onSelect: (n: number) => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll the active tab into view on change
  useEffect(() => {
    if (activeRef.current && tabsRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selected]);

  return (
    <div
      ref={tabsRef}
      className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b border-white/10 scrollbar-hide"
      style={{ scrollbarWidth: 'none' }}
    >
      {matches.map(m => {
        const isActive = m.matchNumber === selected;
        return (
          <button
            key={m.matchNumber}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect(m.matchNumber)}
            className={`flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            <span>M{m.matchNumber}</span>
            {m.matchTotal > 0 && (
              <span className={`text-[10px] font-semibold tabular-nums ${isActive ? 'text-indigo-200' : 'text-white/25'}`}>
                +{m.matchTotal}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Summary overview ───────────────────────────────────────────────────────────

function SummaryPanel({
  allMatches,
  grandTotal,
}: {
  allMatches: MatchBreakdown[];
  grandTotal: number;
}) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // Aggregate per-player totals across all matches
  const playerTotals = new Map<string, { player: BreakdownPlayer; total: number; matches: number }>();
  for (const m of allMatches) {
    for (const p of m.players) {
      const existing = playerTotals.get(p.playerId);
      if (existing) {
        existing.total += p.fantasyPoints;
        existing.matches++;
        // Keep the latest captain/vc status
        if (p.isCaptain) existing.player = { ...existing.player, isCaptain: true };
        if (p.isViceCaptain) existing.player = { ...existing.player, isViceCaptain: true };
      } else {
        playerTotals.set(p.playerId, { player: p, total: p.fantasyPoints, matches: 1 });
      }
    }
  }

  const sorted = [...playerTotals.values()].sort((a, b) => b.total - a.total);
  const bestMatch = allMatches.reduce<MatchBreakdown | null>(
    (best, m) => (!best || m.matchTotal > best.matchTotal ? m : best), null
  );

  return (
    <div>
      {/* Season stats bar */}
      <div className="grid grid-cols-3 gap-px bg-white/5 border-b border-white/10">
        {[
          { label: 'Total pts', value: grandTotal.toLocaleString() },
          { label: 'Matches', value: allMatches.length },
          { label: 'Best match', value: bestMatch ? `+${bestMatch.matchTotal}` : '—' },
        ].map(stat => (
          <div key={stat.label} className="bg-[#0a0a0f] py-3 px-4 text-center">
            <p className="text-white font-black text-xl tabular-nums">{stat.value}</p>
            <p className="text-white/30 text-[10px] mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Player totals list */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-white/30 text-xs uppercase tracking-wider mb-3">Season totals by player</p>
      </div>
      <div>
        {sorted.map(({ player, total, matches }) => (
          <div
            key={player.playerId}
            className={`border-b border-white/5 last:border-0 ${expandedPlayerId === player.playerId ? 'bg-white/[0.04]' : ''}`}
          >
            <button
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/5 transition-colors"
              onClick={() => setExpandedPlayerId(prev => prev === player.playerId ? null : player.playerId)}
            >
              <span className="w-5 flex-shrink-0" />
              <RoleBadge role={player.role} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{player.playerName}</p>
                <p className="text-white/25 text-[10px]">
                  {player.teamCode && `${player.teamCode} · `}{matches} match{matches !== 1 ? 'es' : ''}
                </p>
              </div>
              <span className={`text-sm font-black tabular-nums ${total > 0 ? 'text-green-400' : 'text-white/20'}`}>
                {total > 0 ? `+${total}` : '—'}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-white/20 flex-shrink-0 ml-1 transition-transform ${expandedPlayerId === player.playerId ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedPlayerId === player.playerId && (
              <PlayerSeasonHistory
                playerId={player.playerId}
                playerName={player.playerName}
                allMatches={allMatches}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { id: leagueId, memberId } = useParams<{ id: string; memberId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useLeagueMemberBreakdown(leagueId!, memberId ?? null);

  // Selected match: null = summary/overview
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);

  // Auto-select the most recent match on first load
  useEffect(() => {
    if (data?.matches.length && selectedMatch === null) {
      const latest = data.matches.at(-1)!.matchNumber;
      setSelectedMatch(latest);
    }
  }, [data, selectedMatch]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-white/30 text-sm">Loading team…</p>
      </div>
    );
  }

  const { member, matches, grandTotal } = data;
  const currentMatch = selectedMatch !== null
    ? matches.find(m => m.matchNumber === selectedMatch) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-white/10 flex-shrink-0">
        <Link
          to={`/league/${leagueId}`}
          className="text-white/50 hover:text-white transition-colors p-1 -ml-1"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg truncate leading-tight">{member.teamName}</h1>
          <p className="text-white/35 text-xs">{member.username}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-white font-black text-2xl tabular-nums leading-none">{grandTotal.toLocaleString()}</p>
          <p className="text-white/30 text-[10px] mt-0.5">pts total</p>
        </div>
      </header>

      {/* ── Match tab bar + "Overview" pill ── */}
      <div className="border-b border-white/10 flex-shrink-0">
        <div
          className="flex gap-1.5 overflow-x-auto px-4 py-3"
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Overview tab */}
          <button
            onClick={() => setSelectedMatch(null)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              selectedMatch === null
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            Overview
          </button>

          {/* Match tabs */}
          {matches.map(m => {
            const isActive = m.matchNumber === selectedMatch;
            return (
              <button
                key={m.matchNumber}
                onClick={() => setSelectedMatch(m.matchNumber)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                <span>M{m.matchNumber}</span>
                {m.matchTotal > 0 && (
                  <span className={`text-[10px] font-semibold tabular-nums ${isActive ? 'text-indigo-200' : 'text-white/25'}`}>
                    +{m.matchTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {selectedMatch === null ? (
          <SummaryPanel allMatches={matches} grandTotal={grandTotal} />
        ) : currentMatch ? (
          <MatchPanel match={currentMatch} allMatches={matches} />
        ) : (
          <div className="text-center py-16 text-white/30 text-sm">No data for this match</div>
        )}
      </div>

    </div>
  );
}
