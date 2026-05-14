import { Resend } from 'resend';
import supabase from '../db/supabase.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const reasonLabels = {
  user_request: 'Visitor requested a human agent',
  failed_attempts: 'Bot could not answer 3 times in a row',
  sensitive_topic: 'Sensitive topic detected (complaint/legal/disciplinary)',
};

export async function sendEscalationEmail({ school, lead, conversation, reason }) {
  try {
    const transcript = (conversation.messages || [])
      .map(m => (m.role === 'user' ? 'Visitor: ' : 'Bot: ') + m.content)
      .join('\n\n');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <div style="background: #d32f2f; padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 20px;">🚨 Escalation Alert — ${school.name}</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">A visitor requires human assistance</p>
    </div>

    <div style="padding: 24px;">

      <div style="background: #f9f9f9; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Visitor Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #666; width: 80px;">Name</td>
            <td style="padding: 4px 0; font-weight: bold;">${lead.name || '(not provided)'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Email</td>
            <td style="padding: 4px 0;">${lead.email || '(not provided)'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Phone</td>
            <td style="padding: 4px 0;">${lead.phone || '(not provided)'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Date</td>
            <td style="padding: 4px 0;">${new Date().toLocaleString()}</td>
          </tr>
        </table>
      </div>

      <div style="background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Escalation Reason</h2>
        <p style="margin: 0; font-weight: bold; color: #e65100;">${reasonLabels[reason] || reason}</p>
      </div>

      <div>
        <h2 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Conversation Transcript</h2>
        <div style="background: #f9f9f9; border-radius: 6px; padding: 16px; font-family: monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">
${transcript || '(No messages recorded)'}
        </div>
      </div>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px;">
        Log in to the admin dashboard to manage this escalation.
      </div>

    </div>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from: 'chatbot@notifications.yourdomain.com',
      to: school.staff_email,
      subject: `🚨 Escalation — ${lead.name || 'Unknown Visitor'} — ${school.name}`,
      html,
    });

    await supabase
      .from('escalations')
      .update({ email_sent: true })
      .eq('conversation_id', conversation.id);
  } catch (error) {
    console.error('Email send failed:', error.message);
    // Do not rethrow
  }
}

export async function sendTicketEmail({ school, ticket }) {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #1565c0; padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 20px;">🎫 New Support Ticket — ${school.name}</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">A visitor has submitted a support request</p>
    </div>
    <div style="padding: 24px;">
      <div style="background: #f9f9f9; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Contact Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #666; width: 80px;">Name</td><td style="padding: 4px 0; font-weight: bold;">${ticket.name}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Email</td><td style="padding: 4px 0;">${ticket.email}</td></tr>
          ${ticket.phone ? `<tr><td style="padding: 4px 0; color: #666;">Phone</td><td style="padding: 4px 0;">${ticket.phone}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #666;">Date</td><td style="padding: 4px 0;">${new Date().toLocaleString()}</td></tr>
        </table>
      </div>
      <div style="background: #e3f2fd; border-left: 4px solid #1565c0; border-radius: 4px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Subject</h2>
        <p style="margin: 0; font-weight: bold; color: #0d47a1;">${ticket.subject}</p>
      </div>
      <div>
        <h2 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Message</h2>
        <div style="background: #f9f9f9; border-radius: 6px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${ticket.message}</div>
      </div>
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px;">
        Log in to the admin dashboard to manage this ticket.
      </div>
    </div>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from: 'chatbot@notifications.yourdomain.com',
      to: school.staff_email,
      subject: `🎫 New Ticket — ${ticket.subject} — ${school.name}`,
      html,
    });
  } catch (error) {
    console.error('Ticket email failed:', error.message);
  }
}
