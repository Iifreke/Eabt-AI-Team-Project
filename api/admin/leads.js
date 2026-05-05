import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { schoolId, page = '1', limit = '20', search } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('leads')
      .select('id, name, email, phone, zoho_contact_id, zoho_synced_at, created_at, schools(name, slug)', {
        count: 'exact',
      });

    if (schoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('id')
        .eq('slug', schoolId)
        .single();
      if (school) query = query.eq('school_id', school.id);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: leads, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    return res.status(200).json({ leads: leads || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('leads error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
