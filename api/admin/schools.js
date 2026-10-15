import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { data: schools, error } = await supabase
      .from('schools')
      .select('id, name, slug')
      .order('name', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ schools: schools || [] });
  } catch (error) {
    console.error('schools error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
