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
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://elcugbusrvbrpbhwsrev.supabase.co',
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3VnYnVzcnZicnBiaHdzcmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTY2NTAsImV4cCI6MjA5Mjg3MjY1MH0.Biy-na8wbeVhSl-wSMkAKwcujTZ2mX_PyusPGInGZ7o'
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
