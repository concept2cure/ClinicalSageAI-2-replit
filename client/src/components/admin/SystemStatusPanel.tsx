import React, { useEffect, useState } from 'react';
import axios from 'axios';

type HealthStatus = {
  status: string;
  db_latency_ms: number;
  intelligence_assets: number;
  services?: Record<string, string>;
};

type AuditLogEntry = {
  id: number;
  timestamp: string;
  actor_id: string;
  action_type: string;
  target_resource?: string;
};

export const SystemStatusPanel: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
        const headers = tenantId ? { 'x-organization-id': tenantId } : undefined;
        const hRes = await axios.get('/api/lumen/system/health', { headers });
        setHealth(hRes.data);
        const lRes = await axios.get('/api/lumen/system/audit-logs', { headers });
        setLogs(lRes.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return <div className="text-xs text-slate-500 animate-pulse">INITIALIZING TELEMETRY...</div>;

  return (
    <div className="bg-slate-950 border-t border-slate-800 p-4 font-mono text-xs">
      <div className="flex gap-6 mb-4 text-slate-400 uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              health.status === 'OPERATIONAL' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
            }`}
          ></div>
          <span>SYSTEM: {health.status}</span>
        </div>
        <div>
          DB LATENCY: <span className="text-white">{health.db_latency_ms}ms</span>
        </div>
        <div>
          INTEL ASSETS: <span className="text-white">{health.intelligence_assets}</span>
        </div>
      </div>

      <div className="h-32 overflow-y-auto border border-slate-800 bg-black/50 rounded p-2 custom-scrollbar">
        <table className="w-full text-left">
          <thead className="text-slate-600 sticky top-0 bg-black">
            <tr>
              <th className="pb-2">TIMESTAMP</th>
              <th className="pb-2">ACTOR</th>
              <th className="pb-2">ACTION</th>
              <th className="pb-2">TARGET</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            {logs.map(log => (
              <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="py-1 pr-4 text-slate-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td className="py-1 pr-4 text-emerald-400">{log.actor_id}</td>
                <td className="py-1 pr-4 font-bold">{log.action_type}</td>
                <td className="py-1 pr-4 opacity-70 truncate max-w-[150px]">{log.target_resource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
