import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { syncUser } from '../lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setInternalUserId = useAuthStore((s) => s.setInternalUserId);

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        // Upsert user in our DB whenever a new session starts
        if (session) {
          const result = await syncUser().catch(console.error);
          if (result) setInternalUserId(result.id);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [setSession, setInternalUserId]);

  return <>{children}</>;
}
