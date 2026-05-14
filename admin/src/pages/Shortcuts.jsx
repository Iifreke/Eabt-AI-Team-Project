import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { supabase } from '../lib/supabase.js';
import { useUser } from '../context/UserContext.jsx';

function ShortcutForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    shortcut: initial?.shortcut || '/',
    message: initial?.message || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.shortcut.trim() || !form.message.trim()) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Greeting"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Shortcut Key</label>
          <input
            value={form.shortcut}
            onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
            placeholder="e.g. /greeting"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
        <textarea
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          rows={3}
          placeholder="The full message that will be inserted..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : (initial ? 'Save Changes' : 'Add Shortcut')}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Shortcuts() {
  const { profile } = useUser();
  const [shortcuts, setShortcuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('shortcuts').select('*').order('name');
    setShortcuts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleAdd = async (form) => {
    const { error } = await supabase.from('shortcuts').insert({
      ...form,
      created_by: profile?.full_name || profile?.email || 'Admin',
    });
    if (error) throw error;
    setShowForm(false);
    fetch();
  };

  const handleEdit = async (id, form) => {
    const { error } = await supabase.from('shortcuts').update(form).eq('id', id);
    if (error) throw error;
    setEditingId(null);
    fetch();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this shortcut?')) return;
    await supabase.from('shortcuts').delete().eq('id', id);
    fetch();
  };

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shortcuts</h1>
            <p className="text-gray-500 text-sm mt-0.5">Canned responses — type / in chat to use</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + Add Shortcut
            </button>
          )}
        </div>

        {showForm && (
          <ShortcutForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : !shortcuts.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            No shortcuts yet. Add one to speed up your replies.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Shortcut</th>
                  <th className="px-5 py-3 font-medium">Message Preview</th>
                  <th className="px-5 py-3 font-medium">Created By</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shortcuts.map(s => (
                  <React.Fragment key={s.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-5 py-3 font-mono text-blue-600 text-xs">{s.shortcut}</td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{s.message}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{s.created_by || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(s.id)}
                            className="text-xs text-blue-600 hover:underline">Edit</button>
                          <button onClick={() => handleDelete(s.id)}
                            className="text-xs text-red-500 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                    {editingId === s.id && (
                      <tr>
                        <td colSpan={5} className="px-5 py-3 bg-blue-50">
                          <ShortcutForm
                            initial={s}
                            onSave={(form) => handleEdit(s.id, form)}
                            onCancel={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
