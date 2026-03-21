/**
 * @fileoverview CRO Client Engagement Portal
 * @module concept2cure/components/cro/CROClientPortal
 * @version 1.0.0
 *
 * @description
 * Dashboard designed for how CROs actually operate:
 * 
 * CRO REALITY:
 * - Everything is client and contract driven
 * - SOW (Statement of Work) is the unit of work
 * - Deliverables must be tracked against milestones
 * - Change Orders are constant and must be managed
 * - Utilization rates determine profitability
 * - Multiple clients with competing priorities
 * - Regulatory submissions on behalf of clients
 *
 * KEY USE CASES:
 * 1. "What deliverables are due this week across all clients?"
 * 2. "Show me utilization for the writing team"
 * 3. "What change orders are pending approval?"
 * 4. "Roll up revenue by client/therapeutic area"
 * 5. "Which SOWs need renewal?"
 * 6. "Resource forecast for next quarter"
 *
 * CRO Hierarchy:
 * - Client (Master Service Agreement level)
 *   └── Program (Product/Compound level)
 *       └── SOW (Work package)
 *           └── Deliverable (Actual documents/submissions)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Building2,
  FileText,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  DollarSign,
  BarChart,
  ChevronRight,
  ChevronDown,
  Filter,
  TrendingUp,
  TrendingDown,
  UserCheck,
  FileEdit,
  Briefcase,
  RefreshCw,
  Target,
  Zap,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Reflecting CRO Business Model
// ═══════════════════════════════════════════════════════════════════════════════

export type DeliverableType = 
  | 'protocol'
  | 'ib'                    // Investigator's Brochure
  | 'csr'                   // Clinical Study Report
  | 'ind_module'
  | 'nda_module'
  | 'cta_dossier'          // Clinical Trial Application
  | 'regulatory_response'
  | 'briefing_document'
  | 'dsur'
  | 'psur'
  | 'submission_support'
  | 'advisory_prep';

export type DeliverableStatus = 
  | 'not_started'
  | 'in_progress'
  | 'internal_review'
  | 'client_review'
  | 'revision'
  | 'final_qc'
  | 'delivered'
  | 'accepted';

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface CRODeliverable {
  id: string;
  sowId: string;
  type: DeliverableType;
  title: string;
  description: string;
  dueDate: string;
  originalDueDate?: string;
  status: DeliverableStatus;
  completionPct: number;
  budgetedHours: number;
  actualHours: number;
  assignedWriters: string[];
  assignedReviewers: string[];
  clientContact?: string;
  notes?: string;
}

export interface ChangeOrder {
  id: string;
  sowId: string;
  number: string;          // CO-001, CO-002, etc.
  title: string;
  reason: string;
  status: ChangeOrderStatus;
  additionalHours: number;
  additionalFees: number;
  scopeChange: string;
  requestedBy: string;
  requestedDate: string;
  approvedDate?: string;
}

export interface SOW {
  id: string;
  programId: string;
  sowNumber: string;       // SOW-001
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'complete' | 'on_hold' | 'cancelled';
  
  // Financial
  contractValue: number;
  budgetedHours: number;
  actualHours: number;
  revenueRecognized: number;
  
  // Work
  deliverables: CRODeliverable[];
  changeOrders: ChangeOrder[];
  
  // Health
  onSchedule: boolean;
  withinBudget: boolean;
}

export interface CROProgram {
  id: string;
  clientId: string;
  compoundName: string;
  indication: string;
  therapeuticArea: string;
  developmentPhase: string;
  sows: SOW[];
}

export interface CROClient {
  id: string;
  name: string;
  type: 'biotech' | 'pharma' | 'medtech' | 'academic';
  primaryContact: string;
  msaStatus: 'active' | 'expired' | 'renewal_pending';
  msaExpiryDate?: string;
  programs: CROProgram[];
  
  // Metrics
  lifetimeRevenue: number;
  activeSOWs: number;
  overallSatisfaction?: number;
}

export interface CROResource {
  id: string;
  name: string;
  role: 'medical_writer' | 'regulatory_specialist' | 'project_manager' | 'qc_reviewer';
  department: string;
  utilizationTarget: number;   // e.g., 75%
  currentUtilization: number;
  activeAssignments: number;
  availableHours: number;      // Next 2 weeks
}

interface CROClientPortalProps {
  clients: CROClient[];
  resources: CROResource[];
  onClientClick?: (client: CROClient) => void;
  onSOWClick?: (sow: SOW, client: CROClient) => void;
  onDeliverableClick?: (deliverable: CRODeliverable, sow: SOW) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DELIVERABLE_CONFIG: Record<DeliverableType, { label: string; shortLabel: string }> = {
  protocol: { label: 'Protocol', shortLabel: 'Protocol' },
  ib: { label: "Investigator's Brochure", shortLabel: 'IB' },
  csr: { label: 'Clinical Study Report', shortLabel: 'CSR' },
  ind_module: { label: 'IND Module', shortLabel: 'IND' },
  nda_module: { label: 'NDA Module', shortLabel: 'NDA' },
  cta_dossier: { label: 'CTA Dossier', shortLabel: 'CTA' },
  regulatory_response: { label: 'Regulatory Response', shortLabel: 'Response' },
  briefing_document: { label: 'Briefing Document', shortLabel: 'Briefing' },
  dsur: { label: 'DSUR', shortLabel: 'DSUR' },
  psur: { label: 'PSUR', shortLabel: 'PSUR' },
  submission_support: { label: 'Submission Support', shortLabel: 'Support' },
  advisory_prep: { label: 'Advisory Committee Prep', shortLabel: 'AdComm' },
};

const STATUS_CONFIG: Record<DeliverableStatus, { label: string; color: string; bgColor: string }> = {
  not_started: { label: 'Not Started', color: 'text-zinc-500', bgColor: 'bg-zinc-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  internal_review: { label: 'Internal Review', color: 'text-violet-600', bgColor: 'bg-violet-100' },
  client_review: { label: 'Client Review', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  revision: { label: 'Revision', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  final_qc: { label: 'Final QC', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  delivered: { label: 'Delivered', color: 'text-green-600', bgColor: 'bg-green-100' },
  accepted: { label: 'Accepted', color: 'text-green-700', bgColor: 'bg-green-200' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERABLES DUE PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const DeliverablesDuePanel: React.FC<{
  clients: CROClient[];
  onDeliverableClick?: (deliverable: CRODeliverable, sow: SOW) => void;
}> = ({ clients, onDeliverableClick }) => {
  // Flatten all deliverables with context
  const allDeliverables = useMemo(() => {
    const items: Array<{
      deliverable: CRODeliverable;
      sow: SOW;
      client: CROClient;
      program: CROProgram;
    }> = [];
    
    clients.forEach(client => {
      client.programs.forEach(program => {
        program.sows.forEach(sow => {
          sow.deliverables.forEach(deliverable => {
            if (deliverable.status !== 'delivered' && deliverable.status !== 'accepted') {
              items.push({ deliverable, sow, client, program });
            }
          });
        });
      });
    });
    
    return items
      .sort((a, b) => new Date(a.deliverable.dueDate).getTime() - new Date(b.deliverable.dueDate).getTime());
  }, [clients]);
  
  // Group by time window
  const thisWeek = allDeliverables.filter(d => getDaysUntil(d.deliverable.dueDate) <= 7 && getDaysUntil(d.deliverable.dueDate) >= 0);
  const overdue = allDeliverables.filter(d => getDaysUntil(d.deliverable.dueDate) < 0);
  const nextTwoWeeks = allDeliverables.filter(d => getDaysUntil(d.deliverable.dueDate) > 7 && getDaysUntil(d.deliverable.dueDate) <= 14);
  
  const renderDeliverable = (item: typeof allDeliverables[0]) => {
    const daysUntil = getDaysUntil(item.deliverable.dueDate);
    const isOverdue = daysUntil < 0;
    const isUrgent = daysUntil <= 3 && !isOverdue;
    const statusConfig = STATUS_CONFIG[item.deliverable.status];
    const typeConfig = DELIVERABLE_CONFIG[item.deliverable.type];
    
    return (
      <button
        key={item.deliverable.id}
        onClick={() => onDeliverableClick?.(item.deliverable, item.sow)}
        className={cn(
          'w-full p-3 rounded-lg border text-left transition-colors',
          isOverdue && 'border-red-300 bg-red-50',
          isUrgent && !isOverdue && 'border-amber-300 bg-amber-50',
          !isOverdue && !isUrgent && 'border-zinc-200 bg-white hover:bg-zinc-50'
        )}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-zinc-100 text-zinc-600">
              {typeConfig.shortLabel}
            </span>
            <span className={cn('px-2 py-0.5 text-xs font-medium rounded', statusConfig.bgColor, statusConfig.color)}>
              {statusConfig.label}
            </span>
          </div>
          <div className={cn(
            'text-sm font-semibold',
            isOverdue && 'text-red-600',
            isUrgent && !isOverdue && 'text-amber-600',
            !isOverdue && !isUrgent && 'text-zinc-600'
          )}>
            {isOverdue ? `${Math.abs(daysUntil)}d late` : `${daysUntil}d`}
          </div>
        </div>
        
        <p className="text-sm font-medium text-zinc-900 truncate">{item.deliverable.title}</p>
        <p className="text-xs text-zinc-500">{item.client.name} • {item.program.compoundName}</p>
        
        {/* Progress Bar */}
        <div className="mt-2">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Progress</span>
            <span>{item.deliverable.completionPct}%</span>
          </div>
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                item.deliverable.completionPct >= 80 && 'bg-green-500',
                item.deliverable.completionPct >= 50 && item.deliverable.completionPct < 80 && 'bg-amber-500',
                item.deliverable.completionPct < 50 && 'bg-blue-500'
              )}
              style={{ width: `${item.deliverable.completionPct}%` }}
            />
          </div>
        </div>
      </button>
    );
  };
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4 flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-600" />
        Deliverables Pipeline
      </h3>
      
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {overdue.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              OVERDUE ({overdue.length})
            </p>
            <div className="space-y-2">
              {overdue.slice(0, 5).map(renderDeliverable)}
            </div>
          </div>
        )}
        
        {thisWeek.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-600 mb-2">THIS WEEK ({thisWeek.length})</p>
            <div className="space-y-2">
              {thisWeek.map(renderDeliverable)}
            </div>
          </div>
        )}
        
        {nextTwoWeeks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-2">NEXT 2 WEEKS ({nextTwoWeeks.length})</p>
            <div className="space-y-2">
              {nextTwoWeeks.slice(0, 5).map(renderDeliverable)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE UTILIZATION PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const ResourceUtilizationPanel: React.FC<{
  resources: CROResource[];
}> = ({ resources }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, CROResource[]> = {};
    resources.forEach(r => {
      if (!groups[r.role]) groups[r.role] = [];
      groups[r.role].push(r);
    });
    return groups;
  }, [resources]);
  
  const roleLabels: Record<string, string> = {
    medical_writer: 'Medical Writers',
    regulatory_specialist: 'Regulatory Specialists',
    project_manager: 'Project Managers',
    qc_reviewer: 'QC Reviewers',
  };
  
  const avgUtilization = resources.length > 0
    ? Math.round(resources.reduce((sum, r) => sum + r.currentUtilization, 0) / resources.length)
    : 0;
  
  const overUtilized = resources.filter(r => r.currentUtilization > 90);
  const underUtilized = resources.filter(r => r.currentUtilization < 60);
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-600" />
          Resource Utilization
        </h3>
        <span className={cn(
          'px-3 py-1 text-sm font-semibold rounded-full',
          avgUtilization >= 80 && 'bg-green-100 text-green-700',
          avgUtilization >= 60 && avgUtilization < 80 && 'bg-amber-100 text-amber-700',
          avgUtilization < 60 && 'bg-red-100 text-red-700'
        )}>
          {avgUtilization}% Avg
        </span>
      </div>
      
      {/* Alerts */}
      {(overUtilized.length > 0 || underUtilized.length > 0) && (
        <div className="flex gap-2 mb-4">
          {overUtilized.length > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {overUtilized.length} over capacity
            </span>
          )}
          {underUtilized.length > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              {underUtilized.length} available
            </span>
          )}
        </div>
      )}
      
      {/* By Role */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([role, members]) => {
          const avgRoleUtil = Math.round(members.reduce((sum, m) => sum + m.currentUtilization, 0) / members.length);
          
          return (
            <div key={role}>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium text-zinc-700">{roleLabels[role] || role}</span>
                <span className="text-zinc-500">{avgRoleUtil}% avg</span>
              </div>
              <div className="space-y-1.5">
                {members.map(resource => (
                  <div key={resource.id} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-zinc-600 truncate">{resource.name.split(' ')[0]}</span>
                    <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          resource.currentUtilization > 90 && 'bg-red-500',
                          resource.currentUtilization > 75 && resource.currentUtilization <= 90 && 'bg-green-500',
                          resource.currentUtilization >= 60 && resource.currentUtilization <= 75 && 'bg-amber-500',
                          resource.currentUtilization < 60 && 'bg-blue-400'
                        )}
                        style={{ width: `${Math.min(resource.currentUtilization, 100)}%` }}
                      />
                    </div>
                    <span className={cn(
                      'w-10 text-xs font-medium text-right',
                      resource.currentUtilization > 90 && 'text-red-600',
                      resource.currentUtilization <= 90 && 'text-zinc-600'
                    )}>
                      {resource.currentUtilization}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE ORDERS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const ChangeOrdersPanel: React.FC<{
  clients: CROClient[];
}> = ({ clients }) => {
  // Flatten change orders
  const changeOrders = useMemo(() => {
    const items: Array<{
      co: ChangeOrder;
      sow: SOW;
      client: CROClient;
    }> = [];
    
    clients.forEach(client => {
      client.programs.forEach(program => {
        program.sows.forEach(sow => {
          sow.changeOrders.forEach(co => {
            items.push({ co, sow, client });
          });
        });
      });
    });
    
    return items.filter(i => i.co.status !== 'rejected');
  }, [clients]);
  
  const pending = changeOrders.filter(c => c.co.status === 'draft' || c.co.status === 'submitted');
  const totalPendingValue = pending.reduce((sum, c) => sum + c.co.additionalFees, 0);
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-amber-600" />
          Change Orders
        </h3>
        {pending.length > 0 && (
          <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
            {pending.length} pending • {formatCurrency(totalPendingValue)}
          </span>
        )}
      </div>
      
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
        {changeOrders.slice(0, 8).map(({ co, sow, client }) => (
          <div
            key={co.id}
            className={cn(
              'p-3 rounded-lg border',
              co.status === 'submitted' && 'border-amber-200 bg-amber-50',
              co.status === 'draft' && 'border-zinc-200 bg-zinc-50',
              co.status === 'approved' && 'border-green-200 bg-green-50'
            )}
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <span className="text-xs font-medium text-zinc-500">{co.number}</span>
                <p className="text-sm font-medium text-zinc-900">{co.title}</p>
              </div>
              <span className={cn(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                co.status === 'submitted' && 'bg-amber-200 text-amber-700',
                co.status === 'draft' && 'bg-zinc-200 text-zinc-600',
                co.status === 'approved' && 'bg-green-200 text-green-700'
              )}>
                {co.status}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{client.name} • {sow.sowNumber}</p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="text-zinc-600">
                <Clock className="w-3 h-3 inline mr-1" />
                +{co.additionalHours}h
              </span>
              <span className="font-medium text-green-600">
                <DollarSign className="w-3 h-3 inline" />
                {formatCurrency(co.additionalFees)}
              </span>
            </div>
          </div>
        ))}
        
        {changeOrders.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-4 italic">No change orders</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CARD
// ═══════════════════════════════════════════════════════════════════════════════

const ClientCard: React.FC<{
  client: CROClient;
  onClientClick?: (client: CROClient) => void;
  onSOWClick?: (sow: SOW, client: CROClient) => void;
}> = ({ client, onClientClick, onSOWClick }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Calculate metrics
  const metrics = useMemo(() => {
    const allSOWs = client.programs.flatMap(p => p.sows);
    const activeSOWs = allSOWs.filter(s => s.status === 'active');
    const allDeliverables = allSOWs.flatMap(s => s.deliverables);
    const overdueDeliverables = allDeliverables.filter(d => 
      getDaysUntil(d.dueDate) < 0 && d.status !== 'delivered' && d.status !== 'accepted'
    );
    const totalContractValue = allSOWs.reduce((sum, s) => sum + s.contractValue, 0);
    const totalRevenue = allSOWs.reduce((sum, s) => sum + s.revenueRecognized, 0);
    
    return {
      activeSOWs: activeSOWs.length,
      overdueDeliverables: overdueDeliverables.length,
      totalContractValue,
      totalRevenue,
    };
  }, [client]);
  
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            client.type === 'biotech' && 'bg-green-100',
            client.type === 'pharma' && 'bg-blue-100',
            client.type === 'medtech' && 'bg-violet-100',
            client.type === 'academic' && 'bg-amber-100'
          )}>
            <Building2 className={cn(
              'w-5 h-5',
              client.type === 'biotech' && 'text-green-600',
              client.type === 'pharma' && 'text-blue-600',
              client.type === 'medtech' && 'text-violet-600',
              client.type === 'academic' && 'text-amber-600'
            )} />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-zinc-900">{client.name}</h3>
            <p className="text-sm text-zinc-500 capitalize">{client.type} • {client.programs.length} programs</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* MSA Status */}
          {client.msaStatus === 'renewal_pending' && (
            <span className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              MSA Renewal
            </span>
          )}
          
          {/* Active SOWs */}
          <div className="text-right">
            <p className="text-xs text-zinc-500">Active SOWs</p>
            <p className="text-lg font-semibold text-zinc-900">{metrics.activeSOWs}</p>
          </div>
          
          {/* Contract Value */}
          <div className="text-right">
            <p className="text-xs text-zinc-500">Contract Value</p>
            <p className="text-lg font-semibold text-blue-600">{formatCurrency(metrics.totalContractValue)}</p>
          </div>
          
          {/* Alerts */}
          {metrics.overdueDeliverables > 0 && (
            <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">
              {metrics.overdueDeliverables} overdue
            </span>
          )}
          
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-zinc-400" />
          )}
        </div>
      </button>
      
      {/* Expanded SOWs */}
      {expanded && (
        <div className="border-t border-zinc-200 bg-zinc-50 p-4">
          <div className="space-y-3">
            {client.programs.map(program => (
              <div key={program.id}>
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  {program.compoundName} • {program.indication} • {program.developmentPhase}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {program.sows.map(sow => {
                    const hoursUsed = sow.budgetedHours > 0 ? Math.round((sow.actualHours / sow.budgetedHours) * 100) : 0;
                    
                    return (
                      <button
                        key={sow.id}
                        onClick={() => onSOWClick?.(sow, client)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-colors',
                          sow.status === 'active' && 'bg-white border-zinc-200 hover:border-blue-300',
                          sow.status === 'complete' && 'bg-green-50 border-green-200',
                          sow.status === 'on_hold' && 'bg-amber-50 border-amber-200'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-500">{sow.sowNumber}</span>
                          <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full',
                            sow.status === 'active' && 'bg-blue-100 text-blue-700',
                            sow.status === 'complete' && 'bg-green-100 text-green-700',
                            sow.status === 'on_hold' && 'bg-amber-100 text-amber-700'
                          )}>
                            {sow.status}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-zinc-900 truncate">{sow.title}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                          <span>{sow.deliverables.length} deliverables</span>
                          <span>{hoursUsed}% hours used</span>
                        </div>
                        
                        {/* Budget Bar */}
                        <div className="mt-2 h-1 bg-zinc-200 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              hoursUsed <= 80 && 'bg-green-500',
                              hoursUsed > 80 && hoursUsed <= 100 && 'bg-amber-500',
                              hoursUsed > 100 && 'bg-red-500'
                            )}
                            style={{ width: `${Math.min(hoursUsed, 120)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CROClientPortal: React.FC<CROClientPortalProps> = ({
  clients,
  resources,
  onClientClick,
  onSOWClick,
  onDeliverableClick,
  className,
}) => {
  // Calculate aggregate metrics
  const metrics = useMemo(() => {
    const allSOWs = clients.flatMap(c => c.programs.flatMap(p => p.sows));
    const activeSOWs = allSOWs.filter(s => s.status === 'active');
    const totalContractValue = allSOWs.reduce((sum, s) => sum + s.contractValue, 0);
    const totalRevenue = allSOWs.reduce((sum, s) => sum + s.revenueRecognized, 0);
    const allDeliverables = allSOWs.flatMap(s => s.deliverables);
    const activeDeliverables = allDeliverables.filter(d => d.status !== 'delivered' && d.status !== 'accepted');
    const overdueDeliverables = activeDeliverables.filter(d => getDaysUntil(d.dueDate) < 0);
    const pendingCOs = allSOWs.flatMap(s => s.changeOrders).filter(c => c.status === 'submitted');
    
    const avgUtilization = resources.length > 0
      ? Math.round(resources.reduce((sum, r) => sum + r.currentUtilization, 0) / resources.length)
      : 0;
    
    return {
      totalClients: clients.length,
      activeSOWs: activeSOWs.length,
      totalContractValue,
      totalRevenue,
      activeDeliverables: activeDeliverables.length,
      overdueDeliverables: overdueDeliverables.length,
      pendingCOs: pendingCOs.length,
      avgUtilization,
    };
  }, [clients, resources]);
  
  return (
    <div className={cn('flex flex-col h-full bg-zinc-50', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Client Engagement Portal</h1>
            <p className="text-sm text-zinc-500">CRO operations dashboard</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg">
              <Filter className="w-4 h-4 inline mr-1" />
              Filter
            </button>
            <button className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Briefcase className="w-4 h-4 inline mr-1" />
              New SOW
            </button>
          </div>
        </div>
        
        {/* Metrics Bar */}
        <div className="grid grid-cols-6 gap-4">
          <div className="p-3 bg-zinc-100 rounded-lg">
            <p className="text-xs text-zinc-500">Clients</p>
            <p className="text-xl font-semibold text-zinc-900">{metrics.totalClients}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600">Active SOWs</p>
            <p className="text-xl font-semibold text-blue-700">{metrics.activeSOWs}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-green-600">Contract Value</p>
            <p className="text-xl font-semibold text-green-700">{formatCurrency(metrics.totalContractValue)}</p>
          </div>
          <div className={cn('p-3 rounded-lg', metrics.overdueDeliverables > 0 ? 'bg-red-50' : 'bg-zinc-100')}>
            <p className={cn('text-xs', metrics.overdueDeliverables > 0 ? 'text-red-600' : 'text-zinc-500')}>Overdue</p>
            <p className={cn('text-xl font-semibold', metrics.overdueDeliverables > 0 ? 'text-red-700' : 'text-zinc-900')}>
              {metrics.overdueDeliverables}
            </p>
          </div>
          <div className={cn('p-3 rounded-lg', metrics.pendingCOs > 0 ? 'bg-amber-50' : 'bg-zinc-100')}>
            <p className={cn('text-xs', metrics.pendingCOs > 0 ? 'text-amber-600' : 'text-zinc-500')}>Pending COs</p>
            <p className={cn('text-xl font-semibold', metrics.pendingCOs > 0 ? 'text-amber-700' : 'text-zinc-900')}>
              {metrics.pendingCOs}
            </p>
          </div>
          <div className="p-3 bg-violet-50 rounded-lg">
            <p className="text-xs text-violet-600">Utilization</p>
            <p className="text-xl font-semibold text-violet-700">{metrics.avgUtilization}%</p>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Client Cards */}
          <div className="col-span-2 space-y-4">
            {clients.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                onClientClick={onClientClick}
                onSOWClick={onSOWClick}
              />
            ))}
          </div>
          
          {/* Right: Operations Panels */}
          <div className="space-y-6">
            <DeliverablesDuePanel
              clients={clients}
              onDeliverableClick={onDeliverableClick}
            />
            <ResourceUtilizationPanel resources={resources} />
            <ChangeOrdersPanel clients={clients} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CROClientPortal;
