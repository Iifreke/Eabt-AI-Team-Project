import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import Sidebar from '../components/Sidebar.jsx';
import FileUploader from '../components/FileUploader.jsx';

const SCHOOLS = [
  { slug: 'backock', name: 'Backock School' },
  { slug: 'abu', name: 'ABU' },
];

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function StatusBadge({ status, errorMessage }) {
  if (status === 'ready') return <span className="text-green-600 text-sm flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Ready</span>;
  if (status === 'error') return (
    <span className="text-red-600 text-sm flex items-center gap-1" title={errorMessage}>
      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Error
    </span>
  );
  return (
    <span className="text-blue-600 text-sm flex items-center gap-1">
      <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
      Processing
    </span>
  );
}

export default function KnowledgeBase() {
  const [activeSchool, setActiveSchool] = useState('backock');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const pollRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await api.documents(activeSchool);
      setDocuments(data.documents || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeSchool]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-poll while any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing');
    if (hasProcessing) {
      pollRef.current = setInterval(fetchDocuments, 5000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [documents, fetchDocuments]);

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(docId);
    try {
      await api.deleteDocument(docId);
      fetchDocuments();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="ml-60 min-h-screen p-8">
      <Sidebar />

      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Knowledge Base</h1>
        <p className="text-gray-500 text-sm mb-6">Upload documents for each school's chatbot</p>

        {/* School tabs */}
        <div className="flex gap-2 mb-6">
          {SCHOOLS.map(s => (
            <button key={s.slug} onClick={() => setActiveSchool(s.slug)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSchool === s.slug ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {s.name}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <FileUploader schoolSlug={activeSchool} onUploaded={fetchDocuments} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 text-sm font-semibold text-gray-700">
            Documents ({documents.length})
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 p-5">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : !documents.length ? (
            <p className="text-gray-400 text-sm p-5">No documents uploaded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Chunks</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Uploaded</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id} className="border-b border-gray-100">
                    <td className="px-5 py-3 font-medium max-w-xs truncate">{doc.name}</td>
                    <td className="px-5 py-3 text-gray-500">{formatSize(doc.file_size)}</td>
                    <td className="px-5 py-3 text-gray-500">{doc.chunk_count || 0}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={doc.status} errorMessage={doc.error_message} />
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleting === doc.id}
                        className="text-red-500 hover:text-red-700 text-xs disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
