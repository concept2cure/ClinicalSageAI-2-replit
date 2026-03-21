/**
 * @fileoverview Risk Cockpit — Risk monitoring, trend analysis, mitigation tracking
 * @module concept2cure/pages/MissionControl/RiskCockpit
 *
 * Top risks, trend by risk category, limiting factors,
 * region-specific risk map, mitigation actions.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Plus,
  Filter,
  Target,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { useRisks, useCreateRisk, useReadiness } from '../../hooks/useMissionControl';

interface RiskCockpitProps {
  programId: number | null;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  open: AlertTriangle,
  mitigating: Clock,
  mitigated: CheckCircle2,
  accepted: Shield,
  closed: XCircle,
};

export const RiskCockpit: React.FC<RiskCockpitProps> = ({ programId }) => {
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showAddRisk, setShowAddRisk] = useState(false);
  const [newRisk, setNewRisk] = useState({ title: '', category: 'regulatory', severity: 'medium', description: '' });

  const { data: risks = [], isLoading } = useRisks(programId, {
    severity: filterSeverity || undefined,
    status: filterStatus || undefined,
  });
  const { data: readiness } = useReadiness(programId);
  const createRisk = useCreateRisk();

  // Stats
  const stats = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    risks.forEach((r: any) => {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    });
    const openCritical = risks.filter((r: any) => r.severity === 'critical' && r.status === 'open').length;
    return { total: risks.length, bySeverity, byStatus, byCategory, openCritical };
  }, [risks]);

  const handleAddRisk = () => {
    if (!programId || !newRisk.title.trim()) return;
    createRisk.mutate({
      programId,
      ...newRisk,
      status: 'open',
    });
    setNewRisk({ title: '', category: 'regulatory', severity: 'medium', description: '' });
    setShowAddRisk(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Clock className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-red-500" />
          <h1 className="text-base font-semibold text-zinc-900">Risk Cockpit</h1>
          <span className="text-xs text-zinc-500">{stats.total} risks tracked</span>
          {stats.openCritical > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium animate-pulse">
              {stats.openCritical} critical
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterSeverity || ''}
            onChange={e => setFilterSeverity(e.target.value || null)}
            className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
          >
            <option value="">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterStatus || ''}
            onChange={e => setFilterStatus(e.target.value || null)}
            className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg bg-white text-zinc-700"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="mitigating">Mitigating</option>
            <option value="mitigated">Mitigated</option>
            <option value="accepted">Accepted</option>
          </select>
          <button
            onClick={() => setShowAddRisk(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Risk
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Risk Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            {['critical', 'high', 'medium', 'low'].map(sev => {
              const colors = SEVERITY_COLORS[sev];
              const count = stats.bySeverity[sev] || 0;
              return (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                  className={cn(
                    'p-4 rounded-xl border transition-all text-left',
                    filterSeverity === sev ? `${colors.bg} ${colors.border} ring-1 ring-offset-1` : 'bg-white border-zinc-200 hover:border-zinc-300',
                    filterSeverity === sev && sev === 'critical' && 'ring-red-300',
                    filterSeverity === sev && sev === 'high' && 'ring-orange-300',
                    filterSeverity === sev && sev === 'medium' && 'ring-amber-300',
                    filterSeverity === sev && sev === 'low' && 'ring-blue-300',
                  )}
                >
                  <p className="text-xs text-zinc-500 capitalize mb-1">{sev}</p>
                  <p className={cn('text-2xl font-semibold', colors.text)}>{count}</p>
                </button>
              );
            })}
          </div>

          {/* Category Breakdown */}
          {Object.keys(stats.byCategory).length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">By Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.byCategory).map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50">
                    <Target className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-700 capitalize flex-1">{cat}</span>
                    <span className="text-xs font-semibold text-zinc-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Readiness-linked blockers */}
          {readiness?.blockers && readiness.blockers.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Readiness Blockers</h3>
              <div className="space-y-2">
                {readiness.blockers.map((blocker: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-100">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-800">{blocker.message || blocker}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk List */}
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Risk Register</h3>
              <span className="text-xs text-zinc-500">{risks.length} risks</span>
            </div>
            {risks.length === 0 ? (
              <div className="p-12 text-center">
                <Shield className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-700">No risks registered</p>
                <p className="text-xs text-zinc-500 mt-1">Track regulatory, clinical, and operational concerns.</p>
                <button
                  onClick={() => setShowAddRisk(true)}
                  className="mt-4 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-150"
                >
                  Add Your First Risk
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {risks.map((risk: any) => {
                  const sevColors = SEVERITY_COLORS[risk.severity] || SEVERITY_COLORS.medium;
                  const StatusIcon = STATUS_ICONS[risk.status] || Clock;
                  return (
                    <div key={risk.id} className="p-4 hover:bg-zinc-50 transition-colors duration-150">
                      <div className="flex items-start gap-3">
                        <StatusIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', sevColors.text)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-zinc-900">{risk.title}</p>
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', sevColors.bg, sevColors.text)}>
                              {risk.severity}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                              {risk.status}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 capitalize">
                              {risk.category}
                            </span>
                          </div>
                          {risk.description && (
                            <p className="text-xs text-zinc-600">{risk.description}</p>
                          )}
                          {risk.mitigation && (
                            <p className="text-xs text-emerald-600 mt-1">
                              <Zap className="w-3 h-3 inline mr-1" />
                              Mitigation: {risk.mitigation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Risk Modal */}
      {showAddRisk && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowAddRisk(false)}>
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-900 mb-4">Add Risk Signal</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Title</label>
                <input
                  type="text"
                  value={newRisk.title}
                  onChange={e => setNewRisk(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  placeholder="Risk title..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Category</label>
                  <select
                    value={newRisk.category}
                    onChange={e => setNewRisk(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    <option value="regulatory">Regulatory</option>
                    <option value="clinical">Clinical</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="commercial">Commercial</option>
                    <option value="technical">Technical</option>
                    <option value="operational">Operational</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Severity</label>
                  <select
                    value={newRisk.severity}
                    onChange={e => setNewRisk(prev => ({ ...prev, severity: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Description</label>
                <textarea
                  value={newRisk.description}
                  onChange={e => setNewRisk(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none h-20 resize-none"
                  placeholder="Describe the risk..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddRisk(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRisk}
                disabled={!newRisk.title.trim()}
                className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60"
              >
                Add Risk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskCockpit;
