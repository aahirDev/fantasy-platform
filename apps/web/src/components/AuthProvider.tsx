import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { syncUser } from '../lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);

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
          await syncUser().catch(console.error);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [setSession]);

  return <>{children}</>;
}
