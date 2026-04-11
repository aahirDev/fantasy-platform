import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const { signInWithEmail, signInWithGoogle } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signInWithEmail(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    navigate(from, { replace: true });
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Sign in</h1>

        <form onSubmit={(e) => { void handleSubmit(e); }} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button
          style={{ ...styles.button, ...styles.googleButton }}
          onClick={() => { void signInWithGoogle(); }}
        >
          Continue with Google
        </button>

        <p style={styles.footer}>
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 40,
    width: 360,
    boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  title: { marginBottom: 24, fontSize: 24, fontWeight: 700 } as React.CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: 16 } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500 } as React.CSSProperties,
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
  } as React.CSSProperties,
  button: {
    marginTop: 8,
    padding: '12px 0',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  } as React.CSSProperties,
  googleButton: { background: '#4285f4', marginTop: 12 } as React.CSSProperties,
  error: { color: '#e53e3e', fontSize: 13, margin: 0 } as React.CSSProperties,
  footer: { textAlign: 'center', marginTop: 20, fontSize: 14 } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
