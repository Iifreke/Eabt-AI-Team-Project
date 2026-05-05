import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSchool } from '../context/SchoolContext.jsx';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/leads', label: 'Leads', icon: '👥' },
  { to: '/conversations', label: 'Conversations', icon: '💬' },
  { to: '/escalations', label: 'Escalations', icon: '🚨' },
  { to: '/knowledge-base', label: 'Knowledge Base', icon: '📚' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { selectedSchool, setSelectedSchool } = useSchool();
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email || '');
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-50">
      <div className="p-6 border-b border-gray-700">
        <div className="text-lg font-bold">School Bot Admin</div>
        <div className="text-xs text-gray-400 mt-1">Management Dashboard</div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
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

      <div className="p-4 border-t border-gray-700">
        <div className="mb-3">
          <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">
            School
          </label>
          <select
            value={selectedSchool}
            onChange={e => setSelectedSchool(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Schools</option>
            <option value="backock">Backock School</option>
            <option value="abu">ABU</option>
          </select>
        </div>

        <div className="text-xs text-gray-500 truncate mb-2">{userEmail}</div>
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
