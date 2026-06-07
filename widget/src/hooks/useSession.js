import { useState } from 'react';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Always generate a fresh session on every page load — no persistence
export function useSession() {
  const [sessionId, setSessionIdState] = useState(() => generateUUID());

  const setSessionId = (id) => setSessionIdState(id);

  const resetSession = () => {
    const id = generateUUID();
    setSessionIdState(id);
    return id;
  };

  return { sessionId, setSessionId, resetSession };
}
