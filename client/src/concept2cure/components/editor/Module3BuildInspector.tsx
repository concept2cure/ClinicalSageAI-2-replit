/**
 * Module3BuildInspector — Editor sidebar inspector for Module 3 subsection build state.
 *
 * Shows build readiness, source documents, missing fields, contradictions,
 * staleness, and action buttons (rebuild, refresh, show lineage) for a given CTD section.
 *
 * Also renders a Module 3 readiness summary when no specific section is selected,
 * giving the user a workspace-level overview of all 17 sections.
 *
 * Phase 6 — Module 3 Workflow Convergence
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
  CheckCircle2,
  Clock,
  X,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  useModule3BuildState,
  getSectionBuildState,
  BUILD_STATE_CONFIG,
  isSectionBuildable,
  isSectionRefreshable,
  getSourceTypeLabel,
} from '@/concept2cure/hooks/useModule3BuildState';
import type {
  Module3SectionBuildStatus,
  Module3BuildStateResponse,
} from '@/concept2cure/hooks/useModule3BuildState';

// ── Types ────────────────────────────────────────────────────────────────────

interface Module3BuildInspectorProps {
  projectId?: string;
  cmcProjectId?: string;
  ctdSection?: string;
  onClose?: () => void;
  /** Navigate to a specific CTD section (e.g. click from summary view) */
  onNavigateToSection?: (ctdSection: string) => void;
  className?: string;
}

interface SourceLineageEntry {
  sourceId: string;
  fileName: string;
  sourceType: string;
  uploadedAt: string;
  extractedFields: string[];
}

interface SourceLineageResponse {
  sources: SourceLineageEntry[];
  section: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function Module3BuildInspector({
  projectId,
  cmcProjectId,
  ctdSection,
  onClose,
  onNavigateToSection,
  className,
}: Module3BuildInspectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lineageExpanded, setLineageExpanded] = useState(false);

  const resolvedId = cmcProjectId || projectId;

  const { data: buildState, isLoading } = useModule3BuildState(projectId, cmcProjectId);

  const section: Module3SectionBuildStatus | null = ctdSection
    ? getSectionBuildState(buildState, ctdSection)
    : null;

