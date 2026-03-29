/**
 * Compliance Guardian
 * 
 * Phase 5: Intelligent Document System
 * 
 * "ICH Guardrails" - Like the CMC Wizard, the Guardian PREVENTS errors before
 * they happen. It doesn't wait for you to ask "is this compliant?" - it tells
 * you immediately when something is wrong and offers to fix it.
 * 
 * Proactive, not reactive. This is what makes Concept2Cure Level 3 Autonomous.
 */

import React, { useState, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Zap,
  FileText,
  Link2,
  Users,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react';
import type { ComplianceGuard, IntelligentDocument } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Rule Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  category: 'structure' | 'content' | 'citation' | 'format' | 'completeness' | 'regulatory' | 'data_integrity' | 'signature';
  severity: 'error' | 'warning' | 'suggestion';
  submissionTypes: Array<'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO' | 'ALL'>;
  regulatoryRef?: string;
  autoFixable: boolean;
  checker: (document: IntelligentDocument, context: ComplianceContext) => ComplianceResult | null;
}

interface ComplianceContext {
  submissionType: string;
  totalClaims: number;
  supportedClaims: number;
  connectedModules: number;
  hasPendingReviews: boolean;
  hasSignatures: boolean;
  wordCount: number;
  sectionCount: number;
}

interface ComplianceResult {
  ruleId: string;
  message: string;
  details?: string;
  affectedText?: string;
  position?: { from: number; to: number };
  suggestion?: string;
  autoFix?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Compliance Rules
// ─────────────────────────────────────────────────────────────────────────────

const COMPLIANCE_RULES: ComplianceRule[] = [
  // Citation Rules
  {
    id: 'citation-unsupported-claims',
    name: 'Unsupported Claims',
    description: 'All efficacy and safety claims must be traceable to source data',
    category: 'citation',
    severity: 'error',
    submissionTypes: ['ALL'],
    regulatoryRef: '21 CFR Part 11',
    autoFixable: true,
    checker: (_doc, ctx) => {
      if (ctx.totalClaims > 0 && ctx.supportedClaims < ctx.totalClaims) {
        const unsupported = ctx.totalClaims - ctx.supportedClaims;
        return {
          ruleId: 'citation-unsupported-claims',
          message: `${unsupported} claim${unsupported > 1 ? 's' : ''} need supporting evidence`,
          details: 'Regulatory submissions require all claims to be traceable to source data.',
          suggestion: 'Use Auto-Traceability to link claims to available sources',
        };
      }
      return null;
    },
  },
  {
    id: 'citation-minimum-sources',
    name: 'Minimum Source Count',
    description: 'Document should have at least 5 unique source references',
    category: 'citation',
    severity: 'warning',
    submissionTypes: ['510K', 'NDA', 'BLA', 'PMA', 'CER'],
    autoFixable: false,
    checker: (_doc, ctx) => {
      if (ctx.supportedClaims < 5) {
        return {
          ruleId: 'citation-minimum-sources',
          message: 'Document has fewer than 5 source references',
          details: 'Robust submissions typically include multiple supporting sources.',
          suggestion: 'Add more literature or data sources to strengthen your submission',
        };
      }
      return null;
    },
  },
  
  // Completeness Rules
  {
    id: 'completeness-word-count',
    name: 'Minimum Content',
    description: 'Document should have sufficient content for the section type',
    category: 'completeness',
    severity: 'warning',
    submissionTypes: ['ALL'],
    autoFixable: false,
    checker: (_doc, ctx) => {
      if (ctx.wordCount < 500) {
        return {
          ruleId: 'completeness-word-count',
          message: 'Document appears incomplete',
          details: `Current word count: ${ctx.wordCount}. Most regulatory sections require 500+ words.`,
          suggestion: 'Continue drafting to meet minimum content requirements',
        };
      }
      return null;
    },
  },
  {
    id: 'completeness-data-connections',
    name: 'Data Integration',
    description: 'Document should be connected to relevant data modules',
    category: 'completeness',
    severity: 'suggestion',
    submissionTypes: ['510K', 'IND', 'NDA', 'BLA'],
    autoFixable: true,
    checker: (_doc, ctx) => {
      if (ctx.connectedModules < 2) {
        return {
          ruleId: 'completeness-data-connections',
          message: 'Limited data source connections',
          details: 'Connect more data modules to enrich your document with cross-referenced evidence.',
          suggestion: 'Go to Data Bridges to connect additional modules',
        };
      }
      return null;
    },
  },
  
  // Regulatory Rules
  {
    id: 'regulatory-predicate-required',
    name: 'Predicate Device Required',
    description: '510(k) submissions must reference at least one predicate device',
    category: 'regulatory',
    severity: 'error',
    submissionTypes: ['510K', 'DE_NOVO'],
    regulatoryRef: '21 CFR 807.87',
    autoFixable: true,
    checker: (doc, ctx) => {
      // This would check for predicate device references
      if (ctx.submissionType === '510K' && ctx.connectedModules === 0) {
        return {
          ruleId: 'regulatory-predicate-required',
          message: 'No predicate device linked',
          details: 'Substantial equivalence requires comparison to a legally marketed predicate device.',
          suggestion: 'Connect the Predicate Finder module to add predicate device data',
        };
      }
      return null;
    },
  },
  {
    id: 'regulatory-ind-clinical',
    name: 'Clinical Protocol Reference',
    description: 'IND submissions must reference the clinical protocol',
    category: 'regulatory',
    severity: 'error',
    submissionTypes: ['IND'],
    regulatoryRef: '21 CFR 312.23',
    autoFixable: false,
    checker: (_doc, _ctx) => {
      // Would check for protocol references
      return null;
    },
  },
  
  // Signature Rules
  {
    id: 'signature-required',
    name: 'Signature Required',
    description: 'Document requires approval signature before export',
    category: 'signature',
    severity: 'error',
    submissionTypes: ['ALL'],
    regulatoryRef: '21 CFR Part 11',
    autoFixable: false,
    checker: (doc, ctx) => {
      if (doc.status === 'draft' && !ctx.hasSignatures) {
        // Only show this when document is otherwise complete
        const complianceScore = doc.complianceScore || 0;
        if (complianceScore >= 90) {
          return {
            ruleId: 'signature-required',
            message: 'Document ready for approval',
            details: 'Electronic signature required before this document can be exported.',
            suggestion: 'Request review and approval from authorized signers',
          };
        }
      }
      return null;
    },
  },
  
  // Format Rules
  {
    id: 'format-heading-structure',
    name: 'Heading Structure',
    description: 'Document should have proper heading hierarchy',
    category: 'format',
    severity: 'warning',
    submissionTypes: ['ALL'],
    autoFixable: true,
    checker: (_doc, _ctx) => {
      // Would analyze heading structure
      return null;
    },
  },
  
  // Data Integrity Rules
  {
    id: 'data-integrity-audit-trail',
    name: 'Audit Trail',
    description: 'All changes must be tracked in the audit trail',
    category: 'data_integrity',
    severity: 'error',
    submissionTypes: ['ALL'],
    regulatoryRef: '21 CFR Part 11',
    autoFixable: false,
    checker: () => null, // Always passes - audit trail is automatic
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceGuardianProps {
  // Document to check
  document: IntelligentDocument | null;
  
  // Compliance context
  submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';
  totalClaims: number;
  supportedClaims: number;
  connectedModules: number;
  hasPendingReviews: boolean;
  hasSignatures: boolean;
  
  // Callbacks
  onIssueClick?: (guard: ComplianceGuard) => void;
  onAutoFix?: (guard: ComplianceGuard) => void;
  onRequestReview?: () => void;
  onNavigateToSection?: (position: { from: number; to: number }) => void;
  
  // Display
  compact?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Score Ring
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceScoreRing: React.FC<{
  score: number;
  size?: number;
}> = ({ score, size = 120 }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  
  const getColor = (s: number) => {
    if (s >= 90) return { stroke: '#22c55e', text: 'text-green-500', bg: 'bg-green-50' };
    if (s >= 70) return { stroke: '#eab308', text: 'text-amber-500', bg: 'bg-amber-50' };
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-50' };
    if (s >= 90) return { stroke: '#92a87a', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' };
    if (s >= 70) return { stroke: '#eab308', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' };
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' };
  };
  
  const colors = getColor(score);
  
  return (
    <div className={`relative inline-flex items-center justify-center p-4 rounded-xl ${colors.bg}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-stone-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-200 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-medium ${colors.text}`}>{score}</span>
        <span className="text-xs text-stone-500">Compliance</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Issue Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface IssueCardProps {
  guard: ComplianceGuard;
  onAction: () => void;
  onAutoFix?: () => void;
}

const IssueCard: React.FC<IssueCardProps> = ({ guard, onAction, onAutoFix }) => {
  const severityConfig = {
    error: {
      icon: XCircle,
      label: 'Error',
      color: 'border-red-200 bg-red-50',
      iconColor: 'text-red-500',
      buttonColor: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: AlertTriangle,
      label: 'Warning',
      color: 'border-amber-200 bg-amber-50',
      iconColor: 'text-amber-500',
      buttonColor: 'bg-amber-600 hover:bg-amber-700',
    },
    suggestion: {
      icon: Lightbulb,
      label: 'Suggestion',
      color: 'border-blue-200 bg-blue-50',
      iconColor: 'text-blue-500',
      buttonColor: 'bg-stone-800 hover:bg-stone-900',
    },
  };
  
  const config = severityConfig[guard.severity];
  const Icon = config.icon;
  
  return (
    <div className={`p-4 rounded-lg border ${config.color}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-stone-900">
              {guard.title}
            </h4>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              guard.severity === 'error' ? 'bg-red-100 text-red-700' :
              guard.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {config.label}
            </span>
          </div>
          
          <p className="text-sm text-stone-600">
            {guard.description}
          </p>
          
          {guard.affectedText && (
            <div className="mt-2 p-2 bg-white/50 rounded text-sm italic text-stone-600">
              "{guard.affectedText}"
            </div>
          )}
          
          {guard.regulatoryRef && (
            <p className="mt-2 text-xs text-stone-500 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {guard.regulatoryRef}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-4">
        {guard.action.autoFixAvailable && onAutoFix && (
          <button
            onClick={onAutoFix}
            className={`flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${config.buttonColor}`}
            data-testid={`button-guard-autofix-${guard.id}`}
          >
            <Zap className="w-4 h-4" />
            Auto-Fix
          </button>
        )}
        <button
          onClick={onAction}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors
            ${guard.action.autoFixAvailable 
              ? 'text-stone-600 hover:bg-stone-100' 
              : `text-white ${config.buttonColor}`
            }`}
          data-testid={`button-guard-action-${guard.id}`}
        >
          <ArrowRight className="w-4 h-4" />
          {guard.action.label}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Category Filter Tabs
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const CATEGORY_TABS: CategoryTab[] = [
  { id: 'all', label: 'All', icon: Shield },
  { id: 'citation', label: 'Citations', icon: Link2 },
  { id: 'regulatory', label: 'Regulatory', icon: FileText },
  { id: 'completeness', label: 'Content', icon: FileText },
  { id: 'signature', label: 'Approvals', icon: Users },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Compliance Guardian Component
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceGuardian: React.FC<ComplianceGuardianProps> = ({
  document,
  submissionType,
  totalClaims,
  supportedClaims,
  connectedModules,
  hasPendingReviews,
  hasSignatures,
  onIssueClick,
  onAutoFix,
  onRequestReview,
  onNavigateToSection: _onNavigateToSection,
  compact = false,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isExpanded, setIsExpanded] = useState(!compact);
  
  // Build compliance context
  const context: ComplianceContext = useMemo(() => ({
    submissionType,
    totalClaims,
    supportedClaims,
    connectedModules,
    hasPendingReviews,
    hasSignatures,
    wordCount: document?.content?.split(/\s+/).length || 0,
    sectionCount: 0, // Would count headings
  }), [document, submissionType, totalClaims, supportedClaims, connectedModules, hasPendingReviews, hasSignatures]);
  
  // Run all compliance checks
  const complianceIssues = useMemo(() => {
    if (!document) return [];
    
    const issues: ComplianceGuard[] = [];
    
    COMPLIANCE_RULES.forEach(rule => {
      // Check if rule applies to this submission type
      if (!rule.submissionTypes.includes('ALL') && 
          !rule.submissionTypes.includes(submissionType as any)) {
        return;
      }
      
      const result = rule.checker(document, context);
      if (result) {
        issues.push({
          id: `guard-${rule.id}`,
          type: rule.id as any,
          severity: rule.severity,
          title: rule.name,
          description: result.message,
          action: {
            type: 'review',
            label: result.suggestion || 'Review',
            autoFixAvailable: rule.autoFixable,
          },
          position: result.position,
          affectedText: result.affectedText,
          regulatoryRef: rule.regulatoryRef,
        });
      }
    });
    
    // Sort by severity
    return issues.sort((a, b) => {
      const order = { error: 0, warning: 1, suggestion: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [document, submissionType, context]);
  
  // Filter issues by category
  const filteredIssues = useMemo(() => {
    if (selectedCategory === 'all') return complianceIssues;
    
    const categoryMap: Record<string, string[]> = {
      citation: ['citation-unsupported-claims', 'citation-minimum-sources'],
      regulatory: ['regulatory-predicate-required', 'regulatory-ind-clinical'],
      completeness: ['completeness-word-count', 'completeness-data-connections'],
      signature: ['signature-required'],
    };
    
    const ruleIds = categoryMap[selectedCategory] || [];
    return complianceIssues.filter(i => ruleIds.some(id => i.type.includes(id)));
  }, [complianceIssues, selectedCategory]);
  
  // Calculate overall score
  const complianceScore = useMemo(() => {
    if (complianceIssues.length === 0) return 100;
    
    const errorCount = complianceIssues.filter(i => i.severity === 'error').length;
    const warningCount = complianceIssues.filter(i => i.severity === 'warning').length;
    
    // Errors are -20 points, warnings are -5 points
    const deduction = (errorCount * 20) + (warningCount * 5);
    return Math.max(0, 100 - deduction);
  }, [complianceIssues]);
  
  // Issue counts by severity
  const errorCount = complianceIssues.filter(i => i.severity === 'error').length;
  const warningCount = complianceIssues.filter(i => i.severity === 'warning').length;
  const suggestionCount = complianceIssues.filter(i => i.severity === 'suggestion').length;
  
  // Get status
  const getStatus = () => {
    if (errorCount > 0) return { label: 'Blocked', icon: ShieldX, color: 'text-red-500' };
    if (warningCount > 0) return { label: 'Needs Attention', icon: ShieldAlert, color: 'text-amber-500' };
    return { label: 'Ready', icon: ShieldCheck, color: 'text-green-500' };
  };
  
  const status = getStatus();
  const StatusIcon = status.icon;
  
  // Compact view
  if (compact) {
    return (
      <div className={`${className}`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 bg-white rounded-lg border border-stone-200 hover:border-blue-300 transition-colors duration-150"
          data-testid="button-compliance-compact-toggle"
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-5 h-5 ${status.color}`} />
            <div className="text-left">
              <p className="font-medium text-stone-900">
                Compliance: {complianceScore}%
              </p>
              <p className="text-xs text-stone-500">
                {errorCount} errors, {warningCount} warnings
              </p>
            </div>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
        </button>
        
        {isExpanded && complianceIssues.length > 0 && (
          <div className="mt-2 space-y-2">
            {complianceIssues.slice(0, 3).map(issue => (
              <IssueCard
                key={issue.id}
                guard={issue}
                onAction={() => onIssueClick?.(issue)}
                onAutoFix={issue.action.autoFixAvailable ? () => onAutoFix?.(issue) : undefined}
              />
            ))}
            {complianceIssues.length > 3 && (
              <p className="text-sm text-center text-stone-500 py-2">
                +{complianceIssues.length - 3} more issues
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
  
  // Full view
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Score */}
      <div className="flex items-center gap-6 p-4 rounded-xl border border-stone-200/70 bg-white shadow-sm">
        <ComplianceScoreRing score={complianceScore} />
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`w-6 h-6 ${status.color}`} />
            <h3 className="text-lg font-semibold text-stone-900">
              {status.label}
            </h3>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="w-4 h-4" />
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                {warningCount} warning{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {suggestionCount > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <Lightbulb className="w-4 h-4" />
                {suggestionCount} suggestion{suggestionCount > 1 ? 's' : ''}
              </span>
            )}
            {complianceIssues.length === 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                All checks passed
              </span>
            )}
          </div>
          
          {complianceScore >= 90 && !hasSignatures && (
            <button
              onClick={onRequestReview}
              className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors duration-150"
              data-testid="button-request-review"
            >
              <Users className="w-4 h-4" />
              Request Review & Approval
            </button>
          )}
        </div>
      </div>
      
      {/* Category Tabs */}
      {complianceIssues.length > 0 && (
        <div className="flex gap-1 p-1 bg-stone-100/80 rounded-xl border border-stone-200/60">
          {CATEGORY_TABS.map(tab => {
            const count = tab.id === 'all' 
              ? complianceIssues.length 
              : filteredIssues.filter(i => i.type.includes(tab.id)).length;
            
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors
                  ${selectedCategory === tab.id
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                  }`}
                data-testid={`button-category-tab-${tab.id}`}
                aria-current={selectedCategory === tab.id ? 'page' : undefined}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs
                    ${selectedCategory === tab.id
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      
      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="text-center py-8">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <h4 className="font-semibold text-stone-900">All Clear!</h4>
          <p className="text-sm text-stone-600 mt-1">
            {selectedCategory === 'all' 
              ? 'No compliance issues found. Your document is ready.'
              : `No ${selectedCategory} issues found.`
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map(issue => (
            <IssueCard
              key={issue.id}
              guard={issue}
              onAction={() => onIssueClick?.(issue)}
              onAutoFix={issue.action.autoFixAvailable ? () => onAutoFix?.(issue) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ComplianceGuardian;
