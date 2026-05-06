import { createClient } from '@supabase/supabase-js';
import supabase from '../db/supabase.js';

export async function requireAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const token = authHeader.split(' ')[1];

  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: { user }, error } = await anonClient.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }

  return user;
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from('admin_profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();
  return data || null;
}

export async function requireSuperAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const profile = await getProfile(user.id);
  if (!profile || profile.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required' });
    return null;
  }

  return { ...user, profile };
}
