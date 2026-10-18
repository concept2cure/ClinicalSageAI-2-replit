import React, { useId } from 'react';
import { oversightPrompt, type OversightAction } from './authoringOversight';

export function AuthoringOversightActions({ projectOpen, sectionOpen, documentOpen, dirty, onAsk }: {
  projectOpen: boolean; sectionOpen: boolean; documentOpen: boolean; dirty: boolean; onAsk: (text: string) => void;
}) {
  const noteId = useId();
  const actions: Array<{ id: OversightAction; label: string; enabled: boolean }> = [
    { id: 'section', label: 'Review section', enabled: sectionOpen },
    { id: 'document', label: 'Review document', enabled: documentOpen },
    { id: 'evidence', label: 'Reconcile project evidence', enabled: true },
    { id: 'fixes', label: 'Prepare targeted fixes', enabled: sectionOpen },
  ];
  return <section aria-label="AnA document oversight" className="authoring-oversight">
    <details className="authoring-oversight-options">
      <summary className="authoring-oversight-toggle" aria-describedby={noteId}>Review with AnA</summary>
      <div className="authoring-oversight-actions">
        {actions.map(action => <button key={action.id} type="button" className="btn ghost authoring-oversight-action" aria-describedby={noteId} disabled={!projectOpen || !action.enabled} onClick={() => onAsk(oversightPrompt(action.id))}>{action.label}</button>)}
      </div>
    </details>
    <p id={noteId} className="authoring-oversight-note">
      {!projectOpen ? 'Open a project so AnA can read its documents and evidence.' : dirty ? 'AnA reviews the saved record. Your unsaved changes are not included.' : 'AnA reads saved documents and project evidence. Proposed fixes remain tracked changes for your review.'}
    </p>
  </section>;
}
