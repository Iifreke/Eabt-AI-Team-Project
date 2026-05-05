import React, { useState, useEffect } from 'react';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import ChatHeader from './components/ChatHeader.jsx';
import MessageList from './components/MessageList.jsx';
import ChatInput from './components/ChatInput.jsx';

const slideUpKeyframe = `
@keyframes schoolbot-slideup {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export default function ChatWidget({ config }) {
  const primaryColor = config?.theme?.primaryColor || '#1a73e8';
  const schoolName = config?.theme?.name || 'School Support';

  const { sessionId } = useSession();
  const {
    messages,
    stage,
    isLoading,
    hasGreeted,
    fetchGreeting,
    sendMessage,
    handleSuggestionClick,
  } = useChat();

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen && !hasGreeted) {
      fetchGreeting(config, sessionId);
    }
  }, [isOpen]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 480;

  const windowStyle = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
      }
    : {
        position: 'fixed',
        bottom: '92px',
        right: '24px',
        width: '380px',
        height: '560px',
        borderRadius: '16px',
      };

  return (
    <>
      <style>{slideUpKeyframe}</style>

      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            ...windowStyle,
            background: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9998,
            animation: 'schoolbot-slideup 0.2s ease-out',
            overflow: 'hidden',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <ChatHeader
            schoolName={schoolName}
            primaryColor={primaryColor}
            onClose={() => setIsOpen(false)}
          />
          <MessageList
            messages={messages}
            stage={stage}
            isLoading={isLoading}
            primaryColor={primaryColor}
            onSuggestionSelect={(q, msgId) =>
              handleSuggestionClick(q, msgId, config, sessionId)
            }
          />
          <ChatInput
            onSend={(text) => sendMessage(text, config, sessionId)}
            isLoading={isLoading}
            primaryColor={primaryColor}
          />
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: primaryColor,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
        }}
        aria-label="Open chat"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
