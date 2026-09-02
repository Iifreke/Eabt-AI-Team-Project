import React, { useState, useEffect, useRef } from 'react';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import ChatHeader from './components/ChatHeader.jsx';
import MessageList from './components/MessageList.jsx';
import ChatInput from './components/ChatInput.jsx';

const slideUpKeyframe = `
@keyframes schoolbot-slideup {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1.5px solid #ddd',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
};

// Business hours: 8am–6pm Mon–Fri in West Africa Time (UTC+1)
function isBusinessHours() {
  const wat = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  const day = wat.getDay();   // 0=Sun, 6=Sat
  const hour = wat.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

const CSAT_OPTIONS = [
  { rating: 1, emoji: '😞', label: 'Very Bad' },
  { rating: 2, emoji: '😕', label: 'Bad' },
  { rating: 3, emoji: '😐', label: 'Okay' },
  { rating: 4, emoji: '🙂', label: 'Good' },
  { rating: 5, emoji: '😊', label: 'Excellent' },
];

export default function ChatWidget({ config }) {
  const primaryColor = config?.theme?.primaryColor || '#1a73e8';
  const isMultiSchool = Array.isArray(config?.schools) && config.schools.length > 1;

  const [step, setStep] = useState(isMultiSchool ? 'school' : 'form');
  const [selectedSchool, setSelectedSchool] = useState(
    isMultiSchool ? null : { id: config?.schoolId, name: config?.theme?.name || 'School Support' }
  );
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Ticket form state
  const [ticketForm, setTicketForm] = useState({ subject: '', message: '' });
  const [ticketError, setTicketError] = useState('');
  const [ticketLoading, setTicketLoading] = useState(false);

  // CSAT state
  const [csatSending, setCsatSending] = useState(false);

  // Banner shown when user tries to open a ticket during business hours
  const [showAgentOnlineBanner, setShowAgentOnlineBanner] = useState(false);

  // Dismissed state for the escalated offline banner
  const [escalatedBannerDismissed, setEscalatedBannerDismissed] = useState(false);

  // No-response hint — shown after 2 min in escalated stage with no admin reply
  const [showNoResponseHint, setShowNoResponseHint] = useState(false);
  const noResponseTimerRef = useRef(null);

  const { sessionId, setSessionId, resetSession } = useSession();
  const { messages, stage, isLoading, agentTyping, adminsOnline, showTicketPrompt, askSatisfaction, dismissTicketPrompt, submitLead, sendMessage, sendWithAttachments, handleSuggestionClick, resetChat } = useChat();

  // Keep a live ref so timer callbacks always read the latest messages
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const effectiveConfig = {
    ...config,
    schoolId: selectedSchool?.id,
    theme: { ...config?.theme, name: selectedSchool?.name },
  };

  const apiUrl = config?.apiUrl || '';

  // ── Web User Presence Heartbeat ─────────────────────────────
  useEffect(() => {
    if (!sessionId || !isOpen || step !== 'chat') return;

    const sendPresence = (online) => {
      fetch(`${apiUrl}/api/chat/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, online }),
        keepalive: true,
      }).catch(() => {});
    };

    sendPresence(true);
    const interval = setInterval(() => sendPresence(true), 25000);

    const onVisibilityChange = () => {
      sendPresence(document.visibilityState === 'visible');
    };

    const onBeforeUnload = () => {
      sendPresence(false);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [sessionId, isOpen, step, apiUrl]);

  // Start 2-minute no-response countdown when stage becomes escalated
  useEffect(() => {
    if (stage === 'escalated') {
      noResponseTimerRef.current = setTimeout(() => {
        const hasAdminReply = messagesRef.current.some(m => m.role === 'admin');
        if (!hasAdminReply) setShowNoResponseHint(true);
      }, 2 * 60 * 1000);
    } else {
      clearTimeout(noResponseTimerRef.current);
      setShowNoResponseHint(false);
    }
    return () => clearTimeout(noResponseTimerRef.current);
  }, [stage]);

  // Hide the hint as soon as an admin reply arrives (even after the timer already fired)
  useEffect(() => {
    if (showNoResponseHint && messages.some(m => m.role === 'admin')) {
      setShowNoResponseHint(false);
    }
  }, [messages, showNoResponseHint]);

  const getWhatsAppUrl = () => {
    const waNumber = config?.whatsappNumber || '2348000000000';
    const schoolName = selectedSchool?.name || 'Admissions';
    const text = encodeURIComponent(`Hello! I was chatting with ${schoolName} support on the website and would like to continue here.`);
    return `https://wa.me/${waNumber.replace(/[^\d]/g, '')}?text=${text}`;
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 480;
  const windowStyle = isMobile
    ? { position: 'fixed', bottom: 0, right: 0, width: '100vw', height: '100vh', borderRadius: 0 }
    : { position: 'fixed', bottom: '92px', right: '24px', width: '380px', height: '560px', maxHeight: 'calc(100vh - 120px)', borderRadius: '16px' };

  const panelStyle = {
    ...windowStyle,
    background: 'white',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9998,
    animation: 'schoolbot-slideup 0.2s ease-out',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  function PanelHeader({ title, subtitle, onClose }) {
    return (
      <div style={{ background: primaryColor, padding: '18px 20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: '4px', display: 'flex', alignItems: 'center' }} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  function handleClose() {
    setIsOpen(false);
    resetSession();
    resetChat();
    setStep(isMultiSchool ? 'school' : 'form');
    setSelectedSchool(isMultiSchool ? null : { id: config?.schoolId, name: config?.theme?.name || 'School Support' });
    setForm({ name: '', email: '', phone: '' });
    setFormError('');
    setTicketForm({ subject: '', message: '' });
    setTicketError('');
    setShowNoResponseHint(false);
    setShowAgentOnlineBanner(false);
  }

  function handleSchoolSelect(school) { setSelectedSchool(school); setStep('form'); }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  async function handleFormSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!name) { setFormError('Please enter your full name.'); return; }
    if (!email || !emailRegex.test(email)) { setFormError('Please enter a valid email address (e.g. name@example.com).'); return; }
    if (!phone || phone.length < 8) { setFormError('Please enter a valid phone number.'); return; }
    setFormError('');
    setFormLoading(true);
    await submitLead({ name, email, phone }, effectiveConfig, sessionId, (restoredSid) => {
      setSessionId(restoredSid);
    });
    setFormLoading(false);
    setStep('chat');
  }

  async function handleTicketSubmit(e) {
    e.preventDefault();
    const name = (form.name || ticketForm.name || '').trim();
    const email = (form.email || ticketForm.email || '').trim();
    const phone = (form.phone || ticketForm.phone || '').trim();
    const subject = ticketForm.subject.trim();
    const message = ticketForm.message.trim();

    if (!name) { setTicketError('Please enter your full name.'); return; }
    if (!email || !emailRegex.test(email)) { setTicketError('Please enter a valid email address (e.g. name@example.com).'); return; }
    if (!subject) { setTicketError('Please enter a subject.'); return; }
    if (!message) { setTicketError('Please describe your question or issue.'); return; }
    setTicketError('');
    setTicketLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool?.id,
          name,
          email,
          phone,
          subject,
          message,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setStep('ticket_done');
    } catch (err) {
      setTicketError(err.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleRatingSubmit(rating) {
    setCsatSending(true);
    try {
      await fetch(`${apiUrl}/api/admin/csat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool?.id,
          sessionId,
          rating,
        }),
      });
    } catch (err) {
      console.error('CSAT submit error:', err);
    } finally {
      setCsatSending(false);
      setStep('rating_done');
    }
  }

  return (
    <>
      <style>{slideUpKeyframe}</style>

      {/* ── SCHOOL SELECT STEP ── */}
      {isOpen && step === 'school' && isMultiSchool && (
        <div style={panelStyle}>
          <PanelHeader title="Select Institution" subtitle="Choose your school to get started" onClose={handleClose} />
          <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
            {config.schools.map((school) => (
              <button
                key={school.id}
                onClick={() => handleSchoolSelect(school)}
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1.5px solid #e0e0e0',
                  background: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, transform 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = primaryColor; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#222' }}>{school.name}</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Admissions & Support</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── FORM STEP ── */}
      {isOpen && step === 'form' && (
        <div style={panelStyle}>
          <PanelHeader title={selectedSchool?.name || 'School Support'} subtitle="Please share your details to begin" onClose={handleClose} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Adeola Johnson"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. adeola@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Phone Number (WhatsApp)</label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  required
                />
              </div>

              {formError && (
                <div style={{ fontSize: '12px', color: '#d93025', background: '#fce8e6', padding: '8px 12px', borderRadius: '6px' }}>{formError}</div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                style={{
                  background: formLoading ? '#999' : primaryColor,
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: formLoading ? 'not-allowed' : 'pointer',
                  marginTop: '6px',
                  transition: 'opacity 0.15s',
                }}
              >
                {formLoading ? 'Starting chat...' : 'Start Chat'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── CHAT STEP ── */}
      {isOpen && step === 'chat' && (
        <div style={panelStyle}>
          <ChatHeader
            config={effectiveConfig}
            onClose={handleClose}
            stage={stage}
            agentTyping={agentTyping}
            adminsOnline={adminsOnline}
          />
          <MessageList
            messages={messages}
            stage={stage}
            isLoading={isLoading}
            agentTyping={agentTyping}
            primaryColor={primaryColor}
            onSuggestionSelect={(q, msgId) => handleSuggestionClick(q, msgId, effectiveConfig, sessionId)}
          />
          <ChatInput
            onSend={(text) => sendMessage(text, effectiveConfig, sessionId)}
            onSendWithAttachments={(text, files) => sendWithAttachments(text, files, effectiveConfig, sessionId)}
            isLoading={isLoading}
            primaryColor={primaryColor}
            apiUrl={effectiveConfig?.apiUrl}
          />

          {/* Off-hours / Offline banner */}
          {showTicketPrompt && !isBusinessHours() && (
            <div style={{ margin: '0 12px 8px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#e65100', position: 'relative' }}>
              <button
                onClick={dismissTicketPrompt}
                style={{ position: 'absolute', top: '6px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#e65100', fontSize: '18px', fontWeight: 700, lineHeight: 1, padding: '2px 4px' }}
                aria-label="Dismiss">&#x2715;</button>
              <div style={{ fontWeight: 700, marginBottom: '4px', paddingRight: '20px' }}>Support Team is Offline</div>
              <div style={{ marginBottom: '8px', lineHeight: '1.5' }}>Our team is offline (Mon–Fri 8am–6pm WAT). Continue on WhatsApp or open a ticket.</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: '#25D366', color: 'white', textDecoration: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  📱 WhatsApp Chat →
                </a>
                <button
                  onClick={() => { setTicketError(''); setStep('ticket'); }}
                  style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  Open a Ticket →
                </button>
              </div>
            </div>
          )}

          {/* Offline warning banner after escalation */}
          {stage === 'escalated' && !isBusinessHours() && !escalatedBannerDismissed && (
            <div style={{ margin: '0 12px 8px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#c62828', position: 'relative' }}>
              <button
                onClick={() => setEscalatedBannerDismissed(true)}
                style={{ position: 'absolute', top: '6px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: '18px', fontWeight: 700, lineHeight: 1, padding: '2px 4px' }}
                aria-label="Dismiss">&#x2715;</button>
              <div style={{ fontWeight: 700, marginBottom: '4px', paddingRight: '20px' }}>Support Team is Offline</div>
              <div style={{ marginBottom: '8px', lineHeight: '1.5' }}>Our advisors are offline. You can chat with our AI, switch to WhatsApp, or open a ticket.</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: '#25D366', color: 'white', textDecoration: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  📱 Chat on WhatsApp
                </a>
                <button
                  onClick={() => { setTicketError(''); setStep('ticket'); }}
                  style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  Open a Ticket
                </button>
              </div>
            </div>
          )}

          {/* Satisfaction check */}
          {askSatisfaction && stage !== 'resolved' && (
            <div style={{ margin: '0 12px 8px', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#1e40af' }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Were you satisfied with this answer?</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => sendMessage('yes', effectiveConfig, sessionId)}
                  style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  Yes ✓
                </button>
                <button
                  onClick={() => sendMessage('no', effectiveConfig, sessionId)}
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  No, I need more help
                </button>
              </div>
            </div>
          )}

          {/* Resolved banner */}
          {stage === 'resolved' && (
            <div style={{ margin: '0 12px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#15803d', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>✓ Conversation Resolved</div>
              <div>Start a new chat any time you need help.</div>
            </div>
          )}

          {/* Footer actions */}
          {(stage === 'escalated' || showTicketPrompt) && (
            <div style={{ background: '#f9f9f9', borderTop: '1px solid #eee', padding: '8px 16px', display: 'flex', gap: '12px', justifyContent: 'center', flexShrink: 0 }}>
              <button onClick={() => setStep('rating')}
                style={{ fontSize: '12px', color: primaryColor, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Rate this chat ★
              </button>
              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '12px', color: '#128C7E', background: 'none', textDecoration: 'underline', fontWeight: 600 }}>
                📱 WhatsApp
              </a>
              <button
                onClick={() => {
                  if (isBusinessHours()) {
                    setShowAgentOnlineBanner(true);
                    setStep('chat');
                  } else {
                    setTicketError(''); setStep('ticket');
                  }
                }}
                style={{ fontSize: '12px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                📋 Open a Ticket
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TICKET FORM ── */}
      {isOpen && step === 'ticket' && !isBusinessHours() && (
        <div style={panelStyle}>
          <PanelHeader title="Open a Ticket" subtitle="We'll reply to your email within 24 hours" onClose={handleClose} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <form onSubmit={handleTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!form.name && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Full Name</label>
                  <input type="text" placeholder="e.g. Amina Bello" value={ticketForm.name || ''}
                    onChange={e => setTicketForm(f => ({ ...f, name: e.target.value }))} style={inputStyle}
                    onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
                </div>
              )}
              {!form.email && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Email Address</label>
                  <input type="email" placeholder="e.g. student@gmail.com" value={ticketForm.email || ''}
                    onChange={e => setTicketForm(f => ({ ...f, email: e.target.value }))} style={inputStyle}
                    onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
                </div>
              )}
              {!form.phone && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Phone Number (Optional)</label>
                  <input type="tel" placeholder="e.g. 08012345678" value={ticketForm.phone || ''}
                    onChange={e => setTicketForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle}
                    onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} />
                </div>
              )}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Subject</label>
                <input type="text" placeholder="e.g. Admission requirements" value={ticketForm.subject}
                  onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Message</label>
                <textarea placeholder="Describe your question or issue..." value={ticketForm.message}
                  onChange={e => setTicketForm(f => ({ ...f, message: e.target.value }))}
                  style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }} required />
              </div>
              {ticketError && (
                <div style={{ fontSize: '12px', color: '#d93025', background: '#fce8e6', padding: '8px 12px', borderRadius: '6px' }}>{ticketError}</div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={ticketLoading}
                  style={{ flex: 1, background: ticketLoading ? '#999' : primaryColor, color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: ticketLoading ? 'not-allowed' : 'pointer' }}>
                  {ticketLoading ? 'Sending...' : 'Send Message'}
                </button>
                <button type="button" onClick={() => setStep('chat')}
                  style={{ padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#666' }}>
                  Back
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TICKET DONE ── */}
      {isOpen && step === 'ticket_done' && (
        <div style={panelStyle}>
          <PanelHeader title="Ticket Submitted" onClose={handleClose} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#222', marginBottom: '8px' }}>We've received your ticket!</div>
            <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', maxWidth: '280px' }}>
              Our support team will review your message and reply to your email within 24 hours.
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '10px 16px', borderRadius: '10px', background: '#25D366', color: 'white', textDecoration: 'none', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                📱 Chat on WhatsApp
              </a>
              <button onClick={() => setStep('chat')}
                style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#444' }}>
                Back to chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RATING STEP ── */}
      {isOpen && step === 'rating' && (
        <div style={panelStyle}>
          <PanelHeader title="Rate Your Experience" subtitle="How did we do today?" onClose={handleClose} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#444', marginBottom: '24px', fontWeight: 600 }}>Please rate your support experience:</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '32px' }}>
              {CSAT_OPTIONS.map(opt => (
                <button
                  key={opt.rating}
                  disabled={csatSending}
                  onClick={() => handleRatingSubmit(opt.rating)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '12px 10px', borderRadius: '12px', border: '1.5px solid #e0e0e0', background: 'white', cursor: 'pointer', minWidth: '58px', transition: 'border-color 0.15s, transform 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = primaryColor; e.currentTarget.style.transform = 'scale(1.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <span style={{ fontSize: '26px' }}>{opt.emoji}</span>
                  <span style={{ fontSize: '10px', color: '#666', fontWeight: 600 }}>{opt.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('chat')}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #ddd', background: 'none', cursor: 'pointer', fontSize: '12px', color: '#888' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── RATING DONE ── */}
      {isOpen && step === 'rating_done' && (
        <div style={panelStyle}>
          <PanelHeader title="Thank You!" onClose={handleClose} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#222', marginBottom: '8px' }}>Thanks for your feedback!</div>
            <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>Your rating helps us keep improving.</div>
            <button onClick={() => setStep('chat')}
              style={{ marginTop: '24px', padding: '10px 20px', borderRadius: '10px', border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#444' }}>
              Back to chat
            </button>
          </div>
        </div>
      )}

      {/* ── FLOATING BUBBLE ── */}
      <button
        onClick={() => isOpen ? handleClose() : setIsOpen(true)}
        style={{ position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px', borderRadius: '50%', background: primaryColor, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'; }}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          : <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        }
      </button>
    </>
  );
}
