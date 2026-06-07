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

  // No-response hint — shown after 2 min in escalated stage with no admin reply
  const [showNoResponseHint, setShowNoResponseHint] = useState(false);
  const noResponseTimerRef = useRef(null);

  const { sessionId, setSessionId, resetSession } = useSession();
  const { messages, stage, isLoading, agentTyping, adminsOnline, submitLead, sendMessage, sendWithAttachments, handleSuggestionClick, resetChat } = useChat();

  // Keep a live ref so timer callbacks always read the latest messages
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const effectiveConfig = {
    ...config,
    schoolId: selectedSchool?.id,
    theme: { ...config?.theme, name: selectedSchool?.name },
  };

  const apiUrl = config?.apiUrl || '';

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
    // Reset everything so next open starts a fresh session
    resetSession();
    resetChat();
    setStep(isMultiSchool ? 'school' : 'form');
    setSelectedSchool(isMultiSchool ? null : { id: config?.schoolId, name: config?.theme?.name || 'School Support' });
    setForm({ name: '', email: '', phone: '' });
    setFormError('');
    setTicketForm({ subject: '', message: '' });
    setTicketError('');
    setShowNoResponseHint(false);
  }
  function handleSchoolSelect(school) { setSelectedSchool(school); setStep('form'); }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!name) { setFormError('Please enter your full name.'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError('Please enter a valid email address.'); return; }
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
    const subject = ticketForm.subject.trim();
    const message = ticketForm.message.trim();
    if (!subject) { setTicketError('Please enter a subject.'); return; }
    if (!message) { setTicketError('Please describe your issue.'); return; }
    setTicketError('');
    setTicketLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool?.id,
          name: form.name || lead.name || 'Visitor',
          email: form.email || lead.email || '',
          phone: form.phone || lead.phone || '',
          subject,
          message,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setTicketForm({ subject: '', message: '' });
      setShowNoResponseHint(false);
      setStep('ticket_sent');
    } catch (err) {
      setTicketError(err.message || 'Failed to send. Please try again.');
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleCsatSelect(rating) {
    setCsatSending(true);
    try {
      await fetch(`${apiUrl}/api/chat/messages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, rating }),
      });
      setStep('rating_done');
    } catch {
      setStep('rating_done');
    } finally {
      setCsatSending(false);
    }
  }

  return (
    <>
      <style>{slideUpKeyframe}</style>

      {/* ── SCHOOL PICKER ── */}
      {isOpen && step === 'school' && (
        <div style={panelStyle}>
          <PanelHeader title="Welcome!" subtitle="School Admissions Assistant" onClose={handleClose} />
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <p style={{ fontSize: '14px', color: '#444', lineHeight: '1.6' }}>Which school are you enquiring about?</p>
            {config.schools.map(school => (
              <button
                key={school.id}
                onClick={() => handleSchoolSelect(school)}
                style={{ padding: '16px 18px', borderRadius: '12px', border: `2px solid ${primaryColor}`, background: 'white', color: primaryColor, fontSize: '14px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = primaryColor; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = primaryColor; }}
              >
                {school.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── LEAD FORM ── */}
      {isOpen && step === 'form' && (
        <div style={panelStyle}>
          <PanelHeader title={selectedSchool?.name || 'School Support'} subtitle="Just a few quick details to get started" onClose={handleClose} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '18px', lineHeight: '1.5' }}>
              Hi! To help you better, please fill in your details below.
            </p>
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Full Name</label>
                <input type="text" placeholder="e.g. Amaka Johnson" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Email Address</label>
                <input type="email" placeholder="e.g. amaka@gmail.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#444', display: 'block', marginBottom: '5px' }}>Phone Number</label>
                <input type="tel" placeholder="e.g. 08012345678" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = primaryColor} onBlur={e => e.target.style.borderColor = '#ddd'} required />
              </div>
              {formError && (
                <div style={{ fontSize: '12px', color: '#d93025', background: '#fce8e6', padding: '8px 12px', borderRadius: '6px' }}>{formError}</div>
              )}
              <button type="submit" disabled={formLoading}
                style={{ background: formLoading ? '#999' : primaryColor, color: 'white', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '14px', fontWeight: 700, cursor: formLoading ? 'not-allowed' : 'pointer', marginTop: '4px' }}>
                {formLoading ? 'Starting chat...' : 'Start Chat →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── CHAT ── */}
      {isOpen && step === 'chat' && (
        <div style={panelStyle}>
          <ChatHeader
            schoolName={selectedSchool?.name || config?.theme?.name || 'School Support'}
            primaryColor={primaryColor}
            adminsOnline={adminsOnline}
            onClose={handleClose}
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
          {/* Offline warning banner */}
          {!adminsOnline && (
            <div style={{ margin: '0 12px 8px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#c62828' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Support Team is Offline</div>
              <div style={{ marginBottom: '8px', lineHeight: '1.5' }}>Our team is currently offline. Open a ticket and we'll reply to your email.</div>
              <button
                onClick={() => { setTicketError(''); setStep('ticket'); }}
                style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                Open a Ticket →
              </button>
            </div>
          )}
          {/* No-response hint — shown after 2 min in escalated with no admin reply */}
          {showNoResponseHint && adminsOnline && (
            <div style={{ margin: '0 12px 8px', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#795548' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>No agent has responded yet</div>
              <div style={{ marginBottom: '8px', lineHeight: '1.5' }}>Our team may be busy. Open a ticket and we'll reply to your email.</div>
              <button
                onClick={() => { setTicketError(''); setStep('ticket'); }}
                style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                Open a Ticket →
              </button>
            </div>
          )}
          {/* Footer actions */}
          <div style={{ background: '#f9f9f9', borderTop: '1px solid #eee', padding: '8px 16px', display: 'flex', gap: '12px', justifyContent: 'center', flexShrink: 0 }}>
            {stage === 'escalated' && (
              <button onClick={() => setStep('rating')}
                style={{ fontSize: '12px', color: primaryColor, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Rate this chat ★
              </button>
            )}
            <button onClick={() => { setTicketError(''); setStep('ticket'); }}
              style={{ fontSize: '12px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              📋 Open a Ticket
            </button>
          </div>
        </div>
      )}

      {/* ── TICKET FORM ── */}
      {isOpen && step === 'ticket' && (
        <div style={panelStyle}>
          <PanelHeader title="Open a Ticket" subtitle="We'll reply to your email within 24 hours" onClose={handleClose} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <form onSubmit={handleTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

      {/* ── TICKET SENT ── */}
      {isOpen && step === 'ticket_sent' && (
        <div style={panelStyle}>
          <PanelHeader title="Ticket Sent!" onClose={handleClose} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#222', marginBottom: '8px' }}>We've received your ticket!</div>
            <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
              Our team will reply to <strong>{form.email || lead.email || 'your email'}</strong> within 24 hours.
            </div>
            <button onClick={() => setStep('chat')}
              style={{ marginTop: '24px', padding: '10px 20px', borderRadius: '10px', border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#444' }}>
              Back to chat
            </button>
          </div>
        </div>
      )}

      {/* ── CSAT RATING ── */}
      {isOpen && step === 'rating' && (
        <div style={panelStyle}>
          <PanelHeader title="Rate Your Experience" subtitle="How was your chat today?" onClose={handleClose} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: '24px' }}>
            <div style={{ fontSize: '14px', color: '#444', textAlign: 'center' }}>
              Your feedback helps us improve our support.
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              {CSAT_OPTIONS.map(({ rating, emoji, label }) => (
                <button key={rating} onClick={() => handleCsatSelect(rating)} disabled={csatSending}
                  title={label}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: csatSending ? 'not-allowed' : 'pointer', opacity: csatSending ? 0.5 : 1, transition: 'transform 0.1s' }}
                  onMouseEnter={e => { if (!csatSending) e.currentTarget.style.transform = 'scale(1.2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                  <span style={{ fontSize: '36px' }}>{emoji}</span>
                  <span style={{ fontSize: '10px', color: '#888' }}>{label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('chat')}
              style={{ fontSize: '12px', color: '#999', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Skip
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
        onClick={() => setIsOpen(o => !o)}
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
