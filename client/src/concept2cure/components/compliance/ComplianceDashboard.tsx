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
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    if (s >= 90) return '#92a87a'; // stone-1000
    if (s >= 70) return '#eab308'; // stone-1000
    return '#ef4444'; // stone-1000
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
          className="text-stone-200"
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
          className="transition-all duration-200 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-lg font-medium"
          style={{ color: getScoreColor(score) }}
        >
          {score}
        </span>
        {label && (
          <span className="text-xs text-stone-500">{label}</span>
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
    if (s >= 90) return 'bg-stone-1000';
    if (s >= 70) return 'bg-stone-1000';
    return 'bg-stone-1000';
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 flex items-center justify-center rounded-md bg-stone-100 text-stone-600 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-stone-700">{label}</span>
          <span className="text-sm text-stone-500">{score}%</span>
        </div>
        <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getScoreColor(score)}`}
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
      bgColor: 'bg-stone-100',
      borderColor: 'border-stone-200',
      iconColor: 'text-stone-1000',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-stone-100',
      borderColor: 'border-stone-200',
      iconColor: 'text-stone-1000',
    },
    info: {
      icon: Info,
      bgColor: 'bg-stone-100',
      borderColor: 'border-stone-200',
      iconColor: 'text-stone-1000',
    },
  };

  const config = severityConfig[violation.severity];
  const Icon = config.icon;

  return (
    <div className={`border rounded-xl ${config.bgColor} ${config.borderColor}`}>
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full p-5 h-auto flex items-start gap-3 text-left rounded-none"
      >
        <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-stone-500">
              {violation.ruleId}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-stone-200 text-stone-600">
              {violation.category}
            </span>
          </div>
          <p className="text-sm font-medium text-stone-900">
            {violation.ruleName}
          </p>
          <p className="text-sm text-stone-600 mt-0.5">
            {violation.message}
          </p>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
        )}
      </Button>

      {isExpanded && (
        <div className="px-5 pb-5 ml-8 space-y-2">
          {violation.suggestion && (
            <div className="p-2 bg-white rounded-xl">
              <p className="text-xs text-stone-500 mb-1">Suggestion:</p>
              <p className="text-sm text-stone-700">{violation.suggestion}</p>
            </div>
          )}
          {violation.regulatoryReference && (
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <BookOpen className="w-3 h-3" />
              <span>Reference: {violation.regulatoryReference}</span>
            </div>
          )}
          {violation.location?.section && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClick}
              className="h-auto px-1 py-0.5 text-xs text-stone-600 hover:text-stone-700"
            >
              <ExternalLink className="w-3 h-3" />
              Go to location
            </Button>
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
      <span className="flex items-center gap-1 text-stone-1000 text-sm">
        <TrendingUp className="w-4 h-4" />
        +{diff}%
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="flex items-center gap-1 text-stone-1000 text-sm">
        <TrendingDown className="w-4 h-4" />
        {diff}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-stone-400 text-sm">
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
      <div className="px-5 py-4 border-b border-stone-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
              <Shield size={18} strokeWidth={2} className="text-stone-600" />
            </div>
            <div>
              <h2 className="font-semibold text-stone-900">Compliance Dashboard</h2>
              {documentTitle && (
                <p className="text-sm text-stone-500">{documentTitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={isLoading}
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 text-stone-600 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {onExport && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExport}
                title="Export Report"
              >
                <Download className="w-4 h-4 text-stone-600" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Score Overview */}
      <div className="px-5 py-4 border-b border-stone-100 bg-stone-50">
        <div className="flex items-center gap-6">
          <ScoreRing score={score.overall} label="Overall" />
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              {submissionType && (
                <span className="px-3 py-1 bg-stone-100 text-stone-600 text-sm font-medium rounded-full">
                  {submissionType}
                </span>
              )}
              <TrendIndicator history={history} />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-stone-1000">
                <AlertTriangle className="w-4 h-4" />
                {errorCount} errors
              </span>
              <span className="flex items-center gap-1 text-stone-1000">
                <AlertTriangle className="w-4 h-4" />
                {warningCount} warnings
              </span>
              <span className="flex items-center gap-1 text-stone-1000">
                <Info className="w-4 h-4" />
                {infoCount} info
              </span>
              <span className="text-stone-400">
                {score.passedRules}/{score.totalRules} rules passed
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-2">
              Last checked: {new Date(score.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="px-5 py-4 border-b border-stone-100">
        <h3 className="text-sm font-medium text-stone-700 mb-3">
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
        <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
          <Filter className="w-4 h-4 text-stone-400" />
          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-sm bg-stone-100 border-0">
              <SelectValue placeholder="All Severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
              <SelectItem value="warning">Warnings</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
            <SelectTrigger className="w-[150px] h-8 text-sm bg-stone-100 border-0">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="structure">Structure</SelectItem>
              <SelectItem value="content">Content</SelectItem>
              <SelectItem value="citation">Citations</SelectItem>
              <SelectItem value="format">Format</SelectItem>
              <SelectItem value="completeness">Completeness</SelectItem>
              <SelectItem value="regulatory">Regulatory</SelectItem>
              <SelectItem value="data_integrity">Data Integrity</SelectItem>
              <SelectItem value="signature">Signatures</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-stone-500 ml-auto">
            {filteredViolations.length} issues
          </span>
        </div>

        {/* Violations List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {filteredViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-stone-500">
              <CheckCircle className="w-12 h-12 mb-3 text-stone-1000" />
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
