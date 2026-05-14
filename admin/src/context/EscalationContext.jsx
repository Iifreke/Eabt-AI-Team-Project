import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

const EscalationContext = createContext(null);

export function EscalationProvider({ children }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const d = await api.escalations({ status: 'pending' });
      setPendingCount((d.escalations || []).length);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <EscalationContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </EscalationContext.Provider>
  );
}

export function useEscalation() {
  const ctx = useContext(EscalationContext);
  if (!ctx) throw new Error('useEscalation must be used within EscalationProvider');
  return ctx;
}
