import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const STATUSES = ['all', 'pending', 'in_progress', 'resolved'];

// Map DB slugs to display labels
const SLUG_DISPLAY = { backock: 'BABCOCK', abu: 'ABU' };
const schoolBadge = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

const statusBadge = (status) => {
  const map = {
    pending: 'bg-red-100 text-red-700',
    in_progress: 'bg-amber-100 text-amber-700',
    resolved: 'bg-green-100 text-green-700',
  };
  return `px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`;
};

const reasonLabel = {
  user_request: 'Visitor requested human',
  failed_attempts: 'Bot failed 3 times',
  sensitive_topic: 'Sensitive topic',
};

// ── Live Chat Panel ─────────────────────────────────────────────
function LiveChatPanel({ esc }) {
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Fetch latest messages from the conversation
  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.conversation(esc.conversation_id);
      if (data?.messages) setMessages(data.messages.filter(m => m.role !== '__typing__'));
    } catch (e) {
      console.error('poll error', e);
    }
  }, [esc.conversation_id]);

  // Initial load + polling every 4s
  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 4000);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(typingTimerRef.current);
      api.setTyping(esc.conversation_id, false);
    };
  }, [fetchMessages, esc.conversation_id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReplyChange = (e) => {
    setReply(e.target.value);
    api.setTyping(esc.conversation_id, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => api.setTyping(esc.conversation_id, false), 5000);
  };

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    clearTimeout(typingTimerRef.current);
    setSending(true);
    setError('');
    try {
      await api.replyToConversation(esc.conversation_id, reply.trim());
      setReply('');
      await fetchMessages();
    } catch (e) {
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const roleBg = (role) => {
    if (role === 'user') return 'bg-blue-100 text-blue-800';
    if (role === 'admin') return 'bg-purple-100 text-purple-800';
    return 'bg-white border border-gray-200 text-gray-700';
  };

  const roleLabel = (msg) => {
    if (msg.role === 'user') return 'Visitor';
    if (msg.role === 'admin') return `🧑‍💼 ${msg.adminName || 'Support Agent'}`;
    return '🤖 Maverick';
  };

  return (
    <div className="mt-4 border border-purple-200 rounded-xl overflow-hidden">
      <div className="bg-purple-50 px-4 py-2 flex items-center justify-between border-b border-purple-200">
        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
          🟣 Live Admin Chat
        </span>
        <span className="text-xs text-purple-500">Auto-refreshing every 4s</span>
      </div>

      {/* Message thread */}
      <div className="bg-gray-50 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: '240px' }}>
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No messages yet. Reply below to start the live conversation.</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`text-xs px-3 py-2 rounded-lg ${roleBg(msg.role)}`}>
              <div className="font-semibold mb-0.5">{roleLabel(msg)}</div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.ts && (
                <div className="text-gray-400 mt-0.5 text-right">
                  {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      {esc.status !== 'resolved' && (
        <div className="p-3 bg-white border-t border-purple-100">
          {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={handleReplyChange}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Type your reply... (Enter to send, Shift+Enter for newline)"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 self-end"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Escalation Row ───────────────────────────────────────────────
function EscalationRow({ esc, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(esc.staff_notes || '');
  const [saving, setSaving] = useState(false);

  const update = async (status) => {
    setSaving(true);
    try {
      await api.updateEscalation({ id: esc.id, status, staff_notes: notes });
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.updateEscalation({ id: esc.id, staff_notes: notes });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-5 py-3 font-medium">{esc.leads?.name || '—'}</td>
        <td className="px-5 py-3">
          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
            {schoolBadge(esc.schools?.slug)}
          </span>
        </td>
        <td className="px-5 py-3 text-gray-500">{reasonLabel[esc.reason] || esc.reason}</td>
        <td className="px-5 py-3">
          <span className={statusBadge(esc.status)}>{esc.status?.replace('_', ' ')}</span>
        </td>
        <td className="px-5 py-3 text-gray-400">
          {esc.created_at ? new Date(esc.created_at).toLocaleDateString() : '—'}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Lead details + messages */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Visitor</div>
                <div className="text-sm space-y-1">
                  <div>Name: <strong>{esc.leads?.name || '—'}</strong></div>
                  <div>Email: {esc.leads?.email || '—'}</div>
                  <div>Phone: {esc.leads?.phone || '—'}</div>
                </div>

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Last Messages</div>
                <div className="space-y-2">
                  {(esc.conversations?.messages || []).map((msg, i) => (
                    <div key={i} className={`text-xs px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-100 text-blue-800' : msg.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-white border border-gray-200'}`}>
                      <span className="font-semibold">
                        {msg.role === 'user' ? 'Visitor: ' : msg.role === 'admin' ? '🧑‍💼 Admin: ' : 'Bot: '}
                      </span>
                      {msg.content}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions + notes */}
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Staff Notes</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Add notes..."
                />
                <div className="flex gap-2 mt-3">
                  {esc.status === 'pending' && (
                    <button onClick={() => update('in_progress')} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      Mark In Progress
                    </button>
                  )}
                  {(esc.status === 'pending' || esc.status === 'in_progress') && (
                    <button onClick={() => update('resolved')} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      Mark Resolved
                    </button>
                  )}
                  <button onClick={saveNotes} disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    Save Notes
                  </button>
                </div>
              </div>
            </div>

            {/* Live admin chat panel — shown when not resolved */}
            {esc.status !== 'resolved' && esc.conversation_id && (
              <LiveChatPanel esc={esc} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Escalations() {
  const { selectedSchool } = useSchool();
  const [escalations, setEscalations] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchEscalations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      if (status !== 'all') params.status = status;

      const data = await api.escalations(params);
      setEscalations(data.escalations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [status, selectedSchool]);

  useEffect(() => { fetchEscalations(); }, [fetchEscalations]);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Escalations</h1>
        <p className="text-gray-500 text-sm mb-6">Click a row to expand, manage and reply live</p>

        <div className="flex gap-2 mb-5">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                status === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : !escalations.length ? (
            <p className="text-gray-400 text-sm p-5">No escalations found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map(esc => (
                  <EscalationRow key={esc.id} esc={esc} onUpdate={fetchEscalations} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
