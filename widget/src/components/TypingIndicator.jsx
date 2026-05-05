import React from 'react';

const keyframes = `
@keyframes schoolbot-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}
`;

export default function TypingIndicator() {
  return (
    <>
      <style>{keyframes}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          marginBottom: '4px',
        }}
      >
        <div
          style={{
            background: '#f1f1f1',
            borderRadius: '18px 18px 18px 4px',
            padding: '12px 16px',
            display: 'flex',
            gap: '5px',
            alignItems: 'center',
          }}
        >
          {[0, 150, 300].map((delay, i) => (
            <div
              key={i}
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#aaa',
                animation: `schoolbot-bounce 1s ease-in-out ${delay}ms infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
