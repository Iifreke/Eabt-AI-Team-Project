import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble.jsx';
import SuggestedQuestions from './SuggestedQuestions.jsx';
import TypingIndicator from './TypingIndicator.jsx';

export default function MessageList({ messages, stage, isLoading, primaryColor, onSuggestionSelect }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map((msg, index) => (
        <div key={msg.id}>
          <MessageBubble message={msg} primaryColor={primaryColor} />
          {msg.role === 'assistant' && (
            <SuggestedQuestions
              suggestions={msg.suggestions}
              onSelect={(q) => onSuggestionSelect(q, msg.id)}
              visible={
                index === messages.length - 1 &&
                !msg.suggestionsUsed &&
                stage === 'active' &&
                !isLoading
              }
              primaryColor={primaryColor}
            />
          )}
        </div>
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
