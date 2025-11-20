/* src/components/cmc/editor/tokens/BatchAnalysesTable.jsx */
/* eslint-disable react/prop-types */
import React from 'react';

export default function BatchAnalysesTable({ payload }) {
  const batches = payload?.batches || [];
  return (
    <div className="space-y-3">
      {batches.map((b, idx) => (
        <div key={idx} className="border rounded p-2">
          <div className="text-sm font-medium mb-1">
            Lot {b.lot || b.batch || '—'}{' '}
            <span className="text-xs text-slate-500">
              ({b.date ? new Date(b.date).toLocaleDateString() : '—'})
            </span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs border border-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left border-b">Test</th>
                  <th className="px-2 py-1 text-left border-b">Value</th>
                  <th className="px-2 py-1 text-left border-b">Unit</th>
                  <th className="px-2 py-1 text-left border-b">Pass</th>
                </tr>
              </thead>
              <tbody>
                {(b.results || []).map((r, i) => (
                  <tr key={i} className="even:bg-slate-50/30">
                    <td className="px-2 py-1 border-b">{r.test}</td>
                    <td className="px-2 py-1 border-b">{r.value}</td>
                    <td className="px-2 py-1 border-b">{r.unit}</td>
                    <td className="px-2 py-1 border-b">
                      {r.pass ? (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                          PASS
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                          FAIL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!b.results?.length && (
                  <tr>
                    <td className="px-2 py-2 text-slate-500" colSpan={4}>
                      No results for this lot in snapshot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!batches.length && (
        <div className="text-xs text-slate-500">No batch analyses in snapshot.</div>
      )}
    </div>
  );
}
