/**
 * @fileoverview MedTech Industry Workspace
 * @module concept2cure/components/canvas/workspaces/MedTechWorkspace
 * @version 1.0.0
 *
 * @description
 * The MedTech/Device workspace with:
 * - 510(k) Predicate Pathfinder
 * - MAUDE Hazard Monitor
 * - eSTAR Package Manager
 * - CER/PMCF Support (EU MDR)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Filter,
  Download,
  RefreshCw,
  ChevronRight,
  Target,
  Shield,
  Microscope,
  ClipboardList,
  BarChart2,
  Activity,
  Globe,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import {
  usePredicateSearch,
  usePredicateWorkflow,
  useSubmissions,
  useHazardAnalysis,
  useDeviceDashboard,
} from '../../../hooks/useMedicalDevice';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface MedTechWorkspaceProps {
  projectId?: string;
  userId: string;
  onNavigate?: (destination: string) => void;
}

type WorkspaceTab = 'overview' | 'predicates' | 'maude' | 'estar' | 'cer';

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICATE PATHFINDER
// ═══════════════════════════════════════════════════════════════════════════════

interface PredicatePathfinderProps {
  onSelectPredicate: (kNumber: string) => void;
}

const PredicatePathfinder: React.FC<PredicatePathfinderProps> = ({ onSelectPredicate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    productCode: '',
    dateFrom: '',
    dateTo: '',
  });

  const { data: predicates, isLoading } = usePredicateSearch(
    {
      deviceName: searchQuery || undefined,
      productCode: filters.productCode || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      limit: 20,
    },
    searchQuery.length >= 2 || !!filters.productCode
  );

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-zinc-900">Predicate Pathfinder</h3>
            <p className="text-sm text-zinc-500">Search FDA 510(k) database for predicates</p>
          </div>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by device name, product code, or K number..."
            className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Results */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Searching FDA database...</p>
          </div>
        ) : predicates && predicates.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {predicates.map((predicate) => (
              <button
                key={predicate.kNumber}
                onClick={() => onSelectPredicate(predicate.kNumber)}
                className="w-full p-4 hover:bg-zinc-50 transition-colors text-left group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-blue-600">{predicate.kNumber}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[11px] font-medium",
                        predicate.decisionType === 'SE' 
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      )}>
                        {predicate.decisionType}
                      </span>
                      {predicate.similarityScore && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-medium">
                          {Math.round(predicate.similarityScore * 100)}% match
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-zinc-900 mb-1">
                      {predicate.deviceName}
                    </h4>
                    <p className="text-xs text-zinc-500">
                      {predicate.applicant} • {predicate.productCode} • Class {predicate.deviceClass}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="p-8 text-center text-zinc-500">
            <p className="text-sm">No predicates found</p>
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500">
            <Search className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
            <p className="text-sm">Enter at least 2 characters to search</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAUDE HAZARD MONITOR
// ═══════════════════════════════════════════════════════════════════════════════

interface MAUDEHazardMonitorProps {
  productCode: string;
}

const MAUDEHazardMonitor: React.FC<MAUDEHazardMonitorProps> = ({ productCode }) => {
  const { data: hazardAnalysis, isLoading } = useHazardAnalysis(productCode);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
        <p className="text-sm text-zinc-500">Analyzing MAUDE data...</p>
      </div>
    );
  }

  if (!hazardAnalysis) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
        <p className="text-sm text-zinc-500">No hazard data available</p>
      </div>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-100 text-red-700 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'MEDIUM': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'LOW': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'UP': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'DOWN': return <TrendingDown className="w-4 h-4 text-emerald-500" />;
      default: return <Activity className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-zinc-900">MAUDE Hazard Monitor</h3>
            <p className="text-sm text-zinc-500">Product Code: {productCode}</p>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-sm font-medium border",
            getRiskColor(hazardAnalysis.summary.riskLevel)
          )}>
            {hazardAnalysis.summary.riskLevel} Risk
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-zinc-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-zinc-900">
            {hazardAnalysis.summary.totalReports}
          </div>
          <div className="text-xs text-zinc-500">Total Reports</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-600">
            {hazardAnalysis.summary.malfunctions}
          </div>
          <div className="text-xs text-zinc-500">Malfunctions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            {hazardAnalysis.summary.injuries}
          </div>
          <div className="text-xs text-zinc-500">Injuries</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">
            {hazardAnalysis.summary.deaths}
          </div>
          <div className="text-xs text-zinc-500">Deaths</div>
        </div>
      </div>

      {/* Top Issues */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-zinc-900 mb-3">Top Issues</h4>
        <div className="space-y-2">
          {hazardAnalysis.topIssues.slice(0, 5).map((issue, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600">
                  {index + 1}
                </div>
                <span className="text-sm text-zinc-700">{issue.issue}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-900">{issue.count}</span>
                {getTrendIcon(issue.trend)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {hazardAnalysis.recommendations.length > 0 && (
        <div className="p-4 border-t border-zinc-200 bg-amber-50">
          <h4 className="text-sm font-medium text-amber-900 mb-2">Recommendations</h4>
          <ul className="space-y-1">
            {hazardAnalysis.recommendations.map((rec, index) => (
              <li key={index} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="text-amber-500">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const SubmissionTracker: React.FC = () => {
  const { data, isLoading } = useSubmissions({ limit: 10 });
  const submissions = data?.submissions || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-zinc-100 text-zinc-600';
      case 'INTERNAL_REVIEW': return 'bg-blue-100 text-blue-600';
      case 'READY_FOR_SUBMISSION': return 'bg-emerald-100 text-emerald-600';
      case 'SUBMITTED': return 'bg-purple-100 text-purple-600';
      case 'RTA_HOLD': return 'bg-amber-100 text-amber-600';
      case 'SUBSTANTIVE_REVIEW': return 'bg-indigo-100 text-indigo-600';
      case 'AI_REQUEST': return 'bg-orange-100 text-orange-600';
      case 'SE_DETERMINATION': return 'bg-emerald-100 text-emerald-600';
      default: return 'bg-zinc-100 text-zinc-600';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900">Active Submissions</h3>
          <p className="text-sm text-zinc-500">{submissions.length} total</p>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
          <Plus className="w-4 h-4" />
          New 510(k)
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
        </div>
      ) : submissions.length > 0 ? (
        <div className="divide-y divide-zinc-100">
          {submissions.map((submission) => (
            <div
              key={submission.id}
              className="p-4 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-zinc-900">{submission.deviceName}</h4>
                  <p className="text-sm text-zinc-500">{submission.applicant}</p>
                </div>
                <span className={cn(
                  "px-2 py-1 rounded text-xs font-medium",
                  getStatusColor(submission.status)
                )}>
                  {submission.status.replace(/_/g, ' ')}
                </span>
              </div>
              {submission.targetDate && (
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="w-3 h-3" />
                  Target: {new Date(submission.targetDate).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-zinc-500">
          <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
          <p className="text-sm">No active submissions</p>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════════

export const MedTechWorkspace: React.FC<MedTechWorkspaceProps> = ({
  projectId,
  userId,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [selectedProductCode, setSelectedProductCode] = useState<string>('DRC');

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'predicates', label: 'Predicates', icon: Search },
    { id: 'maude', label: 'MAUDE', icon: AlertTriangle },
    { id: 'estar', label: 'eSTAR', icon: ClipboardList },
    { id: 'cer', label: 'CER/PMCF', icon: Globe },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Workspace Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">MedTech Workspace</h2>
            <p className="text-sm text-zinc-500">510(k), PMA, De Novo & EU MDR Tools</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Workspace Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-6">
            <SubmissionTracker />
            <MAUDEHazardMonitor productCode={selectedProductCode} />
            <div className="col-span-2">
              <PredicatePathfinder onSelectPredicate={(k) => console.log('Selected:', k)} />
            </div>
          </div>
        )}

        {activeTab === 'predicates' && (
          <PredicatePathfinder onSelectPredicate={(k) => console.log('Selected:', k)} />
        )}

        {activeTab === 'maude' && (
          <MAUDEHazardMonitor productCode={selectedProductCode} />
        )}

        {activeTab === 'estar' && (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
            <ClipboardList className="w-16 h-16 mx-auto mb-4 text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">eSTAR Package Manager</h3>
            <p className="text-zinc-500 mb-4">FDA eSTAR template management and validation</p>
            <button className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
              Create eSTAR Package
            </button>
          </div>
        )}

        {activeTab === 'cer' && (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
            <Globe className="w-16 h-16 mx-auto mb-4 text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Clinical Evaluation Report</h3>
            <p className="text-zinc-500 mb-4">EU MDR CER and PMCF planning</p>
            <button className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
              Start New CER
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MedTechWorkspace;
