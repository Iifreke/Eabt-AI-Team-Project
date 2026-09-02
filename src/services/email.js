import nodemailer from 'nodemailer';
import supabase from '../db/supabase.js';

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

const DEFAULT_FROM = process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || `"Admissions Support" <eabtconnect@gmail.com>`;

/**
 * Sends an email using Resend API if available, falling back to Nodemailer SMTP.
 */
async function sendEmailMessage({ to, subject, html, replyTo }) {
  if (!to) {
    console.warn('[Email Service] No recipient email provided.');
    return false;
  }

  // 1. Try Resend API if API Key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddr = process.env.RESEND_FROM_EMAIL || 'admissions@eabt-ai-team-project.vercel.app' || 'onboarding@resend.dev';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: fromAddr.includes('<') ? fromAddr : `Admissions Office <${fromAddr}>`,
          to: [to],
          subject,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });

      if (res.ok) {
        console.log(`[Email Service] Delivered via Resend API to: ${to}`);
        return true;
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[Email Service] Resend API attempt returned:', errJson?.message || res.statusText);
      }
    } catch (resendErr) {
      console.warn('[Email Service] Resend dispatch error:', resendErr.message);
    }
  }

  // 2. Try Nodemailer SMTP
  const smtp = getTransporter();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: DEFAULT_FROM,
        to,
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      console.log(`[Email Service] Delivered via SMTP to: ${to}`);
      return true;
    } catch (smtpErr) {
      console.error('[Email Service] SMTP error:', smtpErr.message);
    }
  }

  console.warn(`[Email Service] Simulated send to ${to}: "${subject}"`);
  return true;
}

const reasonLabels = {
  user_request: 'Student requested a live human advisor',
  failed_attempts: 'Inquiry required specialized admissions guidance',
  sensitive_topic: 'Specialized request requiring admissions director attention',
};

