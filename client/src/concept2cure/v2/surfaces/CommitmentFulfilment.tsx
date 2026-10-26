/**
 * Meetings & commitments: recording what met a commitment (rows D2 and D5,
 * 2026-10-19; decision P-41).
 *
 * Recording a PMR, PMC or REMS as fulfilled is a Part 11 signed act that names
 * the dispatched sequence the agency received, the Vault version that met it,
 * or both, on a date the signer is shown in the signature dialog. A meeting
 * commitment or other is recorded with a reason, and may name what met it.
 * Every rule is the server's (server/routes/commitment-fulfil-route.ts): this
 * dialog reads the options the server offers, shows the server's reasons a
 * person cannot write or sign before anything is typed, and says what the
 * server refused. The row it is opened from is CommitmentRow.tsx.
 *
 * Replaces the C2CForm "Record a commitment as fulfilled" drawer that
 * CommunicationCenter.tsx carried until this change (a date and a reason,
 * unsigned, naming nothing).
 *
 * Reviewed 2026-10-19 (docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/
 * README.md, "Review"): the dialog and the signature show the Vault version's
 * project and sha256; on a project's door the Vault is searched only once the
 * project's program is known; an options read the server refused says the
 * server's sentence and offers nothing; an outcome that could not be
 * confirmed is never reported as stored or as not stored; focus returns to
 * where it was.
 */
import React from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { registerCeremonyOpen } from '../ceremony';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { dispatchWords, typeName, type CommitmentRow, type FulfilmentRuleView } from './CommitmentRow';
import { VaultVersionPicker, shortSha256, type PickedVaultVersion } from './VaultLibraryResults';

/** Today on the person's own calendar: the date the dialog offers and the signature binds. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Only ApiRequestError has been through the envelope reduction and is safe to show. */
function said(e: ApiRequestError): string {
  return e.message || 'the server refused it';
}

/** A refusal the server returned, as one sentence that ends by saying nothing was stored. */
export function refusalSentence(message: string): string {
  const m = message.trim();
  if (/Nothing was/.test(m)) return `Not recorded as fulfilled: ${m}`;
  return `Not recorded as fulfilled: ${m.replace(/[.\s]+$/, '')}. Nothing was stored.`;
}

/** What a 401 means here when the server gave no sentence of its own. */
const SESSION_ENDED = 'your session has ended. Sign in again';
/** No answer, or one that does not confirm it: the record may or may not have been written. */
const UNCONFIRMED_SIGN = 'Whether the fulfilment was recorded could not be confirmed. Reload before signing again.';
const UNCONFIRMED_RECORD = 'Whether the fulfilment was recorded could not be confirmed. The register was reloaded: check this commitment before recording it again.';

/* ── The fulfil dialog ───────────────────────────────────────────────────── */

interface SequenceOption {
  id: number;
  sequenceNumber: string;
  region: string;
  type: string;
  dispatchStatus: string;
  submission: { id: number; title: string | null; applicationType: string | null };
}
/** The submission an organisation commitment was made under (its sequences are the only ones offered). */
type CommitmentSubmission = { readable: true; id: number; title: string | null } | { readable: false };
interface FulfilmentOptions {
  commitment: { id: number; commitmentType: string; status: string; submission?: CommitmentSubmission | null };
  rule: FulfilmentRuleView & { meanings: string[] };
  projectLinked: boolean;
  sequences: SequenceOption[];
  sequencesTruncated: boolean;
  vault: { programId: string | null };
  viewer: { canWrite: boolean; writeRefusal: string | null; canSign: boolean; signAuthorityRefusal: string | null };
}
const isFulfilmentOptions: ShapeGuard<FulfilmentOptions> = (v): v is FulfilmentOptions => {
  if (!v || typeof v !== 'object') return false;
  const o = v as FulfilmentOptions;
  return !!o.rule && typeof o.rule.signatureRequired === 'boolean' && typeof o.projectLinked === 'boolean' &&
    Array.isArray(o.sequences) && o.sequences.every((s) => typeof s?.id === 'number' && typeof s.sequenceNumber === 'string' && !!s.submission) &&
    !!o.vault && !!o.viewer && typeof o.viewer.canWrite === 'boolean';
};

