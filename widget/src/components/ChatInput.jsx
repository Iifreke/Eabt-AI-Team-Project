import React, { useState, useRef, useEffect } from 'react';

const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'application/zip': 'zip', 'application/x-rar-compressed': 'rar', 'application/x-tar': 'tar', 'application/x-7z-compressed': '7z'
};

const ALLOWED_TYPES = new Set(Object.keys(EXT_MAP));

function FilePreview({ file, onRemove, onTranscribe, isTranscribing }) {
  const isAudio = file.type.startsWith('audio/');
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: '#f3f4f6', borderRadius: '8px', padding: '4px 8px',
      fontSize: '12px', maxWidth: '200px',
    }}>
      {isImage && previewUrl && (
        <img src={previewUrl} alt={file.name} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
      )}
      {isVideo && previewUrl && (
        <video src={previewUrl} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} muted />
      )}
      {!isImage && !isVideo && (
        <span style={{ flexShrink: 0 }}>
          {isAudio && file.name?.startsWith('voice-') ? '🎙️' : isAudio ? '🎵' : '📄'}
        </span>
      )}
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
  const [isVoiceTyping, setIsVoiceTyping] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingIdx, setTranscribingIdx] = useState(null);
  const [micError, setMicError] = useState('');
  const [isVoiceMessage, setIsVoiceMessage] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const autoStopTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTextRef = useRef('');
  const voiceRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceTimerRef = useRef(null);
  const voiceAutoStopRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      clearTimeout(autoStopTimerRef.current);
      clearInterval(voiceTimerRef.current);
      clearTimeout(voiceAutoStopRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (voiceRecorderRef.current?.state !== 'inactive') {
        voiceRecorderRef.current?.stop();
      }
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
      // Convert blob to base64 and send as JSON — no multipart needed
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i += 8192) {
        binary += String.fromCharCode(...uint8.slice(i, i + 8192));
      }
      const b64 = btoa(binary);
      const res = await fetch(`${apiUrl}/api/chat/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transcribe', data: b64, mimeType }),
      });
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

  // ── Voice Typing & Recording ──────────────────────────────
  const startVoiceTyping = () => {
    setMicError('');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      startRecording();
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      // Seed finalTextRef with whatever the user already typed
      finalTextRef.current = value.trim();

      rec.onstart = () => {
        setIsVoiceTyping(true);
      };

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            // Commit this chunk permanently
            finalTextRef.current = (finalTextRef.current + ' ' + result[0].transcript).trim();
          } else {
            interim += result[0].transcript;
          }
        }
        // Display = committed finals + live interim (no appending, always a fresh set)
        setValue((finalTextRef.current + (interim ? ' ' + interim : '')).trim());
      };

      rec.onerror = (e) => {
        console.error('Speech recognition error:', e.error);
        if (e.error === 'not-allowed') {
          setMicError('Microphone access denied. Please check permission.');
        } else {
          setMicError('Voice typing failed. Falling back...');
          startRecording();
        }
        stopVoiceTyping();
      };

      rec.onend = () => {
        // Keep only finalized text; discard any in-flight interim
        setValue(finalTextRef.current.trim());
        finalTextRef.current = '';
        setIsVoiceTyping(false);
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      console.error('Speech recognition failed to start:', e);
      startRecording();
    }
  };

  const stopVoiceTyping = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // triggers onend which cleans up state
      recognitionRef.current = null;
    }
  };

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

  // ── Voice message (record → upload as audio attachment) ───────
  const startVoiceMessage = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const baseMime = mimeType.split(';')[0];
        const blob = new Blob(voiceChunksRef.current, { type: baseMime });
        const ext = baseMime === 'audio/mp4' ? 'm4a' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: baseMime });
        setPendingFiles(prev => [...prev, file]);
        setIsVoiceMessage(false);
        setVoiceSeconds(0);
      };
      recorder.start();
      voiceRecorderRef.current = recorder;
      setIsVoiceMessage(true);
      setVoiceSeconds(0);
      voiceTimerRef.current = setInterval(() => setVoiceSeconds(s => s + 1), 1000);
      voiceAutoStopRef.current = setTimeout(() => stopVoiceMessage(), 120000);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setMicError('Microphone access denied. Please allow it in your browser.');
      } else {
        setMicError('Could not access microphone.');
      }
    }
  };

  const stopVoiceMessage = () => {
    clearInterval(voiceTimerRef.current);
    clearTimeout(voiceAutoStopRef.current);
    if (voiceRecorderRef.current?.state !== 'inactive') {
      voiceRecorderRef.current.stop();
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

      {/* Voice typing indicator */}
      {isVoiceTyping && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', fontSize: '12px', color: '#6366f1' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1',
            display: 'inline-block',
            animation: 'pulse 1s ease-in-out infinite',
          }} />
          Voice typing... speak clearly (tap microphone to stop)
        </div>
      )}

      {/* Voice message indicator */}
      {isVoiceMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', fontSize: '12px', color: '#dc2626' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626',
            display: 'inline-block', animation: 'pulse 1s ease-in-out infinite',
          }} />
          Voice message — {voiceSeconds}s · tap stop to send
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
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
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

        {/* Mic button — voice typing (speech-to-text) */}
        {typeof navigator !== 'undefined' && navigator.mediaDevices && (
          <button
            onClick={isVoiceTyping ? stopVoiceTyping : isRecording ? stopRecording : startVoiceTyping}
            disabled={isLoading || isTranscribing || isVoiceMessage}
            title={isVoiceTyping ? 'Stop voice typing' : isRecording ? 'Stop recording' : 'Voice typing (speech to text)'}
            style={{
              width: '34px', height: '34px', borderRadius: '50%', border: 'none',
              background: (isRecording || isVoiceTyping) ? '#ef4444' : '#f3f4f6',
              cursor: (isLoading || isTranscribing || isVoiceMessage) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s ease',
              opacity: isVoiceMessage ? 0.4 : 1,
            }}
          >
            {(isRecording || isVoiceTyping) ? (
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

        {/* Voice message button — record audio and send as attachment */}
        {typeof navigator !== 'undefined' && navigator.mediaDevices && (
          <button
            onClick={isVoiceMessage ? stopVoiceMessage : startVoiceMessage}
            disabled={isLoading || isTranscribing || isVoiceTyping || isRecording}
            title={isVoiceMessage ? 'Stop & attach voice message' : 'Record voice message'}
            style={{
              width: '34px', height: '34px', borderRadius: '50%', border: 'none',
              background: isVoiceMessage ? '#dc2626' : '#f3f4f6',
              cursor: (isLoading || isTranscribing || isVoiceTyping || isRecording) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s ease',
              opacity: (isVoiceTyping || isRecording) ? 0.4 : 1,
            }}
          >
            {isVoiceMessage ? (
              <span style={{ width: '10px', height: '10px', background: 'white', borderRadius: '2px', display: 'block' }} />
            ) : (
              /* Waveform icon — distinct from the STT mic */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="12" x2="2" y2="12" />
                <line x1="5" y1="8" x2="5" y2="16" />
                <line x1="8" y1="5" x2="8" y2="19" />
                <line x1="11" y1="9" x2="11" y2="15" />
                <line x1="14" y1="4" x2="14" y2="20" />
                <line x1="17" y1="8" x2="17" y2="16" />
                <line x1="20" y1="10" x2="20" y2="14" />
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
          placeholder={isVoiceTyping ? 'Listening...' : isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : isVoiceMessage ? 'Recording voice message...' : 'Type a message...'}
          style={{
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: '24px',
            padding: '9px 14px',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
            background: (isLoading || isVoiceMessage) ? '#f9f9f9' : 'white',
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
