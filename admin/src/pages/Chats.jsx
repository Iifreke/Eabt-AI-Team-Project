import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import ConversationViewer from '../components/ConversationViewer.jsx';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import { useEscalation } from '../context/EscalationContext.jsx';
import { supabase } from '../lib/supabase.js';
import { renderSlaBadge as getSlaBadge, formatRelativeTime, formatChatActivityTime, formatElapsedTime } from '../utils/time.jsx';

const STATUSES = ['all', 'needs_reply', 'in_progress', 'resolved'];

const SLUG_DISPLAY = { backock: 'BABCOCK', babcock: 'BABCOCK', abu: 'ABU' };
const schoolBadge = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

const statusBadge = (status) => {
  const map = {
    needs_reply: 'bg-rose-100 text-rose-700 border border-rose-200',
    pending: 'bg-rose-100 text-rose-700 border border-rose-200',
    in_progress: 'bg-amber-100 text-amber-800 border border-amber-200',
    resolved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    closed: 'bg-gray-100 text-gray-700 border border-gray-200',
  };
  return `px-2 py-0.5 rounded-full text-xs font-bold ${map[status] || 'bg-gray-100 text-gray-600'}`;
};

const STATUS_LABEL = {
  all: 'All',
  needs_reply: 'Needs Reply',
  in_progress: 'In Progress',
  resolved: 'Ended',
};

const reasonLabel = {
  user_request: 'Visitor requested human',
  failed_attempts: 'Bot failed 3 times',
  sensitive_topic: 'Sensitive topic',
};

