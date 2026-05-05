import React, { useState, useEffect } from 'react';

export default function SuggestedQuestions({ suggestions, onSelect, visible, primaryColor }) {
  const [visibleItems, setVisibleItems] = useState([]);

  useEffect(() => {
    if (!visible || !suggestions?.length) {
      setVisibleItems([]);
      return;
    }
    // Stagger the appearance
    const timers = suggestions.map((_, i) =>
      setTimeout(() => setVisibleItems(prev => [...prev, i]), i * 80)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible, suggestions]);

  if (!visible || !suggestions?.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '8px',
        marginBottom: '8px',
      }}
    >
      {suggestions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          style={{
            padding: '6px 12px',
            borderRadius: '20px',
            border: `1px solid ${primaryColor}`,
            color: primaryColor,
            background: 'white',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
            opacity: visibleItems.includes(i) ? 1 : 0,
            transform: visibleItems.includes(i) ? 'translateY(0)' : 'translateY(4px)',
            fontFamily: 'inherit',
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
          {q}
        </button>
      ))}
    </div>
  );
}
