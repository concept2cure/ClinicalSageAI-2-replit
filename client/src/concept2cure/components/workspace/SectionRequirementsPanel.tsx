import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  Layers,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionRequirement } from '../../models/ctdHierarchy';

export interface SectionMetrics {
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  completionPercent: number;
  templateCoverageAvailable: boolean;
  evidenceCount: number;
  precedentCount: number;
}

interface SectionReqsPanelProps {
  reqs: SectionRequirement;
  metrics?: SectionMetrics;
  onClose: () => void;
}

export function SectionRequirementsPanel({ reqs, metrics, onClose }: SectionReqsPanelProps) {
  const [showChildren, setShowChildren] = useState(false);

  return (
    <div className="w-[200px] 2xl:w-[240px] border-l border-stone-200 shrink-0 flex flex-col bg-white overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-200 bg-stone-50/60">
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-stone-600" />
          <span className="text-xs font-semibold text-stone-700">Section Requirements</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
          aria-label="Close panel"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2.5 space-y-2.5 text-xs">
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Section</div>
          <div className="font-semibold text-stone-900">{reqs.ctdSection}</div>
          <div className="text-stone-600 mt-0.5">{reqs.label}</div>
        </div>

        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Description</div>
          <p className="text-stone-600 leading-relaxed">{reqs.description}</p>
        </div>

        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
            Expected Documents
          </div>
          <ul className="space-y-0.5">
            {reqs.requiredDocTypes.map((dt, i) => (
              <li key={i} className="text-stone-700 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5 text-stone-400" />
                {dt}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded bg-stone-50">
          {reqs.optional ? (
            <>
              <Info className="w-3 h-3 text-stone-1000" />
              <span className="text-xs text-stone-700 font-medium">Optional section</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3 text-stone-1000" />
              <span className="text-xs text-stone-700 font-medium">Required section</span>
            </>
          )}
        </div>

        {reqs.starterTemplatesAvailable.length > 0 && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
              Starter Templates
            </div>
            {reqs.starterTemplatesAvailable.map((t, i) => (
              <div key={i} className="text-stone-600 flex items-center gap-1 py-0.5">
                <Layers className="w-2.5 h-2.5 text-stone-1000" />
                {t}
              </div>
            ))}
          </div>
        )}

        {reqs.commonMissingBlocks.length > 0 && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">
              Expected Content Blocks
            </div>
            {reqs.commonMissingBlocks.map((b, i) => (
              <div key={i} className="text-stone-500 text-xs py-0.5">
                • {b}
              </div>
            ))}
          </div>
        )}

        {(reqs.requiredChildren.length > 0 || reqs.optionalChildren.length > 0) && (
          <div>
            <button
              onClick={() => setShowChildren(!showChildren)}
              className="flex items-center gap-1 text-xs text-stone-400 uppercase tracking-wide mb-0.5 hover:text-stone-600"
            >
              {showChildren ? (
                <ChevronDown className="w-2.5 h-2.5" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5" />
              )}
              Child Sections ({reqs.requiredChildren.length + reqs.optionalChildren.length})
            </button>
            {showChildren && (
              <div className="space-y-0.5 mt-0.5">
                {reqs.requiredChildren.map((c, i) => (
                  <div key={i} className="text-stone-600 text-xs">
                    ▸ {c}
                  </div>
                ))}
                {reqs.optionalChildren.map((c, i) => (
                  <div key={i} className="text-stone-400 text-xs italic">
                    ▹ {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {metrics && (
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Current Status</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Artifacts</span>
                <span className="font-medium text-stone-700">{metrics.artifactCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Completion</span>
                <span className="font-medium text-stone-700">{metrics.completionPercent}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-150',
                    metrics.completionPercent >= 75
                      ? 'bg-stone-1000'
                      : metrics.completionPercent >= 25
                        ? 'bg-stone-1000'
                        : 'bg-stone-400'
                  )}
                  style={{ width: `${Math.min(100, metrics.completionPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Evidence</span>
                <span className="font-medium text-stone-700">{metrics.evidenceCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Precedents</span>
                <span className="font-medium text-stone-700">{metrics.precedentCount}</span>
              </div>
              {metrics.artifactCount > 0 && metrics.evidenceCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No evidence linked
                </div>
              )}
              {metrics.artifactCount > 0 && metrics.precedentCount === 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5" /> No precedents
                </div>
              )}
              {metrics.artifactCount === 0 && reqs.hasTemplates && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-xs">
                  <Info className="w-2.5 h-2.5" /> Template available, no doc created
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SectionRequirementsPanel;
