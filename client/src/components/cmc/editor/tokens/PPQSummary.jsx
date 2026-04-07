/* src/components/cmc/editor/tokens/PPQSummary.jsx */
/* eslint-disable react/prop-types */
import React from 'react';

export default function PPQSummary({ payload }) {
  const lots = payload?.lots || [];
  return (
    <div className="border rounded p-2">
      <div className="text-sm font-medium mb-1">PPQ Summary</div>
      <div className="overflow-auto">
        <table className="min-w-full text-xs border border-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-1 text-left border-b">Lot</th>
              <th className="px-2 py-1 text-left border-b">Date</th>
              <th className="px-2 py-1 text-left border-b">Outcome</th>
              <th className="px-2 py-1 text-left border-b">Notes</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((r, i) => (
              <tr key={i} className="even:bg-slate-50/30">
                <td className="px-2 py-1 border-b">{r.id || '—'}</td>
                <td className="px-2 py-1 border-b">
                  {r.date ? new Date(r.date).toLocaleDateString() : '—'}
                </td>
                <td className="px-2 py-1 border-b">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] border ${
                      r.outcome === 'PASS'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.outcome === 'FAIL'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {r.outcome || '—'}
                  </span>
                </td>
                <td className="px-2 py-1 border-b">{r.notes || '—'}</td>
              </tr>
            ))}
            {!lots.length && (
              <tr>
                <td className="px-2 py-2 text-slate-500" colSpan={4}>
                  No PPQ lots in snapshot.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
