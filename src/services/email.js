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

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    await resend.emails.send({
      from: fromAddress,
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

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    await resend.emails.send({
      from: fromAddress,
      to: school.staff_email,
      subject: `🎫 New Ticket — ${ticket.subject} — ${school.name}`,
      html,
    });
  } catch (error) {
    console.error('Ticket email failed:', error.message);
  }
}

/**
 * Send a reply email to the visitor/lead when admin responds to their ticket.
 * @param {{ school: object, ticket: object, staffReply: string }} opts
 */
export async function sendTicketReplyEmail({ school, ticket, staffReply }) {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <div style="background: #1565c0; padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 20px;">📩 Reply to Your Support Ticket</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">${school.name} — Support Team</p>
    </div>

    <div style="padding: 24px;">
      <p style="font-size: 15px; color: #333; margin: 0 0 16px;">Hi <strong>${ticket.name}</strong>,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">
        Our support team has responded to your ticket: <strong>${ticket.subject}</strong>
      </p>

      <div style="background: #e3f2fd; border-left: 4px solid #1565c0; border-radius: 4px; padding: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Support Team's Reply</h2>
        <div style="font-size: 14px; color: #1a237e; line-height: 1.7; white-space: pre-wrap;">${staffReply}</div>
      </div>

      <div style="background: #f9f9f9; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #666; letter-spacing: 0.5px;">Your Original Message</h2>
        <p style="margin: 0; font-size: 13px; color: #666; font-style: italic; line-height: 1.6;">${ticket.message}</p>
      </div>

      <p style="font-size: 13px; color: #666; margin: 0;">
        If you have further questions, please reply to this email or visit our website.
        <br>Thank you for reaching out to <strong>${school.name}</strong>.
      </p>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
        This is a reply to ticket #${ticket.id?.slice(0, 8) || 'N/A'} submitted on ${new Date(ticket.created_at || Date.now()).toLocaleDateString()}.
      </div>
    </div>
  </div>
</body>
</html>`;

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'support@notifications.schoolbot.ng';

    await resend.emails.send({
      from: fromAddress,
      to: ticket.email,
      subject: `Re: ${ticket.subject} — ${school.name} Support`,
      html,
    });

    console.log(`Ticket reply email sent to ${ticket.email}`);
  } catch (error) {
    console.error('Ticket reply email failed:', error.message);
    // Do not rethrow — email failure should not block the API response
  }
}
