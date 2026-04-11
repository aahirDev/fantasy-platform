import { supabase } from './supabase';

const API_URL = import.meta.env['VITE_API_URL'] as string ?? 'http://localhost:3001';

async function getHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Called after login to upsert the user into our users table */
export async function syncUser(): Promise<void> {
  await apiFetch('/api/auth/sync', { method: 'POST' });
}