  // Lineage query — lazy, only when expanded
  const {
    data: lineageData,
    isLoading: lineageLoading,
    isError: lineageError,
  } = useQuery<SourceLineageResponse>({
    queryKey: queryKeys.module3.sourceLineage(resolvedId, ctdSection),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/cmc/module3-os/source-lineage/${resolvedId}/${ctdSection}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch lineage');
      return json.data as SourceLineageResponse;
    },
    enabled: lineageExpanded && !!resolvedId && !!ctdSection,
    staleTime: 60 * 1000,
  });

  // Rebuild mutation
  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        'POST',
        `/api/cmc/module3-os/build-section/${resolvedId}/${ctdSection}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Rebuild failed');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module3.buildState(projectId, cmcProjectId),
      });
      toast({
        title: 'Section rebuilt',
        description: `${ctdSection} has been recompiled from current sources.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Rebuild failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // ── Panel header ────────────────────────────────────────────────────────

  const header = (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100">
      <div className="flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-stone-500" />
        <span className="text-[11px] font-semibold text-stone-700">Module 3 Build</span>
      </div>
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          className="h-6 w-6 text-stone-400 hover:text-stone-600"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className={cn('flex flex-col', className)}>
        {header}
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
          <span className="text-xs text-stone-400">Loading build state...</span>
        </div>
      </div>
    );
  }

  // ── No section selected → show Module 3 summary ────────────────────────

  if (!ctdSection || !section) {
    return (
      <div className={cn('flex flex-col', className)}>
        {header}
        {buildState ? (
          <Module3SummaryView buildState={buildState} onNavigateToSection={onNavigateToSection} />
        ) : (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-stone-400">
              Open a Module 3 section to inspect its build state.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Section detail view ────────────────────────────────────────────��────

  const stateConfig = BUILD_STATE_CONFIG[section.buildState];
  const buildable = isSectionBuildable(section);
  const refreshable = isSectionRefreshable(section);

  return (
    <div className={cn('flex flex-col', className)}>
      {header}

      <div className="flex flex-col gap-3 p-3">
        {/* Section label + state badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-700">{section.sectionLabel}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">{section.sectionKey}</p>
          </div>
          <Badge
            className={cn(
              'shrink-0 text-[10px] font-medium px-1.5 py-0.5 border',
              stateConfig.bgColor,
              stateConfig.color,
              'border-stone-200'
            )}
          >
            {stateConfig.label}
          </Badge>
        </div>

        {/* Completeness bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-stone-400">Completeness</span>
            <span className="text-[10px] font-medium text-stone-600">
              {section.completeness}%
            </span>
          </div>
          <Progress value={section.completeness} className="h-1.5" />
        </div>

        {/* Source summary */}
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span>
            {section.sourceObjectCount} source{section.sourceObjectCount !== 1 ? 's' : ''}
          </span>
          {section.sourceTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {section.sourceTypes.map((t) => (
                <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0 h-4 font-normal">
                  {getSourceTypeLabel(t)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Stale warning */}
        {section.isStale && (
          <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-100 px-2.5 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-medium text-orange-700">Content is stale</p>
              {section.staleReason && (
                <p className="text-[10px] text-orange-600 mt-0.5">{section.staleReason}</p>
              )}
            </div>
          </div>
        )}

        {/* Contradictions */}
        {section.hasContradictions && section.contradictionCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-2.5 py-2">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <div>
              <span className="text-[11px] font-medium text-red-700">
                {section.contradictionCount} contradiction{section.contradictionCount !== 1 ? 's' : ''}
              </span>
              <p className="text-[10px] text-red-600 mt-0.5">
                Review required before section can be approved.
              </p>
            </div>
          </div>
        )}

        {/* Missing inputs */}
        {section.missingInputs.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Missing inputs
            </p>
            <div className="flex flex-wrap gap-1">
              {section.missingInputs.map((input) => (
                <Badge
                  key={input}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal text-stone-500"
                >
                  <XCircle className="w-2.5 h-2.5 text-stone-400" />
                  {input}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {(buildable || refreshable) && (
          <div className="flex flex-col gap-1.5 pt-1">
            {refreshable && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs justify-start gap-1.5"
                onClick={() => rebuildMutation.mutate()}
                disabled={rebuildMutation.isPending}
              >
                {rebuildMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Refresh from latest sources
              </Button>
            )}
            {buildable && !refreshable && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs justify-start gap-1.5"
                onClick={() => rebuildMutation.mutate()}
                disabled={rebuildMutation.isPending}
              >
                {rebuildMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Rebuild section
              </Button>
            )}
          </div>
        )}

        {/* Lineage (expandable) */}
        <div className="border-t border-stone-100 pt-2">
          <Button
            variant="ghost"
            type="button"
            className="flex items-center gap-1.5 text-[11px] text-stone-500 hover:text-stone-700 h-auto px-1 py-0.5"
            onClick={() => setLineageExpanded((v) => !v)}
          >
            {lineageExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <GitBranch className="w-3 h-3" />
            Source lineage
          </Button>

          {lineageExpanded && (
            <div className="mt-2 pl-2 border-l-2 border-stone-100">
              {lineageLoading && (
                <div className="flex items-center gap-1.5 py-2">
                  <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                  <span className="text-[10px] text-stone-400">Loading lineage...</span>
                </div>
              )}

              {lineageError && (
                <p className="text-[10px] text-red-500 py-2">Failed to load lineage.</p>
              )}

              {lineageData && lineageData.sources.length === 0 && (
                <p className="text-[10px] text-stone-400 py-2">No source documents linked.</p>
              )}

              {lineageData &&
                lineageData.sources.map((src) => (
                  <div
                    key={src.sourceId}
                    className="py-2 border-b border-stone-50 last:border-0"
                  >
                    <p className="text-[11px] text-stone-600 font-medium truncate">
                      {src.fileName}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{getSourceTypeLabel(src.sourceType)}</p>
                    {src.extractedFields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {src.extractedFields.slice(0, 6).map((f) => (
                          <Badge
                            key={f}
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-3.5 font-normal"
                          >
                            {f}
                          </Badge>
                        ))}
                        {src.extractedFields.length > 6 && (
                          <span className="text-[9px] text-stone-400">
                            +{src.extractedFields.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Timestamps */}
        {(section.lastCompiled || section.lastUpdated) && (
          <div className="border-t border-stone-100 pt-2 space-y-0.5">
            {section.lastCompiled && (
              <p className="text-[10px] text-stone-400">
                Compiled{' '}
                {new Date(section.lastCompiled).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {section.artifactId && (
              <p className="text-[10px] text-stone-400">
                Artifact: <span className="font-mono text-stone-500">{section.artifactId}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Module 3 Summary View (no section selected) ─────────────────────────────

function Module3SummaryView({ buildState, onNavigateToSection }: { buildState: Module3BuildStateResponse; onNavigateToSection?: (ctdSection: string) => void }) {
  const { summary, sections } = buildState;
  const ready = sections.filter((s) => s.buildState === 'approved' || s.buildState === 'locked');
  const stale = sections.filter((s) => s.isStale);
  const blocked = sections.filter((s) => s.hasContradictions);
  const empty = sections.filter((s) => s.buildState === 'no_sources');
  const inProgress = sections.filter(
    (s) =>
      !['no_sources', 'approved', 'locked'].includes(s.buildState) && !s.isStale && !s.hasContradictions
  );

  const overallCompleteness = sections.length > 0
    ? Math.round(sections.reduce((sum, s) => sum + s.completeness, 0) / sections.length)
    : 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Overall readiness */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-stone-600">Module 3 Readiness</span>
          <span className="text-[11px] font-semibold text-stone-700">{overallCompleteness}%</span>
        </div>
        <Progress value={overallCompleteness} className="h-2" />
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 gap-2">
        <StatusCount
          icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
          label="Ready"
          count={ready.length}
          total={sections.length}
          color="text-green-700"
        />
        <StatusCount
          icon={<Clock className="w-3.5 h-3.5 text-blue-600" />}
          label="In progress"
          count={inProgress.length}
          total={sections.length}
          color="text-blue-700"
        />
        <StatusCount
          icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-600" />}
          label="Stale"
          count={stale.length}
          total={sections.length}
          color="text-orange-700"
        />
        <StatusCount
          icon={<ShieldAlert className="w-3.5 h-3.5 text-red-600" />}
          label="Blocked"
          count={blocked.length}
          total={sections.length}
          color="text-red-700"
        />
      </div>

      {/* Section list */}
      <div className="border-t border-stone-100 pt-2">
        <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-2">
          All sections
        </p>
        <div className="space-y-1">
          {sections.map((s) => {
            const cfg = BUILD_STATE_CONFIG[s.buildState];
            return (
              <div
                key={s.sectionKey}
                className={cn(
                  'flex items-center gap-2 py-1 px-1.5 rounded hover:bg-stone-50 transition-colors',
                  onNavigateToSection && 'cursor-pointer'
                )}
                onClick={() => onNavigateToSection?.(s.sectionKey)}
                role={onNavigateToSection ? 'button' : undefined}
                tabIndex={onNavigateToSection ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onNavigateToSection && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onNavigateToSection(s.sectionKey);
                  }
                }}
              >
                <span className="text-[10px] text-stone-500 w-12 shrink-0 font-mono">
                  {s.sectionKey}
                </span>
                <span className="text-[11px] text-stone-600 flex-1 truncate">
                  {s.sectionLabel}
                </span>
                <Badge
                  className={cn(
                    'text-[9px] px-1 py-0 h-4 font-normal border',
                    cfg.bgColor,
                    cfg.color,
                    'border-stone-200'
                  )}
                >
                  {cfg.label}
                </Badge>
                <span className="text-[10px] text-stone-400 w-8 text-right shrink-0">
                  {s.completeness}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty section guidance */}
      {empty.length > 0 && (
        <div className="bg-stone-50 rounded-lg px-2.5 py-2 border border-stone-100">
          <p className="text-[11px] text-stone-600">
            <span className="font-medium">{empty.length} section{empty.length !== 1 ? 's' : ''}</span>{' '}
            need source data. Upload documents via the Data Room with dossier classification to begin building.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Status count card ────────────────────────────────────────────────────────

function StatusCount({
  icon,
  label,
  count,
  total,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-stone-50/50 rounded-lg">
      {icon}
      <div>
        <p className={cn('text-[12px] font-semibold leading-tight', color)}>
          {count}/{total}
        </p>
        <p className="text-[10px] text-stone-400">{label}</p>
      </div>
    </div>
  );
}

export default Module3BuildInspector;
