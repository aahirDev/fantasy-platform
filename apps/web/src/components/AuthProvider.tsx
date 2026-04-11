import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { syncUser } from '../lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setInternalUserId = useAuthStore((s) => s.setInternalUserId);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        // Upsert user in our DB whenever a new session starts.
        // After sync completes the supabaseUid is linked in our DB —
        // invalidate the leagues cache so it refetches with the correct identity.
        if (session) {
          const result = await syncUser().catch(console.error);
          if (result) {
            setInternalUserId(result.id);
            await queryClient.invalidateQueries({ queryKey: ['leagues'] });
          }
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [setSession, setInternalUserId, queryClient]);

  return <>{children}</>;
}
