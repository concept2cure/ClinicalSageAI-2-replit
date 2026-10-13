import React from 'react';
import { I } from '../icons';
import type { VaultDoc } from '../fixtures/vault-data';
import type { ProjectSource } from './DocumentWorkbench';
import { SourceImportDialog, sourceImportUnavailableReason } from './SourceImportDialog';

/** The two section actions — cite a source, refer to anything else — which
 *  the viewer pane and the selected row both offer, on the same rule. */
export function SectionActions(props: {
  sectionOpen: boolean; sectionCode: string | null; source: ProjectSource | null;
  onCite: () => void; onInsertRef: () => void; citeTestId?: string; refTestId?: string;
}) {
  const { sectionOpen, sectionCode, source, onCite, onInsertRef, citeTestId, refTestId } = props;
  if (!sectionOpen) return null;
  return source ? (
    <button type="button" className="btn ghost" onClick={onCite} data-testid={citeTestId}>
      {I.quote} Cite in {sectionCode ? `§${sectionCode}` : 'this section'}
    </button>
  ) : (
    <button type="button" className="btn ghost" onClick={onInsertRef} data-testid={refTestId}>
      {I.link} Insert reference
    </button>
  );
}

function PullFileOffer({ doc, onPull }: { doc: VaultDoc; onPull: () => void }) {
  if (doc.src !== 'upload') return null;
  const reason = sourceImportUnavailableReason({ ...doc, isCurrent: doc.earlierVersion ? false : undefined });
  return <button type="button" className="btn ghost" onClick={onPull} disabled={Boolean(reason)} title={reason ?? undefined}>
    {I.penLine} Work on document
  </button>;
}

/** The selected row's footer: what the file is, what can be done with it, and
 *  why a file that is not a data-room source cannot be cited. */
export function SelectedFileActions(props: {
  doc: VaultDoc; sectionOpen: boolean; sectionCode: string | null; source: ProjectSource | null;
  busy: boolean; onOpen: () => void; onPull: () => void; onCite: () => void; onInsertRef: () => void; editorAttached: boolean;
}) {
  const { doc, busy, onOpen, onPull, editorAttached, ...actions } = props;
  const { sectionOpen, source } = props;
  return (
    <div className="pf-sel" data-testid="pf-selected">
      <div className="pf-sel-t">{doc.title}</div>
      {doc.hash && <div className="pf-sel-m" title={`SHA-256 ${doc.hash}`}>SHA-256 {doc.hash.slice(0, 12)}…</div>}
      {doc.filing?.folderLabel && <div className="pf-sel-m">{doc.filing.folderLabel}</div>}
      <div className="pf-actions">
        {(doc.src === 'upload' || doc.docId) && (
          <button type="button" className="btn ghost" disabled={busy} onClick={onOpen}>
            {I.eye} {busy ? 'Opening…' : 'Open'}
          </button>
        )}
        <PullFileOffer doc={doc} onPull={onPull} />
        <SectionActions {...actions} citeTestId="pf-cite" refTestId="pf-insert-reference" />
        {editorAttached && !sectionOpen && <span className="pf-sel-m">Open an editable section to cite or refer to this file.</span>}
      </div>
      {doc.disposition === 'remove_data' && <p className="pf-sel-m">Source data use has been withdrawn.</p>}
      {doc.disposition === 'supersede' && <p className="pf-sel-m">This source has been superseded. Use its current version.</p>}
      {doc.earlierVersion && <p className="pf-sel-m">This is an earlier source version. Use its current version to create a working copy.</p>}
      {doc.originalFileAvailable === false && <p className="pf-sel-m">The original file is unavailable. Use retained data-room text with AnA where data use is still permitted.</p>}
      {sectionOpen && !source && (
        <div className="pf-sel-m" data-testid="pf-not-citable">
          Not a data-room source, so it cannot be cited — a citation claims a source the reference list resolves. Add the file to the project’s data room to cite it; a reference inserts as text.
        </div>
      )}
    </div>
  );
}

/** The host owns navigation; this offer only selects a verified source intake. */
export function VaultSourceImport({ doc, programId, onClose, onOpenDocument }: {
  doc: VaultDoc | null; programId: string; onClose: () => void; onOpenDocument?: (id: string) => void;
}) {
  if (!doc) return null;
  const id = doc.docId ?? doc.id;
  if (!id) return null;
  return <SourceImportDialog programId={programId} source={{ kind: 'vault', documentId: id }}
    title={doc.title} onClose={onClose} onOpenDocument={onOpenDocument} />;
}
