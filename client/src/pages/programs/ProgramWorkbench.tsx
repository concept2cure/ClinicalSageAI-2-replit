/**
 * Program Workbench Dashboard
 *
 * Unified dashboard for regulatory programs with real-time status tiles,
 * timeline view, and evidence tracking.
 *
 * @version 1.0.0
 * @module client/src/pages/programs
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LoadingState, ErrorState, EmptyState, DataStateWrapper } from '@/components/ui/states';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Program {
  id: string;
  name: string;
  code: string;
  programType: 'CER' | '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'DE_NOVO';
  productType: string;
  deviceClass?: string;
  primaryAgency: string;
  productName: string;
  status: 'draft' | 'active' | 'in_review' | 'submitted' | 'approved' | 'rejected' | 'archived';
  phase: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  progressPercent: number;
  targetSubmissionDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface DashboardStats {
  totalPrograms: number;
  activePrograms: number;
  submittedPrograms: number;
  approvedPrograms: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  upcomingDeadlines: Array<{
    programId: string;
    programName: string;
    deadline: string;
    daysRemaining: number;
  }>;
  recentActivity: number;
  evidenceCount: number;
  pendingReviews: number;
}

interface Milestone {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'at_risk';
  targetDate: string;
  actualDate?: string;
  progress: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

const fetchPrograms = async (): Promise<Program[]> => {
  const response = await fetch('/api/programs');
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch programs');
  return data.data;
};

const fetchDashboardStats = async (): Promise<DashboardStats> => {
  const response = await fetch('/api/programs/stats/overview');
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch stats');
  return data.data;
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Status badge component */
const StatusBadge: React.FC<{ status: Program['status'] }> = ({ status }) => {
  const config: Record<Program['status'], { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    active: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Active' },
    in_review: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Review' },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    archived: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Archived' },
  };
  const { bg, text, label } = config[status];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
};

/** Priority indicator */
const PriorityIndicator: React.FC<{ priority: Program['priority'] }> = ({ priority }) => {
  const colors: Record<Program['priority'], string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500',
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[priority]}`}
      title={`${priority.charAt(0).toUpperCase() + priority.slice(1)} priority`}
    />
  );
};

/** Program type badge */
const ProgramTypeBadge: React.FC<{ type: Program['programType'] }> = ({ type }) => {
  const colors: Record<Program['programType'], string> = {
    CER: 'bg-indigo-100 text-indigo-700',
    '510K': 'bg-cyan-100 text-cyan-700',
    IND: 'bg-emerald-100 text-emerald-700',
    NDA: 'bg-violet-100 text-violet-700',
    BLA: 'bg-fuchsia-100 text-fuchsia-700',
    PMA: 'bg-rose-100 text-rose-700',
    DE_NOVO: 'bg-amber-100 text-amber-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type]}`}
    >
      {type.replace('_', ' ')}
    </span>
  );
};

