/**
 * Compliance Scoring Dashboard
 * 
 * Phase 5: Intelligent Document System
 * Real-time compliance scoring and monitoring dashboard.
 * 
 * Features:
 * - Overall compliance score visualization
 * - Category breakdown charts
 * - Violation list with filtering
 * - Trend analysis
 * - Export compliance reports
 */

import React, { useState, useMemo } from 'react';
import {
  FileCheck,
  AlertTriangle,
  CheckCircle,
  Info,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Shield,
  FileText,
  BookOpen,
  Hash,
  Lock,
  PenTool,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RuleSeverity = 'error' | 'warning' | 'info';

type RuleCategory =
  | 'structure'
  | 'content'
  | 'citation'
  | 'format'
  | 'completeness'
  | 'regulatory'
  | 'data_integrity'
  | 'signature';

interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  category: RuleCategory;
  message: string;
  suggestion?: string;
  location?: {
    section?: string;
    line?: number;
    range?: { from: number; to: number };
  };
  regulatoryReference?: string;
}

interface ComplianceScore {
  overall: number;
  breakdown: {
    structure: number;
    content: number;
    citations: number;
    format: number;
    completeness: number;
    regulatory: number;
    dataIntegrity: number;
    signature: number;
  };
  violations: ComplianceViolation[];
  passedRules: number;
  totalRules: number;
  timestamp: string;
}

interface ComplianceHistory {
  timestamp: string;
  score: number;
}

