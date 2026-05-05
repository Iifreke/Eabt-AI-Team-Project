import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-500 text-sm mb-8">Overview of chatbot activity</p>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatsCard label="Total Leads" value={stats?.totalLeads} icon="👥" color="blue" />
              <StatsCard label="Active Conversations" value={stats?.activeConversations} icon="💬" color="green" />
              <StatsCard label="Pending Escalations" value={stats?.pendingEscalations} icon="🚨" color="red" />
              <StatsCard label="Total Conversations" value={stats?.totalConversations} icon="📊" color="amber" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Backock Leads</div>
                <div className="text-4xl font-bold text-gray-900">{stats?.leadsBySchool?.backock ?? '—'}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">ABU Leads</div>
                <div className="text-4xl font-bold text-gray-900">{stats?.leadsBySchool?.abu ?? '—'}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-700 mb-4">Recent Leads</div>
              {!stats?.recentLeads?.length ? (
                <p className="text-gray-400 text-sm">No leads yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Email</th>
                      <th className="pb-2 pr-4 font-medium">School</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentLeads.map((lead, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-medium">{lead.name || '—'}</td>
                        <td className="py-2 pr-4 text-gray-500">{lead.email || '—'}</td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                            {lead.schools?.slug?.toUpperCase() || '—'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-400">
                          {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
