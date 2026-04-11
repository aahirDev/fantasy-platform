import { useAuthStore } from '../store/auth';

const API_URL = import.meta.env['VITE_API_URL'] as string ?? 'http://localhost:3001';

// Read token from the Zustand store — avoids the Supabase auth lock entirely.
// AuthProvider keeps the store in sync via onAuthStateChange, so this is always current.
function getHeaders(): HeadersInit {
  const token = useAuthStore.getState().session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = getHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Called after login to upsert the user into our users table. Returns the internal user ID. */
export async function syncUser(): Promise<{ id: string; created: boolean }> {
  return apiFetch<{ id: string; created: boolean }>('/api/auth/sync', { method: 'POST' });
}
