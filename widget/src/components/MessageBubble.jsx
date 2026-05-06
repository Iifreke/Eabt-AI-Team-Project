import React from 'react';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
          🧑‍💼 Support Agent
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
        {message.content}
      </div>
      <div style={{ fontSize: '10px', color: '#999', marginTop: '3px', paddingLeft: '2px', paddingRight: '2px' }}>
        {formatTime(message.ts || Date.now())}
      </div>
    </div>
  );
}
