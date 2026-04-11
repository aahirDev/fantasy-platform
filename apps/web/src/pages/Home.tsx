import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useLeagues, useCreateLeague, useJoinLeague, type League } from '../hooks/useLeagues';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<League['status'], string> = {
  LOBBY: 'Lobby',
  AUCTION_PHASE1: 'Auction · P1',
  AUCTION_PHASE2: 'Auction · P2',
  ACTIVE: 'Live',
  COMPLETE: 'Complete',
};

const STATUS_DOT: Record<League['status'], string> = {
  LOBBY: '#f59e0b',
  AUCTION_PHASE1: '#60a5fa',
  AUCTION_PHASE2: '#a78bfa',
  ACTIVE: '#34d399',
  COMPLETE: '#6b7280',
};

const SPORT_GRADIENT: Record<string, string> = {
  CRICKET_T20: 'linear-gradient(135deg, #065f46 0%, #0f766e 100%)',
  CRICKET_ODI: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
  FOOTBALL: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
  BASKETBALL: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)',
  BASEBALL: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
  AMERICAN_FOOTBALL: 'linear-gradient(135deg, #3f1f00 0%, #92400e 100%)',
};

const SPORT_ICON: Record<string, string> = {
  CRICKET_T20: '🏏',
  CRICKET_ODI: '🏏',
  FOOTBALL: '⚽',
  BASKETBALL: '🏀',
  BASEBALL: '⚾',
  AMERICAN_FOOTBALL: '🏈',
};

const SPORT_OPTIONS = [
  { value: 'CRICKET_T20', label: 'Cricket T20' },
  { value: 'CRICKET_ODI', label: 'Cricket ODI' },
  { value: 'FOOTBALL', label: 'Football' },
  { value: 'BASKETBALL', label: 'Basketball' },
  { value: 'BASEBALL', label: 'Baseball' },
  { value: 'AMERICAN_FOOTBALL', label: 'American Football' },
];

function sportLabel(sport: string) {
  return SPORT_OPTIONS.find(o => o.value === sport)?.label ?? sport;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const { data: leagues, isLoading, error } = useLeagues();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <header style={{
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 32px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>⚡</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>DraftArena</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{user?.email}</span>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, cursor: 'default',
          }}>{initials}</div>
          <button
            onClick={() => { void signOut().then(() => navigate('/login')); }}
            style={ghostBtn}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1a1040 0%, #0d0d1a 60%, #0a0a0f 100%)',
        padding: '56px 32px 48px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow blobs */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 300,
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#818cf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Your leagues
        </p>
        <h1 style={{ margin: '0 0 16px', fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Draft. Bid. Dominate.
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: 16, color: 'rgba(255,255,255,0.45)', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          Build your dream squad through live auctions with friends worldwide.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => setShowCreate(true)} style={primaryBtn}>
            <span style={{ marginRight: 6 }}>+</span> Create League
          </button>
          <button onClick={() => setShowJoin(true)} style={secondaryBtn}>
            Join with Code
          </button>
        </div>
      </div>

      {/* ── League Grid ── */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>

        {isLoading && (
          <div style={{ display: 'flex', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ flex: 1, height: 200, borderRadius: 16, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <p style={{ color: '#f87171', fontSize: 15 }}>Failed to load leagues. Please refresh.</p>
          </div>
        )}

        {!isLoading && !error && leagues?.length === 0 && (
          <EmptyState onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} />
        )}

        {!!leagues?.length && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
              {leagues.length} league{leagues.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {leagues.map(league => (
                <LeagueCard
                  key={league.id}
                  league={league}
                  userId={user?.id ?? ''}
                  onClick={() => navigate(`/league/${league.id}`)}
                />
              ))}
              {/* Ghost "create" card */}
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  background: 'transparent',
                  border: '2px dashed rgba(255,255,255,0.1)',
                  borderRadius: 20,
                  minHeight: 200,
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                  e.currentTarget.style.color = '#818cf8';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.25)';
                }}
              >
                <span style={{ fontSize: 28 }}>+</span>
                <span>New League</span>
              </button>
            </div>
          </>
        )}
      </main>

      {showCreate && <CreateLeagueModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinLeagueModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 32px' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
      <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 700 }}>No leagues yet</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 32, fontSize: 15 }}>
        Create your first league or enter an invite code to join one.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={onJoin} style={secondaryBtn}>Join with Code</button>
        <button onClick={onCreate} style={primaryBtn}>+ Create League</button>
      </div>
    </div>
  );
}

// ── League Card ───────────────────────────────────────────────────────────────

