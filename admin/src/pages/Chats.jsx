import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import { useEscalation } from '../context/EscalationContext.jsx';
import { supabase } from '../lib/supabase.js';

const STATUSES = ['all', 'pending', 'in_progress', 'resolved'];

const SLUG_DISPLAY = { backock: 'BABCOCK', babcock: 'BABCOCK', abu: 'ABU' };
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

function formatWhatsAppLink(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function getSlaBadge(createdAt, status) {
  if (status === 'resolved' || !createdAt) return null;
  const created = new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - created) / 60000));

  if (elapsedMinutes < 3) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        ⏱️ {elapsedMinutes}m
      </span>
    );
  }
  if (elapsedMinutes < 10) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
        ⏱️ {elapsedMinutes}m
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
      🚨 {elapsedMinutes}m SLA
    </span>
  );
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
const LiveChatPanel = memo(function LiveChatPanel({ esc, onUpdate }) {
  const { profile } = useUser();
  const shortcuts = useShortcuts();
  const [messages, setMessages] = useState([]);
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
    if (esc.status === 'resolved' || !profile?.full_name) return;
    autoResolveRef.current = setTimeout(async () => {
      try {
        await api.updateEscalation({ id: esc.id, status: 'resolved', resolved_by: profile.full_name });
        onUpdateRef.current?.();
      } catch {}
    }, 5 * 60 * 1000);
  }, [esc.id, esc.status, profile]);

  const sessionId = esc.conversations?.session_id;
  const lead = esc.leads;
  const conversation = esc.conversations;
  const isWAConv = conversation?.channel?.toLowerCase() === 'whatsapp' || conversation?.session_id?.startsWith('wa_') || !!conversation?.whatsapp_phone;
  const channel = isWAConv ? 'whatsapp' : 'web';
  const waUrl = formatWhatsAppLink(lead?.normalized_phone || lead?.phone || conversation?.whatsapp_phone);

  const fetchMessages = useCallback(async () => {
    const queryParam = sessionId
      ? `sessionId=${encodeURIComponent(sessionId)}`
      : esc.conversation_id
        ? `conversationId=${encodeURIComponent(esc.conversation_id)}`
        : null;
    if (!queryParam) return;
    try {
      const res = await fetch(`/api/chat/messages?${queryParam}`);
      const data = await res.json();
      if (Array.isArray(data?.messages)) {
        setMessages(prev => {
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
  }, [sessionId, esc.conversation_id, resetAutoResolve]);

  useEffect(() => { resetAutoResolve(); }, [resetAutoResolve]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 1500);
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
    if (!reply.trim() || sending) return;
    setSending(true);
    setError('');
    setInfoMessage('');

    try {
      const result = await api.replyToConversation(esc.conversation_id, reply.trim());
      setReply('');
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

      fetchMessages();
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

      <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 h-72 overflow-y-auto space-y-3 mb-3">
        {!messages.length ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-1">
            <span className="text-xl">💬</span>
            <span>No messages yet in this session.</span>
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
                    {m.content}
                  </span>
                </div>
              );
            }

            // Luxury message formatting — strip any residual system tokens
            const formattedContent = typeof m.content === 'string'
              ? m.content.replace(/\[ESCALATE(?::[^\]]*)?\]/gi, '').trim()
              : m.content;

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
function ChatRow({ esc, onUpdate, defaultExpanded = false }) {
  const { profile } = useUser();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [notes, setNotes] = useState(esc.staff_notes || '');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true);
    }
  }, [defaultExpanded]);

  const update = async (patch) => {
    setSaving(true);
    setActionError('');
    try {
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

  const agentCell = () => {
    if (esc.status === 'in_progress' && esc.attended_by) return `🟡 ${esc.attended_by}`;
    if (esc.status === 'resolved' && esc.resolved_by) return `✅ ${esc.resolved_by}`;
    return '—';
  };

  const isWA = esc.conversations?.channel?.toLowerCase() === 'whatsapp' || esc.conversations?.session_id?.startsWith('wa_') || !!esc.conversations?.whatsapp_phone;
  const channel = isWA ? 'whatsapp' : 'web';
  const waUrl = formatWhatsAppLink(esc.leads?.normalized_phone || esc.leads?.phone || esc.conversations?.whatsapp_phone);

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${defaultExpanded ? 'bg-blue-50/50' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-5 py-3 font-medium">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{esc.leads?.name || '—'}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {channel === 'whatsapp' ? 'WA' : 'WEB'}
            </span>
            {esc.leads?.lead_tier === 'HOT' && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700">🔥 Hot</span>
            )}
          </div>
        </td>
        <td className="px-5 py-3">
          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
            {schoolBadge(esc.schools?.slug)}
          </span>
        </td>
        <td className="px-5 py-3 text-gray-500 text-xs">{reasonLabel[esc.reason] || esc.reason}</td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={statusBadge(esc.status)}>{STATUS_LABEL[esc.status] || esc.status}</span>
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
        <td className="px-5 py-3 text-gray-400 text-xs">
          {esc.created_at ? new Date(esc.created_at).toLocaleDateString() : '—'}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-5 py-4">
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
  const { pendingCount, refresh: refreshBadgeCount } = useEscalation();
  const { chatId: routeChatId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const targetChatId = routeChatId || searchParams.get('id') || searchParams.get('chatId') || searchParams.get('escalationId') || searchParams.get('sessionId') || searchParams.get('leadId');

  const [escalations, setEscalations] = useState([]);
  const [status, setStatus] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const prevPendingRef = useRef(null);

  const fetchEscalations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      // If focusing on a specific chat, fetch across all schools/statuses to ensure it's found
      if (!targetChatId) {
        if (selectedSchool !== 'all') params.schoolId = selectedSchool;
        if (status !== 'all') params.status = status;
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [status, selectedSchool, targetChatId]);

  // Combined update: refresh both the list and the sidebar badge immediately
  const handleUpdate = useCallback(() => {
    fetchEscalations();
    refreshBadgeCount();
  }, [fetchEscalations, refreshBadgeCount]);

  useEffect(() => { fetchEscalations(); }, [fetchEscalations]);

  useEffect(() => {
    if (prevPendingRef.current !== null && pendingCount > prevPendingRef.current) {
      fetchEscalations();
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

  const displayed = targetEsc
    ? [targetEsc]
    : tagFilter
    ? escalations.filter(e => (e.tags || []).includes(tagFilter.toLowerCase()))
    : escalations;

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
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading chats...
            </div>
          ) : !displayed.length ? (
            <p className="text-gray-400 text-sm p-5">No chats found.</p>
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
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(esc => (
                  <ChatRow
                    key={esc.id}
                    esc={esc}
                    onUpdate={handleUpdate}
                    defaultExpanded={!!targetEsc}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
