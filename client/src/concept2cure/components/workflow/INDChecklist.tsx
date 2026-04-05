/**
 * INDChecklist — IND Requirements Checklist mapped to CTD Modules.
 *
 * Surfaces every required IND section (21 CFR 312.23), maps to CTD M1-M5,
 * tracks completion status against project artifacts, and highlights gaps.
 *
 * Wired to:
 * - useINDStatus hook for real section statuses
 * - Project artifacts for coverage mapping
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileText,
  Shield,
  Beaker,
  Activity,
  FlaskConical,
  Sparkles,
  ArrowLeft,
  Loader2,
  PenLine,
} from 'lucide-react';
import { useINDStatus, getNextRecommendedSection, type INDSectionStatus } from '../../hooks/useINDStatus';
import { DataStateWrapper } from '@/components/ui/statesV2';

// ── IND Module Structure ─────────────────────────────────────────────────────

interface INDModuleConfig {
  number: number;
  name: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
}

const IND_MODULES: INDModuleConfig[] = [
  { number: 1, name: 'Administrative Information', icon: FileText, color: 'text-stone-700', bg: 'bg-stone-50', description: 'Forms FDA 1571/1572/3674, cover letter, debarment certification' },
  { number: 2, name: 'CTD Summaries', icon: Activity, color: 'text-stone-700', bg: 'bg-blue-50', description: 'Quality, nonclinical, and clinical overviews and summaries' },
  { number: 3, name: 'Quality (CMC)', icon: Beaker, color: 'text-stone-700', bg: 'bg-violet-50', description: 'Drug substance, drug product, manufacturing, stability' },
  { number: 4, name: 'Nonclinical Study Reports', icon: FlaskConical, color: 'text-amber-700', bg: 'bg-amber-50', description: 'Pharmacology, pharmacokinetics, toxicology reports' },
  { number: 5, name: 'Clinical Study Reports', icon: Shield, color: 'text-emerald-700', bg: 'bg-emerald-50', description: 'Clinical protocols, study reports, case report forms' },
];

type SectionStatus = 'not_started' | 'draft' | 'review' | 'approved' | 'locked';

const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; dot: string }> = {
  not_started: { label: 'Not Started', color: 'text-stone-400', dot: 'bg-stone-300' },
  draft: { label: 'Draft', color: 'text-amber-600', dot: 'bg-amber-500' },
  review: { label: 'In Review', color: 'text-blue-600', dot: 'bg-stone-600' },
  approved: { label: 'Approved', color: 'text-emerald-600', dot: 'bg-emerald-500' },
  locked: { label: 'Locked', color: 'text-emerald-700', dot: 'bg-emerald-600' },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface INDChecklistProps {
  projectId: string | number;
  projectName?: string;
  onSectionClick: (sectionCode: string) => void;
  onAIDraft: (sectionCode: string, sectionTitle: string) => void;
  onBack: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function INDChecklist({ projectId, projectName, onSectionClick, onAIDraft, onBack }: INDChecklistProps) {
  const { data: indStatus, isLoading, error } = useINDStatus(projectId);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([1, 2]));
  const [draftingSection, setDraftingSection] = useState<string | null>(null);

  // Group sections by module
  const moduleGroups = useMemo(() => {
    if (!indStatus?.sections) return [];
    const groups = new Map<number, INDSectionStatus[]>();
    for (const section of indStatus.sections) {
      const mod = section.module || parseInt(section.code.charAt(0), 10) || 1;
      if (!groups.has(mod)) groups.set(mod, []);
      groups.get(mod)!.push(section);
    }
    return IND_MODULES.map(modConfig => ({
      ...modConfig,
      sections: groups.get(modConfig.number) || [],
      stats: {
        total: (groups.get(modConfig.number) || []).length,
        completed: (groups.get(modConfig.number) || []).filter(s => s.status === 'approved' || s.status === 'locked').length,
        required: (groups.get(modConfig.number) || []).filter(s => s.required).length,
        requiredComplete: (groups.get(modConfig.number) || []).filter(s => s.required && (s.status === 'approved' || s.status === 'locked')).length,
      },
    }));
  }, [indStatus]);

  // Overall stats
  const overallStats = useMemo(() => {
    if (!indStatus) return { total: 0, completed: 0, required: 0, requiredComplete: 0, pct: 0 };
    const sections = indStatus.sections || [];
    const total = sections.length;
    const completed = sections.filter(s => s.status === 'approved' || s.status === 'locked').length;
    const required = sections.filter(s => s.required).length;
    const requiredComplete = sections.filter(s => s.required && (s.status === 'approved' || s.status === 'locked')).length;
    const pct = required > 0 ? Math.round((requiredComplete / required) * 100) : 0;
    return { total, completed, required, requiredComplete, pct };
  }, [indStatus]);

  // Next recommended section
  const nextSection = useMemo(() => {
    if (!indStatus?.sections) return null;
    return getNextRecommendedSection(indStatus.sections);
  }, [indStatus]);

  const toggleModule = useCallback((mod: number) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  }, []);

  const handleAIDraft = useCallback(async (code: string, title: string) => {
    setDraftingSection(code);
    try {
      await onAIDraft(code, title);
    } finally {
      setDraftingSection(null);
    }
  }, [onAIDraft]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-7 w-7 text-stone-500 hover:text-stone-700"
            aria-label="Back to project"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">IND Requirements — 21 CFR 312.23</h1>
            <p className="text-xs text-stone-500">{projectName || 'IND Application'}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${overallStats.pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-stone-600 tabular-nums">
            {overallStats.requiredComplete}/{overallStats.required} required sections
          </span>
        </div>

        {/* Next recommended + stats */}
        <div className="flex items-center gap-4 mt-3">
          {nextSection && (
            <Button
              size="sm"
              onClick={() => onSectionClick(nextSection.code)}
              className="gap-1.5 bg-stone-900 hover:bg-stone-800"
            >
              <Sparkles className="h-3 w-3" />
              Next: {nextSection.code} — {nextSection.title}
              <ChevronRight className="h-3 w-3" />
            </Button>
          )}
          <div className="flex gap-3 ml-auto">
            <span className="text-xs text-emerald-600">{overallStats.completed} complete</span>
            <span className="text-xs text-stone-400">{overallStats.total - overallStats.completed} remaining</span>
          </div>
        </div>
      </div>

      {/* Module groups */}
      <DataStateWrapper
        data={moduleGroups}
        isLoading={isLoading}
        error={error}
        emptyDescription="No IND sections found — initialize IND submission first"
      >
        {(groups) => (
          <div className="px-6 py-4 space-y-3">
            {groups.map(group => {
              const isExpanded = expandedModules.has(group.number);
              const modulePct = group.stats.total > 0
                ? Math.round((group.stats.completed / group.stats.total) * 100) : 0;
              const allComplete = group.stats.total > 0 && group.stats.completed === group.stats.total;
              const hasGaps = group.stats.required > group.stats.requiredComplete;

              return (
                <div key={group.number} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
                  {/* Module header — full-width toggle */}
                  <Button
                    variant="ghost"
                    onClick={() => toggleModule(group.number)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 h-auto text-left rounded-none justify-start hover:bg-transparent',
                      group.bg,
                    )}
                  >
                    {isExpanded ? (
                      <ChevronDown className={cn('h-4 w-4 shrink-0', group.color)} />
                    ) : (
                      <ChevronRight className={cn('h-4 w-4 shrink-0', group.color)} />
                    )}
                    <group.icon className={cn('h-4 w-4 shrink-0', group.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-semibold', group.color)}>
                          Module {group.number}
                        </span>
                        <span className="text-sm text-stone-700">{group.name}</span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5 font-normal">{group.description}</p>
                    </div>

                    {/* Module progress */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasGaps && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      {allComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs font-medium text-stone-500 tabular-nums">
                          {group.stats.completed}/{group.stats.total}
                        </span>
                      )}
                      <div className="w-16 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            allComplete ? 'bg-emerald-500' : 'bg-stone-600',
                          )}
                          style={{ width: `${modulePct}%` }}
                        />
                      </div>
                    </div>
                  </Button>

                  {/* Section list */}
                  {isExpanded && group.sections.length > 0 && (
                    <div className="divide-y divide-stone-100">
                      {group.sections.map(section => {
                        const statusCfg = STATUS_CONFIG[section.status] || STATUS_CONFIG.not_started;
                        const isComplete = section.status === 'approved' || section.status === 'locked';
                        const isDrafting = draftingSection === section.code;

                        return (
                          <div
                            key={section.code}
                            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors"
                          >
                            {/* Status icon */}
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Circle className={cn('h-4 w-4 flex-shrink-0', statusCfg.color)} />
                            )}

                            {/* Section info — click to open */}
                            <Button
                              variant="ghost"
                              onClick={() => onSectionClick(section.code)}
                              className="flex-1 min-w-0 text-left h-auto py-0 px-0 hover:bg-transparent justify-start"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-stone-400">{section.code}</span>
                                <span className={cn(
                                  'text-sm',
                                  isComplete ? 'text-stone-400 line-through' : 'text-stone-900',
                                )}>
                                  {section.title}
                                </span>
                                {section.required && (
                                  <Badge variant="destructive" className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0 h-4">
                                    Required
                                  </Badge>
                                )}
                              </div>
                            </Button>

                            {/* Status badge */}
                            <Badge
                              variant="outline"
                              className={cn(
                                'flex-shrink-0 text-[10px] font-medium border-0',
                                isComplete ? 'bg-emerald-50 text-emerald-700' :
                                section.status === 'review' ? 'bg-blue-50 text-stone-700' :
                                section.status === 'draft' ? 'bg-amber-50 text-amber-700' :
                                'bg-stone-50 text-stone-400',
                              )}
                            >
                              {statusCfg.label}
                            </Badge>

                            {/* Action buttons — context-aware */}
                            {section.status === 'not_started' && (
                              <Button
                                size="sm"
                                onClick={() => handleAIDraft(section.code, section.title)}
                                disabled={isDrafting}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 gap-1 h-7 text-[10px] transition-opacity bg-stone-900 hover:bg-stone-800"
                              >
                                {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                AI Draft
                              </Button>
                            )}
                            {section.status === 'draft' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onSectionClick(section.code)}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 gap-1 h-7 text-[10px] transition-opacity"
                              >
                                <PenLine className="h-3 w-3" />
                                Edit
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty state for modules with no sections */}
                  {isExpanded && group.sections.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-stone-400">No sections initialized for this module</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DataStateWrapper>
    </div>
  );
}

export default INDChecklist;
