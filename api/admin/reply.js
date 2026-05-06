import { applyCors } from '../../src/utils/cors.js';
import { requireAuth, getProfile } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message?.trim()) {
      return res.status(400).json({ error: 'conversationId and message are required' });
    }

    // Load conversation
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, messages, stage')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Only allow replies on escalated conversations
    if (conv.stage !== 'escalated') {
      return res.status(400).json({ error: 'Can only reply to escalated conversations' });
    }

    // Look up the admin's display name from their profile
    const profile = await getProfile(user.id);
    const adminName = profile?.full_name || user.email || 'Support Agent';

    // Append admin message with their real name
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    messages.push({
      role: 'admin',
      content: message.trim(),
      ts: Date.now(),
      adminName,
    });

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true, messages });
  } catch (error) {
    console.error('admin reply error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
