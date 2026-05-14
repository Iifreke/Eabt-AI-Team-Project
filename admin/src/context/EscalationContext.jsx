import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

const EscalationContext = createContext(null);

export function EscalationProvider({ children }) {
  const [pendingCount, setPendingCount] = useState(0);
  const prevCountRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.escalations({ status: 'pending' });
      const count = (d.escalations || []).length;

      if (prevCountRef.current !== null && count > prevCountRef.current) {
        const diff = count - prevCountRef.current;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('New Chat Request', {
              body: `${diff} new visitor${diff > 1 ? 's' : ''} need${diff === 1 ? 's' : ''} help`,
              icon: '/favicon.ico',
            });
          } catch {}
        }
      }

      prevCountRef.current = count;
      setPendingCount(count);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
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
