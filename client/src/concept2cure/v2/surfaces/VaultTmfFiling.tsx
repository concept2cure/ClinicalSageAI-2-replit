/**
 * The trial master file's two governed acts: file a document against a record,
 * and remove a filing. Split out of VaultTrialMasterFile.tsx (2026-11-10), in
 * its folder.
 *
 * A record is filed against a document of this project's Vault, with the
 * person's reason. The document is one of two things:
 *   - a version chosen from the Vault (VaultVersionPicker), or
 *   - a file from the person's computer, which is first added to THIS
 *     project's Vault through the Vault's one upload path (useVaultUpload,
 *     POST /api/vault/ingest) and then filed, in one step.
 * The retired eTMF screen had the second as "Attach & file", with its own copy
 * of the upload request and no reason. Here it is the Vault's own upload, and
 * the two halves are said apart: a file the Vault did not take is "not added,
 * nothing filed"; a file the Vault took whose filing was refused is "in the
 * Vault and not filed", and the form then files that document without
 * uploading it again.
 *
 * Both forms are opened only from a button a role that may write the Vault is
 * offered, so a view-only role is offered neither.
 */
import React, { useId, useRef, useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { VAULT_UPLOAD_ACCEPT, useVaultUpload, type VaultUploadFileStatus, type VaultUploadState } from '../useVaultUpload';
import { VaultVersionPicker } from './VaultLibraryResults';
import { FILE_WORDS, REMOVE_WORDS, TmfWriteError, governedWrite, tmfBase, tmfIngestType, type TmfNote, type TmfRecord } from './vaultTmf';

export interface TmfActProps { record: TmfRecord; onDone: (note: TmfNote) => void; onCancel: () => void }
interface FileProps extends TmfActProps {
  projectId: string; studyId: string;
  /** Told when this form put a document into the Vault, or may have: a host that lists the Vault reads it again. */
  onVaultChanged?: () => void;
}

/**
 * The Vault document a filing will name. `from`: chosen from the Vault
 * ('vault'), added to it by this form ('added'), or a file this form sent that
 * the Vault already held ('held').
 */
interface ChosenDocument { id: string; title: string; version: string | null; from: 'vault' | 'added' | 'held' }
type Stage = 'idle' | 'adding' | 'filing';

function ReasonField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <>
      <label className="vd-dr-meta" htmlFor={id}>{label}</label>
      <textarea id={id} className="vd-d-filing-reason" rows={2} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters`} />
    </>
  );
}

const versionOf = (doc: ChosenDocument) => (doc.version ? `, version ${doc.version}` : '');
/** Where an uploaded file now is, said before anything about its filing. */
const inVault = (doc: ChosenDocument) =>
  (doc.from === 'added' ? `“${doc.title}” was added to this project’s Vault${versionOf(doc)}. ` : `“${doc.title}” was already in this project’s Vault${versionOf(doc)}. `);

/** A record filed: against a version chosen from the Vault, or against the file just added to it. */
function filedWords(record: TmfRecord, doc: ChosenDocument): string {
  const reason = 'Your reason is recorded with the filing.';
  if (doc.from === 'vault') return `${record.name} is filed against “${doc.title}”${versionOf(doc)}. ${reason}`;
  return `${inVault(doc)}${record.name} is filed against it. ${reason}`;
}

type Added = { doc: ChosenDocument } | { error: string; unknown: boolean };

/**
 * Add a file to this project's Vault through the Vault's one upload path. The
 * document the server recorded it as, or why there is none. An outcome the
 * server did not confirm is said as not known, never as refused.
 */
async function addToVault(upload: VaultUploadState['upload'], file: File, code: string): Promise<Added> {
  const named = `“${file.name}”`;
  const stored = { version: null as string | null, already: false };
  const onFileStatus = (_index: number, status: VaultUploadFileStatus) => {
    if (status.state === 'stored') Object.assign(stored, { version: status.version, already: status.already });
  };
  const unknown = (why: string) => ({ unknown: true, error: `It is not known whether ${named} was added to this project’s Vault: ${why}. Nothing was filed. ` +
    'Search the Vault for it before uploading it again. If it is there, choose it to file it.' });
  let outcome: Awaited<ReturnType<VaultUploadState['upload']>>;
  try {
    // The record chosen is what the person said the file is; the title is the file's own name.
    outcome = await upload([file], { documentType: tmfIngestType(code), onFileStatus });
  } catch {
    return unknown('the upload did not report an outcome');
  }
  const id = outcome.recorded[0];
  if (id) return { doc: { id, title: file.name, version: stored.version, from: stored.already ? 'held' : 'added' } };
  const failed = outcome.failed[0];
  if (!failed) return { unknown: false, error: `${named} was not sent, so it is not in the Vault. Nothing was filed.` };
  const why = failed.reason.replace(/[.\s]+$/, '');
  return failed.unknown ? unknown(why) : { unknown: false, error: `${named} was not added to this project’s Vault: ${why}. Nothing was filed.` };
}

/**
 * Filing one record: the document chosen, the file to add first, and the two
 * requests. A refusal stays in the form. An outcome (filed, or not known
 * whether it was) closes the form and is said above the list.
 */
function useFileRecord({ projectId, studyId, record, onDone, onVaultChanged }: Omit<FileProps, 'onCancel'>) {
  const { upload } = useVaultUpload(projectId);
  const [chosen, setChosen] = useState<ChosenDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const fileAgainst = async (doc: ChosenDocument, reason: string) => {
    setStage('filing');
    // The reference is the id of a document of this project's Vault, never one made up here.
    const body = { artifactCode: record.code, documentRef: `vault://${doc.id}`, reason };
    const uploaded = doc.from !== 'vault';
    try {
      await governedWrite('POST', `${tmfBase(studyId)}/artifacts`, body, FILE_WORDS);
      onDone({ tone: 'ok', text: filedWords(record, doc) });
    } catch (e) {
      if (!(e instanceof TmfWriteError) || e.unknown) {
        onDone({ tone: 'error', text: `${uploaded ? inVault(doc) : ''}${FILE_WORDS.unknown}` });
      } else if (uploaded) {
        // The upload is done and stands. Only the filing was refused, and it can be asked again without the file.
        setError(`“${doc.title}” is in this project’s Vault and is not filed as ${record.name}. ${e.why} It can be filed from here without uploading it again.`);
      } else {
        setError(e.message);
      }
    }
  };

  const addThenFile = async (picked: File, reason: string) => {
    setStage('adding');
    const added = await addToVault(upload, picked, record.code);
    if ('error' in added) {
      setError(added.error);
      // Not known whether the Vault holds it: the same file is not offered for a second send, and the Vault is read again.
      if (added.unknown) { setFile(null); onVaultChanged?.(); }
      return;
    }
    if (added.doc.from === 'added') onVaultChanged?.();
    // From here the form's document is the one the Vault recorded, whatever the filing comes to.
    setChosen(added.doc);
    setFile(null);
    await fileAgainst(added.doc, reason);
  };

  const submit = (reason: string) => {
    if (stage !== 'idle') return;
    setError(null);
    const work = file ? addThenFile(file, reason) : chosen ? fileAgainst(chosen, reason) : null;
    if (work) void work.finally(() => setStage('idle'));
  };
  const choose = (doc: ChosenDocument | null) => { setChosen(doc); setFile(null); setError(null); };
  const pick = (picked: File | null) => { if (picked) { setFile(picked); setChosen(null); setError(null); } };
  return { chosen, file, stage, error, submit, choose, pick };
}

