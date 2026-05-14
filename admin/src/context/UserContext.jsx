import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(userId) {
      if (!userId) { setLoadingProfile(false); return; }
      const { data } = await supabase
        .from('admin_profiles')
        .select('id, email, full_name, role, status')
        .eq('id', userId)
        .single();
      if (mounted) { setProfile(data || null); setLoadingProfile(false); }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadProfile(session?.user?.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) loadProfile(session?.user?.id ?? null);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  return (
    <UserContext.Provider value={{ profile, loadingProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
