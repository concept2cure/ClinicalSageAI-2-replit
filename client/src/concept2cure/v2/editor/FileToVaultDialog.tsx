/**
 * File to vault — export the document and file the file into the project
 * vault, through one server route.
 *
 * POST /api/authoring/docs/:docId/file-to-vault { format: 'pdf' | 'docx' }
 * (docs/design/ANA_DOCUMENT_CANVAS.md, server contract WM): the server exports
 * through the existing export path, ingests through the existing vault ingest
 * service, files through the existing filing service, audits the whole thing
 * as one governed action and answers
 * `201 { data: { vaultDocumentId, programId, folder, sha256, format, approval } }`. It
 * refuses a document with no program and never files a document that is
 * mid-freeze. `approval` says whether the Authoring approval carried to the
 * Vault version (FD5 (c)) and, when it did not, why.
 *
 * What is shown afterwards is exactly what came back — the vault id, the
 * folder the server chose, the SHA-256 it recorded — and on failure the
 * server's sentence. Nothing here composes a success.
 */
import React, { useEffect, useRef, useState } from 'react';
import { authService } from '@/services/portal/authService';
import { isCanonicalId } from '@shared/regulatory/canonical-document';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { setVaultTarget } from '../vaultTarget';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { mutateVerbatim, mutationUnconfirmed } from '../surfaces/SubmissionSeqWorkspaces';
import { useSubmissionReadSession, type SubmissionReadSession } from '../surfaces/submissionScopedRead';
import type { FireToast } from '../toast';

export interface FileToVaultResult {
  vaultDocumentId: string;
  programId: string;
  folder: string | null;
  sha256: string;
  format: 'pdf' | 'docx';
  /** What the server said about the Authoring approval; null when it said nothing. */
  approval: FiledApproval | null;
}

/** Whether the Authoring approval carried to the Vault version, as the server reported it. */
export type FiledApproval =
  | { carried: true; approvedBy: string | null; reviewedBy: string | null }
  | { carried: false; reason: string };

function readFiledApproval(raw: unknown): FiledApproval | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { carried?: unknown; approvedBy?: unknown; reviewedBy?: unknown; reason?: unknown };
  const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (r.carried === true) return { carried: true, approvedBy: name(r.approvedBy), reviewedBy: name(r.reviewedBy) };
  if (r.carried === false && typeof r.reason === 'string' && r.reason.trim()) return { carried: false, reason: r.reason.trim() };
  return null;
}

/** The sentence the result shows about the Vault approval. */
export function filedApprovalLine(approval: FiledApproval | null): string {
  if (!approval) return 'The server did not report whether the approval carried. Check the version in the Vault.';
  if (approval.carried) {
    const who = [approval.reviewedBy && `reviewed by ${approval.reviewedBy}`, approval.approvedBy && `approved by ${approval.approvedBy}`]
      .filter(Boolean)
      .join(', ');
    return `The Authoring approval carried to this file${who ? ` (${who})` : ''}. The Vault shows the version as approved.`;
  }
  return `Not approved in the Vault: ${approval.reason} Review and approve this version in the Vault before it is transmitted.`;
}

export interface FileToVaultDialogProps {
  /** Keep the filing outcome while the host closes and reopens this dialog. */
  open?: boolean;
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
  /** Current read limit; does not discard a request or receipt already in progress. */
  refusal?: string | null;
}

function readFolderLabel(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { folderLabel?: unknown; folderId?: unknown };
  if (typeof r.folderLabel === 'string' && r.folderLabel.trim()) return r.folderLabel.trim();
  return typeof r.folderId === 'string' && r.folderId.trim() ? r.folderId.trim() : null;
}

/** Confirm this request's project, admitted version, bytes and requested format. */
export function readFileToVaultResult(body: unknown, expected: { programId: string; format: 'pdf' | 'docx' }): FileToVaultResult | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const envelope = body as Record<string, unknown>;
  if (envelope.error != null) return null;
  if ('success' in envelope && envelope.success !== true) return null;
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return null;
  const data = envelope.data as Record<string, unknown>;
  const identities = [data.vaultDocumentId, data.programId];
  if (!identities.every((id): id is string => typeof id === 'string' && isCanonicalId(id))) return null;
  const [vaultDocumentId, programId] = identities;
  if (programId !== expected.programId ||
      typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256) || data.format !== expected.format) return null;
  return {
    vaultDocumentId,
    programId,
    // The route returns the vault's filing record ({ folderId, folderLabel, … });
    // an older shape was a bare label. Read both; a record with no folder is null.
    folder: readFolderLabel(data.folder),
    sha256: data.sha256,
    format: expected.format,
    approval: readFiledApproval(data.approval),
  };
}

