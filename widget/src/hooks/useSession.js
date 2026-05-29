import { useState } from 'react';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SESSION_KEY = 'school_bot_sid';

function getOrCreateSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = generateUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return generateUUID();
  }
}

export function useSession() {
  const [sessionId, setSessionIdState] = useState(() => getOrCreateSessionId());
  const setSessionId = (id) => {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch (e) {}
    setSessionIdState(id);
  };
  return { sessionId, setSessionId };
}
