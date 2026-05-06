import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';

const baseNav = [
  { to: '/dashboard',     label: 'Dashboard',      icon: '📊' },
  { to: '/leads',         label: 'Leads',           icon: '👥' },
  { to: '/conversations', label: 'Conversations',   icon: '💬' },
  { to: '/escalations',   label: 'Escalations',     icon: '🚨' },
  { to: '/knowledge-base',label: 'Knowledge Base',  icon: '📚' },
];

const superAdminNav = [
  { to: '/users', label: 'Team Members', icon: '🔐' },
];

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin' };
const ROLE_COLOR = { super_admin: 'bg-purple-600', admin: 'bg-blue-600' };

export default function Sidebar() {
  const navigate = useNavigate();
  const { selectedSchool, setSelectedSchool } = useSchool();
  const { profile } = useUser();

  const isSuperAdmin = profile?.role === 'super_admin';
  const navItems = isSuperAdmin ? [...baseNav, ...superAdminNav] : baseNav;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
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
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-3">
        {/* School filter */}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">School</label>
          <select
            value={selectedSchool}
            onChange={e => setSelectedSchool(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Schools</option>
            <option value="backock">Babcock University</option>
            <option value="abu">ABU (Ahmadu Bello University)</option>
          </select>
        </div>

        {/* Current user info */}
        {profile && (
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-white truncate">{profile.full_name || profile.email}</span>
              <span className={`text-xs text-white px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLOR[profile.role] || 'bg-gray-600'}`}>
                {ROLE_LABEL[profile.role] || profile.role}
              </span>
            </div>
            <div className="text-xs text-gray-400 truncate">{profile.email}</div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
