import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api } from '../lib/api.js';
import { useUser } from '../context/UserContext.jsx';
import { supabase } from '../lib/supabase.js';

const SLUG_DISPLAY = {
  backock: 'Babcock University',
  babcock: 'Babcock University',
  abu: 'ABU (Ahmadu Bello University)',
};

const DEFAULT_SHORTCUTS = [
  { name: 'Greeting', shortcut: '/greeting', content: 'Hello! Welcome to EduTech Admissions Support. How may I assist you today?' },
  { name: 'Fees Schedule', shortcut: '/fees', content: 'You can view our approved tuition fees and flexible instalment payment structure here: https://edutech.edu.ng/fees' },
  { name: 'Admissions Info', shortcut: '/admissions', content: 'Admissions are currently open. Please have your O\'Level credentials and JAMB registration details ready.' },
  { name: 'Requirements', shortcut: '/requirements', content: 'Entry requirements: Minimum 5 credit passes including English and Mathematics in relevant subjects (WAEC/NECO/NABTEB).' },
  { name: 'Portal Link', shortcut: '/portal', content: 'Please log in to the student portal to track your application and complete document verification.' },
  { name: 'WhatsApp Official', shortcut: '/whatsapp', content: 'You can also continue this conversation anytime directly on our official WhatsApp line: ' },
  { name: 'Closing', shortcut: '/close', content: 'Thank you for reaching out today! Feel free to message us again if you have more questions. Have a wonderful day!' },
];

const EMOJI_LIST = [
  '👍', '❤️', '😂', '🙏', '👏', '🔥', '🎉', '💯',
  '🎓', '📚', '🏫', '📝', '💡', '🏆', '😊', '😀',
  '😎', '🤝', '👋', '💬', '✨', '⏳', '🚨', '📞',
  '✅', '❌', 'ℹ️', '📌', '⭐', '📱', '💼', '🚀'
];

