import React from 'react';

const SLUG_DISPLAY = { backock: 'BABCOCK', babcock: 'BABCOCK', abu: 'ABU' };
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
            <th className="pb-2 pr-4 font-medium">Lead Quality</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Phone</th>
            <th className="pb-2 pr-4 font-medium">School</th>
            <th className="pb-2 pr-4 font-medium">Zoho</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => {
            const tier = lead.lead_tier || (lead.name && lead.email && lead.phone ? 'WARM' : 'COLD');
            const score = lead.lead_score ?? (tier === 'HOT' ? 80 : tier === 'WARM' ? 50 : 20);
            const tags = Array.isArray(lead.intent_tags) ? lead.intent_tags : [];

            return (
              <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-gray-900">{lead.name || '—'}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-max ${
                        tier === 'HOT'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : tier === 'WARM'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {tier === 'HOT' ? '🔥 Hot Lead' : tier === 'WARM' ? '⚡ Warm' : '❄️ Cold'} ({score})
                    </span>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag, i) => (
                          <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-gray-600 font-mono text-xs">{lead.email || '—'}</td>
                <td className="py-2.5 pr-4 text-gray-600 font-mono text-xs">{lead.phone || '—'}</td>
                <td className="py-2.5 pr-4">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {schoolLabel(lead.schools?.slug)}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  {lead.zoho_contact_id ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                      ✓ Synced
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="py-2.5 text-gray-500 text-xs">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
