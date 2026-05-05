import React, { useState } from 'react';

export default function ChatInput({ onSend, isLoading, primaryColor }) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        borderTop: '1px solid #eee',
        padding: '12px 16px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder="Type a message..."
        style={{
          flex: 1,
          border: '1px solid #ddd',
          borderRadius: '24px',
          padding: '10px 16px',
          fontSize: '14px',
          outline: 'none',
          fontFamily: 'inherit',
          background: isLoading ? '#f9f9f9' : 'white',
          color: '#333',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading || !value.trim()}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: isLoading || !value.trim() ? '#ccc' : primaryColor,
          border: 'none',
          cursor: isLoading || !value.trim() ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s ease',
        }}
        aria-label="Send message"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
