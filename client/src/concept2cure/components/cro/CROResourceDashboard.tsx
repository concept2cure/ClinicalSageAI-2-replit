/**
 * @fileoverview CRO Resource & Deliverable Dashboard
 * @module concept2cure/components/cro/CROResourceDashboard
 * @version 1.0.0
 *
 * @description
 * Specialized dashboard for CRO operations management.
 * Reflects real CRO organizational models:
 * - Client relationship management (MSA/SOW tracking)
 * - Multi-client resource allocation
 * - Deliverable tracking with burn rates
 * - Change order management
 * - Billable hours and utilization
 *
 * CRO Workflow Reality:
 * - MSA (Master Service Agreement) per client
 * - SOW (Statement of Work) per project under MSA
 * - Deliverables defined in SOW with milestones
 * - Resource allocation across multiple clients
 * - Budget tracking and change order processing
 *
 * @compliance
 * - SOX compliance for financial tracking
 * - GDPR for client data handling
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Users,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Briefcase,
  PieChart,
  BarChart3,
  Filter,
  Plus,
  ChevronDown,
  ChevronRight,
  FileText,
  User,
  Building2,
  Target,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CROClient {
  id: string;
  name: string;
  tier: 'enterprise' | 'strategic' | 'standard';
  msaNumber: string;
  msaEndDate: string;
  activeProjects: number;
  totalContractValue: number;
  revenueYTD: number;
  satisfaction?: number;  // NPS or CSAT
}

export interface CROProject {
  id: string;
  clientId: string;
  clientName: string;
  sowNumber: string;
  projectName: string;
  productName: string;
  studyPhase?: string;
  
  // Timeline
  startDate: string;
  targetEndDate: string;
  projectedEndDate?: string;
  
  // Financials
  contractValue: number;
  billedToDate: number;
  burnRate: number;  // % of budget consumed
  hoursConsumed: number;
  hoursBudgeted: number;
  
  // Status
  status: 'active' | 'on_hold' | 'at_risk' | 'completed' | 'cancelled';
  healthScore: number;  // 0-100
  
  // People
  projectManager: string;
  leadWriter?: string;
  teamSize: number;
}

export interface ResourceAllocation {
  resourceId: string;
  resourceName: string;
  role: string;
  department: string;
  
  // Capacity
  totalHours: number;
  allocatedHours: number;
  billableHours: number;
  utilizationRate: number;  // %
  
  // Assignments
  assignments: {
    projectId: string;
    projectName: string;
    clientName: string;
    allocatedHours: number;
    startDate: string;
    endDate: string;
  }[];
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  
  type: 'scope_change' | 'timeline_change' | 'resource_change' | 'budget_increase';
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  
  description: string;
  financialImpact: number;
  hoursImpact: number;
  
  requestedDate: string;
  requestedBy: string;
}

interface CROResourceDashboardProps {
  clients: CROClient[];
  projects: CROProject[];
  resources: ResourceAllocation[];
  changeOrders: ChangeOrder[];
  onProjectClick?: (project: CROProject) => void;
  onResourceClick?: (resource: ResourceAllocation) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<CROProject['status'], {
  label: string;
  color: string;
  bgColor: string;
}> = {
  active: { label: 'Active', color: 'text-green-700', bgColor: 'bg-green-100' },
  on_hold: { label: 'On Hold', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  at_risk: { label: 'At Risk', color: 'text-red-700', bgColor: 'bg-red-100' },
  completed: { label: 'Completed', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  cancelled: { label: 'Cancelled', color: 'text-stone-500', bgColor: 'bg-stone-100' },
};

const TIER_CONFIG: Record<CROClient['tier'], {
  label: string;
  color: string;
}> = {
  enterprise: { label: 'Enterprise', color: 'text-violet-600' },
  strategic: { label: 'Strategic', color: 'text-blue-600' },
  standard: { label: 'Standard', color: 'text-stone-600' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(0)}`;
};

const getHealthColor = (score: number): string => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const ClientCard: React.FC<{
  client: CROClient;
  projects: CROProject[];
  onProjectClick?: (project: CROProject) => void;
}> = ({ client, projects, onProjectClick }) => {
  const [expanded, setExpanded] = useState(false);
  const tierConfig = TIER_CONFIG[client.tier];
  const revenueProgress = (client.revenueYTD / client.totalContractValue) * 100;
  const clientProjects = projects.filter(p => p.clientId === client.id);
  const atRiskProjects = clientProjects.filter(p => p.status === 'at_risk');
  
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-stone-50 transition-colors duration-150"
      >
        <Building2 className="w-8 h-8 text-stone-400" />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-stone-900">{client.name}</h3>
            <span className={cn('text-xs font-medium', tierConfig.color)}>
              {tierConfig.label}
            </span>
            {atRiskProjects.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {atRiskProjects.length} at risk
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            MSA: {client.msaNumber} • {client.activeProjects} active projects
          </p>
        </div>
        
        {/* Financials */}
        <div className="text-right">
          <p className="text-sm font-semibold text-stone-900">
            {formatCurrency(client.revenueYTD)}
            <span className="text-xs text-stone-500 font-normal"> / {formatCurrency(client.totalContractValue)}</span>
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-24 h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  revenueProgress > 90 ? 'bg-green-500' : revenueProgress > 70 ? 'bg-amber-500' : 'bg-blue-500'
                )}
                style={{ width: `${Math.min(revenueProgress, 100)}%` }}
              />
            </div>
            <span className="text-xs text-stone-500">{revenueProgress.toFixed(0)}%</span>
          </div>
        </div>
        
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-stone-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-stone-400" />
        )}
      </button>
      
      {/* Projects */}
      {expanded && (
        <div className="border-t border-stone-200 bg-stone-50 p-4">
          <div className="space-y-2">
            {clientProjects.map(project => {
              const statusConfig = STATUS_CONFIG[project.status];
              
              return (
                <button
                  key={project.id}
                  onClick={() => onProjectClick?.(project)}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-200 hover:border-blue-300 transition-colors text-left"
                >
                  <FileText className="w-5 h-5 text-stone-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{project.projectName}</p>
                    <p className="text-xs text-stone-500">{project.productName} • {project.sowNumber}</p>
                  </div>
                  
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    statusConfig.bgColor,
                    statusConfig.color
                  )}>
                    {statusConfig.label}
                  </span>
                  
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-stone-900">{formatCurrency(project.billedToDate)}</p>
                    <p className="text-xs text-stone-500">{project.burnRate}% burned</p>
                  </div>
                  
                  <div className={cn(
                    'flex items-center gap-1 text-sm font-medium',
                    getHealthColor(project.healthScore)
                  )}>
                    {project.healthScore}
                  </div>
                </button>
              );
            })}
            {clientProjects.length === 0 && (
              <p className="text-sm text-stone-500 italic text-center py-4">No active projects</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIZATION CHART
// ═══════════════════════════════════════════════════════════════════════════════

const UtilizationChart: React.FC<{
  resources: ResourceAllocation[];
  onResourceClick?: (resource: ResourceAllocation) => void;
}> = ({ resources, onResourceClick }) => {
  // Group by department
  const byDepartment = useMemo(() => {
    const groups: Record<string, ResourceAllocation[]> = {};
    resources.forEach(r => {
      if (!groups[r.department]) groups[r.department] = [];
      groups[r.department].push(r);
    });
    return groups;
  }, [resources]);
  
  return (
    <div className="p-4 border border-stone-200 rounded-lg">
      <h3 className="text-sm font-semibold text-stone-900 mb-4">Resource Utilization by Department</h3>
      
      <div className="space-y-4">
        {Object.entries(byDepartment).map(([dept, deptResources]) => {
          const avgUtil = deptResources.reduce((sum, r) => sum + r.utilizationRate, 0) / deptResources.length;
          const overAllocated = deptResources.filter(r => r.utilizationRate > 100).length;
          const underUtilized = deptResources.filter(r => r.utilizationRate < 70).length;
          
          return (
            <div key={dept}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-stone-700">{dept}</span>
                <span className={cn(
                  'text-sm font-medium',
                  avgUtil > 100 ? 'text-red-600' : avgUtil > 85 ? 'text-amber-600' : 'text-green-600'
                )}>
                  {avgUtil.toFixed(0)}% avg
                </span>
              </div>
              
              {/* Utilization bar */}
              <div className="h-6 bg-stone-100 rounded-lg overflow-hidden flex">
                {deptResources.slice(0, 10).map((resource, i) => (
                  <button
                    key={resource.resourceId}
                    onClick={() => onResourceClick?.(resource)}
                    className={cn(
                      'h-full transition-opacity hover:opacity-80',
                      resource.utilizationRate > 100 && 'bg-red-500',
                      resource.utilizationRate > 85 && resource.utilizationRate <= 100 && 'bg-amber-500',
                      resource.utilizationRate >= 70 && resource.utilizationRate <= 85 && 'bg-green-500',
                      resource.utilizationRate < 70 && 'bg-blue-300'
                    )}
                    style={{ width: `${100 / deptResources.length}%` }}
                    title={`${resource.resourceName}: ${resource.utilizationRate}%`}
                  />
                ))}
              </div>
              
              <div className="flex items-center gap-4 mt-1 text-xs text-stone-500">
                <span>{deptResources.length} resources</span>
                {overAllocated > 0 && (
                  <span className="text-red-600">{overAllocated} over-allocated</span>
                )}
                {underUtilized > 0 && (
                  <span className="text-blue-600">{underUtilized} under-utilized</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-stone-200">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500" />
          <span className="text-xs text-stone-500">&gt;100%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500" />
          <span className="text-xs text-stone-500">85-100%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500" />
          <span className="text-xs text-stone-500">70-85%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-300" />
          <span className="text-xs text-stone-500">&lt;70%</span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE ORDER PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const ChangeOrderPanel: React.FC<{
  changeOrders: ChangeOrder[];
}> = ({ changeOrders }) => {
  const pending = changeOrders.filter(co => co.status === 'pending_approval');
  const totalImpact = pending.reduce((sum, co) => sum + co.financialImpact, 0);
  
  return (
    <div className="p-4 border border-stone-200 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">Change Orders</h3>
        <span className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
          {pending.length} pending
        </span>
      </div>
      
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{formatCurrency(totalImpact)}</span> pending approval
          </p>
        </div>
      )}
      
      <div className="space-y-2">
        {changeOrders.slice(0, 5).map(co => (
          <div
            key={co.id}
            className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{co.projectName}</p>
              <p className="text-xs text-stone-500 truncate">{co.description}</p>
            </div>
            <span className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              co.status === 'pending_approval' && 'bg-amber-100 text-amber-700',
              co.status === 'approved' && 'bg-green-100 text-green-700',
              co.status === 'rejected' && 'bg-red-100 text-red-700',
              co.status === 'draft' && 'bg-stone-100 text-stone-600'
            )}>
              {co.status.replace('_', ' ')}
            </span>
            <span className={cn(
              'text-sm font-medium',
              co.financialImpact >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {co.financialImpact >= 0 ? '+' : ''}{formatCurrency(co.financialImpact)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CROResourceDashboard: React.FC<CROResourceDashboardProps> = ({
  clients,
  projects,
  resources,
  changeOrders,
  onProjectClick,
  onResourceClick,
  className,
}) => {
  const [view, setView] = useState<'clients' | 'projects' | 'resources'>('clients');
  
  // Metrics
  const metrics = useMemo(() => {
    const totalContractValue = projects.reduce((sum, p) => sum + p.contractValue, 0);
    const totalBilled = projects.reduce((sum, p) => sum + p.billedToDate, 0);
    const avgUtilization = resources.reduce((sum, r) => sum + r.utilizationRate, 0) / resources.length;
    const atRiskProjects = projects.filter(p => p.status === 'at_risk').length;
    const overAllocated = resources.filter(r => r.utilizationRate > 100).length;
    
    return {
      totalContractValue,
      totalBilled,
      avgUtilization,
      atRiskProjects,
      overAllocated,
      activeProjects: projects.filter(p => p.status === 'active').length,
    };
  }, [projects, resources]);
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-stone-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-stone-900">CRO Operations Dashboard</h2>
          <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
            {(['clients', 'projects', 'resources'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                  view === v ? 'bg-white shadow text-stone-900' : 'text-stone-600 hover:text-stone-900'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        
        {/* Metrics Bar */}
        <div className="grid grid-cols-6 gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 mb-0.5">Total Contract Value</p>
            <p className="text-lg font-semibold text-blue-700">{formatCurrency(metrics.totalContractValue)}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-green-600 mb-0.5">Billed YTD</p>
            <p className="text-lg font-semibold text-green-700">{formatCurrency(metrics.totalBilled)}</p>
          </div>
          <div className="p-3 bg-violet-50 rounded-lg">
            <p className="text-xs text-violet-600 mb-0.5">Active Projects</p>
            <p className="text-lg font-semibold text-violet-700">{metrics.activeProjects}</p>
          </div>
          <div className={cn(
            'p-3 rounded-lg',
            metrics.atRiskProjects > 0 ? 'bg-red-50' : 'bg-stone-50'
          )}>
            <p className={cn('text-xs mb-0.5', metrics.atRiskProjects > 0 ? 'text-red-600' : 'text-stone-500')}>At Risk</p>
            <p className={cn('text-lg font-semibold', metrics.atRiskProjects > 0 ? 'text-red-700' : 'text-stone-600')}>
              {metrics.atRiskProjects}
            </p>
          </div>
          <div className={cn(
            'p-3 rounded-lg',
            metrics.avgUtilization > 90 ? 'bg-amber-50' : 'bg-stone-50'
          )}>
            <p className={cn('text-xs mb-0.5', metrics.avgUtilization > 90 ? 'text-amber-600' : 'text-stone-500')}>
              Avg Utilization
            </p>
            <p className={cn('text-lg font-semibold', metrics.avgUtilization > 90 ? 'text-amber-700' : 'text-stone-700')}>
              {metrics.avgUtilization.toFixed(0)}%
            </p>
          </div>
          <div className="p-3 bg-stone-50 rounded-lg">
            <p className="text-xs text-stone-500 mb-0.5">Clients</p>
            <p className="text-lg font-semibold text-stone-700">{clients.length}</p>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {view === 'clients' && (
          <div className="space-y-4">
            {clients.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                projects={projects}
                onProjectClick={onProjectClick}
              />
            ))}
          </div>
        )}
        
        {view === 'resources' && (
          <div className="grid grid-cols-2 gap-4">
            <UtilizationChart resources={resources} onResourceClick={onResourceClick} />
            <ChangeOrderPanel changeOrders={changeOrders} />
          </div>
        )}
        
        {view === 'projects' && (
          <div className="space-y-2">
            {projects.map(project => {
              const statusConfig = STATUS_CONFIG[project.status];
              return (
                <button
                  key={project.id}
                  onClick={() => onProjectClick?.(project)}
                  className="w-full flex items-center gap-4 p-4 rounded-lg border border-stone-200 hover:border-blue-300 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900">{project.projectName}</p>
                    <p className="text-xs text-stone-500">
                      {project.clientName} • {project.productName} • {project.sowNumber}
                    </p>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    statusConfig.bgColor,
                    statusConfig.color
                  )}>
                    {statusConfig.label}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-900">{formatCurrency(project.billedToDate)}</p>
                    <p className="text-xs text-stone-500">{project.burnRate}% of {formatCurrency(project.contractValue)}</p>
                  </div>
                  <div className={cn(
                    'text-lg font-semibold',
                    getHealthColor(project.healthScore)
                  )}>
                    {project.healthScore}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CROResourceDashboard;