function formatWhatsAppLink(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

// ── Shortcuts autocomplete ───────────────────────────────────────
function useShortcuts() {
  const [shortcuts, setShortcuts] = useState([]);
  useEffect(() => {
    supabase.from('shortcuts').select('*').order('name').then(({ data }) => setShortcuts(data || []));
  }, []);
  return shortcuts;
}

// ── Live Chat Panel ─────────────────────────────────────────────
const LiveChatPanel = memo(function LiveChatPanel({ esc, onUpdate, msgInfo, onMarkResponded }) {
  const { profile } = useUser();
  const shortcuts = useShortcuts();
  // Initialize with pre-loaded conversation messages if available so chat is never blank while history polls
  const [messages, setMessages] = useState(() => (Array.isArray(esc.conversations?.messages) && esc.conversations.messages.length > 0 ? esc.conversations.messages : []));
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [shortcutQuery, setShortcutQuery] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const autoResolveRef = useRef(null);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const resetAutoResolve = useCallback(() => {
    clearTimeout(autoResolveRef.current);
  }, []);

  const sessionId = esc.conversations?.session_id;
  const lead = esc.leads;
  const conversation = esc.conversations;
  const isWAConv = conversation?.channel?.toLowerCase() === 'whatsapp' || conversation?.session_id?.startsWith('wa_') || !!conversation?.whatsapp_phone;
  const channel = isWAConv ? 'whatsapp' : 'web';
  const waUrl = formatWhatsAppLink(lead?.normalized_phone || lead?.phone || conversation?.whatsapp_phone);

  // Sync pre-loaded messages if initial state was empty
  useEffect(() => {
    if (Array.isArray(esc.conversations?.messages) && esc.conversations.messages.length > 0) {
      setMessages(prev => (prev.length === 0 ? esc.conversations.messages : prev));
    }
  }, [esc.conversations?.messages]);

  const fetchMessages = useCallback(async () => {
    const queryParam = sessionId
      ? `sessionId=${encodeURIComponent(sessionId)}`
      : esc.conversation_id
        ? `conversationId=${encodeURIComponent(esc.conversation_id)}`
        : null;
    if (!queryParam) return;
    try {
      const res = await fetch(`/api/chat/messages?${queryParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        setMessages(prev => {
          if (prev.length !== data.messages.length || prev[prev.length - 1]?.ts !== data.messages[data.messages.length - 1]?.ts) {
             return data.messages;
          }
          return prev;
        });
        resetAutoResolve();
      }
    } catch (e) {
      console.warn('poll error', e.message);
    }
  }, [sessionId, esc.conversation_id, resetAutoResolve]);

  useEffect(() => { resetAutoResolve(); }, [resetAutoResolve]);

  useEffect(() => {
    fetchMessages();
    // Only poll while chat is active — stop when resolved/ended
    if (esc.status !== 'resolved') {
      pollRef.current = setInterval(fetchMessages, 5000);
    }
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(typingTimerRef.current);
      clearTimeout(autoResolveRef.current);
      api.setTyping(esc.conversation_id, false);
    };
  }, [fetchMessages, esc.conversation_id, esc.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTyping = (e) => {
    setReply(e.target.value);
    api.setTyping(esc.conversation_id, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      api.setTyping(esc.conversation_id, false);
    }, 2000);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const textToSend = reply.trim();
    if (!textToSend || sending) return;
    setSending(true);
    setError('');
    setInfoMessage('');

    // Instant optimistic update in the message stream
    const optimisticMsg = {
      role: 'admin',
      content: textToSend,
      ts: Date.now(),
      adminName: profile?.full_name || 'You',
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setReply('');

    try {
      const result = await api.replyToConversation(esc.conversation_id, textToSend);
      api.setTyping(esc.conversation_id, false);
      resetAutoResolve();

      if (esc.status === 'pending' && profile?.full_name) {
        await api.updateEscalation({ id: esc.id, status: 'in_progress', attended_by: profile.full_name });
        onUpdateRef.current?.();
      }

      if (channel === 'whatsapp') {
        setInfoMessage('Message sent directly to student via WhatsApp! 📱');
      } else if (result?.deliveredVia === 'whatsapp') {
        setInfoMessage('User offline on web — message automatically forwarded to their WhatsApp! 📱');
      }

      onMarkResponded?.(esc.id, esc.conversation_id);
      fetchMessages();
      onUpdateRef.current?.();
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredShortcuts = shortcutQuery
    ? shortcuts.filter(s => s.name.toLowerCase().includes(shortcutQuery.toLowerCase()) || s.shortcut.toLowerCase().includes(shortcutQuery.toLowerCase()))
    : shortcuts;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Live Chat
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
            {channel === 'whatsapp' ? '📱 WhatsApp' : '🌐 Web Widget'}
          </span>
          {getSlaBadge(esc.created_at, esc.status)}
        </div>

        <div className="flex items-center gap-2">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded flex items-center gap-1"
            >
              📱 Message on WhatsApp
            </a>
          )}
          <span className="text-[11px] text-gray-400">Live Sync</span>
        </div>
      </div>

      {msgInfo?.needsResponse && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <span className="text-base">⏳</span>
            <span>Visitor is waiting for your reply.</span>
          </div>
          {msgInfo?.userTs && (
            <span className="text-[10px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">
              Sent {formatRelativeTime(msgInfo.userTs)}
            </span>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 h-72 overflow-y-auto space-y-3 mb-3">
        {!messages.length ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs gap-1.5 p-4">
            <span className="text-2xl">💬</span>
            <span className="font-semibold text-gray-700">No messages yet in this session.</span>
            <span className="text-[11px] text-gray-400">Waiting for live conversation updates...</span>
          </div>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isAgent = m.role === 'agent';
            const isSystem = m.role === '__notification' || m.role === 'system';
            const studentName = esc.leads?.name || esc.lead?.name || esc.lead_name || 'Prospective Student';

            if (isSystem) {
              return (
                <div key={i} className="text-center my-2">
                  <span className="inline-block bg-slate-100 border border-slate-200 text-slate-600 text-[11px] px-3 py-1 rounded-full font-medium">
                    {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
                  </span>
                </div>
              );
            }

            // Safe message formatting — strip any residual system tokens, handle non-strings gracefully
            const formattedContent = typeof m.content === 'string'
              ? m.content.replace(/\[ESCALATE(?::[^\]]*)?\]/gi, '').trim()
              : (m.content ? JSON.stringify(m.content) : '');

            return (
              <div key={i} className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}>
                <div className="text-[10px] text-slate-500 mb-1 px-1 font-semibold tracking-wide">
                  {isUser
                    ? (channel === 'whatsapp' ? `📱 ${studentName} (WhatsApp)` : `👤 ${studentName}`)
                    : isAgent
                    ? `🎧 Staff (${m.agentName || 'Admissions Team'})`
                    : '🏛️ Admissions Concierge'}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none shadow-sm'
                      : isAgent
                      ? 'bg-slate-900 text-white rounded-tr-none shadow-sm font-medium'
                      : 'bg-slate-100 border border-slate-200/60 text-slate-800 rounded-tr-none'
                  }`}
                >
                  {formattedContent}
                </div>
                {m.ts && (
                  <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {infoMessage && (
        <div className="mb-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5 flex items-center justify-between">
          <span>{infoMessage}</span>
          <button onClick={() => setInfoMessage('')} className="text-emerald-800 font-bold ml-2">×</button>
        </div>
      )}

      {error && (
        <div className="mb-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-800 font-bold ml-2">×</button>
        </div>
      )}

      {shortcuts.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-gray-400 font-medium">⚡ Quick Replies:</span>
          {filteredShortcuts.slice(0, 4).map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setReply(s.content || s.message || '')}
              className="text-[11px] bg-white border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 rounded px-2 py-0.5 transition-colors"
              title={s.content || s.message || ''}
            >
              {s.shortcut}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={handleTyping}
          placeholder={channel === 'whatsapp' ? 'Reply directly to student via WhatsApp...' : 'Reply to visitor in live chat...'}
          className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !reply.trim()}
          className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
});

// ── Tags Editor ──────────────────────────────────────────────────
function TagsEditor({ tags = [], onSave }) {
  const [current, setCurrent] = useState(tags);
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || current.includes(trimmed)) return;
    const updated = [...current, trimmed];
    setCurrent(updated);
    setInput('');
    onSave(updated);
  };

  const removeTag = (t) => {
    const updated = current.filter(x => x !== t);
    setCurrent(updated);
    onSave(updated);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {current.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
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
function ChatRow({ esc, onUpdate, defaultExpanded = false, msgInfo, onMarkViewed, onMarkResponded, onOpenModal }) {
  const { profile } = useUser();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [notes, setNotes] = useState(esc.staff_notes || '');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true);
      onMarkViewed?.(esc.id, esc.conversation_id);
    }
  }, [defaultExpanded, esc.id, esc.conversation_id, onMarkViewed]);

  const handleRowClick = async (e) => {
    if (e?.target?.closest('a') || e?.target?.closest('button') || e?.target?.closest('input') || e?.target?.closest('textarea')) return;
    onMarkViewed?.(esc.id, esc.conversation_id);

    let chatToOpen = esc;
    if ((!esc.attended_by || esc.status === 'pending') && esc.status !== 'resolved' && profile?.full_name) {
      try {
        await api.updateEscalation({
          id: esc.id,
          status: 'in_progress',
          attended_by: profile.full_name,
        });
        chatToOpen = {
          ...esc,
          status: 'in_progress',
          attended_by: profile.full_name,
        };
        onUpdate?.();
      } catch (err) {
        console.warn('Auto-assign failed:', err.message);
      }
    }

    if (onOpenModal) {
      onOpenModal(chatToOpen);
    } else {
      setExpanded(prev => !prev);
    }
  };

  const update = async (patch) => {
    setSaving(true);
    setActionError('');
    try {
      // Block double-claiming: warn if someone else is already attending
      if (patch.status === 'in_progress' && esc.attended_by && esc.attended_by !== profile?.full_name) {
        const go = window.confirm(`⚠️ ${esc.attended_by} is already attending this chat. Take over anyway?`);
        if (!go) { setSaving(false); return; }
      }
      if (patch.status === 'resolved') {
        await api.endChat(esc.id, patch.resolved_by || profile?.full_name || null);
      } else {
        await api.updateEscalation({ id: esc.id, ...patch });
      }
      onUpdate();
    } catch (err) {
      console.error(err);
      setActionError(err.message || 'Action failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    setSaving(true);
    setActionError('');
    try {
      await api.joinChat(esc.id, profile?.full_name);
      onUpdate();
    } catch (err) {
      setActionError(err.message || 'Failed to join conversation.');
    } finally {
      setSaving(false);
    }
  };

  const coAgents = esc.co_agents?.filter(Boolean) || [];
  const isMeAttending = esc.attended_by === profile?.full_name;
  const isMeCoAgent = coAgents.includes(profile?.full_name);
  const isSuperAdmin = profile?.role === 'super_admin';
  const canJoin = esc.status === 'in_progress' && esc.attended_by && !isMeAttending && !isMeCoAgent;

  const msgs = Array.isArray(esc.conversations?.messages) ? esc.conversations.messages : [];
  const lastMsgTs = msgs.length > 0 ? (msgs[msgs.length - 1].ts || 0) : 0;
  const convUpdatedTs = esc.conversations?.updated_at ? new Date(esc.conversations.updated_at).getTime() : 0;
  const escUpdatedTs = esc.updated_at ? new Date(esc.updated_at).getTime() : 0;
  const escCreatedTs = esc.created_at ? new Date(esc.created_at).getTime() : 0;
  const lastChatTs = Math.max(lastMsgTs, convUpdatedTs, escUpdatedTs, escCreatedTs, msgInfo?.userTs || 0);

  const isEnded = esc.status === 'resolved' || esc.status === 'closed';
  const isInProgress = esc.status === 'in_progress' && Boolean(esc.attended_by) && !isEnded;
  const isNeedsReply = !isEnded && (!esc.attended_by || esc.status === 'pending' || msgInfo?.needsResponse);

  const displayStatus = isEnded ? 'resolved' : isInProgress ? 'in_progress' : 'needs_reply';
  const displayStatusLabel = isEnded ? 'Ended' : isInProgress ? 'In Progress' : 'Needs Reply';

  const handleAcceptAttend = async (e) => {
    e.stopPropagation();
    const agentName = profile?.full_name || 'Support Agent';
    setSaving(true);
    setActionError('');
    try {
      await api.updateEscalation({
        id: esc.id,
        status: 'in_progress',
        attended_by: agentName,
      });
      onMarkViewed?.(esc.id, esc.conversation_id);
      onUpdate?.();
      onOpenModal?.({
        ...esc,
        status: 'in_progress',
        attended_by: agentName,
      });
    } catch (err) {
      console.error('Accept chat error:', err);
      setActionError(err.message || 'Failed to accept chat');
    } finally {
      setSaving(false);
    }
  };

  const agentCell = () => {
    if (isEnded && esc.resolved_by) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
          ✅ {esc.resolved_by}
        </span>
      );
    }
    if (esc.attended_by) {
      const extras = coAgents.length > 0 ? ` +${coAgents.length}` : '';
      return (
        <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
          🟡 {esc.attended_by}{extras}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
        Unassigned
      </span>
    );
  };

  const isWA = esc.conversations?.channel?.toLowerCase() === 'whatsapp' || esc.conversations?.session_id?.startsWith('wa_') || !!esc.conversations?.whatsapp_phone;
  const channel = isWA ? 'whatsapp' : 'web';
  const waUrl = formatWhatsAppLink(esc.leads?.normalized_phone || esc.leads?.phone || esc.conversations?.whatsapp_phone);

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors ${
          msgInfo?.isUnviewed
            ? 'bg-red-50/70 hover:bg-red-50/90 border-l-4 border-l-red-500'
            : isNeedsReply
            ? 'bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-400'
            : defaultExpanded
            ? 'bg-blue-50/50 hover:bg-blue-50/70'
            : 'hover:bg-gray-50'
        }`}
        onClick={handleRowClick}
      >
        <td className="px-5 py-3 font-medium">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-gray-900">{esc.leads?.name || '—'}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {channel === 'whatsapp' ? 'WA' : 'WEB'}
            </span>
            {esc.leads?.lead_tier === 'HOT' && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700">🔥 Hot</span>
            )}
            {msgInfo?.isUnviewed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white shadow-sm animate-pulse">
                🔴 NEW MESSAGE
              </span>
            ) : isNeedsReply ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                ⏳ Needs Reply
              </span>
            ) : null}
          </div>

          {/* Last message preview snippet */}
          {msgInfo?.lastUserContent && (
            <div className={`text-xs mt-1 truncate max-w-sm flex items-center gap-1.5 ${
              msgInfo?.isUnviewed ? 'text-red-950 font-medium' : 'text-gray-500'
            }`}>
              <span className="truncate">💬 "{msgInfo.lastUserContent}"</span>
              {msgInfo?.userTs && (
                <span className="text-[10px] text-gray-400 font-normal shrink-0">
                  • {formatRelativeTime(msgInfo.userTs)}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-5 py-3">
          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
            {schoolBadge(esc.schools?.slug)}
          </span>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">{reasonLabel[esc.reason] || esc.reason}</td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={statusBadge(displayStatus)}>{displayStatusLabel}</span>
            {getSlaBadge(esc.created_at, esc.status)}
          </div>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">
          <div className="flex flex-wrap gap-1">
            {(esc.tags || []).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{t}</span>
            ))}
          </div>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">{agentCell()}</td>
        <td className="px-5 py-3 text-xs">
          <div className="font-semibold text-gray-800">{formatChatActivityTime(lastChatTs)}</div>
          <div className="text-[10px] text-gray-400">{lastChatTs ? new Date(lastChatTs).toLocaleDateString() : '—'}</div>
        </td>
        <td className="px-5 py-3 text-right">
          {(!esc.attended_by || esc.status === 'pending') ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleAcceptAttend}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-all active:scale-95 animate-pulse"
              title={`Accept this chat and assign ${profile?.full_name || 'yourself'} to attend`}
            >
              <span>✋</span>
              <span>{saving ? 'Assigning...' : 'Accept & Attend'}</span>
            </button>
          ) : isInProgress ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkViewed?.(esc.id, esc.conversation_id);
                onOpenModal?.(esc);
              }}
              className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-all active:scale-95"
            >
              <span>💬</span>
              <span>Reply</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkViewed?.(esc.id, esc.conversation_id);
                onOpenModal?.(esc);
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold shadow-sm inline-flex items-center gap-1 transition-all"
            >
              <span>👁️</span>
              <span>View</span>
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={8} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Student Details</div>
                <div className="text-sm space-y-1.5">
                  <div>Name: <strong>{esc.leads?.name || '—'}</strong></div>
                  <div>Email: {esc.leads?.email || '—'}</div>
                  <div>Phone: {esc.leads?.phone || esc.leads?.normalized_phone || '—'}</div>
                  <div className="flex items-center gap-2 pt-1">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        📱 WhatsApp Chat
                      </a>
                    )}
                    {esc.leads?.zoho_contact_id && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded">
                        💼 Zoho ID: {esc.leads.zoho_contact_id}
                      </span>
                    )}
                  </div>
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
                  placeholder="Add staff notes..."
                />

                {/* Attending / Co-agents banner */}
                {esc.status === 'in_progress' && esc.attended_by && (
                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-amber-800">🟡 Attending:</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${isMeAttending ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'}`}>
                        {esc.attended_by}{isMeAttending ? ' (you)' : ''}
                      </span>
                      {coAgents.map(a => (
                        <span key={a} className={`px-2 py-0.5 rounded-full font-medium ${a === profile?.full_name ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800'}`}>
                          👁️ {a}{a === profile?.full_name ? ' (you)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {actionError && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{actionError}</div>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {esc.status === 'pending' && (
                    <button onClick={() => update({ status: 'in_progress', attended_by: profile?.full_name })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Attend / Serve'}
                    </button>
                  )}
                  {canJoin && isSuperAdmin && (
                    <button onClick={handleJoin} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                      👁️ {saving ? 'Joining...' : 'Join Conversation'}
                    </button>
                  )}
                  {(esc.status === 'pending' || esc.status === 'in_progress') && (
                    <button
                      onClick={() => update({ status: 'resolved', resolved_by: profile?.full_name || null })}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Ending...' : 'End Chat'}
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
              <LiveChatPanel
                esc={esc}
                onUpdate={onUpdate}
                msgInfo={msgInfo}
                onMarkResponded={onMarkResponded}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Chats() {
  const { selectedSchool } = useSchool();
  const {
    pendingCount,
    unviewedCount,
    unrespondedCount,
    markChatAsViewed,
    markChatAsResponded,
    getEscalationInfo,
    refresh: refreshBadgeCount,
  } = useEscalation();
  const { chatId: routeChatId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const targetChatId = routeChatId || searchParams.get('id') || searchParams.get('chatId') || searchParams.get('escalationId') || searchParams.get('sessionId') || searchParams.get('leadId');

  const [escalations, setEscalations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [status, setStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bulkEnding, setBulkEnding] = useState(false);
  const prevPendingRef = useRef(null);

  const fetchEscalations = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      setLoadError('');
      const params = { limit: 250 };
      // If focusing on a specific chat, fetch across all schools/statuses to ensure it's found
      if (!targetChatId && selectedSchool !== 'all') {
        params.schoolId = selectedSchool;
      }
      const data = await api.escalations(params);
      let list = data.escalations || [];

      // If targetChatId provided but not in escalations, try to fetch the single conversation
      if (targetChatId && !list.some(e => e.id === targetChatId || e.conversation_id === targetChatId || e.conversations?.id === targetChatId || e.conversations?.session_id === targetChatId || e.lead_id === targetChatId)) {
        try {
          const single = await api.conversation(targetChatId);
          if (single?.id) {
            const syntheticEsc = {
              id: single.escalation?.id || `conv_${single.id}`,
              conversation_id: single.id,
              conversations: single,
              leads: single.leads,
              schools: single.schools,
              status: single.escalation?.status || single.stage || 'active',
              reason: single.escalation?.reason || 'Live Direct Link',
              staff_notes: single.escalation?.staff_notes || '',
              attended_by: single.escalation?.attended_by || null,
              resolved_by: single.escalation?.resolved_by || null,
              tags: single.escalation?.tags || single.leads?.intent_tags || [],
              created_at: single.created_at,
            };
            list = [syntheticEsc, ...list];
          }
        } catch (sErr) {
          console.warn('Single conversation fetch fallback:', sErr.message);
        }
      }

      setEscalations(list);
    } catch (err) {
      console.error('fetchEscalations error:', err);
      if (!isBackground) {
        setLoadError(err.message || 'Failed to load chats. Please check your connection and retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSchool, targetChatId]);

  // Combined update: refresh both the list and the sidebar badge immediately
  const handleUpdate = useCallback(() => {
    fetchEscalations(true);
    refreshBadgeCount();
  }, [fetchEscalations, refreshBadgeCount]);

  const handleBulkEnd = useCallback(async () => {
    const total = pendingCount + unrespondedCount;
    if (!window.confirm(`End all ${total > 0 ? total : ''} pending chats${selectedSchool !== 'all' ? ' for this school' : ''}? This cannot be undone.`)) return;
    setBulkEnding(true);
    try {
      const result = await api.bulkEndChats(selectedSchool !== 'all' ? selectedSchool : undefined);
      await fetchEscalations();
      refreshBadgeCount();
      alert(`✅ ${result.ended || 0} chats ended successfully.`);
    } catch (err) {
      alert('Failed to bulk end chats: ' + err.message);
    } finally {
      setBulkEnding(false);
    }
  }, [selectedSchool, pendingCount, unrespondedCount, fetchEscalations, refreshBadgeCount]);

  useEffect(() => {
    fetchEscalations();
    // Fast polling fallback to eliminate delays
    const interval = setInterval(() => fetchEscalations(true), 2500);

    // Instant zero-delay Supabase Realtime listeners for escalations and conversations
    const channel = supabase
      .channel('admin_chats_realtime_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalations' }, () => {
        fetchEscalations(true);
        refreshBadgeCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchEscalations(true);
        refreshBadgeCount();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchEscalations, refreshBadgeCount]);

  useEffect(() => {
    if (prevPendingRef.current !== null && pendingCount > prevPendingRef.current) {
      fetchEscalations(true);
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount, fetchEscalations]);

  const targetEsc = targetChatId
    ? escalations.find(e =>
        e.id === targetChatId ||
        e.conversation_id === targetChatId ||
        e.conversations?.id === targetChatId ||
        e.conversations?.session_id === targetChatId ||
        e.lead_id === targetChatId ||
        e.leads?.id === targetChatId ||
        e.leads?.phone === targetChatId ||
        e.leads?.normalized_phone === targetChatId
      )
    : null;

  // Auto-mark target chat as viewed and open modal when navigated directly
  useEffect(() => {
    if (targetEsc) {
      markChatAsViewed(targetEsc.id, targetEsc.conversation_id);
      setSelectedChat(targetEsc);
    }
  }, [targetEsc, markChatAsViewed]);

  const analyzedList = useMemo(() => {
    return escalations.map(esc => {
      const info = getEscalationInfo(esc);
      const msgs = Array.isArray(esc.conversations?.messages) ? esc.conversations.messages : [];
      const lastMsgTs = msgs.length > 0 ? (msgs[msgs.length - 1].ts || 0) : 0;
      const convUpdatedTs = esc.conversations?.updated_at ? new Date(esc.conversations.updated_at).getTime() : 0;
      const escUpdatedTs = esc.updated_at ? new Date(esc.updated_at).getTime() : 0;
      const escCreatedTs = esc.created_at ? new Date(esc.created_at).getTime() : 0;
      const userTs = info?.userTs || 0;
      const lastChatTs = Math.max(lastMsgTs, convUpdatedTs, escUpdatedTs, escCreatedTs, userTs);

      const isEnded = esc.status === 'resolved' || esc.status === 'closed';
      const isInProgress = !isEnded && esc.status === 'in_progress' && Boolean(esc.attended_by);
      const isNeedsReply = !isEnded && (!esc.attended_by || esc.status === 'pending' || info?.needsResponse);

      return {
        esc,
        info,
        lastChatTs,
        isEnded,
        isInProgress,
        isNeedsReply,
      };
    });
  }, [escalations, getEscalationInfo]);

  // Tab counts dynamically calculated from current list
  const tabCounts = useMemo(() => {
    const counts = { all: analyzedList.length, needs_reply: 0, in_progress: 0, resolved: 0 };
    analyzedList.forEach(item => {
      if (item.isNeedsReply) counts.needs_reply++;
      if (item.isInProgress) counts.in_progress++;
      if (item.isEnded) counts.resolved++;
    });
    return counts;
  }, [analyzedList]);

  const filtered = useMemo(() => {
    if (targetEsc) {
      const found = analyzedList.find(a => a.esc.id === targetEsc.id);
      if (found) return [found];
      return [{
        esc: targetEsc,
        info: getEscalationInfo(targetEsc),
        lastChatTs: Date.now(),
        isEnded: targetEsc.status === 'resolved' || targetEsc.status === 'closed',
        isInProgress: targetEsc.status === 'in_progress' && Boolean(targetEsc.attended_by),
        isNeedsReply: !targetEsc.attended_by || targetEsc.status === 'pending',
      }];
    }

    const q = searchQuery.trim().toLowerCase();

    return analyzedList.filter(({ esc, info, isNeedsReply, isInProgress, isEnded }) => {
      // School filter
      if (selectedSchool !== 'all') {
        const slug = esc.schools?.slug?.toLowerCase();
        const sel = selectedSchool.toLowerCase();
        if (slug !== sel && !(sel === 'babcock' && slug === 'backock')) {
          return false;
        }
      }

      // Tab column filter
      if (status === 'needs_reply' && !isNeedsReply) return false;
      if (status === 'in_progress' && !isInProgress) return false;
      if (status === 'resolved' && !isEnded) return false;

      // Student name, phone, email, notes, tags & message search
      if (q) {
        const name = (esc.leads?.name || esc.lead?.name || esc.lead_name || '').toLowerCase();
        const phone = (esc.leads?.phone || esc.leads?.normalized_phone || esc.conversations?.whatsapp_phone || '').toLowerCase();
        const email = (esc.leads?.email || '').toLowerCase();
        const notes = (esc.staff_notes || '').toLowerCase();
        const agent = (esc.attended_by || esc.resolved_by || '').toLowerCase();
        const tags = (esc.tags || []).join(' ').toLowerCase();
        const lastMsg = (info?.lastUserContent || '').toLowerCase();
        const reason = (esc.reason || '').toLowerCase();

        const match =
          name.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          notes.includes(q) ||
          agent.includes(q) ||
          tags.includes(q) ||
          lastMsg.includes(q) ||
          reason.includes(q);

        if (!match) return false;
      }

      // Tag filter
      if (tagFilter && !(esc.tags || []).some(t => t.toLowerCase().includes(tagFilter.toLowerCase()))) {
        return false;
      }

      return true;
    });
  }, [targetEsc, analyzedList, selectedSchool, status, searchQuery, tagFilter, getEscalationInfo]);

  // Sort strictly by last chat activity timestamp & date descending (newest chat on top)
  const displayed = useMemo(() => {
    if (targetEsc) return filtered;
    return [...filtered].sort((a, b) => {
      // Unviewed new incoming messages prioritized at top
      if (a.info.isUnviewed && !b.info.isUnviewed) return -1;
      if (!a.info.isUnviewed && b.info.isUnviewed) return 1;

      // Sort by last chat activity timestamp descending
      return (b.lastChatTs || 0) - (a.lastChatTs || 0);
    });
  }, [filtered, targetEsc]);

  const selectedIndex = selectedChat ? displayed.findIndex(d => d.esc.id === selectedChat.id || d.esc.conversation_id === selectedChat.conversation_id) : -1;
  const prevChat = selectedIndex > 0 ? displayed[selectedIndex - 1].esc : null;
  const nextChat = selectedIndex >= 0 && selectedIndex < displayed.length - 1 ? displayed[selectedIndex + 1].esc : null;

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Chats & Escalations</h1>
        <p className="text-gray-500 text-sm mb-6">Manage live conversations from Web & WhatsApp, attend leads, and reply in real-time</p>

        {targetEsc && (
          <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎯</span>
              <div>
                <div className="text-sm font-bold text-blue-900">
                  Direct Live Chat: {targetEsc.leads?.name || 'Visitor'}
                </div>
                <div className="text-xs text-blue-600 font-mono">
                  Chat ID: {targetChatId} • Channel: {targetEsc.conversations?.channel?.toUpperCase() || (targetEsc.conversations?.session_id?.startsWith('wa_') ? 'WHATSAPP' : 'WEB')} • School: {targetEsc.schools?.name || 'School'}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (routeChatId) navigate('/chats');
                else setSearchParams({});
              }}
              className="text-xs font-semibold px-3.5 py-2 bg-white text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-300 rounded-lg shadow-sm transition-all"
            >
              ← View All Available Chats
            </button>
          </div>
        )}

        {!targetEsc && (
          <div className="flex flex-col sm:flex-row gap-3 mb-5 items-stretch sm:items-center justify-between">
            {/* Column / Status Tabs: All, Needs Reply, In Progress, Ended */}
            <div className="flex flex-wrap gap-2 items-center">
              {STATUSES.map(s => {
                const count = tabCounts[s] || 0;
                const isSelected = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all capitalize flex items-center gap-2 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600 ring-offset-1'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{STATUS_LABEL[s] || s}</span>
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 font-bold transition-colors ${
                        isSelected
                          ? 'bg-white text-blue-800'
                          : s === 'needs_reply' && count > 0
                          ? (unviewedCount > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-500 text-white')
                          : s === 'in_progress' && count > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s === 'needs_reply' && unviewedCount > 0 ? `${unviewedCount} new` : count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Real-time Search by student name, phone, email, notes */}
            <div className="flex items-center gap-2 flex-1 max-w-md sm:ml-auto">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search student name, phone, email, notes..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    <span className="text-xs bg-gray-200 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center font-bold">✕</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading chats...
            </div>
          ) : loadError ? (
            <div className="p-5 flex items-center justify-between text-rose-700 bg-rose-50 text-sm">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{loadError}</span>
              </div>
              <button
                onClick={() => fetchEscalations()}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !displayed.length ? (
            <div className="p-8 text-center text-gray-400 text-sm space-y-1">
              <span className="text-3xl block mb-1">💬</span>
              <p className="font-semibold text-gray-600">No chats found in this category.</p>
              {searchQuery && (
                <p className="text-xs text-gray-400">
                  No matching results for "<span className="text-gray-700">{searchQuery}</span>". Try clearing your search.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Student / Lead</th>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tags</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Last Chat</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ esc, info }) => (
                  <ChatRow
                    key={esc.id}
                    esc={esc}
                    msgInfo={info}
                    onUpdate={handleUpdate}
                    onMarkViewed={markChatAsViewed}
                    onMarkResponded={markChatAsResponded}
                    defaultExpanded={false}
                    onOpenModal={(chat) => setSelectedChat(chat)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* WhatsApp-Style Conversation Details Modal */}
      {selectedChat && (
        <ConversationViewer
          conversationId={selectedChat.conversation_id || selectedChat.conversations?.id || selectedChat.id}
          initialConv={selectedChat.conversations ? {
            ...selectedChat.conversations,
            leads: selectedChat.leads,
            schools: selectedChat.schools,
            escalation: selectedChat,
          } : selectedChat}
          escalation={selectedChat}
          onClose={() => {
            setSelectedChat(null);
            if (routeChatId) navigate('/chats');
            else setSearchParams({});
          }}
          onUpdate={handleUpdate}
          onNext={nextChat ? () => setSelectedChat(nextChat) : null}
          onPrev={prevChat ? () => setSelectedChat(prevChat) : null}
        />
      )}
    </div>
  );
}
