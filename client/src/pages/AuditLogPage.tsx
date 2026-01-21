import React from 'react';
import { Shield, CheckCircle, Clock, User } from 'lucide-react';

export const AuditLogPage = () => {
  const logs = [
    { id: 1, action: 'LOGIN_SUCCESS', user: 'jm.smith@concept2cure.pro', time: '09:00 AM' },
    { id: 2, action: 'PROTOCOL_VIEW', user: 'jm.smith@concept2cure.pro', time: '09:05 AM' },
    { id: 3, action: 'DEVICE_ENTRY', user: 'jm.smith@concept2cure.pro', time: '09:15 AM' },
  ];

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-3 mb-8">
          <Shield className="text-emerald-600" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Enterprise Audit Trail</h1>
            <p className="text-sm text-slate-500">21 CFR Part 11 Compliant Logging</p>
          </div>
        </header>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Action</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">User</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-4">
                    <CheckCircle size={16} className="text-emerald-500" />
                  </td>
                  <td className="p-4 font-mono text-xs font-bold text-slate-700">{log.action}</td>
                  <td className="p-4 text-sm text-slate-600 flex items-center gap-2">
                    <User size={14} /> {log.user}
                  </td>
                  <td className="p-4 text-xs text-slate-400 flex items-center gap-2">
                    <Clock size={14} /> {log.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
