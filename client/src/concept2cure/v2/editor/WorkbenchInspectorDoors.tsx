/**
 * The editor bar's doors to the inspector (P-122, 2026-11-10).
 *
 * b6a46499f (2026-11-02) folded the 25-control header into one bar and put Versions, Review tasks, Signatures,
 * Audit trail, Send for review… and File to vault… behind "More": two clicks, and in a demo they looked gone
 * (docs/evidence/DESIGN/P-122/inventory/vault-authoring-submission.md §2.2). §2's inspector pattern keeps review,
 * versions, signatures and filing in an inspector that slides in, not in permanent panels; a quiet door on the bar
 * that opens its panel is that pattern, as Comments' has always been. So each comes back as an icon button with its
 * name, opening the same panel or dialog through the handler More already used.
 *
 * At phone width the bar does not draw them (`.ed-wide`), and More's narrow groups hold them, by the same names and
 * test ids (`.ed-more-narrow`), so nothing leaves the screen at any width.
 *
 * @module client/src/concept2cure/v2/editor/WorkbenchInspectorDoors
 */
import React from 'react';
import { I } from '../icons';
import { MenuItem } from './DownloadMenu';

export type InspectorPanel = 'history' | 'tasks' | 'signatures' | 'audit';

const PANELS: ReadonlyArray<{ id: InspectorPanel; label: string; icon: React.ReactNode }> = [
  { id: 'history', label: 'Versions', icon: I.history },
  { id: 'tasks', label: 'Review tasks', icon: I.checkSquare },
  { id: 'signatures', label: 'Signatures', icon: I.penLine },
  { id: 'audit', label: 'Audit trail', icon: I.list },
];

export function WorkbenchInspectorDoors({ open, onToggle, sendRefusal, vaultRefusal, onSend, onFile }: {
  /** The inspector panel open now, if any (the workbench's `rail`). */
  open: string | null;
  /** Open the panel, or close it when it is the one open; `from` is where focus returns. */
  onToggle: (id: InspectorPanel, from: HTMLButtonElement) => void;
  /** Why this person may not send the document for review, or null (the server's own check, as More's item). */
  sendRefusal: string | null;
  /** Why the document cannot be filed to the vault now, or null. */
  vaultRefusal: string | null;
  onSend: () => void;
  onFile: () => void;
}) {
  return (
    <>
      {PANELS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="btn ed-ico ed-wide"
          aria-label={p.label}
          title={p.label}
          aria-pressed={open === p.id}
          onClick={(e) => onToggle(p.id, e.currentTarget)}
          data-testid={`ed-${p.id}-open`}
        >
          {p.icon}
        </button>
      ))}
      <button
        type="button"
        className="btn ed-ico ed-wide"
        aria-label="Send for review…"
        title={sendRefusal ?? 'Send for review'}
        disabled={!!sendRefusal}
        onClick={onSend}
        data-testid="ed-send-for-review"
      >
        {I.send}
      </button>
      <button
        type="button"
        className="btn ed-ico ed-wide"
        aria-label="File to vault…"
        title={vaultRefusal ?? 'File to vault: export this document and file it into the project vault, with its SHA-256 recorded'}
        disabled={!!vaultRefusal}
        onClick={onFile}
        data-testid="ed-file-to-vault"
      >
        {I.vault}
      </button>
    </>
  );
}

/**
 * More's review and filing items, for a phone-width bar (`.ed-more-narrow`): the same names, test ids and notes they
 * had in More before P-122. Moved here from DocumentWorkbench.tsx with the bar's doors (RULE 6: a split, not new).
 */
export function MoreReviewGroups({ fromMore, documentOpen, assignRefusal, vaultRefusal, dirty, filedUnderProject, onSend, onFile }: {
  fromMore: (id: InspectorPanel) => () => void;
  documentOpen: boolean;
  assignRefusal: string | null;
  vaultRefusal: string | null;
  dirty: boolean;
  filedUnderProject: boolean;
  onSend: () => void;
  onFile: () => void;
}) {
  return (
    <>
      <div role="group" aria-label="Review and sign" className="dlm-group ed-more-narrow">
        <MenuItem label="Versions" onChoose={fromMore('history')} />
        <MenuItem label="Review tasks" onChoose={fromMore('tasks')} testId="tasks-rail-open" />
        <MenuItem label="Signatures" onChoose={fromMore('signatures')} />
        <MenuItem label="Audit trail" onChoose={fromMore('audit')} />
      </div>
      {documentOpen && (
        <div role="group" aria-label="Review and file" className="dlm-group ed-more-narrow">
          {/* GE-P-3 (2026-09-28): disabled, not hidden, when the server will refuse this caller; the reason is the
              item's note. Send for review records the review request the board lists, and each reviewer's task. */}
          <MenuItem label="Send for review…" disabled={!!assignRefusal} note={assignRefusal ?? undefined}
            onChoose={onSend} testId="send-for-review-open" />
          <MenuItem
            label="File to vault…"
            disabled={dirty || !!vaultRefusal}
            note={vaultRefusal ?? (dirty
              ? 'Save the open section first — the vault files the saved document.'
              : !filedUnderProject
                ? 'This document is not filed under a project; the vault is project-scoped.'
                : 'Export this document and file the file into the project vault, with its SHA-256 recorded.')}
            onChoose={onFile}
            testId="file-to-vault-open"
          />
        </div>
      )}
    </>
  );
}
