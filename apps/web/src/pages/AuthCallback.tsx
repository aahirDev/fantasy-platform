import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/** Landing page for OAuth redirects (e.g. Google sign-in) */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Session will be set by onAuthStateChange in AuthProvider
      navigate(data.session ? '/' : '/login', { replace: true });
    });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      Signing you in…
    </div>
  );
}
