/**
 * Module3BuildInspector — Sidebar inspector for Module 3 subsection build state.
 *
 * Shows build readiness, source documents, missing fields, contradictions,
 * staleness, and action buttons (rebuild, show lineage) for a given CTD section.
 *
 * Phase 3 — Module 3 Workflow Convergence
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  useModule3BuildState,
  getSectionBuildState,
  BUILD_STATE_CONFIG,
  isSectionBuildable,
  isSectionRefreshable,
} from '@/concept2cure/hooks/useModule3BuildState';
import type { Module3SectionBuildStatus } from '@/concept2cure/hooks/useModule3BuildState';

// ── Types ────────────────────────────────────────────────────────────────────

interface Module3BuildInspectorProps {
  projectId?: string;
  cmcProjectId?: string;
  ctdSection?: string; // e.g. '3.2.S.4'
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
  className,
}: Module3BuildInspectorProps) {
  const queryClient = useQueryClient();
  const [lineageExpanded, setLineageExpanded] = useState(false);

  const resolvedId = cmcProjectId || projectId;

  // Fetch overall build state
  const { data: buildState } = useModule3BuildState(projectId, cmcProjectId);

  // Derive section status
  const section: Module3SectionBuildStatus | null = ctdSection
    ? getSectionBuildState(buildState, ctdSection)
    : null;

  // Lineage query — lazy, only when expanded
  const {
    data: lineageData,
    isLoading: lineageLoading,
    isError: lineageError,
  } = useQuery<SourceLineageResponse>({
    queryKey: ['concept2cure', 'module3-source-lineage', resolvedId, ctdSection] as const,
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
        queryKey: ['concept2cure', 'module3-build-state', projectId, cmcProjectId],
      });
    },
  });

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!ctdSection || !resolvedId) {
    return (
      <div className={cn('w-[280px] p-3 text-xs text-stone-400', className)}>
        Select a Module 3 section to inspect build state.
      </div>
    );
  }

  if (!section) {
    return (
      <div className={cn('w-[280px] p-3 text-xs text-stone-400', className)}>
        No build data for section {ctdSection}.
      </div>
    );
  }

  const stateConfig = BUILD_STATE_CONFIG[section.buildState];
  const buildable = isSectionBuildable(section);
  const refreshable = isSectionRefreshable(section);

  return (
    <div className={cn('w-[280px] flex flex-col gap-2.5 p-3', className)}>
      {/* ── Header: Section label + state badge ─────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-700 truncate">
            {section.sectionLabel}
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">{section.sectionKey}</p>
        </div>
        <Badge
          className={cn(
            'shrink-0 text-[10px] font-medium px-1.5 py-0 border',
            stateConfig.bgColor,
            stateConfig.color,
            'border-stone-200'
          )}
        >
          {stateConfig.label}
        </Badge>
      </div>

      {/* ── Completeness bar ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-stone-400">Completeness</span>
          <span className="text-[10px] font-medium text-stone-600">
            {section.completeness}%
          </span>
        </div>
        <Progress value={section.completeness} className="h-1" />
      </div>

      {/* ── Source summary ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
        <FileText className="w-3 h-3 text-stone-400 shrink-0" />
        <span>
          {section.sourceObjectCount} source{section.sourceObjectCount !== 1 ? 's' : ''}
          {section.sourceTypes.length > 0 && (
            <span className="text-stone-400">
              {' '}
              ({section.sourceTypes.join(', ')})
            </span>
          )}
        </span>
      </div>

      {/* ── Stale warning ───────────────────────────────────────────────── */}
      {section.isStale && (
        <div className="flex items-start gap-1.5 rounded bg-orange-50 border border-orange-100 px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-medium text-orange-700">Stale</p>
            {section.staleReason && (
              <p className="text-[10px] text-orange-600 mt-0.5">
                {section.staleReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Contradictions ──────────────────────────────────────────────── */}
      {section.hasContradictions && section.contradictionCount > 0 && (
        <div className="flex items-center gap-1.5 rounded bg-red-50 border border-red-100 px-2 py-1.5">
          <ShieldAlert className="w-3 h-3 text-red-600 shrink-0" />
          <span className="text-[10px] text-red-700">
            {section.contradictionCount} contradiction
            {section.contradictionCount !== 1 ? 's' : ''} detected
          </span>
        </div>
      )}

      {/* ── Missing inputs ──────────────────────────────────────────────── */}
      {section.missingInputs.length > 0 && (
        <div>
          <p className="text-[10px] text-stone-400 mb-1">Missing inputs</p>
          <div className="flex flex-wrap gap-1">
            {section.missingInputs.map((input) => (
              <span
                key={input}
                className="inline-flex items-center gap-0.5 rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600"
              >
                <XCircle className="w-2.5 h-2.5 text-stone-400" />
                {input}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 pt-1">
        {refreshable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs justify-start gap-1.5 text-stone-600"
            onClick={() => rebuildMutation.mutate()}
            disabled={rebuildMutation.isPending}
          >
            {rebuildMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh from sources
          </Button>
        )}
        {buildable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs justify-start gap-1.5 text-stone-600"
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

      {/* ── Lineage (expandable) ────────────────────────────────────────── */}
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-700 transition-colors pt-1"
        onClick={() => setLineageExpanded((v) => !v)}
      >
        {lineageExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <GitBranch className="w-3 h-3" />
        Show lineage
      </button>

      {lineageExpanded && (
        <div className="pl-2 border-l border-stone-100">
          {lineageLoading && (
            <div className="flex items-center gap-1.5 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
              <span className="text-[10px] text-stone-400">Loading lineage...</span>
            </div>
          )}

          {lineageError && (
            <p className="text-[10px] text-red-500 py-1">Failed to load lineage.</p>
          )}

          {lineageData && lineageData.sources.length === 0 && (
            <p className="text-[10px] text-stone-400 py-1">No source documents linked.</p>
          )}

          {lineageData &&
            lineageData.sources.map((src) => (
              <div
                key={src.sourceId}
                className="py-1.5 border-b border-stone-50 last:border-0"
              >
                <p className="text-[11px] text-stone-600 font-medium truncate">
                  {src.fileName}
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{src.sourceType}</p>
                {src.extractedFields.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {src.extractedFields.slice(0, 5).map((f) => (
                      <span
                        key={f}
                        className="rounded bg-stone-50 px-1 py-0 text-[9px] text-stone-500"
                      >
                        {f}
                      </span>
                    ))}
                    {src.extractedFields.length > 5 && (
                      <span className="text-[9px] text-stone-400">
                        +{src.extractedFields.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* ── Last compiled timestamp ─────────────────────────────────────── */}
      {section.lastCompiled && (
        <p className="text-[10px] text-stone-300 pt-0.5">
          Last compiled{' '}
          {new Date(section.lastCompiled).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}

export default Module3BuildInspector;
