import React from 'react';

const SLUG_DISPLAY = { backock: 'BABCOCK', abu: 'ABU' };
const schoolLabel = (slug) => SLUG_DISPLAY[slug] || (slug?.toUpperCase() ?? '—');

export default function LeadsTable({ leads }) {
  if (!leads?.length) {
    return <p className="text-gray-400 text-sm py-4">No leads found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="pb-2 pr-4 font-medium">Name</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Phone</th>
            <th className="pb-2 pr-4 font-medium">School</th>
            <th className="pb-2 pr-4 font-medium">Zoho</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-4 font-medium">{lead.name || '—'}</td>
              <td className="py-2 pr-4 text-gray-600">{lead.email || '—'}</td>
              <td className="py-2 pr-4 text-gray-600">{lead.phone || '—'}</td>
              <td className="py-2 pr-4">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {schoolLabel(lead.schools?.slug)}
                </span>
              </td>
              <td className="py-2 pr-4">
                {lead.zoho_contact_id ? (
                  <span className="text-green-600 text-xs">✓ Synced</span>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </td>
              <td className="py-2 text-gray-500">
                {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
