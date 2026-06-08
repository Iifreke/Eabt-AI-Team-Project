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

const STATUS_CONFIG = {
  online:    { dot: 'bg-green-400',  label: 'Online',    text: 'text-green-700',  bg: 'bg-green-50'  },
  away:      { dot: 'bg-yellow-400', label: 'Away',      text: 'text-yellow-700', bg: 'bg-yellow-50' },
  invisible: { dot: 'bg-gray-400',   label: 'Invisible', text: 'text-gray-500',   bg: 'bg-gray-100'  },
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

  const statusCfg = STATUS_CONFIG[user.status] || STATUS_CONFIG.invisible;

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
      <td className="px-5 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.label}
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

const STAGE_CONFIG = {
  active:     { label: 'Active',     bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  onboarding: { label: 'Onboarding', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  escalated:  { label: 'Escalated',  bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  resolved:   { label: 'Resolved',   bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400'  },
};

const ESC_STATUS_CONFIG = {
  in_progress: { label: 'Active',   bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  pending:     { label: 'Pending',  bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  resolved:    { label: 'Resolved', bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400'  },
};

function AgentConversationsPanel({ stat, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="font-bold text-gray-900">{stat.name}</div>
            <div className="text-xs text-gray-400">{stat.email} · {stat.total} conversation{stat.total !== 1 ? 's' : ''} total</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {!stat.conversations.length ? (
            <p className="text-sm text-gray-400 text-center py-8">No conversations yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="pb-2 text-left font-medium">User</th>
                  <th className="pb-2 text-left font-medium">School</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {stat.conversations.map(c => {
                  const cfg = ESC_STATUS_CONFIG[c.status] || ESC_STATUS_CONFIG.resolved;
                  return (
                    <tr key={c.escalationId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-gray-900">{c.lead?.name || '—'}</div>
                        <div className="text-xs text-gray-400">{c.lead?.email || ''}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{c.school}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-gray-400">
                        {c.startedAt ? new Date(c.startedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const navigate = useNavigate();
  const { profile, loadingProfile } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [agentStats, setAgentStats] = useState([]);
  const [botStats, setBotStats] = useState({ total: 0, active: 0, escalated: 0, resolved: 0, conversations: [] });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [botFilter, setBotFilter] = useState('active'); // 'active' | 'all' | 'resolved'

  // Guard: redirect non-super-admins
  useEffect(() => {
    if (!loadingProfile && profile?.role !== 'super_admin') {
      navigate('/dashboard');
    }
  }, [profile, loadingProfile, navigate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, statsData] = await Promise.all([api.listUsers(), api.agentStats()]);
      setUsers(userData.users || []);
      setAgentStats(statsData.agentStats || []);
      setBotStats(statsData.botStats || { total: 0, active: 0, escalated: 0, conversations: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Silent refresh every 5s — uses service-key API so RLS doesn't block it
  const silentRefresh = useCallback(async () => {
    try {
      const [userData, statsData] = await Promise.all([api.listUsers(), api.agentStats()]);
      if (userData.users) setUsers(userData.users);
      if (statsData?.agentStats) setAgentStats(statsData.agentStats);
      if (statsData?.botStats) setBotStats(statsData.botStats);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const poll = setInterval(silentRefresh, 5000);
    return () => clearInterval(poll);
  }, [silentRefresh]);

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
                  <th className="px-5 py-3 font-medium">Status</th>
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

      {/* ── HUMAN AGENT CONVERSATION LOAD ── */}
      <div className="mt-8 max-w-4xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">Conversation Load</h2>
          <p className="text-gray-500 text-sm mt-0.5">Users each agent is attending to or has attended</p>
        </div>

        {agentStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-400">No data yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-5 lg:grid-cols-3">
              {agentStats.map(stat => {
                const statusCfg = STATUS_CONFIG[stat.status] || STATUS_CONFIG.invisible;
                return (
                  <button key={stat.id} onClick={() => setSelectedAgent(stat)}
                    className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                      <span className="font-semibold text-sm text-gray-900 truncate">{stat.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-xl font-bold text-gray-900">{stat.total}</div><div className="text-xs text-gray-400">Total</div></div>
                      <div><div className="text-xl font-bold text-blue-600">{stat.active}</div><div className="text-xs text-gray-400">Active</div></div>
                      <div><div className="text-xl font-bold text-green-600">{stat.resolved}</div><div className="text-xs text-gray-400">Resolved</div></div>
                    </div>
                    <div className="mt-3 text-xs text-blue-500 font-medium">View conversations →</div>
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-center">Total</th>
                    <th className="px-5 py-3 font-medium text-center">Active</th>
                    <th className="px-5 py-3 font-medium text-center">Resolved</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map(stat => {
                    const statusCfg = STATUS_CONFIG[stat.status] || STATUS_CONFIG.invisible;
                    return (
                      <tr key={stat.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{stat.name}</div>
                          <div className="text-xs text-gray-400">{stat.email}</div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center font-bold text-gray-900">{stat.total}</td>
                        <td className="px-5 py-3 text-center font-bold text-blue-600">{stat.active}</td>
                        <td className="px-5 py-3 text-center font-bold text-green-600">{stat.resolved}</td>
                        <td className="px-5 py-3">
                          <button onClick={() => setSelectedAgent(stat)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">View →</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── AI BOT CONVERSATION LOAD ── */}
      <div className="mt-10 max-w-4xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">AI Bot — Conversation Load</h2>
          <p className="text-gray-500 text-sm mt-0.5">Users the AI bot is currently attending to or has attended</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-gray-900">{botStats.total}</div>
            <div className="text-xs text-gray-400 mt-1">Total Users</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-blue-600">{botStats.active}</div>
            <div className="text-xs text-blue-500 mt-1">Currently Active</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-orange-600">{botStats.escalated}</div>
            <div className="text-xs text-orange-500 mt-1">Escalated to Human</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-green-600">{botStats.resolved}</div>
            <div className="text-xs text-green-500 mt-1">Resolved</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex gap-1">
              {[
                { key: 'active',   label: 'Active' },
                { key: 'resolved', label: 'Resolved' },
                { key: 'all',      label: 'All' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setBotFilter(f.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    botFilter === f.key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const rows = botFilter === 'all'
              ? botStats.conversations
              : botFilter === 'resolved'
              ? botStats.conversations.filter(c => c.stage === 'resolved')
              : botStats.conversations.filter(c => c.stage === 'active' || c.stage === 'onboarding');
            if (!rows.length) return <p className="text-sm text-gray-400 text-center py-8">No conversations to show.</p>;
            return (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">User</th>
                    <th className="px-5 py-3 text-left font-medium">School</th>
                    <th className="px-5 py-3 text-left font-medium">Stage</th>
                    <th className="px-5 py-3 text-left font-medium">Messages</th>
                    <th className="px-5 py-3 text-left font-medium">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(c => {
                    const stageCfg = STAGE_CONFIG[c.stage] || { label: c.stage, bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' };
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{c.lead?.name || '—'}</div>
                          <div className="text-xs text-gray-400">{c.lead?.email || ''}</div>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">{c.school}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stageCfg.bg} ${stageCfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${stageCfg.dot}`} />
                            {stageCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700 font-medium">{c.messageCount}</td>
                        <td className="px-5 py-3 text-xs text-gray-400">
                          {c.lastActivity ? new Date(c.lastActivity).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={fetchUsers}
        />
      )}

      {selectedAgent && (
        <AgentConversationsPanel
          stat={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
