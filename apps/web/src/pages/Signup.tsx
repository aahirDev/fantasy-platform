import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUpWithEmail } = useAuthStore();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signUpWithEmail(email, password, username);
    setLoading(false);
    if (err) { setError(err); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email</h1>
          <p style={{ fontSize: 14, color: '#555' }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then{' '}
            <Link to="/login">sign in</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create account</h1>

        <form onSubmit={(e) => { void handleSubmit(e); }} style={styles.form}>
          <label style={styles.label}>
            Username
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers and underscores only"
              autoComplete="username"
            />
          </label>

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
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
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
  error: { color: '#e53e3e', fontSize: 13, margin: 0 } as React.CSSProperties,
  footer: { textAlign: 'center', marginTop: 20, fontSize: 14 } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
