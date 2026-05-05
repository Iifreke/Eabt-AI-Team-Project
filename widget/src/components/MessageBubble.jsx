import React from 'react';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, primaryColor }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '4px',
      }}
    >
      <div
        style={{
          background: isUser ? primaryColor : '#f1f1f1',
          color: isUser ? 'white' : '#222',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '10px 14px',
          maxWidth: isUser ? '75%' : '85%',
          fontSize: '14px',
          lineHeight: '1.5',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
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
