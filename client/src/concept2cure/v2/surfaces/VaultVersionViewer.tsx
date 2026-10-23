/**
 * View a version of a Vault document in the page (gap 3.1 of
 * docs/design/VEEVA_GAP_2026-10-22.md, 2026-10-22).
 *
 * The Vault surface could only download a version. Project files and Project
 * home's Evidence could already show one in the browser. This reaches the same
 * viewer (editor/vaultPdfViewer.tsx), with nothing rebuilt:
 *   - the same audited download route;
 *   - the same bytes rule: only bytes that begin %PDF are framed;
 *   - the same object-URL lifetime;
 *   - the same hash line.
 * A file whose bytes are not a PDF is downloaded instead, and the note says
 * why. A refusal says what the Vault said.
 *
 * @module client/src/concept2cure/v2/surfaces/VaultVersionViewer
 */
import React, { useEffect, useRef, useState } from 'react';
import { redactInternals } from '@/lib/queryClient';
import { I } from '../icons';
import {
  claimsToBePdf, downloadVaultFile, PdfFrame, presentOpenedFile, useVaultPdfViewer, type ViewableFile,
} from '../editor/vaultPdfViewer';

interface ViewedVersion extends ViewableFile { id: string }
type Note = { text: string; tone: 'ok' | 'error' };

/** Whether a version is offered for viewing: its file is named as a PDF. The bytes still decide. */
export function viewableAsPdf(v: { fileName: string | null }): boolean {
  return claimsToBePdf('', v.fileName ?? '');
}

/** View on a version row, for a version whose file is named as a PDF; nothing for any other. */
export function VersionViewButton({ version, title, onView, viewingId }: {
  version: { id: string; version: string | null; fileName: string | null; contentHash: string | null };
  title: string;
  onView?: (versionId: string, label: string, hash: string | null) => void;
  viewingId?: string | null;
}) {
  if (!onView || !viewableAsPdf(version)) return null;
  const label = version.version ? `${title} v${version.version}` : title;
  const opening = viewingId === version.id;
  return (
    <button
      className="sp-ask"
      disabled={opening}
      onClick={() => onView(version.id, label, version.contentHash)}
      aria-label={`View ${version.version ? `version ${version.version} of ` : ''}${title}`}
    >
      {I.eye} {opening ? 'Opening…' : 'View'}
    </button>
  );
}

/** The viewer a document's Versions section keeps: the open version, the one being fetched, and the last note. */
export function useVaultVersionViewer(projectId: string) {
  const { viewer, showPdf, closeViewer } = useVaultPdfViewer<ViewedVersion>();
  const [viewing, setViewing] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const view = async (id: string, title: string, hash: string | null) => {
    if (viewing) return;
    setViewing(id);
    setNote(null);
    const doc: ViewedVersion = { id, title, hash };
    try {
      const file = await downloadVaultFile(projectId, id, doc);
      if (alive.current) presentOpenedFile({ file, doc, report: (text, tone) => setNote({ text, tone }), showPdf });
    } catch (e) {
      if (alive.current) setNote({ text: redactInternals(e instanceof Error ? e.message : '', `${title} was not opened.`), tone: 'error' });
    } finally {
      if (alive.current) setViewing(null);
    }
  };

  return { viewer, closeViewer, viewing, note, view };
}

/** The open version, framed, with its served hash; and the note of the last attempt. */
export function VaultVersionViewer({ state }: { state: ReturnType<typeof useVaultVersionViewer> }) {
  const { viewer, closeViewer, note } = state;
  return (
    <>
      {note && (
        <div className={note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={note.tone === 'error' ? 'alert' : 'status'}>
          {note.tone === 'error' ? I.alertTriangle : null} {note.text}
        </div>
      )}
      {viewer && (
        <div className="pf-viewer" data-testid="vault-version-viewer">
          <div className="pf-viewer-h">
            <button type="button" className="nda-open" onClick={closeViewer}>{I.close} Close viewer</button>
            <span className="pf-viewer-t" title={viewer.doc.title}>{viewer.doc.title}</span>
          </div>
          <PdfFrame title={viewer.doc.title} url={viewer.url} hash={viewer.hash} />
        </div>
      )}
    </>
  );
}
