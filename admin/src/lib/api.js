import { supabase } from './supabase.js';

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function authFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
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

  conversation: (id) => authFetch(`/api/admin/conversation?id=${id}`),

  escalations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return authFetch(`/api/admin/escalations${qs ? '?' + qs : ''}`);
  },

  updateEscalation: (data) =>
    authFetch('/api/admin/escalation', { method: 'PATCH', body: JSON.stringify(data) }),

  replyToConversation: (conversationId, message) =>
    authFetch('/api/admin/reply', { method: 'POST', body: JSON.stringify({ conversationId, message }) }),

  documents: (schoolId) =>
    authFetch(`/api/documents/list?schoolId=${schoolId}`),

  processDocument: (data) =>
    authFetch('/api/documents/process', { method: 'POST', body: JSON.stringify(data) }),

  deleteDocument: (documentId) =>
    authFetch('/api/documents/delete', { method: 'DELETE', body: JSON.stringify({ documentId }) }),
};

