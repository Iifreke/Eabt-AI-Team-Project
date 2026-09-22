import { supabase } from './supabase.js';

const BASE_URL = (typeof window !== 'undefined' && window.location.origin) ? '' : (import.meta.env.VITE_API_URL || '');

async function authFetch(path, options = {}) {
  let { data: { session }, error: sessionErr } = await supabase.auth.getSession();
  let token = session?.access_token;

  if (!token) {
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      token = refreshData?.session?.access_token;
    } catch (_) {}
  }

  if (!token) {
    console.warn('authFetch: no session token', { path, sessionErr });
    throw new Error('Not authenticated — please refresh or log in again');
  }

  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (netErr) {
    console.error('authFetch network error:', netErr);
    throw new Error('Network connection error — please check your connection and retry');
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Token may have expired during session — attempt one refresh and retry
      try {
        const { data: refreshData } = await supabase.auth.refreshSession();
        const retryToken = refreshData?.session?.access_token;
        if (retryToken && retryToken !== token) {
          const retryRes = await fetch(url, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${retryToken}`,
              ...(options.headers || {}),
            },
          });
          if (retryRes.ok) return retryRes.json();
        }
      } catch (_) {}
    }

    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error('authFetch error:', res.status, url, err);
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export const api = {
  stats: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/stats${qs ? '?' + qs : ''}`);
  },

  leads: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/leads${qs ? '?' + qs : ''}`);
  },

  conversations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/conversations${qs ? '?' + qs : ''}`);
  },

  conversation: (id) => authFetch(`/api/admin/conversations?id=${id}`),

  conversationsByLead: (leadId) =>
    authFetch(`/api/admin/conversations?leadId=${leadId}`),

  tickets: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/tickets${qs ? '?' + qs : ''}`);
  },

  updateTicket: (data) =>
    authFetch('/api/admin/tickets', { method: 'PATCH', body: JSON.stringify(data) }),

  escalations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/escalations${qs ? '?' + qs : ''}`);
  },

  updateEscalation: (data) =>
    authFetch('/api/admin/escalations', { method: 'POST', body: JSON.stringify(data) }),

  endChat: (escalationId, resolvedBy) =>
    authFetch('/api/admin/end-chat', { method: 'POST', body: JSON.stringify({ escalationId, resolvedBy }) }),

  replyToConversation: (conversationId, message) =>
    authFetch('/api/admin/reply', { method: 'POST', body: JSON.stringify({ conversationId, message }) }),

  setTyping: (conversationId, typing) =>
    authFetch('/api/admin/reply', { method: 'PATCH', body: JSON.stringify({ conversationId, typing }) }).catch(() => {}),

  updateMyStatus: (status) =>
    authFetch('/api/admin/me', { method: 'PATCH', body: JSON.stringify({ status }) }),

  heartbeat: () =>
    authFetch('/api/admin/me', { method: 'PATCH', body: JSON.stringify({ heartbeat: true }) }),

  listUsers: () => authFetch('/api/admin/users'),

  inviteUser: ({ email, fullName, role }) =>
    authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, fullName, role }) }),

  updateUser: (userId, updates) =>
    authFetch('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId, ...updates }) }),

  removeUser: (userId) =>
    authFetch('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ userId }) }),

  agentStats: () => authFetch('/api/admin/agent-stats'),

  documents: (schoolId) =>
    authFetch(`/api/documents?schoolId=${schoolId}`),

  processDocument: (data) =>
    authFetch('/api/documents', { method: 'POST', body: JSON.stringify(data) }),

  deleteDocument: (documentId) =>
    authFetch('/api/documents', { method: 'DELETE', body: JSON.stringify({ documentId }) }),
};

