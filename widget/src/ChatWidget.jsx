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

  // Multi-school support: config.schools = [{ id, name }, ...]
  const isMultiSchool = Array.isArray(config?.schools) && config.schools.length > 1;
  const [selectedSchool, setSelectedSchool] = useState(null);

  // Effective config resolved after school selection (or single-school)
  const effectiveSchoolId = selectedSchool?.id || config?.schoolId;
  const effectiveSchoolName = selectedSchool?.name || config?.theme?.name || 'School Support';
  const effectiveConfig = {
    ...config,
    schoolId: effectiveSchoolId,
    theme: { ...config?.theme, name: effectiveSchoolName },
  };

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

  // Fetch greeting once school is known and chat is open
  useEffect(() => {
    if (isOpen && !hasGreeted && effectiveSchoolId) {
      fetchGreeting(effectiveConfig, sessionId);
    }
  }, [isOpen, selectedSchool]);

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

  const panelStyle = {
    ...windowStyle,
    background: 'white',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9998,
    animation: 'schoolbot-slideup 0.2s ease-out',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  return (
    <>
      <style>{slideUpKeyframe}</style>

      {/* School selection screen */}
      {isOpen && isMultiSchool && !selectedSchool && (
        <div style={panelStyle}>
          <div style={{
            background: primaryColor,
            padding: '18px 20px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>Welcome!</div>
              <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>School Admissions Assistant</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: '4px' }}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <p style={{ fontSize: '14px', color: '#444', marginBottom: '4px', lineHeight: '1.5' }}>
              Hi there! Which school are you enquiring about?
            </p>
            {config.schools.map(school => (
              <button
                key={school.id}
                onClick={() => setSelectedSchool(school)}
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: `2px solid ${primaryColor}`,
                  background: 'white',
                  color: primaryColor,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = primaryColor;
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.color = primaryColor;
                }}
              >
                {school.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat window */}
      {isOpen && (!isMultiSchool || selectedSchool) && (
        <div style={panelStyle}>
          <ChatHeader
            schoolName={effectiveSchoolName}
            primaryColor={primaryColor}
            onClose={() => setIsOpen(false)}
          />
          <MessageList
            messages={messages}
            stage={stage}
            isLoading={isLoading}
            primaryColor={primaryColor}
            onSuggestionSelect={(q, msgId) =>
              handleSuggestionClick(q, msgId, effectiveConfig, sessionId)
            }
          />
          <ChatInput
            onSend={(text) => sendMessage(text, effectiveConfig, sessionId)}
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
