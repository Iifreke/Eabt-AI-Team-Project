import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const SLUG_DISPLAY = { backock: 'Babcock', abu: 'ABU' };
const schoolDisplayName = (slug) => SLUG_DISPLAY[slug] || slug?.toUpperCase() || '—';

const RANGES = [
  { value: '',      label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

function TrendBar({ data }) {
  if (!data?.length) return <p className="text-gray-400 text-sm">No data for this period.</p>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(({ date, count }) => (
        <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-blue-500 rounded-sm transition-all duration-200 group-hover:bg-blue-600"
            style={{ height: `${Math.max(4, (count / max) * 80)}px` }}
          />
          <div className="absolute bottom-full mb-1 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
            {date}: {count}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { selectedSchool } = useSchool();
  const [range, setRange] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(() => {
    setLoading(true);
    const params = {};
    if (selectedSchool !== 'all') params.schoolId = selectedSchool;
    if (range) params.range = range;
    api.stats(params)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSchool, range]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const schoolLabel = selectedSchool === 'all' ? 'All Schools'
    : selectedSchool === 'backock' ? 'Babcock University' : 'ABU';

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
            <p className="text-gray-500 text-sm mt-0.5">{schoolLabel}</p>
          </div>

          <div className="flex gap-2">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  range === r.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            {/* Primary stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatsCard label="Total Contacts" value={stats?.totalLeads} icon="👥" color="blue" />
              <StatsCard label="Chats Served" value={stats?.humanAssistedCount} icon="💬" color="green" />
              <StatsCard label="AI Resolved" value={stats?.aiOnlyCount} icon="🤖" color="amber" />
              <StatsCard label="Avg CSAT" value={stats?.avgCsat != null ? `${stats.avgCsat} ★` : '—'} icon="⭐" color="purple" />
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatsCard label="Active Chats" value={stats?.activeConversations} icon="🟢" color="green" />
              <StatsCard label="Pending Chats" value={stats?.pendingEscalations} icon="🚨" color="red" />
              <StatsCard label="Open Tickets" value={stats?.openTickets} icon="🎫" color="amber" />
              <StatsCard label="Resolved Chats" value={stats?.resolvedChats} icon="✅" color="blue" />
            </div>

            {/* Contacts trend chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="text-sm font-semibold text-gray-700 mb-4">Contacts Over Time</div>
              <TrendBar data={stats?.leadsTrend} />
              {stats?.leadsTrend?.length > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">{stats.leadsTrend[0]?.date}</span>
                  <span className="text-xs text-gray-400">{stats.leadsTrend[stats.leadsTrend.length - 1]?.date}</span>
                </div>
              )}
            </div>

            {/* AI vs Human */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🤖 AI Only</div>
                <div className="text-4xl font-bold text-amber-600">{stats?.aiOnlyCount ?? '—'}</div>
                <div className="text-xs text-gray-400 mt-1">Conversations resolved without human</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🧑‍💼 Human Assisted</div>
                <div className="text-4xl font-bold text-green-600">{stats?.humanAssistedCount ?? '—'}</div>
                <div className="text-xs text-gray-400 mt-1">Conversations handled by an agent</div>
              </div>
            </div>

            {/* Per-school breakdown */}
            {selectedSchool === 'all' && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Babcock Contacts</div>
                  <div className="text-4xl font-bold text-gray-900">{stats?.leadsBySchool?.backock ?? '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ABU Contacts</div>
                  <div className="text-4xl font-bold text-gray-900">{stats?.leadsBySchool?.abu ?? '—'}</div>
                </div>
              </div>
            )}

            {/* Agent performance */}
            {stats?.agentPerformance?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="text-sm font-semibold text-gray-700 mb-4">Agent Performance</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Agent</th>
                      <th className="pb-2 pr-4 font-medium">Chats Served</th>
                      <th className="pb-2 pr-4 font-medium">Chats Resolved</th>
                      <th className="pb-2 pr-4 font-medium">Avg Response Time</th>
                      <th className="pb-2 font-medium">Users Served</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.agentPerformance.map((a, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-medium">{a.agent}</td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{a.served}</span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{a.resolved}</span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                            {a.avgResponseMs != null
                              ? a.avgResponseMs < 60000
                                ? `${Math.round(a.avgResponseMs / 1000)}s`
                                : `${Math.round(a.avgResponseMs / 60000)}m`
                              : '—'}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                            {a.usersRespondedTo ?? 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent contacts */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-700 mb-4">Recent Contacts</div>
              {!stats?.recentLeads?.length ? (
                <p className="text-gray-400 text-sm">No contacts yet.</p>
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
                            {schoolDisplayName(lead.schools?.slug)}
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