/** Either the vault record the server wrote, or the sentence to show instead. */
type FileToVaultAttempt =
  | { ok: true; result: FileToVaultResult }
  | { ok: false; message: string; unconfirmed: boolean };

/**
 * The POST, its status handling and the strict read of its body, in one place:
 * every way this can fail becomes the same shape, so the component only picks
 * what to show and can never compose a success out of a failure.
 */
async function attemptFileToVault(docId: string, programId: string, format: 'pdf' | 'docx'): Promise<FileToVaultAttempt> {
  const reply = await mutateVerbatim<unknown>('POST', `/api/authoring/docs/${encodeURIComponent(docId)}/file-to-vault`, { format });
  const parsed = readFileToVaultResult(reply.data, { programId, format });
  if (parsed) return { ok: true, result: parsed };
  const existingVersion = reply.code === 'VAULT_VERSION_ALREADY_RECORDED';
  const unconfirmed = existingVersion || !!reply.unconfirmed || reply.data != null || mutationUnconfirmed(reply.status, reply.code);
  return {
    ok: false,
    unconfirmed,
    message: existingVersion
      ? 'This version is already recorded in the Vault. Check the existing Vault record before retrying.'
      : unconfirmed
        ? 'We cannot confirm whether this document was filed. It may be present in the Vault. Check the Vault before retrying.'
        : reply.error ?? 'The server refused the filing without a reason.',
  };
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
 * The next step on the filing path, in the order the path enforces: a
 * submission takes PDF, and a sequence is not frozen or transmitted until each
 * leaf names an approved, current version. Placement itself does not check
 * approval, so an unapproved filing is told to approve first.
 */
export function filedNextStep(format: string, approved: boolean): string {
  if (format !== 'PDF') {
    return `Submissions take PDF, so this ${format === 'DOCX' ? 'Word' : format} copy cannot be placed into one. To submit this document, file it again as PDF.`;
  }
  return approved
    ? 'Next: open it in the Vault and use “Place into filing…” on its record.'
    : 'Next: review and approve this version in the Vault. It can be placed into a submission before then, but the sequence is not frozen or transmitted until it is approved.';
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
  onOpenVault,
}: {
  result: FileToVaultResult | null;
  error: string | null;
  chosenFormat: string;
  onOpenVault?: () => void;
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
      {result && (
        <div className={result.approval?.carried ? 'de-gov' : 'de-err'} role="status" data-testid="ftv-approval">
          {result.approval?.carried && <span className="ico">{I.checkCircle}</span>}
          <span className="de-gov-t">{filedApprovalLine(result.approval)}</span>
        </div>
      )}
      {error && (
        <div className="de-err" role="alert" data-testid="ftv-error">{error}</div>
      )}
      {result && (
        <div className="de-field" data-testid="ftv-next">
          {filedNextStep(filedFormatLabel(result, chosenFormat), result.approval?.carried === true)}
        </div>
      )}
      {result && onOpenVault && (
        <div className="de-field">
          <button
            className="btn ghost"
            style={{ height: 30 }}
            data-testid="ftv-open-vault"
            onClick={onOpenVault}
          >
            {I.vault} Open in Vault
          </button>
        </div>
      )}
    </>
  );
}

export function FileToVaultDialog(props: FileToVaultDialogProps) {
  const shellProject = useShellProject();
  const project = shellProgramId(shellProject);
  const session = useSubmissionReadSession();
  const context = JSON.stringify([props.docId, props.programId, project, session.key]);
  // Reuse the project-visit boundary: A → B → A retires the previous request too.
  const visit = useRef({ context, generation: 0, projectCurrent: captureShellProjectGuard() });
  if (visit.current.context !== context || !visit.current.projectCurrent()) {
    visit.current = { context, generation: visit.current.generation + 1, projectCurrent: captureShellProjectGuard() };
  }
  return <FileToVaultDialogForDocument key={`${context}:${visit.current.generation}`} {...props} session={session} projectCurrent={visit.current.projectCurrent} projectMatches={!shellProject || project === props.programId} />;
}

