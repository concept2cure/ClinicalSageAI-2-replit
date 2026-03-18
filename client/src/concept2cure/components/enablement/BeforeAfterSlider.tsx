import React from 'react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComparisonItem {
  text: string;
}

interface ComparisonConfig {
  before: ComparisonItem[];
  after: ComparisonItem[];
  beforeTitle: string;
  afterTitle: string;
}

interface BeforeAfterSliderProps {
  className?: string;
  initialPosition?: number;
  preset?: keyof typeof COMPARISON_PRESETS;
  config?: ComparisonConfig;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const COMPARISON_PRESETS = {
  workflow: {
    beforeTitle: 'Legacy Workflow',
    afterTitle: 'Concept2Cure Workflow',
    before: [
      { text: '5+ disconnected tools for one submission' },
      { text: 'Manual evidence cross-referencing in spreadsheets' },
      { text: 'No audit trail or provenance tracking' },
      { text: 'Compliance gaps found at FDA review' },
      { text: 'Weeks of rework after deficiency letters' },
      { text: 'Siloed knowledge, no institutional memory' },
    ],
    after: [
      { text: 'One governed platform, end to end' },
      { text: 'AnA 1.0 analyzes evidence automatically' },
      { text: 'Full provenance and audit trail on every artifact' },
      { text: 'Dr. Sage catches gaps before submission' },
      { text: 'AI-assisted remediation in hours, not weeks' },
      { text: 'Shared intelligence across every project' },
    ],
  },
  evidence: {
    beforeTitle: 'Manual Evidence Review',
    afterTitle: 'AnA 1.0 Intelligence',
    before: [
      { text: 'Manually searching through thousands of pages' },
      { text: 'Missed cross-references between studies' },
      { text: 'Subjective evidence strength assessments' },
      { text: 'Inconsistent predicate device comparisons' },
      { text: 'Hours spent on literature review summaries' },
      { text: 'No automated gap detection in evidence packages' },
    ],
    after: [
      { text: 'AI-powered semantic search across all documents' },
      { text: 'Automatic cross-reference mapping and linking' },
      { text: 'Quantified evidence scoring with rationale' },
      { text: 'Standardized predicate comparison matrices' },
      { text: 'Auto-generated literature review drafts in minutes' },
      { text: 'Real-time evidence coverage gap analysis' },
    ],
  },
  compliance: {
    beforeTitle: 'Reactive Compliance',
    afterTitle: 'Proactive Compliance',
    before: [
      { text: 'Discover issues during FDA audit' },
      { text: 'Manual checklist tracking in spreadsheets' },
      { text: 'Regulatory updates found weeks after publication' },
      { text: 'No visibility into cross-module dependencies' },
      { text: 'Retrospective CAPA after non-conformances' },
      { text: 'Inconsistent formatting across submissions' },
    ],
    after: [
      { text: 'Continuous compliance monitoring in real time' },
      { text: 'Automated compliance scoring per requirement' },
      { text: 'Instant alerts on new guidance and regulations' },
      { text: 'Full dependency graph across all modules' },
      { text: 'Predictive risk detection before issues arise' },
      { text: 'Template-enforced formatting and structure' },
    ],
  },
} as const;

// ─── BeforeAfterSlider ──────────────────────────────────────────────────────

export function BeforeAfterSlider({
  className,
  preset = 'workflow',
  config,
}: BeforeAfterSliderProps) {
  const comparison = config ?? COMPARISON_PRESETS[preset];

  return (
    <div
      className={cn(
        'w-full bg-white border border-zinc-100 rounded-lg overflow-hidden',
        className
      )}
    >
      <div className="grid grid-cols-2 min-h-[320px]">
        {/* Before column */}
        <div className="p-6 border-r border-zinc-100">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            Before
          </h3>
          <ul className="space-y-3">
            {comparison.before.map((item, i) => (
              <li key={i} className="text-sm text-zinc-500 leading-relaxed">
                <span className="text-zinc-300 mr-2">&middot;</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* After column */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-zinc-900 mb-4">
            With Concept2Cure
          </h3>
          <ul className="space-y-3">
            {comparison.after.map((item, i) => (
              <li key={i} className="text-sm text-zinc-700 leading-relaxed">
                <span className="text-zinc-400 mr-2">{'\u2713'}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default BeforeAfterSlider;
