import React from 'react';

export default function ChatHeader({
  schoolName,
  primaryColor,
  config,
  adminsOnline = true,
  onClose,
  whatsappUrl,
}) {
  const name = schoolName || config?.theme?.name || 'School Support';
  const color = primaryColor || config?.theme?.primaryColor || '#1a73e8';
  const waUrl = whatsappUrl || config?.whatsappUrl;

  const dotColor = adminsOnline ? '#4caf50' : '#9ca3af';
  const shadowColor = adminsOnline ? 'rgba(76,175,80,0.3)' : 'rgba(156,163,175,0.3)';
  const statusText = adminsOnline ? 'Online' : 'Offline';

  return (
    <div
      style={{
        background: color,
        color: 'white',
        padding: '14px 16px',
        borderRadius: '16px 16px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: '1.2' }}>{name}</div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#25D366',
              color: 'white',
              textDecoration: 'none',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              transition: 'transform 0.1s, opacity 0.15s',
            }}
            title="Chat directly on WhatsApp"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
            </svg>
            WhatsApp
          </a>
        )}
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
    </div>
  );
}
