import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { schoolId } = req.query;

    const school = await getSchool(schoolId, res);
    if (!school) return;

    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name, file_type, file_size, chunk_count, status, error_message, created_at')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ documents });
  } catch (error) {
    console.error('list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
