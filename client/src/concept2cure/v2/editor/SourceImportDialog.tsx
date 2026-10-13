import React, { useEffect, useId, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { setEditorTarget } from '../editorTarget';
import type { AuthoringImportSource, AuthoringSourceImportData } from '@shared/authoring/source-import';

export type ImportSource = AuthoringImportSource;
export type SourceImportResult = AuthoringSourceImportData;

function sourceMatches(origin: SourceImportResult['origin'] | undefined, programId: string, source: ImportSource): boolean {
  if (!origin) return false;
  const sourceId = source.kind === 'vault' ? source.documentId : String(source.sourceId);
  return origin.programId === programId && origin.kind === source.kind && String(origin.id) === sourceId
    && typeof origin.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(origin.sha256)
    && ['docx-structure', 'extracted-text'].includes(origin.conversion);
}

/** A success must identify the exact working copy and the source requested. */
export function readSourceImportResult(body: unknown, programId: string, source: ImportSource): SourceImportResult | null {
  if (!body || typeof body !== 'object') return null;
  const envelope = body as { success?: unknown; data?: SourceImportResult };
  const data = envelope.data;
  if (envelope.success !== true || !data || typeof data.doc?.id !== 'string' || !data.doc.id.trim()
    || typeof data.doc.title !== 'string' || !sourceMatches(data.origin, programId, source)
    || !Array.isArray(data.warnings) || !data.warnings.every(w => typeof w === 'string')
    || typeof data.reused !== 'boolean') return null;
  return data;
}

/** Source surfaces navigate only after a confirmed import, by its exact id. */
export function openImportedDocument(docId: string, programId: string, onNav: (id: string) => void): void {
  setEditorTarget({ docType: null, docId, programId });
  onNav('document-authoring');
}

interface SourceImportDialogProps {
  programId: string;
  source: ImportSource;
  title: string;
  onClose: () => void;
  /** The editor supplies its unsaved-work guard; other surfaces deep-link by id. */
  onOpenDocument?: (docId: string) => void;
}

/** A source or project change cannot retain another source's saved copy. */
export function SourceImportDialog(props: SourceImportDialogProps) {
  const id = props.source.kind === 'vault' ? props.source.documentId : props.source.sourceId;
  return <ScopedSourceImportDialog key={`${props.programId}:${props.source.kind}:${id}`} {...props} />;
}

function ScopedSourceImportDialog({ programId, source, title, onClose, onOpenDocument }: SourceImportDialogProps) {
  const labelId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [result, setResult] = useState<SourceImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog(() => { if (!busyRef.current) onClose(); });

  const pull = async () => {
    if (busyRef.current || result || !reason.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest('POST', '/api/authoring/import/source', { programId, source, reason: reason.trim() });
      const body = await res.json().catch(() => null);
      if (!alive.current) return;
      const saved = res.ok ? readSourceImportResult(body, programId, source) : null;
      if (!saved) {
        setError(serverMessage(body) ?? (res.ok
          ? 'The server did not confirm a working copy of this source. Reload the document list before retrying.'
          : `The source could not be pulled into the editor (HTTP ${res.status}).`));
        return;
      }
      setResult(saved);
    } catch (e) {
      if (alive.current) setError(redactInternals(e instanceof Error ? e.message : '', 'The request could not be completed. Reload the document list before retrying.'));
    } finally {
      if (alive.current) { busyRef.current = false; setBusy(false); }
    }
  };

  return (
    <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget && !busyRef.current) onClose(); }}>
      <div className="de" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelId} data-testid="source-import-dialog">
        <div className="de-h">
          <div>
            <div className="de-h-eye">{source.kind === 'vault' ? 'Vault' : 'Data room'} → document editor</div>
            <div className="de-h-t" id={labelId}>Work on this document</div>
            <div className="de-h-s">{title}</div>
          </div>
          <button className="de-x" onClick={onClose} disabled={busy} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body">
          <p className="de-gov-t">Creates a draft working copy in this project, linked to the source version. The original file stays in the {source.kind === 'vault' ? 'Vault' : 'data room'}.</p>
          <p className="de-gov-t">Word documents retain supported headings, lists and tables. Other readable formats become extracted text; page layout, spreadsheet formulas, figures and form controls need review against the original.</p>
          {!result && <div className="de-field">
            <label className="de-label" htmlFor={reasonId}>Reason for creating a working copy</label>
            <textarea id={reasonId} className="c2c-input" value={reason} onChange={e => setReason(e.target.value)} disabled={busy}
              maxLength={2000} rows={3} style={{ width: '100%' }} />
          </div>}
          {error && <div className="de-err" role="alert">{error}</div>}
          {result && <div role="status" data-testid="source-import-result">
            <p>{result.reused ? 'Existing working copy ready' : 'Draft working copy saved'}: “{result.doc.title}”.</p>
            <p>Source SHA-256: <code style={{ overflowWrap: 'anywhere' }}>{result.origin.sha256}</code></p>
            {result.warnings.length > 0 && <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            {!onOpenDocument && <p>Open Document authoring in this project to find the saved working copy.</p>}
          </div>}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</button>
          {!result && <button className="de-btn primary" disabled={busy || !reason.trim()} onClick={() => void pull()}>
            {busy ? 'Creating working copy…' : 'Create working copy'}
          </button>}
          {result && onOpenDocument && <button className="de-btn primary" onClick={() => { if (!alive.current) return; onClose(); onOpenDocument(result.doc.id); }}>
            {I.penLine} Open working copy
          </button>}
        </div>
      </div>
    </div>
  );
}