/** §11.50: recording a fulfilment means approval, or that the signer answers for it (DECISION_ACT_MEANINGS). */
const FULFILMENT_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'responsibility'];

type Viewer = FulfilmentOptions['viewer'];

/** Why this person cannot record this fulfilment, from the server's own checks, or null. */
function viewerRefusalOf(viewer: Viewer | null, signed: boolean): string | null {
  if (!viewer) return null;
  if (viewer.writeRefusal) return viewer.writeRefusal;
  if (signed && !viewer.canSign) return viewer.signAuthorityRefusal ?? 'You cannot sign this fulfilment.';
  return null;
}

/** A Vault version as the dialog and the signature name it: title, version, its project when the search named one, and its sha256. */
export function versionWords(picked: PickedVaultVersion): string {
  const where = picked.programName ? ` in ${picked.programName}` : '';
  const pin = picked.contentHash ? `, sha256 ${shortSha256(picked.contentHash)}` : ', no sha256 recorded';
  return `${picked.title} v${picked.version ?? '?'}${picked.current ? '' : ' (an earlier version)'}${where}${pin}`;
}

/** What the signature will bind, in words, for the signature dialog. */
function metByWords(sequence: SequenceOption | null, picked: PickedVaultVersion | null): string {
  return [
    sequence
      ? `sequence ${sequence.sequenceNumber}${sequence.submission.title ? ` of ${sequence.submission.title}` : ''}, ${dispatchWords(sequence.dispatchStatus)}`
      : null,
    picked ? `Vault version ${versionWords(picked)}` : null,
  ].filter(Boolean).join('; ');
}

/** Why the list is empty, in the terms the server built it in. */
function noSequenceWords(door: 'org' | 'project', submission: CommitmentSubmission | null | undefined): string {
  if (door === 'project') return 'No sequence the agency received is on file for this project.';
  if (submission && !submission.readable) {
    return 'This commitment was made under a submission in a project you cannot open, so none of its sequences is offered.';
  }
  if (submission?.readable) {
    return `No sequence the agency received is on file for ${submission.title ?? `submission ${submission.id}`}, the submission this commitment was made under.`;
  }
  return 'No sequence the agency received is on file for the submissions you can open.';
}

