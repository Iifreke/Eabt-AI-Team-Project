import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import { useEscalation } from '../context/EscalationContext.jsx';
import { supabase } from '../lib/supabase.js';

const STATUSES = ['all', 'pending', 'in_progress', 'resolved'];

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

const STATUS_LABEL = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Ended' };

const reasonLabel = {
  user_request: 'Visitor requested human',
  failed_attempts: 'Bot failed 3 times',
  sensitive_topic: 'Sensitive topic',
};

// ── Shortcuts autocomplete ───────────────────────────────────────
function useShortcuts() {
  const [shortcuts, setShortcuts] = useState([]);
  useEffect(() => {
    supabase.from('shortcuts').select('*').order('name').then(({ data }) => setShortcuts(data || []));
  }, []);
  return shortcuts;
}

// ── Live Chat Panel ─────────────────────────────────────────────
const LiveChatPanel = memo(function LiveChatPanel({ esc, onUpdate }) {
  const { profile } = useUser();
  const shortcuts = useShortcuts();
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [shortcutQuery, setShortcutQuery] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const autoResolveRef = useRef(null);

  // Use refs to stabilize callbacks and prevent re-render loops
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const resetAutoResolve = useCallback(() => {
    clearTimeout(autoResolveRef.current);
    if (esc.status === 'resolved' || !profile?.full_name) return;
    autoResolveRef.current = setTimeout(async () => {
      try {
        await api.updateEscalation({ id: esc.id, status: 'resolved', resolved_by: profile.full_name });
        onUpdateRef.current?.();
      } catch {}
    }, 5 * 60 * 1000);
  }, [esc.id, esc.status, profile]);

  const sessionId = esc.conversations?.session_id;

  const fetchMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
      const data = await res.json();
      if (Array.isArray(data?.messages)) {
        setMessages(prev => {
          // Only update if lengths differ or last message timestamp differs to prevent jumpy UI
          if (prev.length !== data.messages.length || prev[prev.length - 1]?.ts !== data.messages[data.messages.length - 1]?.ts) {
             return data.messages;
          }
          return prev;
        });
        resetAutoResolve();
      }
    } catch (e) {
      console.error('poll error', e);
    }
  }, [sessionId, resetAutoResolve]);

  useEffect(() => { resetAutoResolve(); }, [resetAutoResolve]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 1000);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(typingTimerRef.current);
      clearTimeout(autoResolveRef.current);
      api.setTyping(esc.conversation_id, false);
    };
  }, [fetchMessages, esc.conversation_id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const matchedShortcuts = shortcutQuery
    ? shortcuts.filter(s => s.shortcut.toLowerCase().includes(shortcutQuery.slice(1).toLowerCase()) || s.name.toLowerCase().includes(shortcutQuery.slice(1).toLowerCase()))
    : [];

  const handleReplyChange = (e) => {
    const val = e.target.value;
    setReply(val);
    if (val.startsWith('/')) setShortcutQuery(val);
    else setShortcutQuery('');
    api.setTyping(esc.conversation_id, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => api.setTyping(esc.conversation_id, false), 5000);
  };

  const applyShortcut = (msg) => {
    setReply(msg);
    setShortcutQuery('');
  };

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    clearTimeout(typingTimerRef.current);
    setSending(true);
    setError('');
    try {
      await api.replyToConversation(esc.conversation_id, reply.trim());
      setReply('');
      setShortcutQuery('');
      await fetchMessages();
      resetAutoResolve();
    } catch {
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
    if (e.key === 'Escape') setShortcutQuery('');
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
        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">🟣 Live Chat</span>
        <span className="text-xs text-purple-500">Auto-refreshing every 4s</span>
      </div>

      <div className="bg-gray-50 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: '240px' }}>
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No messages yet. Reply below to start the live conversation.</p>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.ts || i} className={`text-xs px-3 py-2 rounded-lg ${roleBg(msg.role)}`}>
              <div className="font-semibold mb-0.5">{roleLabel(msg)}</div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.attachments?.map((att, ai) => (
                att.type?.startsWith('image/')
                  ? <img key={ai} src={att.url} alt={att.name} className="mt-1 max-w-xs rounded" />
                  : att.type?.startsWith('video/')
                    ? <video key={ai} controls src={att.url} className="mt-1 max-w-xs rounded" />
                    : att.type?.startsWith('audio/')
                      ? <audio key={ai} controls src={att.url} className="mt-1 max-w-xs" />
                      : <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs underline flex items-center gap-1">📄 {att.name}</a>
              ))}
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

      {esc.status !== 'resolved' && (
        <div className="p-3 bg-white border-t border-purple-100 relative">
          {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

          {matchedShortcuts.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {matchedShortcuts.slice(0, 6).map(s => (
                <button key={s.id} onClick={() => applyShortcut(s.message)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                  <span className="font-mono text-blue-600">{s.shortcut}</span>
                  <span className="text-gray-500 truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={handleReplyChange}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Type / for shortcuts, Enter to send"
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
});

// ── Tags editor ──────────────────────────────────────────────────
function TagsEditor({ tags, onSave }) {
  const [input, setInput] = useState('');
  const [current, setCurrent] = useState(tags || []);

  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !current.includes(t)) {
      const next = [...current, t];
      setCurrent(next);
      onSave(next);
    }
    setInput('');
  };

  const removeTag = (t) => {
    const next = current.filter(x => x !== t);
    setCurrent(next);
    onSave(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {current.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
            {t}
            <button onClick={() => removeTag(t)} className="hover:text-red-600 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Add tag..."
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={addTag} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
      </div>
    </div>
  );
}

// ── Chat Row ─────────────────────────────────────────────────────
function ChatRow({ esc, onUpdate }) {
  const { profile } = useUser();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(esc.staff_notes || '');
  const [saving, setSaving] = useState(false);

  const update = async (patch) => {
    setSaving(true);
    try {
      await api.updateEscalation({ id: esc.id, ...patch });
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const agentCell = () => {
    if (esc.status === 'in_progress' && esc.attended_by) return `🟡 ${esc.attended_by}`;
    if (esc.status === 'resolved' && esc.resolved_by) return `✅ ${esc.resolved_by}`;
    return '—';
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
        <td className="px-5 py-3 text-gray-500 text-xs">{reasonLabel[esc.reason] || esc.reason}</td>
        <td className="px-5 py-3">
          <span className={statusBadge(esc.status)}>{STATUS_LABEL[esc.status] || esc.status}</span>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">
          <div className="flex flex-wrap gap-1">
            {(esc.tags || []).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{t}</span>
            ))}
          </div>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">{agentCell()}</td>
        <td className="px-5 py-3 text-gray-400 text-xs">
          {esc.created_at ? new Date(esc.created_at).toLocaleDateString() : '—'}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Visitor</div>
                <div className="text-sm space-y-1">
                  <div>Name: <strong>{esc.leads?.name || '—'}</strong></div>
                  <div>Email: {esc.leads?.email || '—'}</div>
                  <div>Phone: {esc.leads?.phone || '—'}</div>
                </div>

                {esc.status === 'resolved' && (
                  <p className="text-xs text-gray-400 mt-4">Chat ended. Open to view full transcript.</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</div>
                <TagsEditor tags={esc.tags} onSave={(tags) => update({ tags })} />

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Notes</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={() => update({ staff_notes: notes })}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Add notes..."
                />

                <div className="flex gap-2 mt-3 flex-wrap">
                  {esc.status === 'pending' && (
                    <button onClick={() => update({ status: 'in_progress', attended_by: profile?.full_name })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      Serve
                    </button>
                  )}
                  {(esc.status === 'pending' || esc.status === 'in_progress') && (
                    <button onClick={() => update({ status: 'resolved', resolved_by: profile?.full_name })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      End Chat
                    </button>
                  )}
                  <button onClick={() => update({ staff_notes: notes })} disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    Save Notes
                  </button>
                </div>
              </div>
            </div>

            {esc.conversation_id && (
              <LiveChatPanel esc={esc} onUpdate={onUpdate} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Chats() {
  const { selectedSchool } = useSchool();
  const { pendingCount } = useEscalation();
  const [escalations, setEscalations] = useState([]);
  const [status, setStatus] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const prevPendingRef = useRef(null);

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

  // Sound + popup for new escalations is handled globally by EscalationContext
  // / EscalationAlertPopup — this just refetches the list when the count moves.
  useEffect(() => {
    if (prevPendingRef.current !== null && pendingCount > prevPendingRef.current) {
      fetchEscalations();
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount, fetchEscalations]);

  const displayed = tagFilter
    ? escalations.filter(e => (e.tags || []).includes(tagFilter.toLowerCase()))
    : escalations;

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Chats</h1>
        <p className="text-gray-500 text-sm mb-6">Click a row to expand, manage and reply live</p>

        <div className="flex flex-wrap gap-2 mb-5 items-center">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                status === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? 'All' : STATUS_LABEL[s] || s}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}

          <input
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            placeholder="Filter by tag..."
            className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : !displayed.length ? (
            <p className="text-gray-400 text-sm p-5">No chats found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Visitor</th>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tags</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(esc => (
                  <ChatRow key={esc.id} esc={esc} onUpdate={fetchEscalations} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
