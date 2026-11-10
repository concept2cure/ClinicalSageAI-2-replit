import React, { useId } from 'react';
import { oversightPrompt, type OversightAction } from './authoringOversight';
import { MenuItem } from './DownloadMenu';

/**
 * "Review with AnA": four asks that each land in the conversation, and the note
 * that says what AnA reads. `variant="menu"` draws them as one group of the
 * editor bar's AnA (✻) menu (D4.md §D4.G step 2): the same labels, the same
 * `disabled` rule, the same note, each ask closing the menu (`onChoose`) before it
 * is sent. `"section"` (the default) is the disclosure the editor drew under its
 * header before D4-2.
 */
export function AuthoringOversightActions({ projectOpen, sectionOpen, documentOpen, dirty, onAsk, variant = 'section', onChoose }: {
  projectOpen: boolean; sectionOpen: boolean; documentOpen: boolean; dirty: boolean; onAsk: (text: string) => void;
  variant?: 'section' | 'menu'; onChoose?: () => void;
}) {
  const noteId = useId();
  const actions: Array<{ id: OversightAction; label: string; enabled: boolean }> = [
    { id: 'section', label: 'Review section', enabled: sectionOpen },
    { id: 'document', label: 'Review document', enabled: documentOpen },
    { id: 'evidence', label: 'Reconcile project evidence', enabled: true },
    { id: 'fixes', label: 'Prepare targeted fixes', enabled: sectionOpen },
  ];
  const note = !projectOpen ? 'Open a project so AnA can read its documents and evidence.' : dirty ? 'AnA reviews the saved record. Your unsaved changes are not included.' : 'AnA reads saved documents and project evidence. Proposed fixes remain tracked changes for your review.';
  if (variant === 'menu') {
    return <div role="group" aria-label="Review with AnA" className="dlm-group">
      <div className="dlm-sec" aria-hidden="true">Review with AnA</div>
      {actions.map(action => <MenuItem key={action.id} label={action.label} noteId={noteId} disabled={!projectOpen || !action.enabled}
        onChoose={() => { onChoose?.(); onAsk(oversightPrompt(action.id)); }} />)}
      <span id={noteId} className="dlm-reason">{note}</span>
    </div>;
  }
  return <section aria-label="AnA document oversight" className="authoring-oversight">
    <details className="authoring-oversight-options">
      <summary className="authoring-oversight-toggle" aria-describedby={noteId}>Review with AnA</summary>
      <div className="authoring-oversight-actions">
        {actions.map(action => <button key={action.id} type="button" className="btn ghost authoring-oversight-action" aria-describedby={noteId} disabled={!projectOpen || !action.enabled} onClick={() => onAsk(oversightPrompt(action.id))}>{action.label}</button>)}
      </div>
    </details>
    <p id={noteId} className="authoring-oversight-note">{note}</p>
  </section>;
}
