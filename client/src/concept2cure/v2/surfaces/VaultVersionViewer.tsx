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
 * A Word version is shown as its PDF rendition (P-107 item 3, 2026-11-10):
 * a PDF the Vault makes from the version's verified bytes, for reading. The
 * pane says what it is and which source it was made from, and the source
 * stays downloadable beside it. When the Vault cannot make one, the note says
 * why in the Vault's words and nothing is framed.
 *
 * @module client/src/concept2cure/v2/surfaces/VaultVersionViewer
 */
import React, { useEffect, useRef, useState } from 'react';
import { redactInternals } from '@/lib/queryClient';
import { I } from '../icons';
import { downloadBlob } from '../download';
import {
  claimsToBePdf, downloadVaultFile, fetchVaultRendition, namedAsWord, PdfFrame, presentOpenedFile, RENDITION_NOT_NEEDED,
  useVaultPdfViewer, withoutFullStop, type OpenedFile, type ViewableFile,
} from '../editor/vaultPdfViewer';

/** The source file of a shown rendition, when it was fetched on the way to it. */
interface SourceFile { name: string; blob: Blob }
interface ViewedVersion extends ViewableFile { id: string; source?: SourceFile }
type Note = { text: string; tone: 'ok' | 'error' };

/** Whether a version is offered for viewing: its file is named as a PDF. The bytes still decide. */
export function viewableAsPdf(v: { fileName: string | null }): boolean {
  return claimsToBePdf('', v.fileName ?? '');
}

/** Whether a version is offered as its PDF rendition: its file is named as a Word document. The Vault still decides. */
export function viewableAsRendition(v: { fileName: string | null }): boolean {
  return namedAsWord(v.fileName ?? '');
}

/**
 * View on a version row: for a version whose file is named as a PDF, and, as
 * its PDF rendition, for one named as a Word document. Nothing for any other.
 * The file name is passed on, so a surface that hands it to `view` reads a
 * Word version without fetching the Word file first.
 */
export function VersionViewButton({ version, title, onView, viewingId }: {
  version: { id: string; version: string | null; fileName: string | null; contentHash: string | null };
  title: string;
  onView?: (versionId: string, label: string, hash: string | null, fileName?: string | null) => void;
  viewingId?: string | null;
}) {
  const rendition = viewableAsRendition(version);
  if (!onView || !(rendition || viewableAsPdf(version))) return null;
  const label = version.version ? `${title} v${version.version}` : title;
  const opening = viewingId === version.id;
  const named = `${version.version ? `version ${version.version} of ` : ''}${title}`;
  const idle = rendition ? 'View as PDF' : 'View';
  return (
    <button
      className="sp-ask"
      disabled={opening}
      onClick={() => onView(version.id, label, version.contentHash, version.fileName)}
      aria-label={rendition ? `View a PDF rendition of ${named}` : `View ${named}`}
    >
      {I.eye} {opening ? 'Opening…' : idle}
    </button>
  );
}

/** What opening a version produced: the file to show or hand over, and its source file when that was fetched too. */
interface OpenedVersion { file: OpenedFile; source?: SourceFile }

/** The version's own file. For a Word file, its rendition is shown in place of handing the file to the browser;
 *  when there is none, the file is handed over as before and the note says why no rendition was shown. */
async function openSourceFirst(projectId: string, doc: ViewedVersion): Promise<OpenedVersion> {
  const file = await downloadVaultFile(projectId, doc.id, doc);
  if (file.kind !== 'download' || !namedAsWord(file.name)) return { file };
  const rendition = await fetchVaultRendition(projectId, doc.id);
  if (rendition.kind === 'pdf') return { file: rendition, source: { name: file.name, blob: file.blob } };
  const said = rendition.kind === 'refused' ? rendition.message : rendition.why;
  return { file: { ...file, why: `its PDF rendition was not shown: ${withoutFullStop(said)}` } };
}

/**
 * Open a version for reading. A version known to be a Word file is asked for
 * as its rendition only, so the Word file is not fetched to read it; when the
 * Vault answers that the version is already a PDF, the version itself is
 * opened. A version of unknown type is opened as itself first.
 */
async function openVersion(projectId: string, doc: ViewedVersion, fileName?: string | null): Promise<OpenedVersion> {
  if (fileName && namedAsWord(fileName)) {
    const rendition = await fetchVaultRendition(projectId, doc.id);
    if (!(rendition.kind === 'refused' && rendition.code === RENDITION_NOT_NEEDED)) return { file: rendition };
  }
  return openSourceFirst(projectId, doc);
}

/** The viewer a document's Versions section keeps: the open version, the one being fetched, and the last note. */
export function useVaultVersionViewer(projectId: string) {
  const { viewer, showPdf, closeViewer } = useVaultPdfViewer<ViewedVersion>();
  const [viewing, setViewing] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const view = async (id: string, title: string, hash: string | null, fileName?: string | null) => {
    if (viewing) return;
    setViewing(id);
    setNote(null);
    const doc: ViewedVersion = { id, title, hash };
    try {
      const { file, source } = await openVersion(projectId, doc, fileName);
      const shown: ViewedVersion = { ...doc, source };
      if (alive.current) presentOpenedFile({ file, doc: shown, report: (text, tone) => setNote({ text, tone }), showPdf });
    } catch (e) {
      if (alive.current) setNote({ text: redactInternals(e instanceof Error ? e.message : '', `${title} was not opened.`), tone: 'error' });
    } finally {
      if (alive.current) setViewing(null);
    }
  };

  /** Hand the browser the source file of the shown rendition: the bytes already fetched, with no further request. */
  const saveSource = () => {
    const source = viewer?.doc.source;
    if (!viewer || !source) return;
    if (!downloadBlob(source.name, source.blob)) {
      setNote({ text: `${viewer.doc.title} was fetched but the browser refused the download.`, tone: 'error' });
    }
  };

  return { viewer, closeViewer, viewing, note, view, saveSource };
}

/** The open version, framed, with its served hash, or as its rendition with what that is; and the note of the last attempt. */
export function VaultVersionViewer({ state }: { state: ReturnType<typeof useVaultVersionViewer> }) {
  const { viewer, closeViewer, note, saveSource } = state;
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
            {viewer.doc.source && (
              <button type="button" className="nda-open" onClick={saveSource} aria-label={`Download the source of ${viewer.doc.title}`}>
                {I.download} Download the source
              </button>
            )}
          </div>
          <PdfFrame title={viewer.doc.title} url={viewer.url} hash={viewer.hash} rendition={viewer.rendition} />
        </div>
      )}
    </>
  );
}
