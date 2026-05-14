import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useUser } from '../context/UserContext.jsx';

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin' };
const ROLE_COLOR = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
};

function InviteModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ fullName: '', email: '', role: 'admin' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.inviteUser(form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to invite user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Amaka Johnson"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="e.g. amaka@babcock.edu.ng"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="admin">Admin — can reply, manage knowledge base &amp; leads</option>
              <option value="super_admin">Super Admin — full access including user management</option>
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? 'Sending invite…' : 'Send Invite'}
            </button>
          </div>
        </form>
        <p className="text-xs text-gray-400 mt-3 text-center">
          They'll receive an email to set their password and log in.
        </p>
      </div>
    </div>
  );
}

function UserRow({ user, currentUserId, onRoleChange, onRemove }) {
  const [updating, setUpdating] = useState(false);
  const isSelf = user.id === currentUserId;

  const changeRole = async (newRole) => {
    setUpdating(true);
    try { await onRoleChange(user.id, newRole); } finally { setUpdating(false); }
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-5 py-3">
        <div className="font-medium text-gray-900 text-sm">{user.full_name || '—'}</div>
        <div className="text-xs text-gray-400">{user.email}</div>
      </td>
      <td className="px-5 py-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[user.role] || 'bg-gray-100 text-gray-600'}`}>
          {ROLE_LABEL[user.role] || user.role}
        </span>
      </td>
      <td className="px-5 py-3 text-xs text-gray-400">
        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
      </td>
      <td className="px-5 py-3">
        {!isSelf ? (
          <div className="flex items-center gap-2">
            <select
              value={user.role}
              onChange={e => changeRole(e.target.value)}
              disabled={updating}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <button
              onClick={() => onRemove(user.id, user.full_name || user.email)}
              disabled={updating}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">You</span>
        )}
      </td>
    </tr>
  );
}

export default function Users() {
  const navigate = useNavigate();
  const { profile, loadingProfile } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Guard: redirect non-super-admins
  useEffect(() => {
    if (!loadingProfile && profile?.role !== 'super_admin') {
      navigate('/dashboard');
    }
  }, [profile, loadingProfile, navigate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listUsers();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    await api.updateUser(userId, { role: newRole });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from the team? They will lose all access.`)) return;
    await api.removeUser(userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  if (loadingProfile || profile?.role !== 'super_admin') return null;

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
            <p className="text-gray-500 text-sm mt-1">Manage who has access to this admin dashboard</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Invite Member
          </button>
        </div>

        {/* Role legend */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Admin</span>
            </div>
            <p className="text-xs text-gray-500">Can view leads, conversations, escalations; reply to escalated chats; upload knowledge base documents.</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Super Admin</span>
            </div>
            <p className="text-xs text-gray-500">Full access — everything an admin can do, plus invite/remove team members and change roles.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : !users.length ? (
            <p className="text-gray-400 text-sm p-5">No team members yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Name / Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Added</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUserId={profile?.id}
                    onRoleChange={handleRoleChange}
                    onRemove={handleRemove}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={fetchUsers}
        />
      )}
    </div>
  );
}
