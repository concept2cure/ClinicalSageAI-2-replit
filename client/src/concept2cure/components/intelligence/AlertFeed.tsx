/**
 * AlertFeed — Live regulatory alert feed for FDA/EMA/Health Canada updates.
 *
 * Shows prioritized alerts with impact analysis, affected document linking,
 * and one-click navigation to relevant documents. Integrates with the
 * intelligence panel as a sub-tab or standalone sidebar.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Bell,
  BellRing,
  AlertTriangle,
  AlertCircle,
  Info,
  Shield,
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Filter,
  CheckCircle,
  Clock,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type AlertPriority = 'critical' | 'high' | 'medium' | 'low';
type AlertSource = 'FDA' | 'EMA' | 'Health Canada' | 'ICH' | 'WHO' | 'Internal';
type AlertCategory =
  | 'guidance-update'
  | 'safety-signal'
  | 'regulatory-change'
  | 'compliance-deadline'
  | 'inspection-notice'
  | 'recall-notice'
  | 'labeling-change'
  | 'meeting-announcement';

interface RegulatoryAlert {
  id: string;
  title: string;
  summary: string;
  source: AlertSource;
  category: AlertCategory;
  priority: AlertPriority;
  publishedAt: string;
  expiresAt?: string;
  impactAnalysis?: string;
  affectedSections?: string[];
  affectedDocumentIds?: string[];
  actionRequired?: string;
  sourceUrl?: string;
  acknowledged: boolean;
  therapeuticArea?: string;
}

export interface AlertFeedProps {
  projectId?: string;
  therapeuticArea?: string;
  onNavigateToDocument?: (documentId: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

// ── Mock Alert Data ────────────────────────────────────────────────────────────
// In production these come from /api/concept2cure/intelligence/alerts

function generateAlerts(therapeuticArea?: string): RegulatoryAlert[] {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

  const alerts: RegulatoryAlert[] = [
    {
      id: 'alert-001',
      title: 'FDA Draft Guidance: Diversity Action Plans for Clinical Studies',
      summary:
        'FDA released updated draft guidance requiring sponsors to submit Diversity Action Plans with IND/NDA/BLA applications. Public comment period closes April 15, 2026.',
      source: 'FDA',
      category: 'guidance-update',
      priority: 'high',
      publishedAt: daysAgo(2),
      impactAnalysis:
        'Affects clinical protocol design and Module 5 study reports. May require updated enrollment criteria and stratification plans.',
      affectedSections: ['2.5', '2.7', '5.3'],
      actionRequired: 'Review protocol diversity requirements. Update Module 2.5 Clinical Overview.',
      sourceUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
      acknowledged: false,
    },
    {
      id: 'alert-002',
      title: 'EMA Revision: Guideline on Clinical Investigation of Medicinal Products',
      summary:
        'European Medicines Agency published revision to Annex III of clinical investigation guidelines, emphasizing real-world evidence integration.',
      source: 'EMA',
      category: 'regulatory-change',
      priority: 'medium',
      publishedAt: daysAgo(5),
      impactAnalysis:
        'Applicable if submission targets EU market. Real-world evidence may supplement Module 5 clinical data.',
      affectedSections: ['2.5', '5.3'],
      acknowledged: false,
      therapeuticArea: 'oncology',
    },
    {
      id: 'alert-003',
      title: 'ICH E6(R3) Good Clinical Practice — Final Step 4 Document',
      summary:
        'ICH finalized E6(R3) GCP guidelines with modernized approach to risk-based quality management and technology-enabled clinical trials.',
      source: 'ICH',
      category: 'guidance-update',
      priority: 'critical',
      publishedAt: daysAgo(1),
      impactAnalysis:
        'Impacts all clinical protocols and Investigator Brochures. GCP compliance documentation must be updated across all active studies.',
      affectedSections: ['1.3', '2.5', '5.3'],
      actionRequired: 'Update all clinical protocols to reference E6(R3). Review IB for GCP alignment.',
      acknowledged: false,
    },
    {
      id: 'alert-004',
      title: 'FDA Safety Communication: Post-Market Safety Signal',
      summary:
        'FDA identified new safety signal from post-market surveillance data requiring label update consideration for products in related therapeutic area.',
      source: 'FDA',
      category: 'safety-signal',
      priority: 'critical',
      publishedAt: daysAgo(0),
      impactAnalysis:
        'May require REMS assessment update. Prescribing information and patient labeling should be reviewed for adequacy.',
      affectedSections: ['1.4', '2.5', '2.7'],
      actionRequired: 'Conduct safety signal evaluation. Prepare safety update report if applicable.',
      acknowledged: false,
      therapeuticArea: therapeuticArea || 'general',
    },
    {
      id: 'alert-005',
      title: 'Health Canada: Updated Electronic Submission Requirements',
      summary:
        'Health Canada updated eCTD technical specifications effective July 1, 2026. New validation rules for Module 1 regional information.',
      source: 'Health Canada',
      category: 'compliance-deadline',
      priority: 'medium',
      publishedAt: daysAgo(10),
      expiresAt: new Date(2026, 6, 1).toISOString(),
      impactAnalysis: 'Affects Canadian submissions only. Module 1 formatting must comply with new specs.',
      affectedSections: ['1.1', '1.2', '1.3'],
      acknowledged: true,
    },
    {
      id: 'alert-006',
      title: 'FDA Pre-Submission Meeting Reminder',
      summary:
        'Reminder: Pre-submission meeting request deadline is 75 days before target PDUFA date. Ensure meeting package is complete.',
      source: 'Internal',
      category: 'meeting-announcement',
      priority: 'low',
      publishedAt: daysAgo(15),
      actionRequired: 'Verify meeting package completeness with regulatory affairs team.',
      acknowledged: true,
    },
    {
      id: 'alert-007',
      title: 'WHO Essential Medicines List Update',
      summary:
        'WHO updated the Model List of Essential Medicines. Review for inclusion/exclusion of products in development pipeline.',
      source: 'WHO',
      category: 'regulatory-change',
      priority: 'low',
      publishedAt: daysAgo(20),
      acknowledged: true,
    },
  ];

  // Filter by therapeutic area if provided
  if (therapeuticArea) {
    return alerts.filter(
      a => !a.therapeuticArea || a.therapeuticArea === therapeuticArea || a.therapeuticArea === 'general',
    );
  }

  return alerts;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function PriorityBadge({ priority }: { priority: AlertPriority }) {
  const config = {
    critical: { bg: 'bg-red-100 text-red-700', icon: AlertCircle },
    high: { bg: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
    medium: { bg: 'bg-blue-100 text-blue-700', icon: Info },
    low: { bg: 'bg-zinc-100 text-zinc-600', icon: Info },
  }[priority];

  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase', config.bg)}>
      <Icon className="w-3 h-3" />
      {priority}
    </span>
  );
}

function SourceBadge({ source }: { source: AlertSource }) {
  const colors: Record<AlertSource, string> = {
    FDA: 'bg-blue-50 text-blue-700 border-blue-200',
    EMA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Health Canada': 'bg-red-50 text-red-700 border-red-200',
    ICH: 'bg-violet-50 text-violet-700 border-violet-200',
    WHO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Internal: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  };

  return (
    <span className={cn('px-1.5 py-0.5 rounded border text-[10px] font-medium', colors[source])}>
      {source}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AlertFeed({
  projectId,
  therapeuticArea,
  onNavigateToDocument,
  onClose,
  compact = false,
}: AlertFeedProps) {
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<AlertPriority | 'all'>('all');
  const [filterSource, setFilterSource] = useState<AlertSource | 'all'>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // Load alerts
  useEffect(() => {
    setLoading(true);
    // Simulate API call — in production: GET /api/concept2cure/intelligence/alerts?project=X
    const timer = setTimeout(() => {
      setAlerts(generateAlerts(therapeuticArea));
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [therapeuticArea]);

  const handleAcknowledge = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, acknowledged: true } : a)));
  }, []);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setAlerts(generateAlerts(therapeuticArea));
      setLoading(false);
    }, 800);
  }, [therapeuticArea]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (!showAcknowledged && a.acknowledged) return false;
      if (filterPriority !== 'all' && a.priority !== filterPriority) return false;
      if (filterSource !== 'all' && a.source !== filterSource) return false;
      return true;
    });
  }, [alerts, filterPriority, filterSource, showAcknowledged]);

  // Stats
  const stats = useMemo(() => {
    const unack = alerts.filter(a => !a.acknowledged);
    return {
      total: alerts.length,
      unacknowledged: unack.length,
      critical: unack.filter(a => a.priority === 'critical').length,
      high: unack.filter(a => a.priority === 'high').length,
    };
  }, [alerts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading regulatory alerts...</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white', compact && 'text-xs')}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Regulatory Alerts</h2>
              <p className="text-[10px] text-zinc-500">
                {stats.unacknowledged} unread{stats.critical > 0 && ` · ${stats.critical} critical`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150"
              title="Refresh alerts"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150">
                <X className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-[10px]">
          {stats.critical > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertCircle className="w-3 h-3" /> {stats.critical} Critical
            </span>
          )}
          {stats.high > 0 && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <AlertTriangle className="w-3 h-3" /> {stats.high} High
            </span>
          )}
          <span className="text-zinc-400">{stats.total} total</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2">
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value as AlertPriority | 'all')}
            className="text-[10px] px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-600"
          >
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value as AlertSource | 'all')}
            className="text-[10px] px-2 py-1 border border-zinc-200 rounded-md bg-white text-zinc-600"
          >
            <option value="all">All sources</option>
            <option value="FDA">FDA</option>
            <option value="EMA">EMA</option>
            <option value="ICH">ICH</option>
            <option value="Health Canada">Health Canada</option>
            <option value="WHO">WHO</option>
            <option value="Internal">Internal</option>
          </select>
          <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={e => setShowAcknowledged(e.target.checked)}
              className="rounded border-zinc-300 text-amber-600 w-3 h-3"
            />
            Show read
          </label>
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">No alerts matching filters</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredAlerts.map(alert => {
              const isExpanded = expandedAlert === alert.id;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    'px-4 py-3 transition-colors',
                    !alert.acknowledged && 'bg-amber-50/30',
                    isExpanded && 'bg-zinc-50',
                  )}
                >
                  {/* Alert header */}
                  <button
                    onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                    className="w-full text-left flex items-start gap-2"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <PriorityBadge priority={alert.priority} />
                        <SourceBadge source={alert.source} />
                        {!alert.acknowledged && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        )}
                      </div>
                      <h3 className="text-xs font-medium text-zinc-900 leading-snug">
                        {alert.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                        <Clock className="w-3 h-3" />
                        {timeAgo(alert.publishedAt)}
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 ml-5.5 space-y-3 text-xs">
                      <p className="text-zinc-600 leading-relaxed">{alert.summary}</p>

                      {/* Impact analysis */}
                      {alert.impactAnalysis && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center gap-1.5 text-amber-700 font-medium mb-1">
                            <AlertTriangle className="w-3 h-3" />
                            Impact Analysis
                          </div>
                          <p className="text-amber-700/80 text-[11px] leading-relaxed">
                            {alert.impactAnalysis}
                          </p>
                        </div>
                      )}

                      {/* Affected sections */}
                      {alert.affectedSections && alert.affectedSections.length > 0 && (
                        <div>
                          <span className="text-zinc-500 font-medium">Affected CTD Sections: </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {alert.affectedSections.map(section => (
                              <span
                                key={section}
                                className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-mono"
                              >
                                §{section}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action required */}
                      {alert.actionRequired && (
                        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1">
                            <Shield className="w-3 h-3" />
                            Action Required
                          </div>
                          <p className="text-blue-700/80 text-[11px] leading-relaxed">
                            {alert.actionRequired}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors duration-150"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Acknowledge
                          </button>
                        )}
                        {alert.sourceUrl && (
                          <a
                            href={alert.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-md hover:bg-zinc-100 transition-colors duration-150"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Source
                          </a>
                        )}
                        {alert.affectedDocumentIds?.map(docId => (
                          <button
                            key={docId}
                            onClick={() => onNavigateToDocument?.(docId)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors duration-150"
                          >
                            <FileText className="w-3 h-3" />
                            Open Document
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50 text-[10px] text-zinc-400 flex items-center justify-between">
        <span>
          {filteredAlerts.length} of {alerts.length} alerts shown
        </span>
        <span>Last updated: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

export default AlertFeed;
