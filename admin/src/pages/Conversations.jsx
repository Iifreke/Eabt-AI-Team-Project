import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import ConversationViewer from '../components/ConversationViewer.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const STAGES = ['all', 'onboarding', 'active', 'escalated'];

// Map DB slugs to display labels (DB slug unchanged)
const SLUG_DISPLAY = { backock: 'BABCOCK', abu: 'ABU' };
const schoolBadge = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

const stageBadge = (stage) => {

  const map = {
    onboarding: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    escalated: 'bg-red-100 text-red-700',
  };
  return `px-2 py-0.5 rounded-full text-xs font-medium ${map[stage] || 'bg-gray-100 text-gray-600'}`;
};

export default function Conversations() {
  const { selectedSchool } = useSchool();
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState(null);
  const [viewingConv, setViewingConv] = useState(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      if (stage !== 'all') params.stage = stage;

      const data = await api.conversations(params);
      setConversations(data.conversations || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, stage, selectedSchool]);

  useEffect(() => { setPage(1); }, [stage, selectedSchool]);
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">History</h1>
        <p className="text-gray-500 text-sm mb-6">{total} total conversations</p>

        <div className="flex gap-2 mb-5">
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                stage === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

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
                      <span className={stageBadge(conv.stage)}>{conv.stage}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{conv.message_count ?? 0}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {conv.updated_at ? new Date(conv.updated_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
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
