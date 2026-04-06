/* src/components/cmc/editor/tokens/P8Table.jsx */
/* eslint-disable react/prop-types */
import React from 'react';

export default function P8Table({ payload, kind }) {
 // Handles P8.TABLES and P8.TRENDS / P8.CONCLUSIONS
 if (kind === 'P8.CONCLUSIONS') {
 const t = payload?.text || '—';
 const shelf = payload?.shelf_life ? `${payload.shelf_life} months` : '—';
 return (
 <div className="border rounded p-2">
 <div className="text-sm font-medium mb-1">Stability Conclusions</div>
 <div className="text-xs text-slate-700 whitespace-pre-wrap">{t}</div>
 <div className="text-xs text-slate-500 mt-2">Shelf-life: {shelf}</div>
 </div>
 );
 }

 if (kind === 'P8.TRENDS') {
 const trends = payload?.trends || [];
 return (
 <div className="space-y-2">
 {trends.map((t, i) => (
 <div key={i} className="border rounded p-2 text-xs">
 <div className="font-medium">{t.test}</div>
 <div className="text-slate-600">
 slope: {t.slope}, r²: {t.r2}
 </div>
 <div className="text-slate-600">{t.summary || ''}</div>
 </div>
 ))}
 {!trends.length && <div className="text-xs text-slate-500">No trends in snapshot.</div>}
 </div>
 );
 }

 // P8.TABLES (conditions x timepoints)
 const conditions = payload?.conditions || [];
 return (
 <div className="space-y-3">
 {conditions.map((c, idx) => (
 <div key={idx} className="border rounded p-2">
 <div className="text-sm font-medium mb-1">
 {c.kind || 'COND'} — {c.temp ?? '?'}°C / {c.rh ?? '?'}% RH
 </div>
 <div className="overflow-auto">
 <table className="min-w-full text-xs border border-slate-200">
 <thead className="bg-slate-50">
 <tr>
 <th className="px-2 py-1 text-left border-b">Timepoint</th>
 <th className="px-2 py-1 text-left border-b">n</th>
 <th className="px-2 py-1 text-left border-b">Result</th>
 </tr>
 </thead>
 <tbody>
 {(c.timepoints || []).map((tp, i) => (
 <tr key={i} className="even:bg-slate-50/30">
 <td className="px-2 py-1 border-b">{tp.m}M</td>
 <td className="px-2 py-1 border-b">{tp.n ?? '—'}</td>
 <td className="px-2 py-1 border-b">{tp.result ?? '—'}</td>
 </tr>
 ))}
 {!c.timepoints?.length && (
 <tr>
 <td className="px-2 py-2 text-slate-500" colSpan={3}>
 No timepoints in snapshot.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 ))}
 {!conditions.length && (
 <div className="text-xs text-slate-500">No conditions in snapshot.</div>
 )}
 </div>
 );
}