/** The sequences the server offers, or why there are none. An error is never shown as an empty list. */
function SequenceChoice({
  options, door, uid, value, onChange,
}: {
  options: { loading: boolean; error?: string; data: FulfilmentOptions | null };
  door: 'org' | 'project';
  uid: string;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const d = options.data;
  let body: React.ReactNode;
  if (options.loading) body = <p className="de-desc" role="status">Reading the submissions this commitment can name…</p>;
  else if (options.error || !d) body = <p className="de-desc" role="alert">The submissions could not be read. None are offered rather than an incomplete list.</p>;
  else if (!d.projectLinked) body = <p className="de-desc">This project has no linked regulatory record yet, so no sequence or Vault document of it can be named.</p>;
  else if (d.sequences.length === 0) {
    body = (
      <p className="de-desc">
        {noSequenceWords(door, d.commitment?.submission)} A sequence can be named once Submission Center records it as sent to or
        acknowledged by the agency.
      </p>
    );
  } else {
    body = (
      <>
        <label className="cf-seq-opt">
          <input type="radio" name={`${uid}-seq`} checked={value === null} onChange={() => onChange(null)} />
          None
        </label>
        {d.sequences.map((sq) => (
          <label key={sq.id} className="cf-seq-opt">
            <input type="radio" name={`${uid}-seq`} checked={value === sq.id} onChange={() => onChange(sq.id)} />
            Sequence {sq.sequenceNumber} · {sq.submission.title ?? `submission ${sq.submission.id}`} · {dispatchWords(sq.dispatchStatus)}
          </label>
        ))}
        {d.sequencesTruncated && <p className="de-desc">Only the 200 most recent are listed.</p>}
      </>
    );
  }
  return (
    <fieldset className="cf-seq">
      <legend className="de-label">The sequence that met it</legend>
      {body}
    </fieldset>
  );
}

/**
 * Where a Vault version may be searched for. On the organisation's door, any
 * program the person can open (the server's own rule there). On a project's
 * door, only the project's program, and only once the options read has named
 * it: until then, or if it could not be read, nothing is offered, because the
 * server would refuse any other program's version after the signature.
 */
type VaultScope = { kind: 'ready'; programId?: string } | { kind: 'waiting' | 'unavailable' | 'unlinked' };

function vaultScopeOf(door: 'org' | 'project', options: { loading: boolean; data: FulfilmentOptions | null }): VaultScope {
  if (door === 'org') return { kind: 'ready' };
  const programId = options.data?.vault.programId;
  if (typeof programId === 'string' && programId) return { kind: 'ready', programId };
  if (options.loading) return { kind: 'waiting' };
  return options.data && !options.data.projectLinked ? { kind: 'unlinked' } : { kind: 'unavailable' };
}

const VAULT_SCOPE_WORDS: Record<Exclude<VaultScope['kind'], 'ready'>, string> = {
  waiting: "Reading which Vault this project's documents are in…",
  unavailable: "This project's Vault could not be identified, so no document can be named. Close this and open it again to retry.",
  unlinked: 'This project has no linked regulatory record yet, so no Vault document of it can be named.',
};

/** The Vault version named, or the picker to name one. Focus follows the choice: to Remove once chosen, back to the search once removed. */
function VaultChoice({ picked, onPick, scope, disabled }: { picked: PickedVaultVersion | null; onPick: (v: PickedVaultVersion | null) => void; scope: VaultScope; disabled: boolean }) {
  const removeRef = React.useRef<HTMLButtonElement>(null);
  const [focusNext, setFocusNext] = React.useState<'remove' | 'search' | null>(null);
  React.useEffect(() => {
    if (focusNext === 'remove' && picked) removeRef.current?.focus();
  }, [focusNext, picked]);
  let body: React.ReactNode;
  if (picked) {
    body = (
      <div className="cf-picked">
        <span role="status">Chosen: {versionWords(picked)}</span>
        <button ref={removeRef} type="button" className="cc-btn sm" onClick={() => { setFocusNext('search'); onPick(null); }}>
          Remove
        </button>
      </div>
    );
  } else if (scope.kind !== 'ready') {
    body = <p className="de-desc" role={scope.kind === 'waiting' ? 'status' : undefined}>{VAULT_SCOPE_WORDS[scope.kind]}</p>;
  } else {
    body = (
      <VaultVersionPicker
        disabled={disabled}
        includeEarlier
        programId={scope.programId}
        label={scope.programId ? "Search this project's Vault" : 'Search your accessible Vaults'}
        autoFocus={focusNext === 'search'}
        onChoose={(v) => { setFocusNext('remove'); onPick(v); }}
      />
    );
  }
  return (
    <div className="de-field">
      <span className="de-label">The Vault document that met it</span>
      {body}
      {picked && !picked.contentHash && (
        <p className="de-err" role="alert">
          {picked.title} has no recorded sha256, so what it held cannot be pinned and it cannot be named. Remove it and choose another.
        </p>
      )}
    </div>
  );
}

interface FulfilDraft {
  date: string;
  reason: string;
  sequence: SequenceOption | null;
  evidence: { sequenceId?: number; vaultDocumentId?: string };
}

/**
 * Sending the fulfilment: through the signature dialog for a signed type
 * (`sign`, its onSign), or as a governed write with a reason (`record`). A
 * fulfilment is reported recorded only when the server confirms it; a refusal
 * the server returned says nothing was stored; anything else (no answer, an
 * answer that confirms nothing) says the outcome could not be confirmed and
 * reloads the register, because the record may have been written.
 */
function useFulfilSend(base: string, fire: (message: string, tone?: 'ok' | 'error') => void, onDone: () => void) {
  const [busy, setBusy] = React.useState(false);
  /** The server confirmed the signed fulfilment. */
  const recorded = React.useRef(false);
  /** The signed fulfilment's outcome could not be confirmed. */
  const uncertain = React.useRef(false);
  const sign = (draft: FulfilDraft) => async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    let res: Response;
    try {
      res = await apiRequest('POST', `${base}/fulfill`, {
        ...(draft.date ? { fulfilledDate: draft.date } : {}),
        evidence: draft.evidence,
        reason: input.reason,
        meaning: input.meaning,
        password: input.password,
        ...(input.totp ? { mfaToken: input.totp } : {}),
      });
    } catch (e) {
      if (e instanceof ApiRequestError) throw new Error(refusalSentence(said(e)), { cause: e });
      uncertain.current = true;
      throw new Error(UNCONFIRMED_SIGN, { cause: e });
    }
    const body = (await res.json().catch(() => null)) as { signedAt?: string; data?: { status?: string } } | null;
    // apiRequest hands a 401 back rather than throwing: the server refused it.
    if (res.status === 401) throw new Error(refusalSentence(serverMessage(body) ?? SESSION_ENDED));
    if (!res.ok || body?.data?.status !== 'fulfilled' || !body.signedAt) {
      uncertain.current = true;
      throw new Error(UNCONFIRMED_SIGN);
    }
    recorded.current = true;
    return { meaning: input.meaning, reason: input.reason, signedAt: body.signedAt };
  };
  const record = async (draft: FulfilDraft) => {
    setBusy(true);
    try {
      const named = draft.evidence.sequenceId != null || draft.evidence.vaultDocumentId != null;
      let res: Response;
      try {
        // No date sent means today: the server records CURRENT_DATE for a type that is not signed.
        res = await apiRequest('POST', `${base}/fulfill`, {
          ...(draft.date ? { fulfilledDate: draft.date } : {}),
          reason: draft.reason.trim(),
          ...(named ? { evidence: draft.evidence } : {}),
        });
      } catch (e) {
        if (e instanceof ApiRequestError) {
          fire(refusalSentence(said(e)), 'error');
        } else {
          fire(UNCONFIRMED_RECORD, 'error');
          onDone();
        }
        return;
      }
      const body = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
      if (res.status === 401) {
        fire(refusalSentence(serverMessage(body) ?? SESSION_ENDED), 'error');
        return;
      }
      if (!res.ok || body?.data?.status !== 'fulfilled') {
        fire(UNCONFIRMED_RECORD, 'error');
        onDone();
        return;
      }
      fire(`Commitment recorded as fulfilled${draft.sequence ? `, naming sequence ${draft.sequence.sequenceNumber}` : ''}, with an audit entry.`);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return { busy, recorded, uncertain, sign, record };
}

/** Why the date cannot be sent, before it is: one that has not happened (the server refuses it too). */
function dateRefusalOf(date: string): string {
  return date && date > localToday() ? 'A commitment cannot be fulfilled on a date that has not happened yet.' : '';
}

/** What met it, as the send takes it. */
function evidenceOf(sequenceId: number | null, picked: PickedVaultVersion | null): FulfilDraft['evidence'] {
  return { ...(sequenceId != null ? { sequenceId } : {}), ...(picked ? { vaultDocumentId: picked.id } : {}) };
}

/**
 * What the person has named so far, and whether it can be sent: the server's
 * viewer refusal (shown before anything is typed), what the type's rule still
 * needs, and the draft the send takes. A version with no recorded sha256 and a
 * date that has not happened are refused here, as the server would.
 */
function useFulfilForm(options: FulfilmentOptions | null, rule: FulfilmentRuleView) {
  const [sequenceId, setSequenceId] = React.useState<number | null>(null);
  const [picked, setPicked] = React.useState<PickedVaultVersion | null>(null);
  const [date, setDate] = React.useState(localToday);
  const [reason, setReason] = React.useState('');
  const viewerRefusal = viewerRefusalOf(options?.viewer ?? null, rule.signatureRequired);
  const sequence = options?.sequences.find((sq) => sq.id === sequenceId) ?? null;
  const missing = rule.evidenceRequired && sequenceId == null && picked == null;
  const unpinnable = picked?.contentHash === null;
  const dateRefusal = dateRefusalOf(date);
  const dateMissing = rule.dateRequired && !date;
  const draft: FulfilDraft = { date, reason, sequence, evidence: evidenceOf(sequenceId, picked) };
  return {
    sequenceId, setSequenceId, picked, setPicked, date, setDate, reason, setReason,
    sequence, missing, viewerRefusal, dateRefusal, draft,
    ready: !viewerRefusal && !missing && !unpinnable && !dateRefusal && !dateMissing,
  };
}

/** The commitment's own routes on its door. */
function fulfilBase(door: 'org' | 'project', projectId: string | null, id: number): string {
  return door === 'project' && projectId
    ? `/api/concept2cure/projects/${encodeURIComponent(projectId)}/commitments/${id}`
    : `/api/ha-interactions/commitments/${id}`;
}

/** The date, the reason (unsigned types only), what is still missing, and what recording it means. */
function FulfilFields({
  uid, signed, name, date, onDate, dateRefusal, reason, onReason, missing, err,
}: {
  uid: string; signed: boolean; name: string; date: string; onDate: (v: string) => void; dateRefusal: string;
  reason: string; onReason: (v: string) => void; missing: boolean; err: string;
}) {
  return (
    <>
      <div className="de-field">
        <label className="de-label" htmlFor={`${uid}-date`}>Date fulfilled</label>
        <input
          id={`${uid}-date`} className="de-input" type="date" max={localToday()} value={date} onChange={(e) => onDate(e.target.value)}
          aria-describedby={`${uid}-date-d`} aria-invalid={dateRefusal ? true : undefined}
        />
        <p className="de-desc" id={`${uid}-date-d`}>
          {signed ? 'Your signature binds this date, so it is required.' : 'Leave it empty to record today.'}
        </p>
        {dateRefusal && <p className="de-err" role="alert">{dateRefusal}</p>}
      </div>
      {!signed && (
        <div className="de-field">
          <label className="de-label" htmlFor={`${uid}-reason`}>Reason, and how it was met</label>
          <textarea id={`${uid}-reason`} className="de-textarea" rows={3} value={reason} onChange={(e) => onReason(e.target.value)} />
        </div>
      )}
      {missing && <p className="de-desc">Name the sequence or the document that met this {name}.</p>}
      <div className="de-gov">
        <span className="ico">{I.lock}</span>
        <span className="de-gov-t">
          {signed
            ? `Recording a ${name} as fulfilled is an electronic signature (21 CFR Part 11). Your signature binds this commitment, its date and what met it.`
            : 'Recorded with your reason in the audit trail. A fulfilment date cannot be in the future.'}
        </span>
      </div>
      {err && <div className="de-err" role="alert">{err}</div>}
    </>
  );
}

/** The one Part 11 dialog, saying exactly what the signature binds. */
function FulfilSignature({
  name, description, date, metBy, onClose, onSign,
}: {
  name: string; description: string; date: string; metBy: string; onClose: () => void;
  onSign: (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }) => Promise<EsigSignedManifest>;
}) {
  const authUser = useAuthUser();
  return (
    <EsignModal
      open
      action={`Record ${name} as fulfilled`}
      target={`${name}: ${description}`}
      targetMeta={`Your signature binds this commitment, the date and what met it: fulfilled on ${date}${metBy ? `; ${metBy}` : ''}.`}
      meanings={FULFILMENT_MEANINGS}
      defaultMeaning="responsibility"
      signer={esignSignerOf(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={onSign}
    />
  );
}

/**
 * The dialog's focus, around the nested signature dialog: useDialog's (trap,
 * Escape), then, declared after it so each runs after its handling, focus
 * stays on Sign while the signature dialog opens (not on the row behind both),
 * returns to Sign when it closes, and to the opener when this dialog closes.
 * The opener (the row's "Record fulfilment") is taken once: useDialog re-reads
 * it each time the signature dialog hands focus back, by when it may be on
 * nothing.
 */
function useFulfilFocus(onClose: () => void, signing: boolean) {
  const [opener] = React.useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  const panelRef = useDialog(onClose, !signing);
  const signRef = React.useRef<HTMLButtonElement>(null);
  const wasSigning = React.useRef(false);
  React.useEffect(() => {
    if (signing) wasSigning.current = true;
    else if (!wasSigning.current) return;
    else wasSigning.current = false;
    signRef.current?.focus();
  }, [signing]);
  React.useEffect(() => () => {
    if (opener?.isConnected) opener.focus();
  }, [opener]);
  return { panelRef, signRef };
}

export function CommitmentFulfilDialog({
  row, door, projectId, onClose, onDone, fire,
}: {
  row: CommitmentRow;
  door: 'org' | 'project';
  projectId: string | null;
  onClose: () => void;
  /** The register changed: reload it. */
  onDone: () => void;
  fire: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const base = fulfilBase(door, projectId, row.id);
  const options = useLiveData<FulfilmentOptions>(`${base}/fulfilment-options`, [base], isFulfilmentOptions);
  const rule: FulfilmentRuleView = options.data?.rule ?? row.fulfilment.rule;
  const signed = rule.signatureRequired;
  const name = typeName(row.commitment_type);
  const send = useFulfilSend(base, fire, onDone);

  const form = useFulfilForm(options.data, rule);
  const [err, setErr] = React.useState('');
  const [signing, setSigning] = React.useState(false);
  const { panelRef, signRef } = useFulfilFocus(onClose, signing);
  React.useEffect(() => registerCeremonyOpen(), []);
  const uid = React.useId();
  // The server refused the commitment itself (gone, already fulfilled, not
  // this person's to see): its sentence, and nothing offered.
  const optionsRefusal = !options.loading && options.error && [403, 404, 409].includes(options.status ?? 0) ? options.error : null;
  const vaultScope = vaultScopeOf(door, options);
  const canSubmit = !send.busy && form.ready && !optionsRefusal;
  const submit = () => {
    setErr('');
    if (signed) return setSigning(true);
    if (form.reason.trim().length < GOVERNED_REASON_MIN) return setErr(`Give a reason of at least ${GOVERNED_REASON_MIN} characters, saying how it was met.`);
    void send.record(form.draft);
  };

  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget && !signing) onClose(); }}>
      <div className="de" role="dialog" aria-modal="true" aria-label="Record a commitment as fulfilled" tabIndex={-1} ref={panelRef}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Meetings & commitments</div>
            <div className="de-h-t">Record a commitment as fulfilled</div>
            <div className="de-h-s">{name}: {row.description}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </div>
        <div className="de-body">
          {optionsRefusal ? (
            <>
              <p className="de-err" role="alert">{optionsRefusal}</p>
              <p className="de-desc">Nothing can be recorded here. Close this and reload Meetings & commitments to see the commitment as it stands.</p>
            </>
          ) : (
            <>
              {form.viewerRefusal && <p className="de-err" role="alert">{form.viewerRefusal}</p>}
              <SequenceChoice options={options} door={door} uid={uid} value={form.sequenceId} onChange={form.setSequenceId} />
              <VaultChoice picked={form.picked} onPick={form.setPicked} scope={vaultScope} disabled={send.busy} />
              <FulfilFields
                uid={uid} signed={signed} name={name} date={form.date} onDate={form.setDate} dateRefusal={form.dateRefusal}
                reason={form.reason} onReason={form.setReason} missing={form.missing} err={err}
              />
            </>
          )}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button ref={signRef} className="de-btn primary" onClick={submit} disabled={!canSubmit}>
            {I.lock} {signed ? 'Sign fulfilment' : 'Record as fulfilled'}
          </button>
        </div>
      </div>
      {signing && (
        <FulfilSignature
          name={name}
          description={row.description}
          date={form.date}
          metBy={metByWords(form.sequence, form.picked)}
          onClose={() => {
            setSigning(false);
            if (send.recorded.current) onDone();
            else if (send.uncertain.current) {
              fire(UNCONFIRMED_RECORD, 'error');
              onDone();
            }
          }}
          onSign={send.sign(form.draft)}
        />
      )}
    </div>
  );
}
