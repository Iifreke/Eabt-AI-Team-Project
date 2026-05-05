import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function ConversationViewer({ conversationId, onClose }) {
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.conversation(conversationId)
      .then(setConv)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold">Conversation Details</h2>
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
            <div className="flex-1 overflow-y-auto p-5 border-r border-gray-200">
              <div className="space-y-3">
                {(conv.messages || []).map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                        {msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                  {conv.schools?.name || '—'}
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
