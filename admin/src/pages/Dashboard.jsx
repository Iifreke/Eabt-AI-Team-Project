import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { useSchool } from '../context/SchoolContext.jsx';
import { useUser } from '../context/UserContext.jsx';

const SLUG_DISPLAY = { backock: 'Babcock', babcock: 'Babcock', abu: 'ABU' };
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
  const { profile } = useUser();
  const [tab, setTab] = useState('overview'); // 'overview' | 'agent'
  const [selectedAgent, setSelectedAgent] = useState('');
  const [agentsList, setAgentsList] = useState([]);
  const [range, setRange] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(() => {
    setLoading(true);
    const params = {};
    if (selectedSchool !== 'all') params.schoolId = selectedSchool;
    if (range) params.range = range;
    if (tab === 'agent' && selectedAgent) params.agentName = selectedAgent;
    api.stats(params)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSchool, range, tab, selectedAgent]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    api.listUsers()
      .then(data => {
        setAgentsList(data.users || []);
        if (profile?.full_name) {
          setSelectedAgent(profile.full_name);
        } else if (data.users?.length > 0) {
          setSelectedAgent(data.users[0].full_name);
        }
      })
      .catch(console.error);
  }, [profile]);

  const schoolLabel = selectedSchool === 'all' ? 'All Schools'
    : (selectedSchool === 'backock' || selectedSchool === 'babcock') ? 'Babcock University' : 'ABU';

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tab === 'overview' ? 'Overview' : 'Agent Dashboard'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{schoolLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tab Selector */}
            <div className="flex bg-gray-100 p-1 rounded-lg mr-2">
              <button
                onClick={() => setTab('overview')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === 'overview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                School Overview
              </button>
              <button
                onClick={() => setTab('agent')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === 'agent' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Agent Dashboard
              </button>
            </div>

            {/* Range Selector (Only visible for overview) */}
            {tab === 'overview' && (
              <div className="flex gap-1.5">
                {RANGES.map(r => (
                  <button key={r.value} onClick={() => setRange(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      range === r.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ── */}
            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Primary stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard label="Total Contacts" value={stats?.totalLeads} icon="👥" color="blue" />
                  <StatsCard label="Chats Served" value={stats?.humanAssistedCount} icon="💬" color="green" />
                  <StatsCard label="AI Resolved" value={stats?.aiOnlyCount} icon="🤖" color="amber" />
                  <StatsCard label="Avg CSAT" value={stats?.avgCsat != null ? `${stats.avgCsat} ★` : '—'} icon="⭐" color="purple" />
                </div>

                {/* Secondary stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard label="Active Chats" value={stats?.activeConversations} icon="🟢" color="green" />
                  <StatsCard label="Pending Chats" value={stats?.pendingEscalations} icon="🚨" color="red" />
                  <StatsCard label="Open Tickets" value={stats?.openTickets} icon="🎫" color="amber" />
                  <StatsCard label="Resolved Chats" value={stats?.resolvedChats} icon="✅" color="blue" />
                </div>

                {/* Contacts trend chart */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Babcock Contacts</div>
                      <div className="text-4xl font-bold text-gray-900">
                        {((stats?.leadsBySchool?.babcock || 0) + (stats?.leadsBySchool?.backock || 0)) || '0'}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ABU Contacts</div>
                      <div className="text-4xl font-bold text-gray-900">{stats?.leadsBySchool?.abu ?? '0'}</div>
                    </div>
                  </div>
                )}

                {/* Agent performance */}
                {stats?.agentPerformance?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                            <td className="py-2 pr-4 font-medium">
                              <button
                                onClick={() => { setSelectedAgent(a.agent); setTab('agent'); }}
                                className="text-blue-600 hover:underline font-medium text-left"
                                title="View agent dashboard"
                              >
                                {a.agent}
                              </button>
                            </td>
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
              </div>
            )}

            {/* ── AGENT DASHBOARD TAB ── */}
            {tab === 'agent' && (
              <div className="space-y-6">
                {/* Agent Selector */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-700">Select Agent to Track</h2>
                    <p className="text-xs text-gray-500 mt-0.5">View performance metrics and attended leads</p>
                  </div>
                  <select
                    value={selectedAgent}
                    onChange={e => setSelectedAgent(e.target.value)}
                    className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                  >
                    <option value="">Choose an agent...</option>
                    {agentsList.map(a => (
                      <option key={a.id} value={a.full_name}>{a.full_name}</option>
                    ))}
                  </select>
                </div>

                {selectedAgent ? (
                  <>
                    {/* Agent performance breakdown cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Attended counts card */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">💬 Leads Attended</div>
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">Today</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.served?.today ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">This Week</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.served?.week ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">This Month</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.served?.month ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm pt-0.5">
                            <span className="text-gray-700 font-medium">All Time</span>
                            <span className="font-extrabold text-blue-600 text-lg">{stats?.agentStats?.served?.allTime ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Resolved counts card */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">✅ Chats Resolved</div>
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">Today</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.resolved?.today ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">This Week</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.resolved?.week ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1.5">
                            <span className="text-gray-600">This Month</span>
                            <span className="font-bold text-gray-900 text-base">{stats?.agentStats?.resolved?.month ?? 0}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm pt-0.5">
                            <span className="text-gray-700 font-medium">All Time</span>
                            <span className="font-extrabold text-green-600 text-lg">{stats?.agentStats?.resolved?.allTime ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Performance details card */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">⏱️ Avg Response Time</div>
                          <div className="text-4xl font-extrabold text-purple-600 mt-2">
                            {stats?.agentStats?.avgResponseMs != null
                              ? stats.agentStats.avgResponseMs < 60000
                                ? `${Math.round(stats.agentStats.avgResponseMs / 1000)}s`
                                : `${Math.round(stats.agentStats.avgResponseMs / 60000)}m`
                              : '—'}
                          </div>
                          <p className="text-xs text-gray-400 mt-2">Average time from escalation assignment to first agent reply.</p>
                        </div>
                        <div className="border-t border-gray-100 pt-3 mt-3">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</div>
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-700 font-medium capitalize">
                            <span className={`w-2 h-2 rounded-full ${
                              agentsList.find(a => a.full_name === selectedAgent)?.status === 'online' ? 'bg-green-400' : 'bg-gray-400'
                            }`} />
                            {agentsList.find(a => a.full_name === selectedAgent)?.status || 'offline'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Activity trend bar chart */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-sm font-semibold text-gray-700 mb-4">Daily Response Activity (Past 30 Days)</div>
                      <TrendBar data={stats?.agentStats?.leadsTrend} />
                      {stats?.agentStats?.leadsTrend?.length > 0 && (
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-gray-400">{stats.agentStats.leadsTrend[0]?.date}</span>
                          <span className="text-xs text-gray-400">{stats.agentStats.leadsTrend[stats.agentStats.leadsTrend.length - 1]?.date}</span>
                        </div>
                      )}
                    </div>

                    {/* Leads attended to list */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-sm font-semibold text-gray-700 mb-4">Leads Attended To</div>
                      {!stats?.agentStats?.recentLeads?.length ? (
                        <p className="text-gray-400 text-sm py-4 text-center">No leads attended to yet by this agent.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-100">
                              <th className="pb-2 pr-4 font-medium">Name</th>
                              <th className="pb-2 pr-4 font-medium">Email</th>
                              <th className="pb-2 pr-4 font-medium">School</th>
                              <th className="pb-2 pr-4 font-medium">Status</th>
                              <th className="pb-2 font-medium">Assigned Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.agentStats.recentLeads.map((lead, i) => (
                              <tr key={i} className="border-b border-gray-50 last:border-0">
                                <td className="py-2.5 pr-4 font-medium text-gray-900">{lead.name || '—'}</td>
                                <td className="py-2.5 pr-4 text-gray-500">{lead.email || '—'}</td>
                                <td className="py-2.5 pr-4">
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                    {schoolDisplayName(lead.schools?.slug)}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    lead.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {lead.status === 'resolved' ? 'Resolved' : 'In Progress'}
                                  </span>
                                </td>
                                <td className="py-2.5 text-gray-400">
                                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-10 bg-white rounded-xl border border-gray-200">
                    Please select an agent from the dropdown to view their dashboard.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
