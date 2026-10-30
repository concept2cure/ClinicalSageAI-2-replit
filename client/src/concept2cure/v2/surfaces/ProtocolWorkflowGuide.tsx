/** Suggested order over the protocol workspace's existing tabs, never an approval verdict. */
import React from 'react';

const STEPS = [
  { id: 'study-design', label: 'Study design' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'document', label: 'Write protocol' },
  { id: 'compliance', label: 'Run checks' },
  { id: 'reviews', label: 'Review protocol' },
] as const;

function suggestion(doc: Record<string, unknown>): string {
  const raw = doc.studyDesign;
  if (raw == null) return 'Start with Study design: create or bind the design for this protocol.';
  const design = typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!design || design.resolved !== true) return 'The linked study design could not be read. Check its link on Study design before using its projections.';
  if (design.blocksApproval === true) return 'The recorded study-design findings block approval. Review them on Study design before seeking approval.';
  return 'Continue writing the protocol, then run checks and review the recorded findings.';
}

export function ProtocolWorkflowGuide({ doc, tab, onTab }: {
  doc: Record<string, unknown>; tab: string; onTab: (id: string) => boolean;
}) {
  return <nav className="pde-flow" aria-label="Study and protocol design">
    <p className="pde-flow-label">Suggested order</p>
    <ol>{STEPS.map(step => <li key={step.id}>
      <button type="button" className="btn ghost" aria-current={tab === step.id ? 'step' : undefined}
        onClick={() => onTab(step.id)}>{step.label}</button>
    </li>)}</ol>
    <p className="pde-flow-hint">{suggestion(doc)}</p>
  </nav>;
}
