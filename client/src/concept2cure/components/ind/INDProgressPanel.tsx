/**
 * INDProgressPanel — Visual CTD Module 1-5 completion tracker.
 *
 * Shows:
 * - 5 module bars with completion percentage
 * - Expandable section list per module
 * - Status badges (not started / draft / review / approved)
 * - "Generate" button on not-started sections → sends to AnA
 * - Next recommended section highlighted
 *
 * Designed as a sidebar panel or overlay, Claude-style.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useINDStatus, getNextRecommendedSection, type INDSectionStatus } from '@/concept2cure/hooks/useINDStatus';
import { ChevronRight, Check, Clock, AlertTriangle, Lock, Sparkles } from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  not_started: { label: 'Not started', color: 'text-stone-400', icon: Clock },
  draft: { label: 'Draft', color: 'text-stone-500', icon: Clock },
  review: { label: 'In Review', color: 'text-stone-600', icon: AlertTriangle },
  approved: { label: 'Approved', color: 'text-stone-700', icon: Check },
  locked: { label: 'Ready', color: 'text-stone-600', icon: Lock },
};

const MODULE_NAMES: Record<number, string> = {
  1: 'Administrative',
  2: 'CTD Summaries',
  3: 'Quality (CMC)',
  4: 'Nonclinical',
  5: 'Clinical',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface INDProgressPanelProps {
  projectId: string | number;
  /** Called when user clicks "Generate" on a section — triggers AnA */
  onGenerateSection?: (sectionCode: string, sectionTitle: string) => void;
  /** Called when user clicks a completed section to open it */
  onOpenSection?: (artifactId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const INDProgressPanel: React.FC<INDProgressPanelProps> = ({
  projectId,
  onGenerateSection,
  onOpenSection,
}) => {
  const { data, isLoading } = useINDStatus(projectId);
  const [expandedModule, setExpandedModule] = useState<number | null>(1);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-stone-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-stone-400">IND status unavailable</p>
      </div>
    );
  }

  const nextSection = getNextRecommendedSection(data.sections);

  // Group sections by module
  const moduleGroups = [1, 2, 3, 4, 5].map(n => {
    const sections = data.sections.filter(s => s.module === n);
    const moduleData = data.modules[`Module ${n}`] || { total: 0, drafted: 0, approved: 0, completion: 0 };
    return { number: n, name: MODULE_NAMES[n], sections, ...moduleData };
  });

  return (
    <div className="py-2">
      {/* Overall progress */}
      <div className="px-4 pb-3 mb-2 border-b border-stone-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-stone-700">IND Progress</span>
          <span className="text-xs text-stone-400 tabular-nums">
            {data.completedSections} / {data.totalSections}
          </span>
        </div>
        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-stone-800 rounded-full transition-all duration-200"
            style={{ width: `${Math.round((data.completedSections / data.totalSections) * 100)}%` }}
          />
        </div>
      </div>

      {/* Module list */}
      <div className="space-y-0.5">
        {moduleGroups.map(mod => {
          const isExpanded = expandedModule === mod.number;
          return (
            <div key={mod.number}>
              {/* Module header */}
              <button
                onClick={() => setExpandedModule(isExpanded ? null : mod.number)}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-stone-50 transition-colors"
                aria-expanded={isExpanded}
              >
                <ChevronRight className={cn(
                  'w-3 h-3 text-stone-400 transition-transform flex-shrink-0',
                  isExpanded && 'rotate-90'
                )} />
                <span className="text-xs font-medium text-stone-700 flex-1">
                  Module {mod.number} — {mod.name}
                </span>
                <span className="text-[10px] text-stone-400 tabular-nums">
                  {mod.drafted}/{mod.total}
                </span>
              </button>

              {/* Expanded sections */}
              {isExpanded && (
                <div className="pl-7 pr-4 pb-2 space-y-0.5">
                  {mod.sections.map(section => {
                    const style = STATUS_STYLE[section.status] || STATUS_STYLE.not_started;
                    const StatusIcon = style.icon;
                    const isNext = nextSection?.code === section.code;

                    return (
                      <div
                        key={section.code}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs',
                          isNext && 'bg-stone-50 ring-1 ring-stone-200'
                        )}
                      >
                        <StatusIcon className={cn('w-3 h-3 flex-shrink-0', style.color)} />
                        <div className="flex-1 min-w-0">
                          <span className="text-stone-700 truncate block">
                            {section.code} {section.title}
                          </span>
                          {isNext && (
                            <span className="text-[10px] text-stone-400">Recommended next</span>
                          )}
                        </div>
                        {section.status === 'not_started' && onGenerateSection && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateSection(section.code, section.title);
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
                            title="Ask AnA to generate this section"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            Generate
                          </button>
                        )}
                        {section.artifactId && onOpenSection && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenSection(section.artifactId!);
                            }}
                            className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            Open
                          </button>
                        )}
                        {!section.required && (
                          <span className="text-[9px] text-stone-300">optional</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default INDProgressPanel;
