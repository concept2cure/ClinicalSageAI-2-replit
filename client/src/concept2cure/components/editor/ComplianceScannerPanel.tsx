/**
 * ComplianceScannerPanel — Interactive issue browser for the ComplianceScanner extension.
 *
 * Shows all detected compliance issues grouped by severity, with one-click
 * navigation to the issue location and auto-fix suggestions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
  Filter,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ComplianceIssue } from './extensions/ComplianceScanner';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ComplianceScannerPanelProps {
  issues: ComplianceIssue[];
  isScanning: boolean;
  lastScanTime: number;
  onNavigateToIssue: (issue: ComplianceIssue) => void;
  onFixIssue: (issue: ComplianceIssue) => void;
  onRescan: () => void;
  onDismissIssue?: (issueId: string) => void;
  onClose?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  error: {
    label: 'Errors',
    icon: AlertCircle,
    color: 'text-stone-700',
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    badge: 'bg-stone-100 text-stone-800',
  },
  warning: {
    label: 'Warnings',
    icon: AlertTriangle,
    color: 'text-stone-600',
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    badge: 'bg-stone-100 text-stone-700',
  },
  info: {
    label: 'Suggestions',
    icon: Info,
    color: 'text-stone-600',
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    badge: 'bg-stone-100 text-stone-700',
  },
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  language: 'Language',
  terminology: 'Terminology',
  structure: 'Structure',
  placeholder: 'Placeholders',
  'passive-voice': 'Passive Voice',
  'unsupported-claim': 'Claims',
  formatting: 'Formatting',
};

function timeSince(timestamp: number): string {
  if (timestamp === 0) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ComplianceScannerPanel({
  issues,
  isScanning,
  lastScanTime,
  onNavigateToIssue,
  onFixIssue,
  onRescan,
  onDismissIssue,
  onClose,
}: ComplianceScannerPanelProps) {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expandedSeverity, setExpandedSeverity] = useState<Set<string>>(new Set(['error', 'warning']));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Filter issues
  const activeIssues = useMemo(
    () => issues.filter(i => !dismissedIds.has(i.id)),
    [issues, dismissedIds],
  );

  const filteredIssues = useMemo(() => {
    return activeIssues.filter(issue => {
      if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
      if (filterCategory !== 'all' && issue.category !== filterCategory) return false;
      return true;
    });
  }, [activeIssues, filterSeverity, filterCategory]);

  // Group by severity
  const grouped = useMemo(() => {
    const groups: Record<string, ComplianceIssue[]> = {
      error: [],
      warning: [],
      info: [],
    };
    for (const issue of filteredIssues) {
      groups[issue.severity]?.push(issue);
    }
    return groups;
  }, [filteredIssues]);

  // Categories present
  const activeCategories = useMemo(() => {
    const cats = new Set(activeIssues.map(i => i.category));
    return Array.from(cats).sort();
  }, [activeIssues]);

  // Stats
  const stats = useMemo(() => ({
    total: activeIssues.length,
    errors: activeIssues.filter(i => i.severity === 'error').length,
    warnings: activeIssues.filter(i => i.severity === 'warning').length,
    info: activeIssues.filter(i => i.severity === 'info').length,
    fixable: activeIssues.filter(i => i.suggestion).length,
  }), [activeIssues]);

  const toggleSeverity = useCallback((severity: string) => {
    setExpandedSeverity(prev => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }, []);

  const handleDismiss = useCallback((issueId: string) => {
    setDismissedIds(prev => new Set([...prev, issueId]));
    onDismissIssue?.(issueId);
  }, [onDismissIssue]);

  // Compliance score (100 minus weighted deductions)
  const score = useMemo(() => {
    if (activeIssues.length === 0) return 100;
    const deductions = stats.errors * 10 + stats.warnings * 3 + stats.info * 1;
    return Math.max(0, Math.min(100, 100 - deductions));
  }, [activeIssues, stats]);

  const scoreColor = score >= 80 ? 'text-stone-700' : score >= 50 ? 'text-stone-600' : 'text-stone-700';
  const scoreBg = score >= 80 ? 'bg-stone-900' : score >= 50 ? 'bg-stone-900' : 'bg-stone-900';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-stone-600" />
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Compliance Scanner</h2>
              <p className="text-[10px] text-stone-500">
                {isScanning ? 'Scanning...' : `Last scan: ${timeSince(lastScanTime)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRescan}
              disabled={isScanning}
              className="h-7 w-7 hover:bg-white/60"
              title="Re-scan document"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-stone-500', isScanning && 'animate-spin')} />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close compliance scanner" title="Close" className="h-7 w-7 hover:bg-white/60">
                <X className="w-3.5 h-3.5 text-stone-500" />
              </Button>
            )}
          </div>
        </div>

        {/* Score + Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 w-24 bg-stone-200 rounded-full h-2 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-200', scoreBg)}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className={cn('text-sm font-semibold tabular-nums', scoreColor)}>{score}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] ml-auto">
            {stats.errors > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 font-medium">
                {stats.errors} errors
              </span>
            )}
            {stats.warnings > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                {stats.warnings} warnings
              </span>
            )}
            {stats.info > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                {stats.info} info
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2">
          <Select value={filterSeverity} onValueChange={(val) => setFilterSeverity(val as typeof filterSeverity)}>
            <SelectTrigger className="h-6 text-[10px] px-2 py-1 w-auto min-w-[110px] border-stone-200 bg-white text-stone-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="error">Errors only</SelectItem>
              <SelectItem value="warning">Warnings only</SelectItem>
              <SelectItem value="info">Suggestions only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-6 text-[10px] px-2 py-1 w-auto min-w-[110px] border-stone-200 bg-white text-stone-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {activeCategories.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] || cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stats.fixable > 0 && (
            <span className="text-[10px] text-stone-600 font-medium ml-auto">
              {stats.fixable} auto-fixable
            </span>
          )}
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {isScanning && (
          <div className="flex items-center justify-center py-6 text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Scanning document...</span>
          </div>
        )}

        {!isScanning && activeIssues.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="w-10 h-10 text-stone-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-stone-700 mb-1">All Clear</h3>
            <p className="text-xs text-stone-400">No compliance issues detected in this document.</p>
          </div>
        )}

        {!isScanning && (['error', 'warning', 'info'] as const).map(severity => {
          const items = grouped[severity] || [];
          if (items.length === 0) return null;

          const config = SEVERITY_CONFIG[severity];
          const Icon = config.icon;
          const isExpanded = expandedSeverity.has(severity);

          return (
            <div key={severity} className="border-b border-stone-100">
              <Button
                variant="ghost"
                onClick={() => toggleSeverity(severity)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-stone-50 h-auto rounded-none justify-start"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                )}
                <Icon className={cn('w-4 h-4 shrink-0', config.color)} />
                <span className="text-xs font-semibold text-stone-700 flex-1">{config.label}</span>
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', config.badge)}>
                  {items.length}
                </span>
              </Button>

              {isExpanded && (
                <div className="px-4 pb-2 space-y-1.5">
                  {items.map(issue => (
                    <div
                      key={issue.id}
                      className={cn(
                        'p-2.5 rounded-lg border text-xs cursor-pointer transition-colors hover:shadow-sm',
                        config.bg,
                        config.border,
                      )}
                      onClick={() => onNavigateToIssue(issue)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="px-1 py-0.5 rounded bg-white/80 text-[10px] font-mono text-stone-500">
                              {CATEGORY_LABELS[issue.category] || issue.category}
                            </span>
                          </div>
                          <p className="text-stone-700 leading-relaxed">{issue.message}</p>
                          {issue.text && (
                            <p className="mt-1 font-mono text-[10px] text-stone-500 truncate">
                              &ldquo;{issue.text}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {issue.suggestion && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => {
                                e.stopPropagation();
                                onFixIssue(issue);
                              }}
                              className="flex items-center gap-1 h-auto px-2 py-1 text-[10px] font-medium text-stone-700 bg-stone-200 hover:bg-stone-200"
                              title={`Replace with "${issue.suggestion}"`}
                            >
                              <Zap className="w-3 h-3" />
                              Fix
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={e => {
                              e.stopPropagation();
                              handleDismiss(issue.id);
                            }}
                            className="h-6 w-6 text-stone-400 hover:text-stone-600"
                            title="Dismiss"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      {issue.suggestion && (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed border-stone-200/60 text-[10px]">
                          <span className="text-stone-400">Suggestion: </span>
                          <span className="font-medium text-stone-700">&ldquo;{issue.suggestion}&rdquo;</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-stone-200 bg-stone-50 text-[10px] text-stone-400 flex items-center justify-between">
        <span>
          {filteredIssues.length} issues{dismissedIds.size > 0 && ` (${dismissedIds.size} dismissed)`}
        </span>
        <span className="font-mono">25 rules active</span>
      </div>
    </div>
  );
}

export default ComplianceScannerPanel;
