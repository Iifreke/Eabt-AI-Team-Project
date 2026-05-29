import { useState, useCallback, useEffect, useRef } from 'react';

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
  const [sessionId, setSessionId] = useState(null);
  const [config, setConfig] = useState(null);
  const [agentTyping, setAgentTyping] = useState(null);
  const [adminsOnline, setAdminsOnline] = useState(true);
  const pollRef = useRef(null);

  // Poll for new admin messages when stage is escalated
  const pollEscalated = useCallback(async (cfg, sid) => {
    if (!cfg?.apiUrl || !sid) return;
    try {
      const res = await fetch(`${cfg.apiUrl}/api/chat/messages?sessionId=${sid}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.adminsOnline !== undefined) {
        setAdminsOnline(data.adminsOnline);
      }
      if (data.messages) {
        const rebuilt = data.messages.map((m, i) => ({
          id: i + 1,
          role: m.role,
          content: m.content,
          adminName: m.adminName,
          attachments: m.attachments,
          suggestions: [],
          suggestionsUsed: true,
          ts: m.ts || Date.now(),
        }));
        setMessages(rebuilt);
        setAgentTyping(data.agentTyping || null);
      }
    } catch {
      // silently ignore poll errors
    }
  }, []);

  // Start/stop polling based on stage
  useEffect(() => {
    if (stage === 'escalated' && sessionId && config) {
      pollRef.current = setInterval(() => pollEscalated(config, sessionId), 3000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [stage, sessionId, config, pollEscalated]);

  const fetchGreeting = useCallback(async (cfg, sid) => {
    try {
      const res = await fetch(
        `${cfg.apiUrl}/api/chat/greet?schoolId=${cfg.schoolId}&sessionId=${sid}`
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

  // Upload files to /api/chat/upload and return attachment metadata array
  const uploadFiles = useCallback(async (files, cfg) => {
    return Promise.all(files.map(async (file) => {
      const fd = new FormData();
      fd.append('action', 'upload');
      fd.append('file', file, file.name);
      fd.append('schoolId', cfg.schoolId || 'general');
      fd.append('mimeType', file.type);
      fd.append('fileName', file.name);
      const res = await fetch(`${cfg.apiUrl}/api/chat/media`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    }));
  }, []);

  // Send message with file attachments
  const sendWithAttachments = useCallback(async (text, files, cfg, sid) => {
    if ((!text.trim() && files.length === 0) || isLoading) return;
    setConfig(cfg);
    setSessionId(sid);
    setIsLoading(true);

    let attachments = [];
    try {
      attachments = await uploadFiles(files, cfg);
    } catch {
      setIsLoading(false);
      return;
    }

    // Optimistically show the user message with attachments
    const userMsgId = nextId();
    const botMsgId = nextId();

    if (stage !== 'escalated') {
      setMessages(prev => [
        ...prev,
        {
          id: userMsgId, role: 'user', content: text,
          attachments, suggestions: [], suggestionsUsed: false, ts: Date.now(),
        },
      ]);
      setMessages(prev => [
        ...prev,
        { id: botMsgId, role: 'assistant', content: '', suggestions: [], suggestionsUsed: false, ts: Date.now() },
      ]);
    }

    try {
      const response = await fetch(`${cfg.apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, schoolId: cfg.schoolId, sessionId: sid, attachments }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.chunk !== undefined) {
              setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: m.content + event.chunk } : m));
            }
            if (event.done) {
              if (event.stage) setStage(event.stage);
              if (event.lead) setLead(event.lead);
              if (event.stage === 'escalated' && event.messages) {
                setMessages(event.messages.map((m, i) => ({
                  id: i + 1, role: m.role, content: m.content,
                  adminName: m.adminName, attachments: m.attachments,
                  suggestions: [], suggestionsUsed: true, ts: m.ts || Date.now(),
                })));
              } else {
                setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, suggestions: event.suggestions || [] } : m));
              }
              setIsLoading(false);
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: 'Sorry, something went wrong.' } : m));
      setIsLoading(false);
    }
  }, [isLoading, stage, uploadFiles]);

  const sendMessage = useCallback(async (text, cfg, sid) => {
    if (!text.trim() || isLoading) return;

    // Store config & sessionId for polling
    setConfig(cfg);
    setSessionId(sid);

    const userMsgId = nextId();
    const botMsgId = nextId();

    // In escalated stage the server returns the full DB messages array,
    // so we don't add locally — the next poll will include this message.
    if (stage !== 'escalated') {
      setMessages(prev => [
        ...prev,
        { id: userMsgId, role: 'user', content: text, suggestions: [], suggestionsUsed: false, ts: Date.now() },
      ]);
    }

    setIsLoading(true);

    // Only add a placeholder when the bot will actually stream a response.
    // During escalated stage the server returns existing messages directly — no streaming.
    if (stage !== 'escalated') {
      setMessages(prev => [
        ...prev,
        { id: botMsgId, role: 'assistant', content: '', suggestions: [], suggestionsUsed: false, ts: Date.now() },
      ]);
    }

    try {
      const response = await fetch(`${cfg.apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, schoolId: cfg.schoolId, sessionId: sid }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

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
              const newStage = event.stage || stage;
              if (event.stage) setStage(event.stage);
              if (event.lead) setLead(event.lead);

              // When escalated, rebuild messages from the full DB array (includes admin messages)
              if (newStage === 'escalated' && event.messages) {
                setMessages(
                  event.messages.map((m, i) => ({
                    id: i + 1,
                    role: m.role,
                    content: m.content,
                    adminName: m.adminName,
                    attachments: m.attachments,
                    suggestions: [],
                    suggestionsUsed: true,
                    ts: m.ts || Date.now(),
                  }))
                );
                // Show escalated notice as last message if not already there
                const lastMsg = event.messages[event.messages.length - 1];
                if (!lastMsg || lastMsg.role !== 'assistant') {
                  setMessages(prev => [
                    ...prev,
                    {
                      id: nextId(),
                      role: 'assistant',
                      content: 'Our support team has been notified and will reply here shortly. You can keep chatting — we\'ll see your messages.',
                      suggestions: [],
                      suggestionsUsed: true,
                      ts: Date.now(),
                    },
                  ]);
                }
              } else {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === botMsgId
                      ? { ...m, suggestions: event.suggestions || [] }
                      : m
                  )
                );
              }
              setIsLoading(false);
            }
          } catch {
            // ignore parse errors
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
  }, [isLoading, stage]);

  const handleSuggestionClick = useCallback(
    (question, messageId, cfg, sid) => {
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, suggestionsUsed: true } : m))
      );
      sendMessage(question, cfg, sid);
    },
    [sendMessage]
  );

  const submitLead = useCallback(async (formData, cfg, sid, onSessionRestore) => {
    setConfig(cfg);
    setSessionId(sid);
    setIsLoading(true);
    try {
      const res = await fetch(`${cfg.apiUrl}/api/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: cfg.schoolId,
          sessionId: sid,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
        }),
      });
      const data = await res.json();
      if (data.adminsOnline !== undefined) {
        setAdminsOnline(data.adminsOnline);
      }
      if (data.messages && data.messages.length > 0) {
        const rebuilt = data.messages.map((m, i) => ({
          id: i + 1,
          role: m.role,
          content: m.content,
          adminName: m.adminName,
          attachments: m.attachments,
          suggestions: [],
          suggestionsUsed: true,
          ts: m.ts || Date.now(),
        }));
        setMessages(rebuilt);
        setStage(data.stage || 'active');
        if (data.sessionId) {
          setSessionId(data.sessionId);
          if (onSessionRestore) onSessionRestore(data.sessionId);
        }
      } else {
        setMessages([{
          id: nextId(),
          role: 'assistant',
          content: data.message || 'Welcome! How can I help you today?',
          suggestions: [],
          suggestionsUsed: false,
          ts: Date.now(),
        }]);
        setStage('active');
      }
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
    agentTyping,
    adminsOnline,
    fetchGreeting,
    sendMessage,
    sendWithAttachments,
    handleSuggestionClick,
    submitLead,
  };
}
