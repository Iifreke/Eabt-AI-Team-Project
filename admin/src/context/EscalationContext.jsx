import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { playNotificationSound } from '../utils/notificationSound.js';

const EscalationContext = createContext(null);
const RING_INTERVAL_MS = 3000;

export function EscalationProvider({ children }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [alerting, setAlerting] = useState(false);
  const prevCountRef = useRef(null);
  const acknowledgedCountRef = useRef(0);
  const ringRef = useRef(null);

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

      // Keep alerting (ringing + popup) as long as there's pending work the
      // admin hasn't acknowledged yet — whether they're on the chats page or not.
      if (count > acknowledgedCountRef.current) {
        setAlerting(true);
      } else if (count === 0) {
        acknowledgedCountRef.current = 0;
        setAlerting(false);
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
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Repeating ringtone while there's an unacknowledged escalation, like an
  // incoming call — keeps going regardless of which page the admin is on.
  useEffect(() => {
    if (alerting) {
      playNotificationSound();
      ringRef.current = setInterval(playNotificationSound, RING_INTERVAL_MS);
    } else {
      clearInterval(ringRef.current);
    }
    return () => clearInterval(ringRef.current);
  }, [alerting]);

  const dismissAlert = useCallback(() => {
    acknowledgedCountRef.current = pendingCount;
    setAlerting(false);
  }, [pendingCount]);

  return (
    <EscalationContext.Provider value={{ pendingCount, alerting, dismissAlert, refresh }}>
      {children}
    </EscalationContext.Provider>
  );
}

export function useEscalation() {
  const ctx = useContext(EscalationContext);
  if (!ctx) throw new Error('useEscalation must be used within EscalationProvider');
  return ctx;
}
