import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import LeadsTable from '../components/LeadsTable.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

export default function Leads() {
  const { selectedSchool } = useSchool();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      if (search) params.search = search;

      const data = await api.leads(params);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedSchool]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedSchool]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const exportCSV = async () => {
    try {
      const params = { limit: 10000 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      if (search) params.search = search;

      const data = await api.leads(params);
      const rows = data.leads || [];

      const header = 'Name,Email,Phone,School,Zoho Synced,Date';
      const lines = rows.map(l =>
        [
          l.name || '',
          l.email || '',
          l.phone || '',
          l.schools?.slug || '',
          l.zoho_contact_id ? 'Yes' : 'No',
          l.created_at ? new Date(l.created_at).toLocaleDateString() : '',
        ]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );

      const csv = [header, ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-500 text-sm">{total} total leads</p>
          </div>
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Export CSV
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-4">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : (
            <LeadsTable leads={leads} />
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
