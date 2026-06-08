import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const now = Date.now();
    const tenMinAgo  = new Date(now - 10 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    // online → away  after 10 min of inactivity
    await supabase
      .from('admin_profiles')
      .update({ status: 'away', updated_at: new Date(now).toISOString() })
      .eq('status', 'online')
      .lt('updated_at', tenMinAgo);

    // away → invisible  after 1 hour of inactivity
    await supabase
      .from('admin_profiles')
      .update({ status: 'invisible', updated_at: new Date(now).toISOString() })
      .eq('status', 'away')
      .lt('updated_at', oneHourAgo);

    const { count: onlineCount } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'online');

    return res.status(200).json({ adminsOnline: (onlineCount || 0) > 0 });
  } catch {
    return res.status(200).json({ adminsOnline: false });
  }
}
