import React, { useState, useRef, useEffect } from 'react';

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/webm',
]);

function FilePreview({ file, onRemove, onTranscribe, isTranscribing }) {
  const isAudio = file.type.startsWith('audio/');
  const isImage = file.type.startsWith('image/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: '#f3f4f6', borderRadius: '8px', padding: '4px 8px',
      fontSize: '12px', maxWidth: '200px',
    }}>
      {isImage && previewUrl && (
        <img src={previewUrl} alt={file.name} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
      )}
      {!isImage && <span style={{ flexShrink: 0 }}>{isAudio ? '🎵' : '📄'}</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>
        {file.name}
      </span>
      {isAudio && (
        <button
          onClick={onTranscribe}
          disabled={isTranscribing}
          title="Transcribe audio to text"
          style={{
            background: 'none', border: 'none', cursor: isTranscribing ? 'not-allowed' : 'pointer',
            padding: '2px', fontSize: '11px', color: '#6366f1', flexShrink: 0,
          }}
        >
          {isTranscribing ? '...' : 'STT'}
        </button>
      )}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

export default function ChatInput({ onSend, onSendWithAttachments, isLoading, primaryColor, apiUrl }) {
  const [value, setValue] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingIdx, setTranscribingIdx] = useState(null);
  const [micError, setMicError] = useState('');

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const autoStopTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      clearTimeout(autoStopTimerRef.current);
    };
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && pendingFiles.length === 0) || isLoading) return;
    if (pendingFiles.length > 0 && onSendWithAttachments) {
      onSendWithAttachments(trimmed, pendingFiles);
    } else {
      onSend(trimmed);
    }
    setValue('');
    setPendingFiles([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => ALLOWED_TYPES.has(f.type));
    setPendingFiles(prev => [...prev, ...valid]);
    e.target.value = '';
  };

  const removeFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Transcription ──────────────────────────────────────────
  const transcribeAudio = async (blob, mimeType, fileIdx) => {
    if (!apiUrl) return;
    setIsTranscribing(true);
    if (fileIdx !== undefined) setTranscribingIdx(fileIdx);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'audio');
      fd.append('mimeType', mimeType);
      const res = await fetch(`${apiUrl}/api/chat/transcribe`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.text) {
        setValue(data.text);
        if (fileIdx !== undefined) removeFile(fileIdx);
      }
    } catch (_) {
      // silently ignore transcription errors
    } finally {
      setIsTranscribing(false);
      setTranscribingIdx(null);
    }
  };

  // ── Recording ──────────────────────────────────────────────
  const startRecording = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] });
        stream.getTracks().forEach(t => t.stop());
        transcribeAudio(blob, mimeType.split(';')[0]);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      autoStopTimerRef.current = setTimeout(() => stopRecording(), 60000);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setMicError('Microphone access denied. Please allow it in your browser.');
      } else {
        setMicError('Could not access microphone.');
      }
    }
  };

  const stopRecording = () => {
    clearInterval(recordingTimerRef.current);
    clearTimeout(autoStopTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const canSend = (value.trim() || pendingFiles.length > 0) && !isLoading;

  return (
    <div style={{ borderTop: '1px solid #eee', flexShrink: 0 }}>
      {/* Recording indicator */}
      {isRecording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', fontSize: '12px', color: '#ef4444' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444',
            display: 'inline-block',
            animation: 'pulse 1s ease-in-out infinite',
          }} />
          Recording {recordingSeconds}s — tap stop when done
        </div>
      )}

      {/* Transcribing indicator */}
      {isTranscribing && !isRecording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', fontSize: '12px', color: '#6b7280' }}>
          <span style={{
            width: '14px', height: '14px', border: '2px solid #6b7280', borderTopColor: 'transparent',
            borderRadius: '50%', display: 'inline-block',
          }} />
          Transcribing...
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{ padding: '4px 16px', fontSize: '11px', color: '#ef4444' }}>
          {micError}
        </div>
      )}

      {/* File preview strip */}
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 16px 0' }}>
          {pendingFiles.map((f, i) => (
            <FilePreview
              key={i}
              file={f}
              onRemove={() => removeFile(i)}
              onTranscribe={() => transcribeAudio(f, f.type, i)}
              isTranscribing={isTranscribing && transcribingIdx === i}
            />
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ padding: '10px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,audio/*"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Attach file button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Attach file"
          style={{
            width: '34px', height: '34px', borderRadius: '50%', border: 'none',
            background: '#f3f4f6', cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Mic button */}
        {typeof navigator !== 'undefined' && navigator.mediaDevices && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isTranscribing}
            title={isRecording ? 'Stop recording' : 'Record voice message'}
            style={{
              width: '34px', height: '34px', borderRadius: '50%', border: 'none',
              background: isRecording ? '#ef4444' : '#f3f4f6',
              cursor: (isLoading || isTranscribing) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
          >
            {isRecording ? (
              <span style={{ width: '10px', height: '10px', background: 'white', borderRadius: '2px', display: 'block' }} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        )}

        {/* Text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'Type a message...'}
          style={{
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: '24px',
            padding: '9px 14px',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
            background: isLoading ? '#f9f9f9' : 'white',
            color: '#333',
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          style={{
            width: '38px', height: '38px', borderRadius: '50%',
            background: canSend ? primaryColor : '#ccc',
            border: 'none',
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