function FileToVaultDialogForDocument({ open = true, docId, docTitle, docStatus, programId, programName, onClose, onFiled, onNav, fireToast, session, projectCurrent, projectMatches, refusal = null }: FileToVaultDialogProps & {
  session: SubmissionReadSession; projectCurrent: () => boolean; projectMatches: boolean;
}) {
  const [filing, setFiling] = useState(false);
  const ref = useDialog(() => {
    if (!pending.current) onClose();
  }, open);
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [result, setResult] = useState<FileToVaultResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentRef = React.useRef({ refusal, title: docTitle });
  currentRef.current = { refusal, title: docTitle };

  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const active = useRef(true);
  const receiptCurrent = useRef<() => boolean>(() => false);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    if (!open && !filing && !needsReconciliation) {
      setResult(null); setError(null); setFormat('pdf'); receiptCurrent.current = () => false;
    }
  }, [open, filing, needsReconciliation]);

  const sealed = ['FROZEN', 'APPROVED'].includes(String(docStatus ?? '').toUpperCase());
  const canFile = open && projectMatches && Boolean(programId && isCanonicalId(programId)) && !filing && !result && !needsReconciliation && !refusal;

  const file = async () => {
    if (!canFile || currentRef.current.refusal || !programId || pending.current || !active.current || !session.sameRevision() || !projectCurrent()) return;
    const started = generation.current;
    const sessionGuard = authService.captureSessionReadGuard();
    const current = () => active.current && started === generation.current && session.sameRevision() && sessionGuard.sameRevision() && projectCurrent();
    pending.current = true;
    setFiling(true);
    setError(null);
    try {
      const attempt = await attemptFileToVault(docId, programId, format);
      if (!current()) return;
      if (!attempt.ok) {
        setNeedsReconciliation(attempt.unconfirmed);
        setError(attempt.message);
        return;
      }
      setResult(attempt.result);
      receiptCurrent.current = current;
      onFiled?.(attempt.result);
      if (current()) fireToast(`Filed “${currentRef.current.title}” to the vault as ${filedFormatLabel(attempt.result, format)}${attempt.result.folder ? ` under ${attempt.result.folder}` : ''}.`);
    } finally {
      if (current()) { pending.current = false; setFiling(false); }
    }
  };

  if (!open) return null;
  return <FileToVaultForm {...{ docTitle, docStatus, programId, programName, onClose, filing, format, setFormat, canFile, sealed, result, error, file, refusal }} dialogRef={ref}
    onOpenVault={onNav ? () => {
      if (!result || !receiptCurrent.current()) return;
      const current = receiptCurrent.current;
      onClose();
      if (!current()) return;
      setVaultTarget({ documentId: result.vaultDocumentId, programId: result.programId });
      onNav('vault');
    } : undefined} />;
}

interface FileToVaultFormProps extends Pick<FileToVaultDialogProps, 'docTitle' | 'docStatus' | 'programId' | 'programName' | 'onClose' | 'refusal'> {
  dialogRef: ReturnType<typeof useDialog>;
  filing: boolean;
  format: 'pdf' | 'docx';
  setFormat: (format: 'pdf' | 'docx') => void;
  canFile: boolean;
  sealed: boolean;
  result: FileToVaultResult | null;
  error: string | null;
  file: () => Promise<void>;
  onOpenVault?: () => void;
}

/** The existing dialog markup; its controller owns all filing and context decisions. */
function FileToVaultForm({ docTitle, docStatus, programId, programName, onClose, dialogRef, filing, format, setFormat, canFile, sealed, result, error, file, onOpenVault, refusal }: FileToVaultFormProps) {
  return (
    <div
      className="de-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !filing) onClose();
      }}
    >
      <div className="de" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ftv-title" data-testid="file-to-vault-dialog">
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
          {refusal && <div className="de-err" role="status">{refusal}</div>}
          {!programId && (
            <div className="de-err" role="status" data-testid="ftv-no-program">
              This document is not filed under a program, and the vault is program-scoped, so it cannot be filed. Open it from its project, or create documents from a project.
            </div>
          )}
          {sealed && (
            <div className="de-gov" role="status">
              <span className="ico">{I.lock}</span>
              <span className="de-gov-t">
                This document is frozen; the export is taken from the sealed content and its hash.
                {String(docStatus ?? '').toUpperCase() === 'APPROVED' &&
                  ' Its approval carries to the Vault copy when a different person reviewed it first and neither signer is its author.'}
              </span>
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
          <FileToVaultOutcome result={result} error={error} chosenFormat={format} onOpenVault={onOpenVault} />
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
