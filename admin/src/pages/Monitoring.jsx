import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const SLUG_DISPLAY = { backock: 'BABCOCK', abu: 'ABU' };
const schoolBadge = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

export default function Monitoring() {
  const { selectedSchool } = useSchool();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const params = { stage: 'active', limit: 50 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      const data = await api.conversations(params);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedSchool]);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetch]);

  const msAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monitoring</h1>
            <p className="text-gray-500 text-sm mt-0.5">Live view of active conversations — refreshes every 30s</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {conversations.length} visitor{conversations.length !== 1 ? 's' : ''} online
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : !conversations.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            No active conversations right now.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Visitor</th>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Last Activity</th>
                  <th className="px-5 py-3 font-medium">Messages</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map(conv => (
                  <tr key={conv.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{conv.leads?.name || 'Anonymous'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                        {schoolBadge(conv.schools?.slug)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{msAgo(conv.updated_at)}</td>
                    <td className="px-5 py-3 text-gray-500">{conv.message_count ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 capitalize">
                        {conv.stage}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