type Filing = ReturnType<typeof useFileRecord>;

/** Which document: the one chosen, the file about to be added, or the two ways to choose one. */
function DocumentChoice({ filing, projectId, record }: { filing: Filing; projectId: string; record: TmfRecord }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = filing.stage !== 'idle';
  const another = <button type="button" className="btn ghost small" disabled={busy} onClick={() => filing.choose(null)}>Choose another</button>;
  const { chosen, file } = filing;
  if (chosen) {
    return (
      <p className="vd-dr-meta" data-testid="vault-tmf-chosen">
        Document: <b>{chosen.title}</b>
        {chosen.from === 'vault' ? `, version ${chosen.version ?? 'not recorded'}.` : `${versionOf(chosen)}. It is in this project’s Vault and is not filed yet.`}{' '}
        {another}
      </p>
    );
  }
  if (file) {
    return (
      <p className="vd-dr-meta" data-testid="vault-tmf-file-chosen">
        File from your computer: <b>{file.name}</b>. It is added to this project’s Vault first, then filed as {record.name}.{' '}
        {another}
      </p>
    );
  }
  return (
    <>
      <VaultVersionPicker programId={projectId} disabled={busy} label={`Search this project’s Vault for the document to file as ${record.name}`}
        onChoose={(p) => filing.choose({ id: p.id, title: p.title, version: p.version, from: 'vault' })} autoFocus />
      <p className="vd-dr-meta">
        Not in the Vault yet?{' '}
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => input.current?.click()}>Upload a file from your computer</button>{' '}
        It is added to this project’s Vault, then filed here in the same step.
      </p>
      <input ref={input} type="file" className="ana-hidden-input" accept={VAULT_UPLOAD_ACCEPT} aria-label={`A file from your computer to file as ${record.name}`}
        data-testid={`vault-tmf-upload-${record.code}`}
        onChange={(e) => { filing.pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
    </>
  );
}

function submitLabel(filing: Filing, record: TmfRecord): string {
  if (filing.stage === 'adding') return 'Adding to the Vault…';
  if (filing.stage === 'filing') return 'Filing…';
  return filing.file ? `Add to the Vault and file as ${record.name}` : `File as ${record.name}`;
}

export function VaultTmfFileForm({ projectId, studyId, record, onDone, onCancel, onVaultChanged }: FileProps) {
  const filing = useFileRecord({ projectId, studyId, record, onDone, onVaultChanged });
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const busy = filing.stage !== 'idle';
  const ready = Boolean(filing.file || filing.chosen) && reason.trim().length >= GOVERNED_REASON_MIN;
  return (
    <div className="vd-confirm-form" data-testid={`vault-tmf-file-${record.code}`}>
      <DocumentChoice filing={filing} projectId={projectId} record={record} />
      <ReasonField id={reasonId} label="Reason for filing it. Recorded with the filing in the audit trail." value={reason} onChange={setReason} disabled={busy} />
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={busy || !ready} onClick={() => filing.submit(reason.trim())}>
          {submitLabel(filing, record)}
        </button>
        <button type="button" className="vd-dr-toggle" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {filing.error ? <div className="vd-dr-err" role="alert">{filing.error}</div> : null}
    </div>
  );
}

export function VaultTmfRemoveForm({ record, onDone, onCancel }: TmfActProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const filingId = record.filing?.id;
  if (!filingId) return null;
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await governedWrite('DELETE', `/api/etmf/artifacts/${encodeURIComponent(filingId)}`, { reason: reason.trim() }, REMOVE_WORDS);
      onDone({ tone: 'ok', text: `The filing of ${record.name} was removed from this study’s trial master file. Your reason is recorded with the removal. The document stays in the Vault.` });
    } catch (e) {
      // A refusal stays in the form; an outcome that is not known closes it and is said above the list.
      if (e instanceof TmfWriteError && !e.unknown) setError(e.message);
      else onDone({ tone: 'error', text: REMOVE_WORDS.unknown });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vd-confirm-form" data-testid={`vault-tmf-remove-${record.code}`}>
      <ReasonField id={reasonId} label={`Reason for removing the filing of ${record.name}. The document stays in the Vault; the reason is recorded in the audit trail.`}
        value={reason} onChange={setReason} disabled={busy} />
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={busy || reason.trim().length < GOVERNED_REASON_MIN} onClick={() => void remove()}>
          {busy ? 'Removing…' : 'Remove the filing'}
        </button>
        <button type="button" className="vd-dr-toggle" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}
