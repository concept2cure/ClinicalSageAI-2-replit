import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const severityStyles = {
  CRITICAL: 'bg-red-600/20 text-red-300 border-red-500/40',
  HIGH: 'bg-orange-600/20 text-orange-300 border-orange-500/40',
  MEDIUM: 'bg-yellow-600/20 text-yellow-200 border-yellow-500/40',
  LOW: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
};

const LumenRiskRecord = () => {
  const [location, setLocation] = useLocation();
  const recordId = location.split('/').pop();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        setLoading(true);
        const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
        const response = await fetch(`/api/lumen/risk-records/${recordId}`, {
          headers: tenantId ? { 'x-organization-id': tenantId } : undefined,
        });

        if (!response.ok) {
          throw new Error('Failed to load risk record');
        }

        const data = await response.json();
        setRecord(data);
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to load risk record');
      } finally {
        setLoading(false);
      }
    };

    if (recordId) {
      fetchRecord();
    }
  }, [recordId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        Loading risk record...
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-4">
        <div className="text-sm text-red-300">{error || 'Risk record not found'}</div>
        <Button onClick={() => setLocation('/client-portal')}>Return to Portal</Button>
      </div>
    );
  }

  const actions = Array.isArray(record.action_items) ? record.action_items : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Lumen Cortex</div>
            <h1 className="text-3xl font-semibold">Risk Record #{record.id}</h1>
            <div className="text-sm text-slate-400 mt-1">Project: {record.project_name}</div>
          </div>
          <Badge className={`border ${severityStyles[record.severity] || 'border-slate-700'}`}>
            {record.severity}
          </Badge>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-slate-400">Source</h2>
            <div className="text-lg text-slate-200 mt-2 font-mono">{record.source}</div>
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-slate-400">Threat Rationale</h2>
            <p className="text-slate-200 leading-relaxed mt-2">{record.rationale}</p>
          </div>

          {actions.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-slate-400">Action Items</h2>
              <div className="mt-3 space-y-3">
                {actions.map((action, index) => (
                  <div
                    key={`${record.id}-action-${index}`}
                    className="flex items-center gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60"
                  >
                    <div className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold ring-1 ring-blue-500/40">
                      {index + 1}
                    </div>
                    <div className="text-sm text-slate-200">{action}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500">
            Created at: {new Date(record.created_at).toLocaleString()}
          </div>
        </div>

        <div className="mt-6">
          <Button variant="outline" onClick={() => setLocation(`/projects/${record.project_id}`)}>
            Return to Project
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LumenRiskRecord;