interface ComplianceDashboardProps {
  score: ComplianceScore;
  history?: ComplianceHistory[];
  documentTitle?: string;
  submissionType?: string;
  onViolationClick?: (violation: ComplianceViolation) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  isLoading?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Ring Component
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 120,
  strokeWidth = 8,
  label,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 90) return '#92a87a'; // green-500
    if (s >= 70) return '#eab308'; // yellow-500
    return '#ef4444'; // red-500
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getScoreColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold"
          style={{ color: getScoreColor(score) }}
        >
          {score}
        </span>
        {label && (
          <span className="text-xs text-zinc-500">{label}</span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Category Score Bar
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryScoreBarProps {
  label: string;
  score: number;
  icon: React.ReactNode;
}

const CategoryScoreBar: React.FC<CategoryScoreBarProps> = ({ label, score, icon }) => {
  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-green-500';
    if (s >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-zinc-700">{label}</span>
          <span className="text-sm text-zinc-500">{score}%</span>
        </div>
        <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getScoreColor(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Violation Card
// ─────────────────────────────────────────────────────────────────────────────

interface ViolationCardProps {
  violation: ComplianceViolation;
  isExpanded?: boolean;
  onToggle: () => void;
  onClick?: () => void;
}

const ViolationCard: React.FC<ViolationCardProps> = ({
  violation,
  isExpanded,
  onToggle,
  onClick,
}) => {
  const severityConfig = {
    error: {
      icon: AlertTriangle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-500',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      iconColor: 'text-yellow-500',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-500',
    },
  };

  const config = severityConfig[violation.severity];
  const Icon = config.icon;

  return (
    <div className={`border rounded-lg ${config.bgColor} ${config.borderColor}`}>
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-start gap-3 text-left"
      >
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-zinc-500">
              {violation.ruleId}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600">
              {violation.category}
            </span>
          </div>
          <p className="text-sm font-medium text-zinc-800">
            {violation.ruleName}
          </p>
          <p className="text-sm text-zinc-600 mt-0.5">
            {violation.message}
          </p>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 ml-8 space-y-2">
          {violation.suggestion && (
            <div className="p-2 bg-white rounded-lg">
              <p className="text-xs text-zinc-500 mb-1">Suggestion:</p>
              <p className="text-sm text-zinc-700">{violation.suggestion}</p>
            </div>
          )}
          {violation.regulatoryReference && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <BookOpen className="w-3 h-3" />
              <span>Reference: {violation.regulatoryReference}</span>
            </div>
          )}
          {violation.location?.section && (
            <button
              onClick={onClick}
              className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="w-3 h-3" />
              Go to location
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Trend Indicator
// ─────────────────────────────────────────────────────────────────────────────

interface TrendIndicatorProps {
  history: ComplianceHistory[];
}

const TrendIndicator: React.FC<TrendIndicatorProps> = ({ history }) => {
  if (history.length < 2) return null;

  const latest = history[history.length - 1].score;
  const previous = history[history.length - 2].score;
  const diff = latest - previous;

  if (diff > 0) {
    return (
      <span className="flex items-center gap-1 text-green-500 text-sm">
        <TrendingUp className="w-4 h-4" />
        +{diff}%
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex items-center gap-1 text-red-500 text-sm">
        <TrendingDown className="w-4 h-4" />
        {diff}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-zinc-400 text-sm">
      <Minus className="w-4 h-4" />
      No change
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({
  score,
  history = [],
  documentTitle,
  submissionType,
  onViolationClick,
  onRefresh,
  onExport,
  isLoading = false,
  className = '',
}) => {
  const [severityFilter, setSeverityFilter] = useState<RuleSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | 'all'>('all');
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);

  // Filter violations
  const filteredViolations = useMemo(() => {
    let filtered = score.violations;

    if (severityFilter !== 'all') {
      filtered = filtered.filter(v => v.severity === severityFilter);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(v => v.category === categoryFilter);
    }

    return filtered;
  }, [score.violations, severityFilter, categoryFilter]);

  // Violation counts
  const errorCount = score.violations.filter(v => v.severity === 'error').length;
  const warningCount = score.violations.filter(v => v.severity === 'warning').length;
  const infoCount = score.violations.filter(v => v.severity === 'info').length;

  // Category icons
  const categoryIcons: Record<keyof typeof score.breakdown, React.ReactNode> = {
    structure: <FileText className="w-4 h-4" />,
    content: <PenTool className="w-4 h-4" />,
    citations: <BookOpen className="w-4 h-4" />,
    format: <Hash className="w-4 h-4" />,
    completeness: <CheckCircle className="w-4 h-4" />,
    regulatory: <Shield className="w-4 h-4" />,
    dataIntegrity: <Lock className="w-4 h-4" />,
    signature: <FileCheck className="w-4 h-4" />,
  };

  const categoryLabels: Record<keyof typeof score.breakdown, string> = {
    structure: 'Document Structure',
    content: 'Content Quality',
    citations: 'Citations',
    format: 'Formatting',
    completeness: 'Completeness',
    regulatory: 'Regulatory Alignment',
    dataIntegrity: 'Data Integrity',
    signature: 'Signatures',
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-800">Compliance Dashboard</h2>
              {documentTitle && (
                <p className="text-sm text-zinc-500">{documentTitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-zinc-600 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                title="Export Report"
              >
                <Download className="w-5 h-5 text-zinc-600" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Score Overview */}
      <div className="p-4 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-6">
          <ScoreRing score={score.overall} label="Overall" />
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              {submissionType && (
                <span className="px-3 py-1 bg-blue-100 text-blue-600 text-sm font-medium rounded-full">
                  {submissionType}
                </span>
              )}
              <TrendIndicator history={history} />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="w-4 h-4" />
                {errorCount} errors
              </span>
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="w-4 h-4" />
                {warningCount} warnings
              </span>
              <span className="flex items-center gap-1 text-blue-500">
                <Info className="w-4 h-4" />
                {infoCount} info
              </span>
              <span className="text-zinc-400">
                {score.passedRules}/{score.totalRules} rules passed
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Last checked: {new Date(score.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="p-4 border-b border-zinc-200">
        <h3 className="text-sm font-medium text-zinc-700 mb-3">
          Category Breakdown
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(score.breakdown).map(([key, value]) => (
            <CategoryScoreBar
              key={key}
              label={categoryLabels[key as keyof typeof score.breakdown]}
              score={value}
              icon={categoryIcons[key as keyof typeof score.breakdown]}
            />
          ))}
        </div>
      </div>

      {/* Violations Section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-3 border-b border-zinc-200 flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="px-2 py-1 bg-zinc-100 border-0 rounded text-sm"
          >
            <option value="all">All Severities</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)}
            className="px-2 py-1 bg-zinc-100 border-0 rounded text-sm"
          >
            <option value="all">All Categories</option>
            <option value="structure">Structure</option>
            <option value="content">Content</option>
            <option value="citation">Citations</option>
            <option value="format">Format</option>
            <option value="completeness">Completeness</option>
            <option value="regulatory">Regulatory</option>
            <option value="data_integrity">Data Integrity</option>
            <option value="signature">Signatures</option>
          </select>
          <span className="text-xs text-zinc-500 ml-auto">
            {filteredViolations.length} issues
          </span>
        </div>

        {/* Violations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
              <CheckCircle className="w-12 h-12 mb-3 text-green-500" />
              <p className="font-medium">No Issues Found</p>
              <p className="text-sm">
                {severityFilter === 'all' && categoryFilter === 'all'
                  ? 'Document passes all compliance checks!'
                  : 'No issues match the current filters'}
              </p>
            </div>
          ) : (
            filteredViolations.map(violation => (
              <ViolationCard
                key={`${violation.ruleId}-${violation.message}`}
                violation={violation}
                isExpanded={expandedViolation === violation.ruleId}
                onToggle={() =>
                  setExpandedViolation(
                    expandedViolation === violation.ruleId ? null : violation.ruleId
                  )
                }
                onClick={() => onViolationClick?.(violation)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplianceDashboard;
