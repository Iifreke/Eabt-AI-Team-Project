import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function ProtectedRoute({ children, superAdminOnly = false }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'authed' | 'unauthed'
  const [role, setRole] = useState(null);

  useEffect(() => {
    async function check(session) {
      if (!session) { setStatus('unauthed'); return; }
      if (superAdminOnly) {
        const { data } = await supabase
          .from('admin_profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        setRole(data?.role || 'admin');
      }
      setStatus('authed');
    }

    supabase.auth.getSession().then(({ data: { session } }) => check(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      check(session);
    });

    return () => subscription.unsubscribe();
  }, [superAdminOnly]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthed') return <Navigate to="/login" replace />;

  if (superAdminOnly && role !== 'super_admin') return <Navigate to="/chats" replace />;

  return children;
}