function LeagueCard({ league, userId, onClick }: { league: League; userId: string; onClick: () => void }) {
  const isCommissioner = league.commissionerId === userId;
  const gradient = SPORT_GRADIENT[league.sport] ?? 'linear-gradient(135deg, #1e293b, #334155)';
  const icon = SPORT_ICON[league.sport] ?? '🏅';
  const dotColor = STATUS_DOT[league.status];

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.08)',
        transition: 'transform 0.18s, box-shadow 0.18s',
        background: '#111118',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 20px 48px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Colored banner */}
      <div style={{ background: gradient, padding: '20px 20px 14px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 32 }}>{icon}</span>
          <StatusPill status={league.status} dotColor={dotColor} />
        </div>
        <h3 style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {league.name}
        </h3>
        {league.seasonName && (
          <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.65 }}>{league.seasonName}</p>
        )}
      </div>

      {/* Stats row */}
      <div style={{ padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Stat label="Sport" value={sportLabel(league.sport)} />
          <Stat label="Teams" value={`${league.numTeams}`} />
          <Stat label="Squad" value={`${league.squadSize} players`} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Stat label="Budget" value={`${league.totalBudgetLakhs} pts`} />
          <Stat label="Bid Timer" value={`${league.bidTimerSeconds}s`} />
        </div>

        {isCommissioner && league.inviteCode && (
          <div style={{
            marginTop: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8, padding: '6px 10px',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Invite
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: '#a5b4fc' }}>
              {league.inviteCode}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, dotColor }: { status: League['status']; dotColor: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(0,0,0,0.35)',
      borderRadius: 99, padding: '4px 10px',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.12)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor,
        boxShadow: `0 0 6px ${dotColor}`,
        display: 'inline-block',
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.04)',
      borderRadius: 8, padding: '6px 10px',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{value}</div>
    </div>
  );
}

// ── Create League Modal ───────────────────────────────────────────────────────

function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const createLeague = useCreateLeague();
  const [form, setForm] = useState({
    name: '',
    sport: 'CRICKET_T20',
    numTeams: 8,
    totalBudgetLakhs: 1000,
    squadSize: 11,
    bidTimerSeconds: 30,
    seasonName: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createLeague.mutateAsync({ ...form, seasonName: form.seasonName || undefined });
    onClose();
  }

  return (
    <Modal title="Create League" onClose={onClose}>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="League Name">
          <input required placeholder="e.g. Summer Slam 2025" style={inputStyle}
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </Field>

        <Field label="Sport">
          <select style={inputStyle} value={form.sport}
            onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}>
            {SPORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Season Name (optional)">
          <input placeholder="e.g. IPL 2025" style={inputStyle}
            value={form.seasonName} onChange={e => setForm(f => ({ ...f, seasonName: e.target.value }))} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Teams">
            <input type="number" min={2} max={20} required style={inputStyle}
              value={form.numTeams} onChange={e => setForm(f => ({ ...f, numTeams: Number(e.target.value) }))} />
          </Field>
          <Field label="Squad Size">
            <input type="number" min={5} max={25} required style={inputStyle}
              value={form.squadSize} onChange={e => setForm(f => ({ ...f, squadSize: Number(e.target.value) }))} />
          </Field>
          <Field label="Budget (points)">
            <input type="number" min={100} required style={inputStyle}
              value={form.totalBudgetLakhs} onChange={e => setForm(f => ({ ...f, totalBudgetLakhs: Number(e.target.value) }))} />
          </Field>
          <Field label="Bid Timer (sec)">
            <input type="number" min={10} max={120} required style={inputStyle}
              value={form.bidTimerSeconds} onChange={e => setForm(f => ({ ...f, bidTimerSeconds: Number(e.target.value) }))} />
          </Field>
        </div>

        {createLeague.error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{(createLeague.error as Error).message}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={modalGhostBtn}>Cancel</button>
          <button type="submit" disabled={createLeague.isPending} style={modalPrimaryBtn}>
            {createLeague.isPending ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Join League Modal ─────────────────────────────────────────────────────────

function JoinLeagueModal({ onClose }: { onClose: () => void }) {
  const joinLeague = useJoinLeague();
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await joinLeague.mutateAsync({ inviteCode, teamName });
    onClose();
  }

  return (
    <Modal title="Join a League" onClose={onClose}>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Invite Code">
          <input required placeholder="XXXXXXXX" style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 16 }}
            value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Your Team Name">
          <input required placeholder="e.g. Thunder Kings" style={inputStyle}
            value={teamName} onChange={e => setTeamName(e.target.value)} />
        </Field>

        {joinLeague.error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{(joinLeague.error as Error).message}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={modalGhostBtn}>Cancel</button>
          <button type="submit" disabled={joinLeague.isPending} style={modalPrimaryBtn}>
            {joinLeague.isPending ? 'Joining...' : 'Join League'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#16161e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 28,
        width: '100%', maxWidth: 460,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: '#9ca3af', width: 28, height: 28, borderRadius: 8, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {children}
    </label>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 14,
  color: '#fff',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 22px',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 22px',
  background: 'rgba(255,255,255,0.07)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  padding: '7px 14px',
  background: 'none',
  color: 'rgba(255,255,255,0.45)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};

const modalPrimaryBtn: React.CSSProperties = {
  ...primaryBtn,
  padding: '10px 20px',
};

const modalGhostBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'none',
  color: 'rgba(255,255,255,0.4)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 14,
  cursor: 'pointer',
};
