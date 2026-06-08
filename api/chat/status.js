import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { count: onlineCount } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'online');

    return res.status(200).json({ adminsOnline: (onlineCount || 0) > 0 });
  } catch {
    return res.status(200).json({ adminsOnline: false });
  }
}
