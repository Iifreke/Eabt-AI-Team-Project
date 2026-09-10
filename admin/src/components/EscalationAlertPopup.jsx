import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscalation } from '../context/EscalationContext.jsx';

function formatRelativeTime(ts) {
  if (!ts) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function EscalationAlertPopup() {
  const navigate = useNavigate();
  const { unviewedChats, unviewedCount, markChatAsViewed } = useEscalation();
  const [minimized, setMinimized] = useState(false);

  // Per user requirement: Stays on screen till viewed or responded to!
  if (!unviewedCount || unviewedChats.length === 0) return null;

  const handleOpenChat = (chat) => {
    markChatAsViewed(chat.id, chat.conversationId);
    navigate(`/chats?id=${chat.id}`);
  };

  if (minimized) {
    return (
      <aside
        aria-label="Pending incoming messages"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-[100] cursor-pointer bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 border-2 border-white animate-bounce transition-transform"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
        <span className="text-xs font-bold tracking-wide">
          {unviewedCount} New Message{unviewedCount > 1 ? 's' : ''} (Click to expand)
        </span>
      </aside>
    );
  }

  // Display top 3 incoming cards if multiple
  const displayedCards = unviewedChats.slice(0, 3);
  const remainingCount = unviewedCount - displayedCards.length;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-96 max-w-[92vw] bg-white rounded-2xl shadow-2xl border-2 border-red-500 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-rose-600 px-4 py-3 flex items-center justify-between text-white shadow-inner">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <div>
            <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <span>New Incoming Message{unviewedCount > 1 ? 's' : ''}</span>
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {unviewedCount}
              </span>
            </div>
            <div className="text-[10px] text-red-100 opacity-90">
              Needs your review or reply
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMinimized(true)}
            title="Minimize alert"
            className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs transition-colors"
          >
            ➖
          </button>
        </div>
      </div>

      {/* Message Cards List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100 p-2 space-y-1.5">
        {displayedCards.map((chat) => (
          <div
            key={chat.id}
            className="p-3 bg-slate-50 hover:bg-red-50/40 rounded-xl transition-colors border border-slate-200/70"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-gray-900">
                  {chat.studentName}
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                    chat.channel === 'whatsapp'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {chat.channel === 'whatsapp' ? '📱 WhatsApp' : '🌐 Web'}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-200 text-gray-700">
                  {chat.schoolSlug.toUpperCase()}
                </span>
              </div>
              <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap">
                {formatRelativeTime(chat.userTs)}
              </span>
            </div>

            {/* Message Preview Quote */}
            <div className="text-xs text-gray-700 line-clamp-2 italic bg-white p-2 rounded-lg border border-gray-200/80 mb-2.5">
              "{chat.lastUserContent}"
            </div>

            {/* View & Reply Action Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenChat(chat)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-1"
              >
                <span>View & Reply</span>
                <span>→</span>
              </button>
            </div>
          </div>
        ))}

        {remainingCount > 0 && (
          <div className="text-center py-2 text-xs text-gray-500 font-medium">
            + {remainingCount} more unviewed message{remainingCount > 1 ? 's' : ''} waiting
          </div>
        )}
      </div>

      {/* Footer view all link */}
      <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-400 text-[11px]">
          Persists until viewed or replied
        </span>
        <button
          onClick={() => {
            navigate('/chats');
          }}
          className="text-blue-600 hover:text-blue-800 font-bold hover:underline text-[11px]"
        >
          Open Chats Portal →
        </button>
      </div>
    </div>
  );
}
