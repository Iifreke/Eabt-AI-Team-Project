import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api.js';

const SLUG_DISPLAY = { backock: 'Babcock University', abu: 'ABU (Ahmadu Bello University)' };

export default function ConversationViewer({ conversationId, onClose }) {
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const fetchConv = useCallback(() => {
    api.conversation(conversationId)
      .then(setConv)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    fetchConv();
  }, [fetchConv]);

  // Poll every 4s when escalated for live admin replies
  useEffect(() => {
    if (conv?.stage === 'escalated') {
      pollRef.current = setInterval(fetchConv, 4000);
    }
    return () => clearInterval(pollRef.current);
  }, [conv?.stage, fetchConv]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages?.length]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    setReplyError('');
    try {
      await api.replyToConversation(conversationId, reply.trim());
      setReply('');
      fetchConv();
    } catch {
      setReplyError('Failed to send. Please try again.');
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

  const getBubbleStyle = (role) => {
    if (role === 'user') return 'bg-blue-600 text-white rounded-br-sm';
    if (role === 'admin') return 'bg-purple-600 text-white rounded-bl-sm';
    return 'bg-gray-100 text-gray-800 rounded-bl-sm';
  };

  const getRoleLabel = (role) => {
    if (role === 'user') return null; // no label for user
    if (role === 'admin') return <div className="text-xs text-purple-300 mb-1 font-semibold">🧑‍💼 Admin</div>;
    return <div className="text-xs text-gray-400 mb-1">🤖 Bot</div>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold">Conversation Details</h2>
            {conv?.stage === 'escalated' && (
              <span className="text-xs text-purple-600 font-medium">🟣 Escalated — you can reply live below</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !conv ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Failed to load conversation.</div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Chat transcript — 60% */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-3">
                  {(conv.messages || []).map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-sm`}>
                        {getRoleLabel(msg.role)}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${getBubbleStyle(msg.role)}`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : msg.role === 'admin' ? 'text-purple-300' : 'text-gray-400'}`}>
                            {msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </div>

              {/* Admin reply input — only when escalated and not resolved */}
              {conv.stage === 'escalated' && (
                <div className="p-4 border-t border-gray-200 bg-purple-50">
                  <div className="text-xs font-semibold text-purple-700 mb-2">Reply as Admin</div>
                  {replyError && <div className="text-xs text-red-600 mb-2">{replyError}</div>}
                  <div className="flex gap-2">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={2}
                      placeholder="Type your message... (Enter to send)"
                      className="flex-1 text-sm border border-purple-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white"
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

            {/* Details panel — 40% */}
            <div className="w-72 flex-shrink-0 overflow-y-auto p-5 space-y-5">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Lead</div>
                <div className="space-y-1 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium">{conv.leads?.name || '—'}</span></div>
                  <div><span className="text-gray-500">Email:</span> {conv.leads?.email || '—'}</div>
                  <div><span className="text-gray-500">Phone:</span> {conv.leads?.phone || '—'}</div>
                  <div>
                    <span className="text-gray-500">Zoho:</span>{' '}
                    {conv.leads?.zoho_contact_id ? (
                      <span className="text-green-600 font-medium">✓ Synced</span>
                    ) : (
                      <span className="text-gray-400">Not synced</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">School</div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {SLUG_DISPLAY[conv.schools?.slug] || conv.schools?.name || '—'}
                </span>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Stage</div>
                <StageBadge stage={conv.stage} />
              </div>

              {conv.escalation && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Escalation</div>
                  <div className="text-sm space-y-1">
                    <div><span className="text-gray-500">Reason:</span> {conv.escalation.reason}</div>
                    <div><span className="text-gray-500">Status:</span> {conv.escalation.status}</div>
                    {conv.escalation.staff_notes && (
                      <div>
                        <div className="text-gray-500 mb-1">Notes:</div>
                        <div className="bg-gray-50 rounded p-2 text-xs">{conv.escalation.staff_notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StageBadge({ stage }) {
  const map = {
    onboarding: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    escalated: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[stage] || 'bg-gray-100 text-gray-700'}`}>
      {stage}
    </span>
  );
}
