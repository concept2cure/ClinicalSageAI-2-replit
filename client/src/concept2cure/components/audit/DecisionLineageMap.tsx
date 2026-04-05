/**
 * Decision Lineage Map — Visual DAG of decisions, approvals, and state transitions
 *
 * Renders an interactive, audit-ready lineage graph showing:
 *   - Every approval decision (approve/reject/delegate)
 *   - Document state transitions
 *   - Workflow step completions
 *   - Hash chain verification status
 *   - Export options (JSON, CSV, XML)
 *
 * @module concept2cure/components/audit/DecisionLineageMap
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2)
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper } from '@/components/ui/statesV2';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Download,
  FileText,
  FileSpreadsheet,
  FileCode2,
  Activity,
  GitBranch,
  User,
  ChevronDown,
  ChevronUp,
  Lock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface LineageNode {
  id: string;
  nodeType: 'decision' | 'document_state' | 'workflow_step' | 'evidence_link' | 'delegation';
  entityType: string;
  entityId: number;
  action: string;
  performedBy: string;
  performedAt: string;
  details: Record<string, unknown>;
  recordHash?: string;
  parentIds: string[];
  childIds: string[];
  regulatory: {
    gxpRelevant: boolean;
    requiresSignature: boolean;
    signatureStatus?: 'pending' | 'signed' | 'rejected';
    cfr11Compliant: boolean;
  };
}

interface LineageGraph {
  rootEntityType: string;
  rootEntityId: number;
  nodes: LineageNode[];
  edges: Array<{ from: string; to: string; relationship: string }>;
  metadata: {
    generatedAt: string;
    totalDecisions: number;
    totalApprovals: number;
    totalRejections: number;
    totalDelegations: number;
    chainVerified: boolean;
    complianceFrameworks: string[];
  };
}

interface DecisionLineageMapProps {
  entityType: string;
  entityId: number;
  organizationId?: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

const NODE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  decision: { label: 'Decision', color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-200' },
  document_state: { label: 'Document', color: 'text-stone-700', bg: 'bg-stone-100', border: 'border-stone-200' },
  workflow_step: { label: 'Workflow', color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-200' },
  evidence_link: { label: 'Evidence', color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-200' },
  delegation: { label: 'Delegation', color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-200' },
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  approved: <CheckCircle2 className="w-3.5 h-3.5 text-stone-700" />,
  rejected: <XCircle className="w-3.5 h-3.5 text-stone-700" />,
  pending: <Clock className="w-3.5 h-3.5 text-stone-600" />,
  awaiting_decision: <Clock className="w-3.5 h-3.5 text-stone-1000" />,
  delegated: <ArrowRight className="w-3.5 h-3.5 text-stone-600" />,
};

// ── Component ────────────────────────────────────────────────────────────────

const DecisionLineageMap: React.FC<DecisionLineageMapProps> = ({
  entityType,
  entityId,
  organizationId,
}) => {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch lineage graph
  const { data: graph, isLoading, error } = useQuery<LineageGraph>({
    queryKey: queryKeys.decisionLineage.graph(entityType, entityId, organizationId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) params.set('organizationId', String(organizationId));
      const res = await apiRequest('GET', `/api/decision-lineage/${entityType}/${entityId}?${params}`);
      return res.json();
    },
    enabled: !!entityType && entityId > 0,
  });

  // Fetch chain verification
  const { data: chainStatus } = useQuery({
    queryKey: queryKeys.decisionLineage.chainVerification(),
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/decision-lineage/verify-chain');
      return res.json();
    },
  });

  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    if (filterType === 'all') return graph.nodes;
    return graph.nodes.filter(n => n.nodeType === filterType);
  }, [graph, filterType]);

  const handleExport = async (format: 'json' | 'csv' | 'xml') => {
    const params = new URLSearchParams({ format });
    if (organizationId) params.set('organizationId', String(organizationId));
    const res = await apiRequest('GET', `/api/decision-lineage/${entityType}/${entityId}/export?${params}`);
    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lineage_${entityType}_${entityId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataStateWrapper<LineageGraph>
      isLoading={isLoading}
      error={error}
      data={graph ?? undefined}
      emptyTitle="No Lineage Data"
      emptyDescription="No decision lineage data available for this entity."
      testId="decision-lineage"
    >
      {(graphData) => (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-5 h-5 text-stone-1000" />
          <h2 className="text-sm font-semibold text-stone-900">Decision Lineage</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
            {graphData.nodes.length} records
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Chain verification badge */}
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium',
            chainStatus?.chainIntegrity === 'VERIFIED'
              ? 'bg-stone-100 text-stone-800 border border-stone-200'
              : 'bg-stone-100 text-stone-700 border border-stone-200',
          )}>
            {chainStatus?.chainIntegrity === 'VERIFIED' ? (
              <ShieldCheck className="w-3 h-3" />
            ) : (
              <ShieldAlert className="w-3 h-3" />
            )}
            {chainStatus?.chainIntegrity === 'VERIFIED' ? 'Chain Verified' : 'Unverified'}
          </div>
          {/* Export buttons */}
          <div className="flex items-center border rounded-md divide-x">
            <button
              onClick={() => handleExport('json')}
              className="px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-50 flex items-center gap-1"
              title="Export JSON"
            >
              <FileCode2 className="w-3 h-3" />
              JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-50 flex items-center gap-1"
              title="Export CSV"
            >
              <FileSpreadsheet className="w-3 h-3" />
              CSV
            </button>
            <button
              onClick={() => handleExport('xml')}
              className="px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-50 flex items-center gap-1"
              title="Export eCTD XML"
            >
              <FileText className="w-3 h-3" />
              XML
            </button>
          </div>
        </div>
      </div>

      {/* Compliance summary bar */}
      <div className="border-b bg-stone-50/50 px-5 py-2 flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-stone-1000" />
          <span className="font-medium text-stone-600">Compliance:</span>
          {graphData.metadata.complianceFrameworks.slice(0, 3).map(f => (
            <span key={f} className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
              {f}
            </span>
          ))}
          {graphData.metadata.complianceFrameworks.length > 3 && (
            <span className="text-stone-400">
              +{graphData.metadata.complianceFrameworks.length - 3} more
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-stone-500">
            <span className="font-semibold text-stone-700">{graphData.metadata.totalApprovals}</span> approved
          </span>
          <span className="text-stone-500">
            <span className="font-semibold text-stone-700">{graphData.metadata.totalRejections}</span> rejected
          </span>
          <span className="text-stone-500">
            <span className="font-semibold text-stone-600">{graphData.metadata.totalDelegations}</span> delegated
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b px-5 py-1.5 flex items-center gap-1">
        {['all', 'decision', 'document_state', 'workflow_step', 'delegation'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
              filterType === type ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100',
            )}
          >
            {type === 'all' ? 'All' : NODE_TYPE_CONFIG[type]?.label || type}
          </button>
        ))}
      </div>

      {/* Lineage nodes */}
      <div className="flex-1 overflow-y-auto">
        {filteredNodes.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-8 h-8 text-stone-200 mx-auto mb-2" />
            <p className="text-xs text-stone-500">No lineage records found</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredNodes.map((node, idx) => {
              const typeConf = NODE_TYPE_CONFIG[node.nodeType] || NODE_TYPE_CONFIG.decision;
              const isExpanded = expandedNode === node.id;
              const actionIcon = ACTION_ICONS[node.action] || <Activity className="w-3.5 h-3.5 text-stone-400" />;

              return (
                <div key={node.id} className={cn('bg-white transition-colors', isExpanded && 'bg-stone-50')}>
                  <button
                    onClick={() => setExpandedNode(isExpanded ? null : node.id)}
                    className="w-full text-left px-5 py-3 hover:bg-stone-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Vertical timeline connector */}
                      <div className="flex flex-col items-center mt-0.5">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center border',
                          typeConf.bg, typeConf.border,
                        )}>
                          {actionIcon}
                        </div>
                        {idx < filteredNodes.length - 1 && (
                          <div className="w-px h-4 bg-stone-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-stone-800 capitalize">
                            {node.action.replace(/_/g, ' ')}
                          </span>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', typeConf.bg, typeConf.color)}>
                            {typeConf.label}
                          </span>
                          {node.regulatory.gxpRelevant && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
                              GxP
                            </span>
                          )}
                          {node.regulatory.requiresSignature && (
                            <span className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded-full',
                              node.regulatory.signatureStatus === 'signed'
                                ? 'bg-stone-100 text-stone-700'
                                : node.regulatory.signatureStatus === 'pending'
                                  ? 'bg-stone-100 text-stone-600'
                                  : 'bg-stone-100 text-stone-700',
                            )}>
                              <Lock className="w-2.5 h-2.5 inline mr-0.5" />
                              {node.regulatory.signatureStatus || 'pending'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] text-stone-500">
                            <User className="w-3 h-3 inline mr-0.5" />
                            {node.performedBy}
                          </p>
                          <span className="text-stone-300">&middot;</span>
                          <p className="text-[11px] text-stone-400">
                            {new Date(node.performedAt).toLocaleString()}
                          </p>
                          <span className="text-stone-300">&middot;</span>
                          <p className="text-[10px] text-stone-400 font-mono">
                            {node.entityType}:{node.entityId}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pl-14 space-y-2">
                      <div className="bg-white rounded-lg border p-3 space-y-1.5">
                        <p className="text-[10px] font-medium text-stone-600 uppercase tracking-wide">Record Details</p>
                        <div className="text-xs text-stone-700 space-y-1">
                          <p><span className="font-medium">Node ID:</span> <span className="font-mono text-[10px]">{node.id}</span></p>
                          <p><span className="font-medium">Entity:</span> {node.entityType} #{node.entityId}</p>
                          <p><span className="font-medium">CFR 11 Compliant:</span> {node.regulatory.cfr11Compliant ? 'Yes' : 'No'}</p>
                          {node.recordHash && (
                            <p><span className="font-medium">Record Hash:</span> <span className="font-mono text-[10px]">{node.recordHash}</span></p>
                          )}
                          {node.parentIds.length > 0 && (
                            <p><span className="font-medium">Depends On:</span> {node.parentIds.join(', ')}</p>
                          )}
                          {Object.keys(node.details).length > 0 && (
                            <div>
                              <p className="font-medium mb-0.5">Metadata:</p>
                              <pre className="text-[10px] bg-stone-50 rounded p-2 overflow-x-auto text-stone-600">
                                {JSON.stringify(node.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — attestation */}
      <div className="border-t bg-stone-50/50 px-5 py-2 flex items-center justify-between">
        <p className="text-[9px] text-stone-400 max-w-lg">
          This lineage trail is cryptographically hash-chained and tamper-evident per FDA 21 CFR Part 11 §11.10(e).
          All records are immutable and auditable.
        </p>
        <p className="text-[9px] text-stone-400">
          Generated: {graphData.metadata.generatedAt ? new Date(graphData.metadata.generatedAt).toLocaleString() : 'now'}
        </p>
      </div>
    </div>
      )}
    </DataStateWrapper>
  );
};

export default DecisionLineageMap;
