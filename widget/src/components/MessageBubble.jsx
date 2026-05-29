import React from 'react';

const typingKeyframes = `
@keyframes _sb_bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-5px); opacity: 1; }
}`;

function TypingDots({ agentName }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '4px' }}>
      <style>{typingKeyframes}</style>
      <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700, marginBottom: '2px', paddingLeft: '2px' }}>
        🧑‍💼 {agentName || 'Support Agent'}
      </div>
      <div style={{ background: '#f1f1f1', borderRadius: '18px 18px 18px 4px', padding: '10px 16px', display: 'flex', gap: '5px', alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: '7px', height: '7px', borderRadius: '50%', background: '#aaa', display: 'inline-block',
            animation: `_sb_bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function renderContent(text, textColor) {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: textColor === 'white' ? 'rgba(255,255,255,0.85)' : '#1d4ed8', textDecoration: 'underline' }}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function AttachmentView({ att, textColor }) {
  if (att.type?.startsWith('image/')) {
    return (
      <img
        src={att.url}
        alt={att.name || 'image'}
        style={{ maxWidth: '200px', borderRadius: '8px', marginTop: '6px', display: 'block' }}
      />
    );
  }
  if (att.type?.startsWith('video/')) {
    return (
      <video
        controls
        src={att.url}
        style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '6px', display: 'block' }}
      />
    );
  }
  if (att.type?.startsWith('audio/')) {
    return <audio controls src={att.url} style={{ display: 'block', marginTop: '6px', maxWidth: '220px' }} />;
  }
  // PDF or other file
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px',
        color: textColor === 'white' ? 'rgba(255,255,255,0.9)' : '#1d4ed8',
        textDecoration: 'none',
        background: 'rgba(0,0,0,0.08)',
        borderRadius: '6px', padding: '5px 10px', fontSize: '12px',
      }}
    >
      📄 {att.name || 'File'}
    </a>
  );
}

export { TypingDots };

export default function MessageBubble({ message, primaryColor }) {
  const isUser = message.role === 'user';
  const isAdmin = message.role === 'admin';

  const bgColor = isUser ? primaryColor : isAdmin ? '#7c3aed' : '#f1f1f1';
  const textColor = isUser || isAdmin ? 'white' : '#222';
  const borderRadius = isUser
    ? '18px 18px 4px 18px'
    : '18px 18px 18px 4px';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '4px',
      }}
    >
      {/* Admin label */}
      {isAdmin && (
        <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700, marginBottom: '2px', paddingLeft: '2px' }}>
          🧑‍💼 {message.adminName || 'Support Agent'}
        </div>
      )}
      <div
        style={{
          background: bgColor,
          color: textColor,
          borderRadius,
          padding: '10px 14px',
          maxWidth: isUser ? '75%' : '85%',
          fontSize: '14px',
          lineHeight: '1.5',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          boxShadow: isAdmin ? '0 2px 8px rgba(124,58,237,0.15)' : 'none',
        }}
      >
        {renderContent(message.content, textColor)}
        {message.attachments?.map((att, i) => (
          <AttachmentView key={i} att={att} textColor={textColor} />
        ))}
      </div>
      <div style={{ fontSize: '10px', color: '#999', marginTop: '3px', paddingLeft: '2px', paddingRight: '2px' }}>
        {formatTime(message.ts || Date.now())}
      </div>
    </div>
  );
}
