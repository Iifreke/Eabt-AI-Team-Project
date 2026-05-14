import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { status, schoolId } = req.query;

    let query = supabase
      .from('escalations')
      .select('*, leads(name, email, phone), schools(name, slug)');

    if (status) query = query.eq('status', status);

    if (schoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('id')
        .eq('slug', schoolId)
        .single();
      if (school) query = query.eq('school_id', school.id);
    }

    const { data: escalations, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ escalations: escalations || [] });
  } catch (error) {
    console.error('escalations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
