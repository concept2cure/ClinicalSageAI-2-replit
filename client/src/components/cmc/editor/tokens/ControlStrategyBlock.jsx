/* src/components/cmc/editor/tokens/ControlStrategyBlock.jsx */
/* eslint-disable react/prop-types */
import React from 'react';

export default function ControlStrategyBlock({ payload }) {
 const links = payload?.links || [];
 return (
 <div className="border rounded p-2">
 <div className="text-sm font-medium mb-1">Control Strategy (CPP → CQA)</div>
 <div className="overflow-auto">
 <table className="min-w-full text-xs border border-slate-200">
 <thead className="bg-slate-50">
 <tr>
 <th className="px-2 py-1 text-left border-b">CPP</th>
 <th className="px-2 py-1 text-left border-b">CQA</th>
 <th className="px-2 py-1 text-left border-b">Control</th>
 <th className="px-2 py-1 text-left border-b">Monitoring</th>
 </tr>
 </thead>
 <tbody>
 {links.map((r, i) => (
 <tr key={i} className="even:bg-slate-50/30">
 <td className="px-2 py-1 border-b">{r.cpp || '—'}</td>
 <td className="px-2 py-1 border-b">{r.cqa || '—'}</td>
 <td className="px-2 py-1 border-b">{r.control || '—'}</td>
 <td className="px-2 py-1 border-b">{r.monitoring || '—'}</td>
 </tr>
 ))}
 {!links.length && (
 <tr>
 <td className="px-2 py-2 text-slate-500" colSpan={4}>
 No links in snapshot.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 );
}