function formatWhatsAppLink(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function formatPhoneDisplay(phone) {
  if (!phone) return '—';
  const clean = String(phone).trim();
  if (clean.startsWith('0') && clean.length === 11) {
    return `+234 ${clean.slice(1, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return clean;
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.setHours(0,0,0,0) - new Date(date).setHours(0,0,0,0)) / (86400000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── WhatsApp Voice Note Component ─────────────────────────────────────
function WhatsAppVoiceNote({ url, name }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Generate fixed random waveform bar heights for this voice note
  const bars = useMemo(() => {
    const list = [];
    let seed = (name || url || 'audio').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    for (let i = 0; i < 28; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const h = 20 + Math.floor((seed / 233280) * 80);
      list.push(h);
    }
    return list;
  }, [name, url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progressPercent = duration ? (currentTime / duration) : 0;

  const formatAudioSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex items-center gap-3 bg-white/90 p-2.5 rounded-xl border border-gray-200/80 my-1 max-w-xs shadow-sm">
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow transition-transform active:scale-95 shrink-0"
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <div className="flex-1">
        <div className="flex items-center gap-0.5 h-6 mb-1">
          {bars.map((height, i) => {
            const barFraction = i / bars.length;
            const isPlayed = barFraction <= progressPercent;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors"
                style={{
                  height: `${height}%`,
                  backgroundColor: isPlayed ? '#00a884' : '#cbd5e1',
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
          <span>{formatAudioSeconds(currentTime > 0 ? currentTime : duration)}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            className="px-1.5 py-0.2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded text-[10px]"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WhatsApp Double Checkmark SVG ──────────────────────────────────────
function DoubleCheckIcon({ delivered = true, read = true }) {
  const color = read ? '#53bdeb' : '#8696a0';
  return (
    <svg className="w-3.5 h-3.5 inline-block shrink-0 ml-1 -mt-0.5" viewBox="0 0 16 11" fill="none">
      <path
        d="M11.04 1.25L4.95 7.34L2.46 4.85L1.5 5.81L4.95 9.26L12 2.21L11.04 1.25Z"
        fill={color}
      />
      {delivered && (
        <path
          d="M14.54 1.25L8.45 7.34L7.54 6.43L6.58 7.39L8.45 9.26L15.5 2.21L14.54 1.25Z"
          fill={color}
        />
      )}
    </svg>
  );
}

// ── Main ConversationViewer Component ─────────────────────────────────
export default function ConversationViewer({
  conversationId,
  initialConv,
  escalation: propEscalation,
  onClose,
  onUpdate,
  onNext,
  onPrev,
}) {
  const { profile } = useUser();
  const [conv, setConv] = useState(initialConv || null);
  const [loading, setLoading] = useState(!initialConv);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState(null);

  // Escalation management state
  const [notes, setNotes] = useState(
    propEscalation?.staff_notes || initialConv?.escalation?.staff_notes || ''
  );
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedAlert, setNotesSavedAlert] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [tags, setTags] = useState(
    propEscalation?.tags || initialConv?.escalation?.tags || []
  );
  const [newTagInput, setNewTagInput] = useState('');

  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const replyInputRef = useRef(null);

  // Active escalation data (from prop or fetched conversation)
  const esc = useMemo(() => {
    return propEscalation || conv?.escalation || null;
  }, [propEscalation, conv?.escalation]);

  // Load shortcuts from Supabase if available
  useEffect(() => {
    supabase.from('shortcuts').select('*').order('name').then(({ data }) => {
      if (Array.isArray(data) && data.length > 0) {
        setShortcuts([...data, ...DEFAULT_SHORTCUTS]);
      }
    });
  }, []);

  const fetchConv = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await api.conversation(conversationId);
      if (!data) return;
      setConv(prev => ({
        ...prev,
        ...data,
        messages: (data.messages && data.messages.length > 0)
          ? data.messages
          : (prev?.messages || []),
        leads: data.leads || prev?.leads || null,
        schools: data.schools || prev?.schools || null,
        escalation: data.escalation || prev?.escalation || null,
      }));
      if (data.escalation?.staff_notes !== undefined) {
        setNotes(data.escalation.staff_notes || '');
      }
      if (Array.isArray(data.escalation?.tags)) {
        setTags(data.escalation.tags);
      }
    } catch (err) {
      console.error('fetchConv error:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchConv();
  }, [fetchConv]);

  // Real-time polling every 3.5s for live message updates
  useEffect(() => {
    pollRef.current = setInterval(fetchConv, 3500);
    return () => clearInterval(pollRef.current);
  }, [fetchConv]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages?.length]);

  // Typing indicator
  const handleInputChange = (e) => {
    const val = e.target.value;
    setReply(val);
    if (conversationId) {
      api.setTyping(conversationId, true);
    }
    // Autocomplete shortcuts if user types '/'
    if (val === '/' || (val.endsWith(' /') && !showShortcuts)) {
      setShowShortcuts(true);
    } else if (!val.includes('/') && showShortcuts) {
      setShowShortcuts(false);
    }
  };

  // Send message
  const sendReply = async () => {
    const textToSend = reply.trim();
    if ((!textToSend && attachments.length === 0) || sending) return;
    setSending(true);
    setReplyError('');
    setDeliveryInfo('');

    // Instant optimistic update
    const optimisticMsg = {
      role: 'admin',
      content: textToSend,
      ts: Date.now(),
      adminName: profile?.full_name || 'You',
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setConv(prev => ({
      ...prev,
      messages: [...(prev?.messages || []), optimisticMsg],
    }));

    const pendingAttachments = [...attachments];
    setReply('');
    setAttachments([]);
    setShowEmojiPicker(false);
    setShowShortcuts(false);

    try {
      const res = await api.replyToConversation(conversationId, textToSend, pendingAttachments);
      if (res?.whatsappSent) {
        setDeliveryInfo('✓ Delivered directly to student via WhatsApp 📱');
      } else {
        setDeliveryInfo('✓ Message sent to live conversation stream');
      }
      setTimeout(() => setDeliveryInfo(''), 5000);

      if (esc?.status === 'pending' && profile?.full_name && esc.id) {
        await api.updateEscalation({ id: esc.id, status: 'in_progress', attended_by: profile.full_name });
      }

      fetchConv();
      onUpdate?.();
    } catch (err) {
      console.error(err);
      setReplyError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  // Handle file uploads (Images, Docs, Audio)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setReplyError('');

    for (const file of files) {
      try {
        const presignRes = await fetch('/api/chat/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'presign',
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name,
            schoolId: conv?.schools?.slug || 'general',
          }),
        });
        if (!presignRes.ok) throw new Error('Failed to get presigned upload URL');
        const { uploadUrl, publicUrl, name, type } = await presignRes.json();

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error('Storage upload failed');

        setAttachments(prev => [
          ...prev,
          { name: name || file.name, url: publicUrl, type: type || file.type, size: file.size }
        ]);
      } catch (upErr) {
        console.error('File upload error:', upErr);
        setReplyError(`Failed to upload ${file.name}: ${upErr.message}`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save staff notes
  const handleSaveNotes = async () => {
    if (!esc?.id) return;
    setSavingNotes(true);
    try {
      await api.updateEscalation({ id: esc.id, staff_notes: notes });
      setNotesSavedAlert(true);
      setTimeout(() => setNotesSavedAlert(false), 3000);
      onUpdate?.();
    } catch (err) {
      console.error('Save notes error:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  // Add / Remove tags
  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!newTagInput.trim() || !esc?.id) return;
    const tagToAdd = newTagInput.trim().toLowerCase();
    if (tags.includes(tagToAdd)) {
      setNewTagInput('');
      return;
    }
    const updated = [...tags, tagToAdd];
    setTags(updated);
    setNewTagInput('');
    try {
      await api.updateEscalation({ id: esc.id, tags: updated });
      onUpdate?.();
    } catch (err) {
      console.error('Tag add error:', err);
    }
  };

  const handleRemoveTag = async (tagToRemove) => {
    if (!esc?.id) return;
    const updated = tags.filter(t => t !== tagToRemove);
    setTags(updated);
    try {
      await api.updateEscalation({ id: esc.id, tags: updated });
      onUpdate?.();
    } catch (err) {
      console.error('Tag remove error:', err);
    }
  };

  // Escalation quick actions
  const handleClaimChat = async () => {
    if (!esc?.id || !profile?.full_name) return;
    setActionLoading(true);
    try {
      await api.updateEscalation({
        id: esc.id,
        status: 'in_progress',
        attended_by: profile.full_name,
      });
      fetchConv();
      onUpdate?.();
    } catch (err) {
      alert(err.message || 'Failed to claim chat');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndChat = async () => {
    if (!esc?.id) return;
    if (!window.confirm('Are you sure you want to end and resolve this chat?')) return;
    setActionLoading(true);
    try {
      await api.endChat(esc.id, profile?.full_name || null);
      fetchConv();
      onUpdate?.();
    } catch (err) {
      alert(err.message || 'Failed to end chat');
    } finally {
      setActionLoading(false);
    }
  };

  // Extract all media and documents for the right panel gallery (like WhatsApp screenshot)
  const mediaGallery = useMemo(() => {
    const items = [];
    const msgs = conv?.messages || [];
    msgs.forEach((m, msgIdx) => {
      (m.attachments || []).forEach((att, attIdx) => {
        items.push({
          id: `${msgIdx}-${attIdx}`,
          ...att,
          ts: m.ts,
          sender: m.role === 'user' ? 'Student' : 'Admin',
        });
      });
    });
    return items;
  }, [conv?.messages]);

  // Filter messages for search
  const visibleMessages = useMemo(() => {
    const raw = (conv?.messages || []).filter(m => m.role !== '__typing__');
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase();
    return raw.filter(m => {
      if (typeof m.content === 'string' && m.content.toLowerCase().includes(q)) return true;
      if (m.attachments?.some(a => a.name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [conv?.messages, searchQuery]);

  // Lead and contact info
  const lead = conv?.leads || esc?.leads;
  const schoolSlug = conv?.schools?.slug || esc?.schools?.slug;
  const schoolName = SLUG_DISPLAY[schoolSlug] || conv?.schools?.name || esc?.schools?.name || 'EduTech School';
  const phone = lead?.normalized_phone || lead?.phone || conv?.whatsapp_phone;
  const waUrl = formatWhatsAppLink(phone);
  const isWAConv = conv?.channel?.toLowerCase() === 'whatsapp' || conv?.session_id?.startsWith('wa_') || !!conv?.whatsapp_phone;

  // SLA calculation
  const slaElapsedMinutes = useMemo(() => {
    const createdTs = esc?.created_at || conv?.created_at;
    if (!createdTs) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(createdTs).getTime()) / 60000));
  }, [esc?.created_at, conv?.created_at]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* ── Main WhatsApp Window Container ── */}
      <div className="bg-[#f0f2f5] rounded-2xl w-full max-w-6xl h-[92vh] max-h-[920px] flex flex-col overflow-hidden shadow-2xl border border-gray-300 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── WhatsApp Top Header ── */}
        <div className="bg-[#f0f2f5] border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
          {/* Contact Info Avatar + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-sm shadow">
                {lead?.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
              </div>
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                isWAConv ? 'bg-emerald-500' : 'bg-blue-500'
              }`} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-base truncate">
                  {lead?.name || 'Prospective Student'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isWAConv ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {isWAConv ? '📱 WhatsApp' : '🌐 Web Chat'}
                </span>
                {esc?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                    esc.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                    esc.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {esc.status.replace('_', ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate flex items-center gap-1.5 mt-0.5">
                <span>{schoolName}</span>
                {phone && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{formatPhoneDisplay(phone)}</span>
                  </>
                )}
                {esc?.attended_by && (
                  <>
                    <span>•</span>
                    <span className="text-amber-700 font-medium">Attended by {esc.attended_by}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Header Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Prev / Next navigation if list is provided */}
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                title="Previous conversation"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200/70 rounded-full transition-colors text-xs font-semibold flex items-center gap-1"
              >
                ◀ Prev
              </button>
            )}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                title="Next conversation"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200/70 rounded-full transition-colors text-xs font-semibold flex items-center gap-1"
              >
                Next ▶
              </button>
            )}

            {/* In-chat Search Toggle */}
            <button
              type="button"
              onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
              title="Search messages"
              className={`p-2 rounded-full transition-colors ${
                showSearch ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {/* Direct WhatsApp Message Link */}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open directly in WhatsApp Web"
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-[#25d366] hover:bg-[#20ba59] text-white rounded-full shadow-sm transition-transform active:scale-95"
              >
                <span>📱 WhatsApp Web</span>
              </a>
            )}

            {/* Info Drawer Toggle (Group/Contact Info in WhatsApp Web) */}
            <button
              type="button"
              onClick={() => setShowInfo(!showInfo)}
              title="Toggle Contact & Lead Info"
              className={`p-2 rounded-full transition-colors ${
                showInfo ? 'bg-gray-300 text-gray-900' : 'text-gray-600 hover:bg-gray-200/70'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close chat"
              className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Search Bar Dropdown ── */}
        {showSearch && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
            <span className="text-gray-400">🔍</span>
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in this conversation..."
              className="flex-1 text-sm outline-none bg-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {/* ── Middle Area: Chat + Contact Info Sidebar ── */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* ── Left / Main Chat Section (WhatsApp Wallpaper) ── */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Scrollable Message Feed */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 whatsapp-bg whatsapp-scrollbar space-y-3">
              
              {/* WhatsApp Security / Info Pill Banner */}
              <div className="flex justify-center my-2">
                <div className="bg-[#ffeecd] text-[#54656f] text-[11px] px-3.5 py-1.5 rounded-lg shadow-sm max-w-md text-center border border-[#e2d5b8] flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Messages are synced live between EduTech Web Widget and WhatsApp Meta API.</span>
                </div>
              </div>

              {/* Escalation Pill Banner */}
              {esc?.reason && (
                <div className="flex justify-center my-2">
                  <div className="bg-rose-50 text-rose-800 text-[11px] font-semibold px-3.5 py-1 rounded-full border border-rose-200 shadow-sm flex items-center gap-2">
                    <span>🚨</span>
                    <span>Reason: {esc.reason.replace('_', ' ')}</span>
                    {slaElapsedMinutes !== null && (
                      <span className="bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded font-mono text-[10px]">
                        {slaElapsedMinutes}m SLA
                      </span>
                    )}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 border-4 border-[#00a884] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-500 font-medium">Loading conversation messages...</span>
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-sm">
                  <span className="text-3xl mb-2">💬</span>
                  <p className="font-semibold text-gray-700">No messages found.</p>
                  <p className="text-xs text-gray-400">Start the conversation below.</p>
                </div>
              ) : (
                (() => {
                  let lastDateStr = '';
                  return visibleMessages.map((msg, i) => {
                    const msgDateStr = formatDateHeader(msg.ts);
                    const showDateSeparator = msgDateStr && msgDateStr !== lastDateStr;
                    if (showDateSeparator) lastDateStr = msgDateStr;

                    const isUser = msg.role === 'user';
                    const isAdmin = msg.role === 'admin' || msg.role === 'agent';
                    const isBot = msg.role === 'bot' || msg.role === 'assistant';

                    return (
                      <React.Fragment key={i}>
                        {/* WhatsApp Date Separator Badge */}
                        {showDateSeparator && (
                          <div className="flex justify-center my-3 select-none">
                            <span className="bg-white/90 text-gray-600 text-[11px] font-semibold px-3 py-1 rounded-lg shadow-sm border border-gray-200/60 uppercase tracking-wide">
                              {msgDateStr}
                            </span>
                          </div>
                        )}

                        {/* WhatsApp Message Bubble */}
                        <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} my-1`}>
                          <div
                            className={`max-w-[85%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl relative shadow-[0_1px_0.5px_rgba(11,20,26,.13)] transition-all ${
                              isAdmin
                                ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none'
                                : 'bg-white text-gray-900 rounded-tl-none border border-gray-100'
                            }`}
                          >
                            {/* Sender Name Header */}
                            {isAdmin && (
                              <div className="text-[11px] font-bold text-emerald-800 mb-0.5 flex items-center gap-1">
                                <span>🧑‍💼</span>
                                <span>{msg.adminName || 'Admin / Support'}</span>
                              </div>
                            )}
                            {!isAdmin && isBot && (
                              <div className="text-[11px] font-bold text-purple-700 mb-0.5 flex items-center gap-1">
                                <span>🤖</span>
                                <span>Bot Assistant</span>
                              </div>
                            )}
                            {!isAdmin && !isBot && (
                              <div className="text-[11px] font-bold text-emerald-700 mb-0.5">
                                {lead?.name || 'Student'}
                              </div>
                            )}

                            {/* Text Content */}
                            {msg.content && (
                              <div className="text-[13.5px] whitespace-pre-wrap leading-relaxed break-words font-normal">
                                {msg.content}
                              </div>
                            )}

                            {/* Media & Attachments */}
                            {msg.attachments?.map((att, ai) => (
                              <div key={ai} className="mt-2">
                                {att.type?.startsWith('image/') ? (
                                  <div
                                    onClick={() => setLightboxMedia(att)}
                                    className="cursor-pointer group relative overflow-hidden rounded-xl border border-gray-200/70"
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.name || 'image attachment'}
                                      className="max-h-60 rounded-xl object-cover hover:scale-105 transition-transform"
                                    />
                                    <span className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity">
                                      🔍 View Full Size
                                    </span>
                                  </div>
                                ) : att.type?.startsWith('audio/') ? (
                                  <WhatsAppVoiceNote url={att.url} name={att.name} />
                                ) : att.type?.startsWith('video/') ? (
                                  <video controls src={att.url} className="max-h-60 rounded-xl mt-1 border" />
                                ) : (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-medium text-blue-700 transition-colors"
                                  >
                                    <span className="text-xl">📄</span>
                                    <div className="truncate flex-1">
                                      <div className="truncate font-semibold text-gray-800">{att.name || 'Document'}</div>
                                      <div className="text-[10px] text-gray-400">Click to view / download</div>
                                    </div>
                                    <span>⬇️</span>
                                  </a>
                                )}
                              </div>
                            ))}

                            {/* Bottom row: Time + Double Check (for admin messages) */}
                            <div className="flex items-center justify-end gap-1 mt-1 text-[10.5px] text-gray-400 select-none">
                              <span>{formatTime(msg.ts)}</span>
                              {isAdmin && (
                                <DoubleCheckIcon delivered={true} read={true} />
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()
              )}

              <div ref={bottomRef} />
            </div>

            {/* Delivery Toast Notification */}
            {deliveryInfo && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-emerald-800 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in zoom-in-95">
                <span>✓</span>
                <span>{deliveryInfo}</span>
              </div>
            )}

            {/* Reply Error Banner */}
            {replyError && (
              <div className="bg-rose-50 border-t border-rose-200 px-4 py-2 text-xs text-rose-700 flex items-center justify-between">
                <span>⚠️ {replyError}</span>
                <button type="button" onClick={() => setReplyError('')} className="font-bold ml-2">✕</button>
              </div>
            )}

            {/* Pending Attachments Strip */}
            {attachments.length > 0 && (
              <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-gray-500 font-semibold shrink-0">Attached:</span>
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg text-xs">
                    <span>{att.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                    <span className="truncate max-w-[120px] font-medium">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 font-bold ml-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Emoji Picker Popup */}
            {showEmojiPicker && (
              <div className="bg-white border-t border-gray-200 p-3 shadow-lg z-20 animate-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Quick Emojis</span>
                  <button type="button" onClick={() => setShowEmojiPicker(false)} className="text-xs text-gray-400 hover:text-gray-700">✕ Close</button>
                </div>
                <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 text-xl">
                  {EMOJI_LIST.map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        setReply(prev => prev + em);
                        replyInputRef.current?.focus();
                      }}
                      className="p-1.5 rounded hover:bg-gray-100 active:scale-125 transition-all text-center"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shortcuts Dropdown Popup */}
            {showShortcuts && (
              <div className="bg-white border-t border-gray-200 p-3 shadow-lg z-20 max-h-56 overflow-y-auto animate-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <span>⚡</span> Canned Shortcuts & Responses (Click to insert)
                  </span>
                  <button type="button" onClick={() => setShowShortcuts(false)} className="text-xs text-gray-400 hover:text-gray-700">✕ Close</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {shortcuts.map((sc, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setReply(sc.content);
                        setShowShortcuts(false);
                        replyInputRef.current?.focus();
                      }}
                      className="text-left p-2 rounded-lg border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-colors group"
                    >
                      <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
                        <span>{sc.name}</span>
                        <span className="text-[10px] font-mono text-gray-400 group-hover:text-emerald-700">{sc.shortcut}</span>
                      </div>
                      <div className="text-[11px] text-gray-600 truncate mt-0.5">{sc.content}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── WhatsApp Bottom Input Bar ── */}
            <div className="bg-[#f0f2f5] p-3 border-t border-gray-200 flex items-end gap-2 shrink-0">
              {/* Emoji Button */}
              <button
                type="button"
                onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowShortcuts(false); }}
                title="Insert Emoji"
                className={`p-2.5 rounded-full transition-colors ${
                  showEmojiPicker ? 'bg-gray-300 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="text-lg leading-none">😊</span>
              </button>

              {/* Attach File Button */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                title="Attach photo, document, or audio"
                className="p-2.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 -rotate-45" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
              </button>

              {/* Canned Shortcuts Button */}
              <button
                type="button"
                onClick={() => { setShowShortcuts(!showShortcuts); setShowEmojiPicker(false); }}
                title="Canned responses / shortcuts"
                className={`p-2.5 rounded-full transition-colors ${
                  showShortcuts ? 'bg-emerald-200 text-emerald-900' : 'text-gray-500 hover:text-emerald-700 hover:bg-gray-200'
                }`}
              >
                <span className="text-base leading-none">⚡</span>
              </button>

              {/* Text Input Area */}
              <div className="flex-1 bg-white rounded-2xl px-4 py-2 border border-gray-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 shadow-sm transition-all">
                <textarea
                  ref={replyInputRef}
                  value={reply}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={Math.min(4, Math.max(1, (reply.match(/\n/g) || []).length + 1))}
                  placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)"
                  className="w-full text-sm outline-none resize-none bg-transparent placeholder-gray-400 max-h-28"
                />
              </div>

              {/* Send Button (WhatsApp Green Circular Button) */}
              <button
                type="button"
                onClick={sendReply}
                disabled={sending || (!reply.trim() && attachments.length === 0)}
                title="Send message"
                className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white flex items-center justify-center shadow-md disabled:opacity-40 disabled:hover:bg-[#00a884] transition-transform active:scale-95 shrink-0"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 ml-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* ── Right Section: Contact & Lead Info Panel (Matches WhatsApp Web Screenshot!) ── */}
          {showInfo && (
            <div className="w-80 sm:w-96 bg-white border-l border-gray-200 flex flex-col overflow-y-auto whatsapp-scrollbar shrink-0 shadow-lg animate-in slide-in-from-right duration-200">
              
              {/* Header: ✕ Contact Info */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowInfo(false)}
                    className="p-1 text-gray-500 hover:text-gray-800 rounded-full"
                    title="Close info panel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <h4 className="font-bold text-gray-800 text-base">Contact info</h4>
                </div>
              </div>

              {/* Profile Card Hero */}
              <div className="p-6 flex flex-col items-center text-center border-b border-gray-100 bg-gradient-to-b from-gray-50/70 to-white">
                <div className="relative mb-3">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 text-white font-extrabold flex items-center justify-center text-2xl shadow-md border-4 border-white">
                    {lead?.name ? lead.name.slice(0, 2).toUpperCase() : 'LE'}
                  </div>
                  {isWAConv && (
                    <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-[#25d366] text-white flex items-center justify-center text-xs shadow border-2 border-white" title="WhatsApp Lead">
                      📱
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-gray-900 text-lg">{lead?.name || 'Prospective Student'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{schoolName}</p>

                {lead?.lead_tier && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                      lead.lead_tier === 'HOT' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                      lead.lead_tier === 'WARM' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {lead.lead_tier === 'HOT' ? '🔥 HOT LEAD' : `${lead.lead_tier} LEAD`}
                    </span>
                    {lead.lead_score && (
                      <span className="text-[11px] font-mono text-gray-500">Score: {lead.lead_score}/100</span>
                    )}
                  </div>
                )}

                {/* Quick WhatsApp Action Icons (Voice, Video/Chat, CRM, Resolve) */}
                <div className="flex items-center gap-4 mt-5">
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1 text-[#00a884] hover:text-[#008f6f] group"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center text-lg transition-colors">
                        💬
                      </div>
                      <span className="text-[11px] font-semibold text-gray-600">WhatsApp</span>
                    </a>
                  )}

                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-700 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-lg transition-colors">
                        📞
                      </div>
                      <span className="text-[11px] font-semibold text-gray-600">Call</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (lead?.email) navigator.clipboard.writeText(lead.email);
                      alert('Email copied to clipboard!');
                    }}
                    className="flex flex-col items-center gap-1 text-purple-600 hover:text-purple-700 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-50 group-hover:bg-purple-100 flex items-center justify-center text-lg transition-colors">
                      📋
                    </div>
                    <span className="text-[11px] font-semibold text-gray-600">Copy</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEndChat}
                    className="flex flex-col items-center gap-1 text-rose-600 hover:text-rose-700 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-rose-50 group-hover:bg-rose-100 flex items-center justify-center text-lg transition-colors">
                      🏁
                    </div>
                    <span className="text-[11px] font-semibold text-gray-600">Resolve</span>
                  </button>
                </div>
              </div>

              {/* Section: Media, Links and Docs (Matches WhatsApp Web screenshot!) */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📁</span>
                    <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Media, links and docs
                    </h5>
                  </div>
                  <span className="text-xs font-bold text-gray-400">{mediaGallery.length}</span>
                </div>

                {mediaGallery.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 italic text-center">No media or documents shared yet.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {mediaGallery.slice(0, 8).map((m) => (
                      <div
                        key={m.id}
                        onClick={() => m.type?.startsWith('image/') ? setLightboxMedia(m) : window.open(m.url, '_blank')}
                        className="aspect-square rounded-lg bg-gray-100 border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center relative group"
                      >
                        {m.type?.startsWith('image/') ? (
                          <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                        ) : m.type?.startsWith('audio/') ? (
                          <span className="text-xl">🎵</span>
                        ) : (
                          <span className="text-xl">📄</span>
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {m.name || 'File'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Lead Details */}
              <div className="p-4 border-b border-gray-100 space-y-3 text-xs">
                <h5 className="font-bold text-gray-400 uppercase tracking-wider text-[11px]">Lead Details</h5>
                
                <div>
                  <span className="text-gray-400 block mb-0.5">Full Name</span>
                  <span className="font-semibold text-gray-800 text-sm">{lead?.name || '—'}</span>
                </div>

                <div>
                  <span className="text-gray-400 block mb-0.5">Email Address</span>
                  <span className="font-medium text-gray-800 break-all">{lead?.email || '—'}</span>
                </div>

                <div>
                  <span className="text-gray-400 block mb-0.5">Phone (WhatsApp)</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-800">{formatPhoneDisplay(phone)}</span>
                    {waUrl && (
                      <a href={waUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold hover:underline">
                        Message ↗
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-gray-400 block mb-0.5">Zoho CRM Sync</span>
                  {lead?.zoho_contact_id ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ Synced (ID: {lead.zoho_contact_id})
                    </span>
                  ) : (
                    <span className="text-gray-400">Not synced to Zoho CRM</span>
                  )}
                </div>

                <div>
                  <span className="text-gray-400 block mb-0.5">Assigned School</span>
                  <span className="inline-block bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                    {schoolName}
                  </span>
                </div>
              </div>

              {/* Section: Escalation & Agent Attendance */}
              <div className="p-4 border-b border-gray-100 space-y-3 text-xs">
                <h5 className="font-bold text-gray-400 uppercase tracking-wider text-[11px]">Escalation Status</h5>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Reason:</span>
                  <span className="font-bold text-gray-800">{esc?.reason ? esc.reason.replace('_', ' ') : 'Live Chat'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold capitalize text-[11px] ${
                    esc?.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                    esc?.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {esc?.status || 'Active'}
                  </span>
                </div>

                {slaElapsedMinutes !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">SLA Timer:</span>
                    <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                      🚨 {slaElapsedMinutes}m elapsed
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Attended by:</span>
                  <span className="font-medium text-gray-800">{esc?.attended_by || '— Unclaimed —'}</span>
                </div>

                {/* Attend / End Action Buttons */}
                <div className="pt-2 flex flex-col gap-2">
                  {esc?.status === 'pending' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleClaimChat}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-sm transition-colors text-xs flex items-center justify-center gap-1.5"
                    >
                      <span>🟡</span> Claim / Attend This Chat
                    </button>
                  )}

                  {esc?.status !== 'resolved' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleEndChat}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition-colors text-xs flex items-center justify-center gap-1.5"
                    >
                      <span>✅</span> End Chat / Mark Resolved
                    </button>
                  )}
                </div>
              </div>

              {/* Section: Staff Notes */}
              <div className="p-4 border-b border-gray-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-gray-400 uppercase tracking-wider text-[11px]">Staff Notes</h5>
                  {notesSavedAlert && (
                    <span className="text-emerald-600 font-bold text-[10px]">✓ Saved</span>
                  )}
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add internal notes about this student's inquiry..."
                  rows={3}
                  className="w-full text-xs border border-gray-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-gray-50/50"
                />
                <button
                  type="button"
                  disabled={savingNotes}
                  onClick={handleSaveNotes}
                  className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 font-semibold rounded-lg text-xs transition-colors"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>

              {/* Section: Tags */}
              <div className="p-4 space-y-2 text-xs">
                <h5 className="font-bold text-gray-400 uppercase tracking-wider text-[11px]">Conversation Tags</h5>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full font-medium text-[11px]"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-blue-400 hover:text-rose-600 font-bold ml-0.5"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {tags.length === 0 && (
                    <span className="text-gray-400 italic">No tags added yet.</span>
                  )}
                </div>
                <form onSubmit={handleAddTag} className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    placeholder="Add tag (e.g. fees)..."
                    className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-black"
                  >
                    + Add
                  </button>
                </form>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {lightboxMedia && (
        <div
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur cursor-pointer animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.name}
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <a
                href={lightboxMedia.url}
                download={lightboxMedia.name}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-black/60 hover:bg-black/90 text-white text-xs font-bold rounded-lg backdrop-blur flex items-center gap-1"
              >
                ⬇️ Download
              </a>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white font-bold flex items-center justify-center text-sm backdrop-blur"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
