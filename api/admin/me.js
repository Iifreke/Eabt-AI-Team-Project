import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

const VALID_STATUSES = ['online', 'away', 'invisible'];

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // PATCH — any authenticated admin can update their own status
  if (req.method === 'PATCH') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be online, away, or invisible.' });
    }

    const { error } = await supabase
      .from('admin_profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) {
      console.error('update status error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    return res.status(200).json({ ok: true, status });
  }

  return res.status(405).end();
}
