import React from 'react';

export default function ChatHeader({ schoolName, primaryColor, adminsOnline = true, onClose }) {
  const dotColor = adminsOnline ? '#4caf50' : '#9ca3af';
  const shadowColor = adminsOnline ? 'rgba(76,175,80,0.3)' : 'rgba(156,163,175,0.3)';
  const statusText = adminsOnline ? 'Online' : 'Offline';

  return (
    <div
      style={{
        background: primaryColor,
        color: 'white',
        padding: '16px',
        borderRadius: '16px 16px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '15px' }}>{schoolName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 0 2px ${shadowColor}`,
            }}
          />
          <span style={{ fontSize: '12px', opacity: 0.9 }}>{statusText}</span>
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
        aria-label="Close chat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
