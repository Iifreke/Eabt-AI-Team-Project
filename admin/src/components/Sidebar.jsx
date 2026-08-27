import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import { useEscalation } from '../context/EscalationContext.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

const baseNav = [
  { to: '/chats',      label: 'Chats',      icon: '💬' },
  { to: '/tickets',    label: 'Tickets',    icon: '🎫' },
  { to: '/contacts',   label: 'Contacts',   icon: '👥' },
  { to: '/history',    label: 'History',    icon: '🗂️' },
  { to: '/agents',     label: 'Team & Activity', icon: '🟢' },
  { to: '/shortcuts',  label: 'Shortcuts',  icon: '⚡' },
  { to: '/monitoring', label: 'Monitoring', icon: '👁️' },
];

const superAdminNav = [
  { to: '/dashboard',     label: 'Overview',       icon: '📊' },
  { to: '/knowledge-base',label: 'Knowledge Base', icon: '📚' },
];

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Agent' };
const ROLE_COLOR = { super_admin: 'bg-purple-600', admin: 'bg-blue-600' };

// Online/away is now automatic (derived from heartbeat recency server-side) —
// the only manual choice left is opting out entirely via "Invisible".
const STATUS_OPTIONS = [
  { value: 'online',    label: 'Online (auto)', dot: 'bg-green-400' },
  { value: 'invisible', label: 'Invisible',     dot: 'bg-gray-400' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { selectedSchool, setSelectedSchool } = useSchool();
  const { profile } = useUser();
  const { pendingCount } = useEscalation();
  const [statusOpen, setStatusOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Heartbeat — keeps updated_at fresh so the server-side auto online/away
  // derivation (src/utils/presence.js) sees this agent as present in real time.
  React.useEffect(() => {
    if (!profile?.id) return;
    api.heartbeat().catch(() => {});
    const interval = setInterval(() => api.heartbeat().catch(() => {}), 20000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  const isSuperAdmin = profile?.role === 'super_admin';
  const navItems = isSuperAdmin ? [...superAdminNav, ...baseNav] : baseNav;

  // While this sidebar is mounted, heartbeat is firing, so we're online by
  // definition — the only thing to reflect here is an explicit invisible opt-out.
  const agentStatus = (localStatus ?? profile?.status) === 'invisible' ? 'invisible' : 'online';
  const currentStatusDot = STATUS_OPTIONS.find(s => s.value === agentStatus)?.dot || 'bg-green-400';

  // Sync localStatus when profile loads/changes from DB
  React.useEffect(() => {
    if (profile?.status) setLocalStatus(profile.status);
  }, [profile?.status]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleStatusChange = async (value) => {
    setStatusOpen(false);
    setLocalStatus(value); // optimistic — shows instantly in sidebar
    try {
      await api.updateMyStatus(value); // server-side update bypasses RLS
    } catch {
      setLocalStatus(profile?.status ?? 'online'); // revert on failure
    }
  };

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-50">
      <div className="p-5 border-b border-gray-700">
        <div className="text-base font-bold">School Bot Admin</div>
        <div className="text-xs text-gray-400 mt-0.5">Management Dashboard</div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span>{icon}</span>
            <span className="flex-1">{label}</span>
            {to === '/chats' && pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-3">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">School</label>
          <select
            value={selectedSchool === 'backock' ? 'babcock' : selectedSchool}
            onChange={e => setSelectedSchool(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Schools</option>
            <option value="babcock">Babcock University</option>
            <option value="abu">ABU (Ahmadu Bello University)</option>
          </select>
        </div>

        {profile && (
          <div className="bg-gray-800 rounded-lg px-3 py-2 relative">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-white truncate">{profile.full_name || profile.email}</span>
              <span className={`text-xs text-white px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLOR[profile.role] || 'bg-gray-600'}`}>
                {ROLE_LABEL[profile.role] || profile.role}
              </span>
            </div>
            <div className="text-xs text-gray-400 truncate mb-1.5">{profile.email}</div>

            {/* Agent status toggle */}
            <button
              onClick={() => setStatusOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
            >
              <span className={`w-2 h-2 rounded-full ${currentStatusDot}`} />
              <span className="capitalize">{agentStatus}</span>
              <span className="ml-auto opacity-50">▾</span>
            </button>

            {statusOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-700 rounded-lg overflow-hidden shadow-lg z-10">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-gray-600 text-left"
                  >
                    <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                    {opt.label}
                    {agentStatus === opt.value && <span className="ml-auto">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setShowChangePassword(true)}
          className="w-full text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors text-left"
        >
          Change Password
        </button>

        <button
          onClick={handleLogout}
          className="w-full text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors text-left"
        >
          Sign out
        </button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
