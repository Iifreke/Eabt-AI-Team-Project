import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import { useSchool } from '../context/SchoolContext.jsx';

const STATUSES = ['all', 'open', 'pending', 'closed'];

const statusBadge = (status) => {
  const map = {
    open: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    closed: 'bg-green-100 text-green-700',
  };
  return `px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`;
};

const STATUS_LABEL = { open: 'Open', pending: 'In Progress', closed: 'Closed' };

function TagsEditor({ tags, onSave }) {
  const [input, setInput] = useState('');
  const [current, setCurrent] = useState(tags || []);

  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !current.includes(t)) {
      const next = [...current, t];
      setCurrent(next);
      onSave(next);
    }
    setInput('');
  };

  const removeTag = (t) => {
    const next = current.filter(x => x !== t);
    setCurrent(next);
    onSave(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {current.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
            {t}
            <button onClick={() => removeTag(t)} className="hover:text-red-600 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Add tag..."
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={addTag} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
      </div>
    </div>
  );
}

function TicketRow({ ticket, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState(ticket.staff_reply || '');
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const patch = async (updates) => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await api.updateTicket({ id: ticket.id, ...updates });
      if (updates.staff_reply !== undefined) {
        setSuccessMsg('Reply sent and ticket updated!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-5 py-3 font-medium">{ticket.name}</td>
        <td className="px-5 py-3 text-gray-500 text-xs">{ticket.email}</td>
        <td className="px-5 py-3 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
            {ticket.schools?.name || '—'}
          </span>
        </td>
        <td className="px-5 py-3 font-medium text-xs">{ticket.subject}</td>
        <td className="px-5 py-3">
          <span className={statusBadge(ticket.status)}>{STATUS_LABEL[ticket.status] || ticket.status}</span>
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {(ticket.tags || []).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{t}</span>
            ))}
          </div>
        </td>
        <td className="px-5 py-3 text-gray-400 text-xs">
          {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Student Inquiry</div>
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">{ticket.message}</div>

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Student Contact</div>
                <div className="text-sm space-y-1">
                  <div>Name: <strong>{ticket.name}</strong></div>
                  <div>Email: <a href={`mailto:${ticket.email}`} className="text-blue-600 hover:underline">{ticket.email}</a></div>
                  {ticket.phone && <div>Phone: {ticket.phone}</div>}
                </div>

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Tags</div>
                <TagsEditor tags={ticket.tags} onSave={(tags) => patch({ tags })} />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Assign To</div>
                <input
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  onBlur={() => patch({ assigned_to: assignedTo })}
                  placeholder="Admissions officer name..."
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                />

                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                  <span>Official Email Reply</span>
                  {successMsg && <span className="text-emerald-600 font-semibold normal-case">✓ Reply emailed to {ticket.email}</span>}
                </div>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={4}
                  placeholder="Type your official reply (will be emailed directly to student)..."
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
                />

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => patch({ staff_reply: reply })} disabled={saving || !reply.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    ✉️ Send Email Reply
                  </button>
                  {ticket.status !== 'pending' && ticket.status !== 'closed' && (
                    <button onClick={() => patch({ status: 'pending' })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      Mark In Progress
                    </button>
                  )}
                  {ticket.status !== 'closed' && (
                    <button onClick={() => patch({ status: 'closed' })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      Close Ticket
                    </button>
                  )}
                  {ticket.status === 'closed' && (
                    <button onClick={() => patch({ status: 'open' })} disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Tickets() {
  const { selectedSchool } = useSchool();
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = { page, limit: 20 };
      if (selectedSchool !== 'all') params.schoolId = selectedSchool;
      if (status !== 'all') params.status = status;
      const data = await api.tickets(params);
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('fetchTickets error:', err);
      setFetchError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [status, page, selectedSchool]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { setPage(1); }, [status, selectedSchool]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Tickets</h1>
        <p className="text-gray-500 text-sm mb-6">Offline support requests from students & prospective leads</p>

        <div className="flex gap-2 mb-5">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                status === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s === 'all' ? 'All' : STATUS_LABEL[s] || s}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-400 self-center">{total} ticket{total !== 1 ? 's' : ''}</span>
        </div>

        {fetchError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Error loading tickets: <strong>{fetchError}</strong>
            <button onClick={fetchTickets} className="ml-3 underline">Retry</button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading tickets...
            </div>
          ) : !tickets.length ? (
            <p className="text-gray-400 text-sm p-5">No tickets found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Student / Lead</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tags</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => (
                  <TicketRow key={ticket.id} ticket={ticket} onUpdate={fetchTickets} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
