import React from 'react';
import { oversightPrompt, type OversightAction } from './authoringOversight';

export function AuthoringOversightActions({ projectOpen, sectionOpen, documentOpen, dirty, onAsk }: {
  projectOpen: boolean; sectionOpen: boolean; documentOpen: boolean; dirty: boolean; onAsk: (text: string) => void;
}) {
  const actions: Array<{ id: OversightAction; label: string; enabled: boolean }> = [
    { id: 'section', label: 'Review section', enabled: sectionOpen },
    { id: 'document', label: 'Review document', enabled: documentOpen },
    { id: 'evidence', label: 'Reconcile project evidence', enabled: true },
    { id: 'fixes', label: 'Prepare targeted fixes', enabled: sectionOpen },
  ];
  return <section aria-label="AnA document oversight" style={{ borderBottom: '1px solid var(--border)', padding: '8px 12px' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {actions.map(action => <button key={action.id} type="button" className="btn ghost" style={{ fontSize: 12, height: 28 }} disabled={!projectOpen || !action.enabled} onClick={() => onAsk(oversightPrompt(action.id))}>{action.label}</button>)}
    </div>
    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-400)' }}>
      {!projectOpen ? 'Open a project so AnA can read its documents and evidence.' : dirty ? 'AnA reviews the saved record. Your unsaved changes are not included.' : 'AnA reads saved documents and project evidence. Proposed fixes remain tracked changes for your review.'}
    </p>
  </section>;
}
