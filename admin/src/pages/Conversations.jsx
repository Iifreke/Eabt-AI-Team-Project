import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import ConversationViewer from '../components/ConversationViewer.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const STAGES = ['all', 'onboarding', 'active', 'escalated', 'resolved'];

const SLUG_DISPLAY = { backock: 'BABCOCK', babcock: 'BABCOCK', abu: 'ABU' };
const schoolBadge = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

const stageBadge = (stage) => {
  const map = {
    onboarding: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    escalated: 'bg-red-100 text-red-700',
    resolved: 'bg-gray-100 text-gray-500',
  };
  return `px-2 py-0.5 rounded-full text-xs font-medium ${map[stage] || 'bg-gray-100 text-gray-600'}`;
};

export default function Conversations() {
  const { selectedSchool } = useSchool();
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'grouped'

  // Flat mode state
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Grouped mode state
  const [leads, setLeads] = useState([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadConversations, setLeadConversations] = useState([]);
  const [leadConversationsLoading, setLeadConversationsLoading] = useState(false);

  // Shared viewer state
  const [viewingId, setViewingId] = useState(null);
  const [viewingConv, setViewingConv] = useState(null);

  // ── Flat mode fetch ──────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      // 'resolved' is a display-only filter — fetch escalated stage then filter client-side
      if (stage !== 'all' && stage !== 'resolved') params.stage = stage;
      if (stage === 'resolved') params.stage = 'escalated';
      const data = await api.conversations(params);
      let convs = data.conversations || [];
      // Client-side filter for 'resolved' (escalated + resolved escalation status)
      if (stage === 'resolved') convs = convs.filter(c => c.displayStage === 'resolved');
      setConversations(convs);
      setTotal(stage === 'resolved' ? convs.length : (data.total || 0));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, stage, selectedSchool]);

  useEffect(() => { setPage(1); }, [stage, selectedSchool]);
  useEffect(() => {
    if (viewMode === 'flat') fetchConversations();
  }, [viewMode, fetchConversations]);

  // ── Grouped mode: fetch leads ────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const params = { page: leadsPage, limit: 20 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      const data = await api.leads(params);
      setLeads(data.leads || []);
      setLeadsTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLeadsLoading(false);
    }
  }, [leadsPage, selectedSchool]);

  useEffect(() => {
    if (viewMode === 'grouped' && !selectedLead) fetchLeads();
  }, [viewMode, selectedLead, fetchLeads]);

  const handleLeadSelect = async (lead) => {
    setSelectedLead(lead);
    setLeadConversationsLoading(true);
    try {
      const data = await api.conversationsByLead(lead.id);
      setLeadConversations(data.conversations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLeadConversationsLoading(false);
    }
  };

  const handleViewModeSwitch = (mode) => {
    setViewMode(mode);
    setSelectedLead(null);
    setLeadConversations([]);
  };

  const flatTotalPages = Math.ceil(total / 20);
  const leadsTotalPages = Math.ceil(leadsTotal / 20);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">History</h1>
        <p className="text-gray-500 text-sm mb-6">
          {viewMode === 'flat' ? `${total} total conversations` : selectedLead ? `Conversations for ${selectedLead.name || selectedLead.email}` : `${leadsTotal} total users`}
        </p>

        {/* View toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => handleViewModeSwitch('flat')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'flat' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            All Conversations
          </button>
          <button
            onClick={() => handleViewModeSwitch('grouped')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'grouped' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            By User
          </button>
        </div>

        {/* Flat mode: stage filters */}
        {viewMode === 'flat' && (
          <div className="flex gap-2 mb-5">
            {STAGES.map(s => (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${stage === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        )}

        {/* Grouped mode: breadcrumb */}
        {viewMode === 'grouped' && selectedLead && (
          <div className="mb-5">
            <button
              onClick={() => { setSelectedLead(null); setLeadConversations([]); }}
              className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4"
            >
              ← Back to all users
            </button>
            <div className="bg-blue-50 rounded-xl p-4 mb-4">
              <div className="font-semibold text-gray-900">{selectedLead.name || '—'}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {selectedLead.email || '—'}{selectedLead.phone ? ` · ${selectedLead.phone}` : ''}
              </div>
            </div>
          </div>
        )}

        {/* ── Flat mode: conversations table ── */}
        {viewMode === 'flat' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center gap-2 text-gray-400 p-5">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            ) : !conversations.length ? (
              <p className="text-gray-400 text-sm p-5">No conversations found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-gray-500">
                    <th className="px-5 py-3 font-medium">Lead</th>
                    <th className="px-5 py-3 font-medium">School</th>
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 font-medium">Messages</th>
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map(conv => (
                    <tr
                      key={conv.id}
                      onClick={() => { setViewingId(conv.id); setViewingConv(conv); }}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3 font-medium">{conv.leads?.name || '—'}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          {schoolBadge(conv.schools?.slug)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={stageBadge(conv.displayStage || conv.stage)}>{conv.displayStage || conv.stage}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{conv.message_count ?? 0}</td>
                      <td className="px-5 py-3 text-gray-500">{conv.agent || '—'}</td>
                      <td className="px-5 py-3 text-gray-400">
                        {conv.updated_at ? new Date(conv.updated_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Grouped mode: leads list ── */}
        {viewMode === 'grouped' && !selectedLead && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {leadsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 p-5">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading users...
              </div>
            ) : !leads.length ? (
              <p className="text-gray-400 text-sm p-5">No users found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-gray-500">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">School</th>
                    <th className="px-5 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr
                      key={lead.id}
                      onClick={() => handleLeadSelect(lead)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3 font-medium">{lead.name || '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{lead.email || '—'}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          {schoolBadge(lead.schools?.slug)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400">
                        {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Grouped mode: selected lead's conversations ── */}
        {viewMode === 'grouped' && selectedLead && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {leadConversationsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 p-5">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading conversations...
              </div>
            ) : !leadConversations.length ? (
              <p className="text-gray-400 text-sm p-5">No conversations found for this user.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-gray-500">
                    <th className="px-5 py-3 font-medium">School</th>
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 font-medium">Messages</th>
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {leadConversations.map(conv => (
                    <tr
                      key={conv.id}
                      onClick={() => { setViewingId(conv.id); setViewingConv(conv); }}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                          {schoolBadge(conv.schools?.slug)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={stageBadge(conv.displayStage || conv.stage)}>{conv.displayStage || conv.stage}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{conv.message_count ?? 0}</td>
                      <td className="px-5 py-3 text-gray-500">{conv.agent || '—'}</td>
                      <td className="px-5 py-3 text-gray-400">
                        {conv.updated_at ? new Date(conv.updated_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Pagination */}
        {viewMode === 'flat' && flatTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {flatTotalPages}</span>
            <button onClick={() => setPage(p => Math.min(flatTotalPages, p + 1))} disabled={page === flatTotalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        )}

        {viewMode === 'grouped' && !selectedLead && leadsTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setLeadsPage(p => Math.max(1, p - 1))} disabled={leadsPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {leadsPage} of {leadsTotalPages}</span>
            <button onClick={() => setLeadsPage(p => Math.min(leadsTotalPages, p + 1))} disabled={leadsPage === leadsTotalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        )}
      </div>

      {viewingId && (
        <ConversationViewer
          conversationId={viewingId}
          initialConv={viewingConv}
          onClose={() => { setViewingId(null); setViewingConv(null); }}
        />
      )}
    </div>
  );
}
