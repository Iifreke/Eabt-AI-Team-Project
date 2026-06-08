import { supabase } from './supabase.js';

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function authFetch(path, options = {}) {
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    console.warn('authFetch: no session token', { path, sessionErr });
    throw new Error('Not authenticated — please refresh and log in again');
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
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
    authFetch('/api/admin/escalations', { method: 'PATCH', body: JSON.stringify(data) }),

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