export async function sendEscalationEmail({ school, lead, conversation, reason }) {
  try {
    const studentName = lead?.name || 'Prospective Student';
    const schoolName = school?.name || 'Distance Learning Centre';
    const transcript = (conversation.messages || [])
      .map(m => (m.role === 'user' ? `${studentName}: ` : m.role === 'admin' ? 'Admissions Officer: ' : 'Concierge: ') + m.content)
      .join('\n\n');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: #0f172a; padding: 28px 32px; color: #ffffff; border-bottom: 3px solid #3b82f6;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 6px;">Admissions Live Escalation</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">${schoolName}</h1>
      <p style="margin: 8px 0 0; color: #cbd5e1; font-size: 14px;">A student requires personalized advisor attention.</p>
    </div>
    <div style="padding: 32px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 12px;">Student Profile</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 100px;">Full Name</td><td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${studentName}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Email Address</td><td style="padding: 6px 0; color: #0f172a;"><a href="mailto:${lead.email}" style="color: #2563eb; text-decoration: none;">${lead.email || '(Not provided)'}</a></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Phone Number</td><td style="padding: 6px 0; color: #0f172a;">${lead.phone || lead.normalized_phone || '(Not provided)'}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Timestamp</td><td style="padding: 6px 0; color: #64748b;">${new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })} WAT</td></tr>
        </table>
      </div>

      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1e40af; letter-spacing: 1px; margin-bottom: 4px;">Reason for Escalation</div>
        <p style="margin: 0; font-weight: 600; font-size: 14px; color: #1e3a8a;">${reasonLabels[reason] || reason}</p>
      </div>

      <div style="margin-bottom: 28px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 12px;">Conversation Transcript</div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; max-height: 350px; overflow-y: auto; color: #334155;">${transcript || '(No messages recorded)'}</div>
      </div>

      <div style="padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
        <a href="https://eabt-ai-team-project.vercel.app/chats?id=${conversation.id}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; letter-spacing: 0.2px;">Open Live Chat in Admin Portal →</a>
      </div>
    </div>
  </div>
</body>
</html>`;

    const staffEmail =
      (school.slug === 'babcock' || school.slug === 'backock')
        ? (process.env.ESCALATION_EMAIL_BABCOCK || process.env.ESCALATION_EMAIL_BACKOCK || 'eabtconnect@gmail.com')
        : (process.env.ESCALATION_EMAIL_ABU || 'eabtconnect@gmail.com');

    await sendEmailMessage({
      to: staffEmail,
      subject: `Admissions Escalation: ${studentName} — ${schoolName}`,
      html,
    });

    await supabase
      .from('escalations')
      .update({ email_sent: true })
      .eq('conversation_id', conversation.id);
  } catch (error) {
    console.error('Escalation email failed:', error.message);
  }
}

export async function sendTicketEmail({ school, ticket }) {
  try {
    const schoolName = school?.name || 'Distance Learning Centre';
    const studentName = ticket.name || 'Prospective Student';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: #0f172a; padding: 28px 32px; color: #ffffff; border-bottom: 3px solid #3b82f6;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 6px;">New Support Ticket</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">${schoolName}</h1>
      <p style="margin: 8px 0 0; color: #cbd5e1; font-size: 14px;">An offline inquiry has been registered.</p>
    </div>
    <div style="padding: 32px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 12px;">Contact Information</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 100px;">Full Name</td><td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${studentName}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Email Address</td><td style="padding: 6px 0; color: #0f172a;"><a href="mailto:${ticket.email}" style="color: #2563eb; text-decoration: none;">${ticket.email}</a></td></tr>
          ${ticket.phone ? `<tr><td style="padding: 6px 0; color: #64748b;">Phone Number</td><td style="padding: 6px 0; color: #0f172a;">${ticket.phone}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #64748b;">Submitted At</td><td style="padding: 6px 0; color: #64748b;">${new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' })} WAT</td></tr>
        </table>
      </div>

      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1e40af; letter-spacing: 1px; margin-bottom: 4px;">Subject</div>
        <p style="margin: 0; font-weight: 700; font-size: 15px; color: #1e3a8a;">${ticket.subject}</p>
      </div>

      <div style="margin-bottom: 28px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 12px;">Message</div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; color: #334155;">${ticket.message}</div>
      </div>

      <div style="padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
        <a href="https://eabt-ai-team-project.vercel.app/tickets" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Ticket on Admin Dashboard →</a>
      </div>
    </div>
  </div>
</body>
</html>`;

    const staffEmail =
      (school?.slug === 'babcock' || school?.slug === 'backock')
        ? (process.env.ESCALATION_EMAIL_BABCOCK || process.env.ESCALATION_EMAIL_BACKOCK || 'eabtconnect@gmail.com')
        : (process.env.ESCALATION_EMAIL_ABU || 'eabtconnect@gmail.com');

    await sendEmailMessage({
      to: staffEmail,
      subject: `New Support Ticket: ${ticket.subject} — ${schoolName}`,
      html,
    });
  } catch (error) {
    console.error('Ticket email failed:', error.message);
  }
}

export async function sendTicketReplyEmail({ school, ticket, staffReply }) {
  try {
    const schoolName = school?.name || 'Admissions Office';
    const studentName = ticket?.name || 'Prospective Student';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- Executive Header -->
    <div style="background: #0f172a; padding: 32px 36px; color: #ffffff; border-bottom: 3px solid #3b82f6;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 6px;">Official Admissions Response</div>
      <h1 style="margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.3px;">${schoolName}</h1>
      <p style="margin: 6px 0 0; color: #cbd5e1; font-size: 14px;">Admissions & Student Advisory Support</p>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px;">
      <p style="font-size: 16px; color: #0f172a; margin: 0 0 16px; font-weight: 600;">Dear ${studentName},</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
        Thank you for contacting the admissions office regarding <strong>${ticket.subject}</strong>. Our admissions team has reviewed your inquiry and provided the response below:
      </p>

      <!-- Staff Response Card -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #0f172a; border-radius: 8px; padding: 24px; margin-bottom: 28px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0f172a; letter-spacing: 1px; margin-bottom: 12px;">Admissions Team Response</div>
        <div style="font-size: 14.5px; color: #0f172a; line-height: 1.8; white-space: pre-wrap;">${staffReply}</div>
      </div>

      <!-- Original Inquiry Reference -->
      <div style="background: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 8px;">Your Original Inquiry</div>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.6; font-style: italic;">"${ticket.message}"</p>
      </div>

      <!-- Closing & Sign-off -->
      <div style="font-size: 14px; color: #475569; line-height: 1.7; margin-bottom: 28px;">
        If you have any further questions or require additional assistance with your application, please feel free to reply directly to this email or visit our admissions portal.
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; font-size: 13px; color: #64748b; line-height: 1.6;">
        <strong style="color: #0f172a;">Admissions & Support Directorate</strong><br>
        ${schoolName}<br>
        <span style="font-size: 12px; color: #94a3b8;">Inquiry Reference #${ticket.id ? String(ticket.id).slice(0, 8).toUpperCase() : 'REC'} &bull; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

    await sendEmailMessage({
      to: ticket.email,
      subject: `Response to Your Admissions Inquiry: ${ticket.subject} — ${schoolName}`,
      html,
    });

    console.log(`[Email Service] Official ticket reply successfully dispatched to ${ticket.email}`);
  } catch (error) {
    console.error('[Email Service] Ticket reply email failed:', error.message);
  }
}

export async function sendTicketConfirmationEmail({ school, ticket }) {
  try {
    const schoolName = school?.name || 'Admissions Office';
    const studentName = ticket.name || 'Prospective Student';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: #0f172a; padding: 32px 36px; color: #ffffff; border-bottom: 3px solid #3b82f6;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 6px;">Ticket Confirmation</div>
      <h1 style="margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.3px;">${schoolName}</h1>
      <p style="margin: 6px 0 0; color: #cbd5e1; font-size: 14px;">We have received your support ticket.</p>
    </div>
    <div style="padding: 36px;">
      <p style="font-size: 16px; color: #0f172a; margin: 0 0 16px; font-weight: 600;">Dear ${studentName},</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
        Thank you for reaching out. We have received your inquiry regarding <strong>${ticket.subject}</strong>. An admissions representative will review your request and reply to this email address promptly.
      </p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px; border: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 8px;">Recorded Message</div>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.6; font-style: italic;">"${ticket.message}"</p>
      </div>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; font-size: 13px; color: #64748b; line-height: 1.6;">
        <strong style="color: #0f172a;">Admissions Support Team</strong><br>
        ${schoolName}
      </div>
    </div>
  </div>
</body>
</html>`;

    await sendEmailMessage({
      to: ticket.email,
      subject: `Inquiry Received: ${ticket.subject} — ${schoolName}`,
      html,
    });
  } catch (error) {
    console.error('[Email Service] Ticket confirmation email failed:', error.message);
  }
}
