import { applyCors } from '../../src/utils/cors.js';
import { requireAuth, requireSuperAdmin, getProfile } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // GET /api/admin/users  — list all admin profiles (any authenticated admin)
  if (req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { data: profiles, error } = await supabase
      .from('admin_profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('list users error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }

    return res.status(200).json({ users: profiles || [] });
  }

  // POST /api/admin/users  — invite a new admin (super_admin only)
  if (req.method === 'POST') {
    const caller = await requireSuperAdmin(req, res);
    if (!caller) return;

    const { email, fullName, role = 'admin' } = req.body;

    if (!email || !fullName) {
      return res.status(400).json({ error: 'email and fullName are required' });
    }
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    try {
      // Invite user via Supabase (sends magic-link / invite email)
      const siteUrl = process.env.SITE_URL
        || (req.headers['x-forwarded-proto'] && req.headers.host
            ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
            : req.headers.origin)
        || 'https://edutechbabcockabu.vercel.app';
      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/set-password`,
        data: { full_name: fullName },
      });

      if (inviteErr) {
        console.error('invite error:', inviteErr);
        return res.status(400).json({ error: inviteErr.message });
      }

      // Create their profile immediately so role is set before first login
      const { error: profileErr } = await supabase
        .from('admin_profiles')
        .upsert({
          id: invited.user.id,
          email,
          full_name: fullName,
          role,
          updated_at: new Date().toISOString(),
        });

      if (profileErr) throw profileErr;

      return res.status(200).json({ ok: true, userId: invited.user.id });
    } catch (error) {
      console.error('invite error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/admin/users  — update role or name (super_admin only)
  if (req.method === 'PATCH') {
    const caller = await requireSuperAdmin(req, res);
    if (!caller) return;

    const { userId, role, fullName } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const updates = { updated_at: new Date().toISOString() };
    if (role) {
      if (!['super_admin', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.role = role;
    }
    if (fullName) updates.full_name = fullName;

    const { error } = await supabase
      .from('admin_profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      console.error('update user error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }

    return res.status(200).json({ ok: true });
  }

  // DELETE /api/admin/users  — remove an admin (super_admin only)
  if (req.method === 'DELETE') {
    const caller = await requireSuperAdmin(req, res);
    if (!caller) return;

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Prevent self-deletion
    if (userId === caller.id) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }

    try {
      await supabase.from('admin_profiles').delete().eq('id', userId);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('delete user error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).end();
}