/** Progress bar component */
const ProgressBar: React.FC<{ percent: number; size?: 'sm' | 'md' }> = ({
  percent,
  size = 'md',
}) => {
  const height = size === 'sm' ? 'h-1.5' : 'h-2';
  const color =
    percent >= 75
      ? 'bg-green-500'
      : percent >= 50
        ? 'bg-blue-500'
        : percent >= 25
          ? 'bg-yellow-500'
          : 'bg-gray-400';

  return (
    <div className={`w-full bg-gray-200 rounded-full ${height}`}>
      <div
        className={`${color} ${height} rounded-full transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};

/** Stats tile component */
const StatsTile: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color?: string;
}> = ({ label, value, icon, trend, trendValue, color = 'blue' }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          {trend && trendValue && (
            <p
              className={`text-xs mt-1 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
};

/** Program card component */
const ProgramCard: React.FC<{ program: Program; onClick: () => void }> = ({ program, onClick }) => {
  const daysUntilDeadline = program.targetSubmissionDate
    ? Math.ceil(
        (new Date(program.targetSubmissionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <PriorityIndicator priority={program.priority} />
          <ProgramTypeBadge type={program.programType} />
        </div>
        <StatusBadge status={program.status} />
      </div>

      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{program.name}</h3>
      <p className="text-sm text-gray-500 mb-3">{program.productName}</p>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>{program.primaryAgency}</span>
        <span>{program.progressPercent}%</span>
      </div>
      <ProgressBar percent={program.progressPercent} size="sm" />

      {daysUntilDeadline !== null && (
        <div
          className={`mt-3 text-xs ${daysUntilDeadline < 30 ? 'text-red-600' : daysUntilDeadline < 90 ? 'text-yellow-600' : 'text-gray-500'}`}
        >
          {daysUntilDeadline > 0 ? `${daysUntilDeadline} days until deadline` : 'Deadline passed'}
        </div>
      )}
    </div>
  );
};

/** Upcoming deadlines component */
const UpcomingDeadlines: React.FC<{ deadlines: DashboardStats['upcomingDeadlines'] }> = ({
  deadlines,
}) => {
  if (deadlines.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-4">No upcoming deadlines</div>;
  }

  return (
    <div className="space-y-3">
      {deadlines.map(deadline => (
        <div
          key={deadline.programId}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">{deadline.programName}</p>
            <p className="text-xs text-gray-500">
              {new Date(deadline.deadline).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`text-sm font-medium ${
              deadline.daysRemaining < 30
                ? 'text-red-600'
                : deadline.daysRemaining < 90
                  ? 'text-yellow-600'
                  : 'text-green-600'
            }`}
          >
            {deadline.daysRemaining}d
          </span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ProgramWorkbench: React.FC = () => {
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch data
  const {
    data: programs,
    isLoading: programsLoading,
    error: programsError,
    refetch: refetchPrograms,
  } = useQuery({ queryKey: ['programs'], queryFn: fetchPrograms });

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({ queryKey: ['programStats'], queryFn: fetchDashboardStats });

  // Filter programs
  const filteredPrograms = programs?.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterType !== 'all' && p.programType !== filterType) return false;
    return true;
  });

  // Icons (inline SVG for simplicity)
  const icons = {
    folder: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    ),
    check: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    document: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    clock: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Program Workbench</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage regulatory programs, track evidence, and monitor milestones
              </p>
            </div>
            <button
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              onClick={() => {
                /* TODO: Open create modal */
              }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Program
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Tiles */}
        <DataStateWrapper
          isLoading={statsLoading}
          error={statsError as Error | null}
          data={stats}
          loadingComponent={<LoadingState message="Loading statistics..." />}
        >
          {statsData => (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatsTile
                label="Total Programs"
                value={statsData.totalPrograms}
                icon={icons.folder}
                color="blue"
              />
              <StatsTile
                label="Active Programs"
                value={statsData.activePrograms}
                icon={icons.clock}
                color="green"
              />
              <StatsTile
                label="Evidence Objects"
                value={statsData.evidenceCount}
                icon={icons.document}
                color="purple"
              />
              <StatsTile
                label="Pending Reviews"
                value={statsData.pendingReviews}
                icon={icons.check}
                color="yellow"
              />
            </div>
          )}
        </DataStateWrapper>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="block w-40 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="in_review">In Review</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="block w-40 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="CER">CER</option>
                    <option value="510K">510(k)</option>
                    <option value="IND">IND</option>
                    <option value="NDA">NDA</option>
                    <option value="BLA">BLA</option>
                    <option value="PMA">PMA</option>
                    <option value="DE_NOVO">De Novo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Programs Grid */}
            <DataStateWrapper
              isLoading={programsLoading}
              error={programsError as Error | null}
              data={filteredPrograms}
              loadingComponent={<LoadingState message="Loading programs..." />}
              emptyComponent={
                <EmptyState
                  title="No programs found"
                  description="Create your first regulatory program to get started"
                  action={{ label: 'Create Program', onClick: () => {} }}
                />
              }
              retry={refetchPrograms}
            >
              {programsData => (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {programsData.map(program => (
                    <ProgramCard
                      key={program.id}
                      program={program}
                      onClick={() => setSelectedProgram(program.id)}
                    />
                  ))}
                </div>
              )}
            </DataStateWrapper>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Upcoming Deadlines */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Upcoming Deadlines</h3>
              <DataStateWrapper
                isLoading={statsLoading}
                error={statsError as Error | null}
                data={stats?.upcomingDeadlines}
              >
                {deadlines => <UpcomingDeadlines deadlines={deadlines} />}
              </DataStateWrapper>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  📄 Add Literature Evidence
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  🧪 Upload Test Report
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  📊 Generate CER
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                  ✅ Review Pending Items
                </button>
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
              <DataStateWrapper
                isLoading={statsLoading}
                error={statsError as Error | null}
                data={stats}
              >
                {statsData => (
                  <p className="text-sm text-gray-600">
                    {statsData.recentActivity} activities in the last 24 hours
                  </p>
                )}
              </DataStateWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgramWorkbench;
