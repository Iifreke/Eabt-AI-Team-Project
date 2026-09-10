import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { playNotificationSound } from '../utils/notificationSound.js';

const EscalationContext = createContext(null);
const STORAGE_KEY = 'admin_viewed_chats_v1';
const POLL_INTERVAL_MS = 3500;

function getViewedMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveViewedMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function EscalationProvider({ children }) {
  const [escalations, setEscalations] = useState([]);
  const [unviewedChats, setUnviewedChats] = useState([]);
  const [unrespondedChats, setUnrespondedChats] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [unrespondedCount, setUnrespondedCount] = useState(0);
  const [viewedMap, setViewedMap] = useState(getViewedMap);

  const lastNotifiedTsRef = useRef(Date.now() - 60000);
  const initializedRef = useRef(false);

  // Analyze a single escalation against the viewedMap
  const analyzeEsc = useCallback((esc, vMap) => {
    const conv = esc.conversations;
    const msgs = Array.isArray(conv?.messages) ? conv.messages : [];
    const chatMsgs = msgs.filter(m => m.role !== '__notification' && m.role !== '__typing__');

    // Latest user message
    const lastUserMsg = [...chatMsgs].reverse().find(m => m.role === 'user');
    // Latest staff / admin message
    const lastAdminMsg = [...chatMsgs].reverse().find(m => m.role === 'admin' || m.role === 'staff');

    const userTs = lastUserMsg?.ts || (conv?.updated_at ? new Date(conv.updated_at).getTime() : (esc.created_at ? new Date(esc.created_at).getTime() : 0));
    const adminTs = lastAdminMsg?.ts ? new Date(lastAdminMsg.ts).getTime() : 0;

    const isResolved = esc.status === 'resolved' || esc.status === 'closed';
    const hasStaffReplied = isResolved || (Boolean(lastAdminMsg) && adminTs >= userTs);

    // Needs response if pending OR if user sent a message that staff hasn't replied to
    const needsResponse = !isResolved && (esc.status === 'pending' || (Boolean(lastUserMsg) && !hasStaffReplied));

    // Check if viewed by staff
    const viewedAt = vMap[esc.id] || (esc.conversation_id && vMap[esc.conversation_id]) || 0;
    const isViewed = isResolved || (viewedAt >= userTs);

    // Unviewed if it needs response AND has not been viewed since user's message
    const isUnviewed = needsResponse && !isViewed;

    const studentName = esc.leads?.name || esc.lead_name || 'Prospective Student';
    const channel = conv?.channel || (conv?.session_id?.startsWith('wa_') ? 'whatsapp' : 'web');
    const schoolSlug = esc.schools?.slug || 'babcock';
    const schoolName = esc.schools?.name || (schoolSlug === 'abu' ? 'ABU' : 'Babcock');

    return {
      id: esc.id,
      conversationId: esc.conversation_id,
      studentName,
      schoolSlug,
      schoolName,
      channel,
      status: esc.status,
      lastUserMsg,
      lastUserContent: lastUserMsg?.content || (esc.reason ? `Visitor requested help: ${esc.reason}` : 'New chat waiting'),
      userTs,
      adminTs,
      hasStaffReplied,
      needsResponse,
      isViewed,
      isUnviewed,
      rawEsc: esc,
    };
  }, []);

  // Recalculate unviewed & unresponded lists from raw escalations and current viewedMap
  const updateDerivedLists = useCallback((rawEscList, vMap) => {
    let unviewed = [];
    let unresponded = [];
    let pCount = 0;

    for (const esc of rawEscList) {
      if (esc.status === 'pending') pCount++;
      const analyzed = analyzeEsc(esc, vMap);
      if (analyzed.isUnviewed) unviewed.push(analyzed);
      if (analyzed.needsResponse) unresponded.push(analyzed);
    }

    // Sort newest message first
    unviewed.sort((a, b) => b.userTs - a.userTs);
    unresponded.sort((a, b) => b.userTs - a.userTs);

    setUnviewedChats(unviewed);
    setUnviewedCount(unviewed.length);
    setUnrespondedChats(unresponded);
    setUnrespondedCount(unresponded.length);
    setPendingCount(pCount);

    // Audio & Desktop Notification for brand new incoming messages
    if (initializedRef.current) {
      const brandNew = unviewed.find(c => c.userTs > lastNotifiedTsRef.current);
      if (brandNew) {
        lastNotifiedTsRef.current = Math.max(lastNotifiedTsRef.current, brandNew.userTs);
        playNotificationSound();

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(`New Message from ${brandNew.studentName}`, {
              body: brandNew.lastUserContent ? `"${brandNew.lastUserContent}"` : 'New message waiting for your reply.',
              icon: '/favicon.ico',
            });
          } catch {}
        }
      }
    } else {
      initializedRef.current = true;
      if (unviewed.length > 0) {
        const maxTs = Math.max(...unviewed.map(u => u.userTs));
        lastNotifiedTsRef.current = Math.max(lastNotifiedTsRef.current, maxTs);
      }
    }
  }, [analyzeEsc]);

  // Fetch escalations from API
  const refresh = useCallback(async () => {
    try {
      const d = await api.escalations();
      const list = d.escalations || [];
      setEscalations(list);
      setViewedMap(curVMap => {
        updateDerivedLists(list, curVMap);
        return curVMap;
      });
    } catch (err) {
      console.warn('EscalationContext refresh warning:', err?.message);
    }
  }, [updateDerivedLists]);

  // Mark chat as viewed (clears unviewed status and dismisses from popup)
  const markChatAsViewed = useCallback((id, convId) => {
    const now = Date.now();
    setViewedMap(prev => {
      const next = { ...prev };
      if (id) next[id] = now;
      if (convId) next[convId] = now;
      saveViewedMap(next);
      setEscalations(rawList => {
        updateDerivedLists(rawList, next);
        return rawList;
      });
      return next;
    });
  }, [updateDerivedLists]);

  // Mark chat as responded
  const markChatAsResponded = useCallback((id, convId) => {
    markChatAsViewed(id, convId);
    refresh();
  }, [markChatAsViewed, refresh]);

  // Sync viewedMap across browser tabs
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const updated = getViewedMap();
        setViewedMap(updated);
        setEscalations(rawList => {
          updateDerivedLists(rawList, updated);
          return rawList;
        });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [updateDerivedLists]);

  // Initial load, permissions, and fallback polling
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Supabase Realtime subscription for immediate (<500ms) message arrival detection
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('admin-realtime-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalations' }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const getEscalationInfo = useCallback((esc) => {
    return analyzeEsc(esc, viewedMap);
  }, [analyzeEsc, viewedMap]);

  return (
    <EscalationContext.Provider
      value={{
        escalations,
        unviewedChats,
        unviewedCount,
        unrespondedChats,
        unrespondedCount,
        pendingCount,
        markChatAsViewed,
        markChatAsResponded,
        analyzeEsc,
        getEscalationInfo,
        refresh,
      }}
    >
      {children}
    </EscalationContext.Provider>
  );
}

export function useEscalation() {
  const ctx = useContext(EscalationContext);
  if (!ctx) throw new Error('useEscalation must be used within EscalationProvider');
  return ctx;
}
