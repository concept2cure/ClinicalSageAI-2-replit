import React, { useEffect, useState } from 'react';
import { Shield, Lock, User, Clock } from 'lucide-react';
import { Sidebar } from '../components/layout/Sidebar';

type AuditLogEntry = {
  id: string;
  user_id: string;
  action: string;
  details?: string | null;
  timestamp: string;
};

export const AuditPage = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit')
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-screen w-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 text-white rounded-lg">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800">Compliance Vault</h1>
              <p className="text-xs text-slate-500">21 CFR Part 11 Audit Trail</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded border border-green-200 flex items-center gap-2">
            <Lock size={12} /> SECURE MODE ACTIVE
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                <tr>
                  <th className="px-6 py-4">Timestamp (UTC)</th>
                  <th className="px-6 py-4">User ID</th>
                  <th className="px-6 py-4">Action Event</th>
                  <th className="px-6 py-4">Details / Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      Loading secure logs...
                    </td>
                  </tr>
                )}
                {!loading && logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-600 flex items-center gap-2">
                      <Clock size={12} className="text-slate-400" />
                      {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" /> {log.user_id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold border ${
                          log.action.includes('MFA')
                            ? 'bg-purple-50 text-purple-700 border-purple-100'
                            : log.action.includes('SAVE')
                              ? 'bg-blue-50 text-blue-700 border-blue-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs truncate max-w-xs">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuditPage;
