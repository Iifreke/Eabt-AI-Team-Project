import { useState, useCallback } from 'react';

let msgIdCounter = 0;
function nextId() {
  return ++msgIdCounter;
}

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [stage, setStage] = useState('active');
  const [lead, setLead] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  const fetchGreeting = useCallback(async (config, sessionId) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/api/chat/greet?schoolId=${config.schoolId}&sessionId=${sessionId}`
      );
      const data = await res.json();
      setMessages([
        {
          id: nextId(),
          role: 'assistant',
          content: data.message,
          suggestions: data.suggestions || [],
          suggestionsUsed: false,
          ts: Date.now(),
        },
      ]);
      setStage(data.stage || 'onboarding');
      setHasGreeted(true);
    } catch (err) {
      setMessages([
        {
          id: nextId(),
          role: 'assistant',
          content: 'Hello! Welcome. How can I help you today?',
          suggestions: [],
          suggestionsUsed: false,
          ts: Date.now(),
        },
      ]);
      setHasGreeted(true);
    }
  }, []);

  const sendMessage = useCallback(async (text, config, sessionId) => {
    if (!text.trim() || isLoading) return;

    const userMsgId = nextId();
    const botMsgId = nextId();

    // Append user message
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', content: text, suggestions: [], suggestionsUsed: false, ts: Date.now() },
    ]);

    setIsLoading(true);

    // Create empty bot placeholder
    setMessages(prev => [
      ...prev,
      { id: botMsgId, role: 'assistant', content: '', suggestions: [], suggestionsUsed: false, ts: Date.now() },
    ]);

    try {
      const response = await fetch(`${config.apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, schoolId: config.schoolId, sessionId }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.chunk !== undefined) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === botMsgId ? { ...m, content: m.content + event.chunk } : m
                )
              );
            }

            if (event.done) {
              if (event.stage) setStage(event.stage);
              if (event.lead) setLead(event.lead);
              setMessages(prev =>
                prev.map(m =>
                  m.id === botMsgId
                    ? { ...m, suggestions: event.suggestions || [] }
                    : m
                )
              );
              setIsLoading(false);
            }
          } catch {
            // ignore parse errors for malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === botMsgId
            ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
            : m
        )
      );
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleSuggestionClick = useCallback(
    (question, messageId, config, sessionId) => {
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, suggestionsUsed: true } : m))
      );
      sendMessage(question, config, sessionId);
    },
    [sendMessage]
  );

  const submitLead = useCallback(async (formData, config, sessionId) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: config.schoolId,
          sessionId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        }),
      });
      const data = await res.json();
      setMessages([{
        id: nextId(),
        role: 'assistant',
        content: data.message || 'Welcome! How can I help you today?',
        suggestions: [],
        suggestionsUsed: false,
        ts: Date.now(),
      }]);
      setStage('active');
      setLead(data.lead || {});
      setHasGreeted(true);
    } catch {
      setMessages([{
        id: nextId(),
        role: 'assistant',
        content: 'Welcome! How can I help you today?',
        suggestions: [],
        suggestionsUsed: false,
        ts: Date.now(),
      }]);
      setStage('active');
      setHasGreeted(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    stage,
    lead,
    isLoading,
    hasGreeted,
    fetchGreeting,
    sendMessage,
    handleSuggestionClick,
    submitLead,
  };
}
