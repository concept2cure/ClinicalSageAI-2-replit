/* src/components/cmc/editor/tokens/SpecsTable.jsx */
/* eslint-disable react/prop-types */
import React from 'react';

export default function SpecsTable({ payload }) {
  const specs = payload?.specs || [];
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm border border-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-2 py-1 text-left border-b">Test</th>
            <th className="px-2 py-1 text-left border-b">Attribute</th>
            <th className="px-2 py-1 text-left border-b">Unit</th>
            <th className="px-2 py-1 text-left border-b">Low</th>
            <th className="px-2 py-1 text-left border-b">High</th>
            <th className="px-2 py-1 text-left border-b">Justification</th>
            <th className="px-2 py-1 text-left border-b">Method</th>
            <th className="px-2 py-1 text-left border-b">Validated</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((r, i) => (
            <tr key={i} className="even:bg-slate-50/30">
              <td className="px-2 py-1 border-b">{r.test || r.attribute || '—'}</td>
              <td className="px-2 py-1 border-b">{r.attribute || '—'}</td>
              <td className="px-2 py-1 border-b">{r.unit || '—'}</td>
              <td className="px-2 py-1 border-b">{r.low ?? '—'}</td>
              <td className="px-2 py-1 border-b">{r.high ?? '—'}</td>
              <td className="px-2 py-1 border-b">{r.justification || '—'}</td>
              <td className="px-2 py-1 border-b">{r.method_id || r.method || '—'}</td>
              <td className="px-2 py-1 border-b">
                {r.validated ? (
                  <span className="px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    VALIDATED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">
                    TBD
                  </span>
                )}
              </td>
            </tr>
          ))}
          {!specs.length && (
            <tr>
              <td className="px-2 py-2 text-slate-500 text-xs" colSpan={8}>
                No specification rows in snapshot.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
