/**
 * File to vault — export the document and file the file into the project
 * vault, through one server route.
 *
 * POST /api/authoring/docs/:docId/file-to-vault { format: 'pdf' | 'docx' }
 * (docs/design/ANA_DOCUMENT_CANVAS.md, server contract WM): the server exports
 * through the existing export path, ingests through the existing vault ingest
 * service, files through the existing filing service, audits the whole thing
 * as one governed action and answers
 * `201 { data: { vaultDocumentId, folder, sha256, format } }`. It refuses a
 * document with no program and never files a document that is mid-freeze.
 *
 * What is shown afterwards is exactly what came back — the vault id, the
 * folder the server chose, the SHA-256 it recorded — and on failure the
 * server's sentence. Nothing here composes a success.
 */
import React, { useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import type { FireToast } from '../toast';

export interface FileToVaultResult {
  vaultDocumentId: string;
  folder: string | null;
  sha256: string | null;
  format: string;
}

export interface FileToVaultDialogProps {
  docId: string;
  docTitle: string;
  docStatus: string | null;
  programId: string | null;
  programName: string | null;
  onClose: () => void;
  onFiled?: (result: FileToVaultResult) => void;
  /** Where "Open in Vault" goes; omitted where the host has no navigation. */
  onNav?: (id: string) => void;
  fireToast: FireToast;
}

function readFolderLabel(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { folderLabel?: unknown; folderId?: unknown };
  if (typeof r.folderLabel === 'string' && r.folderLabel.trim()) return r.folderLabel.trim();
  return typeof r.folderId === 'string' && r.folderId.trim() ? r.folderId.trim() : null;
}

/** The route's success body, read strictly — a missing id is a failure. */
export function readFileToVaultResult(body: unknown): FileToVaultResult | null {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return null;
  const id = typeof data.vaultDocumentId === 'string' ? data.vaultDocumentId : null;
  if (!id) return null;
  return {
    vaultDocumentId: id,
    // The route returns the vault's filing record ({ folderId, folderLabel, … });
    // an older shape was a bare label. Read both; a record with no folder is null.
    folder: readFolderLabel(data.folder),
    sha256: typeof data.sha256 === 'string' ? data.sha256 : null,
    format: typeof data.format === 'string' ? data.format : '',
  };
}

/** Either the vault record the server wrote, or the sentence to show instead. */
type FileToVaultAttempt =
  | { ok: true; result: FileToVaultResult }
  | { ok: false; message: string };

/**
 * The POST, its status handling and the strict read of its body, in one place:
 * every way this can fail becomes the same shape, so the component only picks
 * what to show and can never compose a success out of a failure.
 */
async function attemptFileToVault(docId: string, format: 'pdf' | 'docx'): Promise<FileToVaultAttempt> {
  try {
    const res = await apiRequest('POST', `/api/authoring/docs/${encodeURIComponent(docId)}/file-to-vault`, { format });
    const json = await res.json().catch(() => null);
    if (res.status === 401) {
      return { ok: false, message: 'Not filed — your session isn’t authenticated. Sign in and retry.' };
    }
    const parsed = res.ok ? readFileToVaultResult(json) : null;
    if (!res.ok || !parsed) {
      return {
        ok: false,
        message:
          'The document was not filed — ' +
          (serverMessage(json) ?? (res.ok ? 'the server answered without a vault record' : `the server refused it (HTTP ${res.status})`)) +
          '. Nothing was written to the vault.',
      };
    }
    return { ok: true, result: parsed };
  } catch (e) {
    return {
      ok: false,
      message: 'The document was not filed — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '. Nothing was written to the vault.',
    };
  }
}

/**
 * The format the server recorded, falling back to the one that was asked for
 * when the server reported none. It exists because the toast and the result
 * notice must not disagree about what was filed.
 */
function filedFormatLabel(result: FileToVaultResult, chosenFormat: string): string {
  return result.format.toUpperCase() || chosenFormat.toUpperCase();
}

/**
 * What the dialog shows once the attempt has answered — the server's own vault
 * record, or the server's refusal, and the way onwards to the vault. Separated
 * so the dialog body stays the form and the outcome stays one readable block.
 */
function FileToVaultOutcome({
  result,
  error,
  chosenFormat,
  onClose,
  onNav,
}: {
  result: FileToVaultResult | null;
  error: string | null;
  chosenFormat: string;
  onClose: () => void;
  onNav?: (id: string) => void;
}) {
  return (
    <>
      {result && (
        <div className="de-gov" role="status" data-testid="ftv-result">
          <span className="ico">{I.checkCircle}</span>
          <span className="de-gov-t">
            Filed as {filedFormatLabel(result, chosenFormat)}
            {result.folder ? ` under ${result.folder}` : ' — the server reported no folder'}.
            {' '}Vault id {result.vaultDocumentId}.
            {result.sha256 ? ` SHA-256 ${result.sha256}.` : ' No content hash was reported.'}
          </span>
        </div>
      )}
      {error && (
        <div className="de-err" role="alert" data-testid="ftv-error">{error}</div>
      )}
      {result && onNav && (
        <div className="de-field">
          <button className="btn ghost" style={{ height: 30 }} onClick={() => { onClose(); onNav('vault'); }}>
            {I.vault} Open in Vault
          </button>
        </div>
      )}
    </>
  );
}

export function FileToVaultDialog({ docId, docTitle, docStatus, programId, programName, onClose, onFiled, onNav, fireToast }: FileToVaultDialogProps) {
  const [filing, setFiling] = useState(false);
  const ref = useDialog(() => {
    if (!filing) onClose();
  });
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [result, setResult] = useState<FileToVaultResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sealed = ['FROZEN', 'APPROVED'].includes(String(docStatus ?? '').toUpperCase());
  const canFile = Boolean(programId) && !filing && !result;

  const file = async () => {
    if (!canFile) return;
    setFiling(true);
    setError(null);
    try {
      const attempt = await attemptFileToVault(docId, format);
      if (!attempt.ok) {
        setError(attempt.message);
        return;
      }
      setResult(attempt.result);
      onFiled?.(attempt.result);
      fireToast(`Filed “${docTitle}” to the vault as ${filedFormatLabel(attempt.result, format)}${attempt.result.folder ? ` under ${attempt.result.folder}` : ''}.`);
    } finally {
      setFiling(false);
    }
  };

  return (
    <div
      className="de-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !filing) onClose();
      }}
    >
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ftv-title" data-testid="file-to-vault-dialog">
        <div className="de-h">
          <div>
            <div className="de-h-eye">Authoring → vault</div>
            <div className="de-h-t" id="ftv-title">File to vault</div>
            <div className="de-h-s">
              Exports “{docTitle}” and files the file into {programName ? `the ${programName} vault` : 'the project vault'}, with its SHA-256 recorded.
            </div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={filing}>
            {I.close}
          </button>
        </div>
        <div className="de-body">
          {!programId && (
            <div className="de-err" role="status" data-testid="ftv-no-program">
              This document is not filed under a program, and the vault is program-scoped, so it cannot be filed. Open it from its project, or create documents from a project.
            </div>
          )}
          {sealed && (
            <div className="de-gov" role="status">
              <span className="ico">{I.lock}</span>
              <span className="de-gov-t">This document is frozen; the export is taken from the sealed content and its hash.</span>
            </div>
          )}
          <fieldset className="de-field" disabled={!canFile}>
            <legend className="de-label">Format</legend>
            <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="ftv-format" value="pdf" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /> PDF
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="ftv-format" value="docx" checked={format === 'docx'} onChange={() => setFormat('docx')} /> Word (.docx)
              </label>
            </div>
          </fieldset>
          <div className="de-gov">
            <span className="ico">{I.lock}</span>
            <span className="de-gov-t">
              One governed action: export, ingest and filing are recorded together in the audit trail. The vault folder is decided by the project’s filing rules and shown below once recorded.
            </span>
          </div>
          <FileToVaultOutcome result={result} error={error} chosenFormat={format} onClose={onClose} onNav={onNav} />
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={filing}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="de-btn primary" onClick={() => void file()} disabled={!canFile} data-testid="ftv-submit">
              {filing ? 'Filing…' : `File as ${format.toUpperCase()}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
