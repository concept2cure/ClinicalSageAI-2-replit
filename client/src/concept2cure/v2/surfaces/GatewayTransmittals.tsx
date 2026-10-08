/**
 * Submission Gateway Transmittals — the "file to the agency" surface.
 *
 * Registry id: `gateway-transmittals`.
 *
 * Wired to the real multi-region dispatch layer
 * (server/routes/mdx-submission-gateway.ts, mounted /api/mdx, org-scoped from
 * the JWT; envelope {data, meta}):
 *   • GET  /gateways?environment=            — the region gateways + whether
 *                                              credentials are configured
 *   • GET  /gateways/transmittals            — the org's transmittal log
 *   • POST /gateways/:region/:gateway/transmit — governed transmit (reason ≥8
 *          + §11 re-auth password/TOTP, verified server-side; 409 = an active
 *          transmittal already holds the lock)
 *   • GET  /gateways/transmittals/:id/status — poll the gateway
 *   • GET  /gateways/transmittals/:id/ack    — download the ACK (binary)
 *   • POST /gateways/transmittals/:id/rollback — governed rollback (reason ≥8)
 *   • POST /gateways/transmittals/:id/technical-rejection — the agency did not
 *          load the sequence this transmittal filed: a governed sign (reason,
 *          §11.50 meaning, re-auth) carrying the agency's notice as a Vault
 *          document; the one act that takes a sequence off the filed history
 *

 * HONESTY: gateways and the transmittal log render live data or honest
 * empty/error states. Transmit/rollback are real awaited writes gated by the
 * server's re-auth; a 401 (re-auth failed), 412 (credentials not configured),
 * 422 (structural gate), and the 409 active-transmittal lock are each surfaced
 * with the server's own reason.
 *
 * The ACK download states WHO WROTE THE BYTES. Only an FDA AS2 MDN is an agency
 * artefact; for every other gateway the platform composes a record from its own
 * transmittal row, and this surface used to hand that file over with the words
 * "the agency's actual bytes" — enough for a sponsor to archive a document
 * Concept2Cure wrote as proof an agency received a submission. The server sends
 * provenance on X-Ack-Provenance and names the file accordingly; the toast below
 * says which one arrived.
 *
 * Rollback is likewise scoped honestly: it records a rollback in THIS platform's
 * audit trail and frees the transmit lock. It does not retract anything at the
 * agency, and the copy no longer implies that it does.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { assessmentState, hasAnswer, type AssessmentState } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormField } from '../C2CForm';
import { apiRequest, ApiRequestError, serverMessage, redactInternals } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';
import { gatewayLabel, transmittalStatusTone as statusTone } from '../gatewayLabels';

interface GatewayInfo { region?: string; gateway?: string; name?: string; configured?: boolean; environment?: string; [k: string]: unknown; }
interface Transmittal {
  // region/status are declared nullable because the log genuinely serves rows
  // that have them null — a narrowed SELECT, or a row written before its gateway
  // replied. The render guards below exist for those rows, not for a bad envelope.
  id: number; region?: string | null; gateway?: string | null; format?: string | null; submission_type?: string | null;
  transmission_id?: string | null; status?: string | null; error_class?: string | null; error_message?: string | null;
  submitted_at?: string | null; ack_received_at?: string | null; completed_at?: string | null;
  submitted_by?: number | null; submitted_by_name?: string | null;
  /** The submission package the transmittal sent; null for a non-package send. */
  package_id?: number | null;
  /** 2026-09-28 (Q-0928-3): `signature` is stamped by the governed transmit in the
   *  same transaction as the electronic signature; absent on rows transmitted
   *  before that, or whose signature transaction was lost. `technicalRejection`
   *  is written by the governed technical-rejection action (sweep F19). */
  metadata?: {
    signature?: { meaning?: string | null; signatureId?: number | null } | null;
    technicalRejection?: { sequence?: string | null; recordedAt?: string | null } | null;
    /** 2026-10-01 (D7): whose account the transmit went out under, stamped by the
     *  guarded transmit. Absent on rows transmitted before the choice existed. */
    gatewayAccount?: { mode?: string | null; senderIdentifier?: string | null } | null;
    [k: string]: unknown;
  } | null;
}

/** Whose account a transmittal went out under, as recorded on it; nothing when it was not recorded. */
export function accountLine(t: Pick<Transmittal, 'metadata'>): string | null {
  const a = t.metadata?.gatewayAccount;
  if (a?.mode === 'platform') return 'via the platform account';
  if (a?.mode === 'client') return a.senderIdentifier ? `via your account (${a.senderIdentifier})` : 'via your account';
  return null;
}

interface RefusalFinding { ruleId?: string; severity?: string; message?: string }
const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
/** Findings list, errors first; tolerant of a partial shape. */
function sortFindings(list: unknown): RefusalFinding[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((f: unknown): f is RefusalFinding => !!f && typeof f === 'object')
    .slice()
    .sort((a: RefusalFinding, b: RefusalFinding) => (SEVERITY_RANK[a.severity ?? ''] ?? 3) - (SEVERITY_RANK[b.severity ?? ''] ?? 3));
}
/** Findings from a transmit 422 body (details.findings). */
function refusalFindings(raw: any): RefusalFinding[] {
  return sortFindings(raw?.details?.findings);
}
const IDENTIFIERS_RULE = 'REGULATORY-IDENTIFIER-MISSING';

/** A row of GET /api/submission-ops/packages, as the picker needs it. */
interface PackageOption { id: number; packageId?: string; title?: string; status?: string; packageFamily?: string }

/**
 * The package picker shared by the transmit, assemble and identifier forms so
 * an operator works with ONE package across the loop. The org's packages are
 * offered by title and status (the numeric id is the value the routes take);
 * when the list could not be loaded the field falls back to the numeric id and
 * says so — never an empty picker presented as "no packages".
 */
const PACKAGE_FIELD = (def: string | undefined, packages: PackageOption[] | null): C2CFormField =>
  packages && packages.length > 0
    ? {
        key: 'packageId', label: 'Package', type: 'select', required: true, half: true, default: def,
        options: packages.map((p) => ({
          value: String(p.id),
          label: `#${p.id} · ${p.title ?? p.packageId ?? 'untitled'} · ${p.status ?? 'status unknown'}`,
        })),
        desc: 'Only a locked package can be assembled and transmitted.',
      }
    : {
        key: 'packageId', label: 'Package id', type: 'number', required: true, half: true, default: def,
        desc: packages === null
          ? 'The package list could not be loaded; enter the numeric package id.'
          : 'No submission packages yet; enter the numeric package id.',
      };
const IDENTIFIERS_FORM = (def: string | undefined, packages: PackageOption[] | null): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · governed change',
  title: 'Record regulatory identifiers',
  sub: 'The agency application number, applicant identity and regulatory contact the Module 1 backbone carries. Recorded on the package with your reason. A bundle assembled under different identifiers is cleared and must be assembled again.',
  // The default banner asserts an audit entry will be written; this route
  // documents the case where it cannot be, so say what actually happens.
  governed: 'Governed change — your reason is recorded with it in the audit trail. If the ledger entry cannot be written, the change is still applied and the response says so.',
  submitLabel: 'Record',
  fields: [
    PACKAGE_FIELD(def, packages),
    /* FDA's own forms (sweep F05, F07b, 2026-10-01): the example was
       'e.g. IND123456', which taught operators to record what FDA refuses; the
       server now refuses it for an FDA eCTD package and never rewrites it. */
    { key: 'applicationNumber', label: 'Application number', type: 'text', required: true, half: true, placeholder: 'e.g. 123456', desc: 'FDA eCTD (IND, NDA, ANDA, BLA, DMF): the six digits FDA assigned, leading zeros kept, no prefix. 510(k) / eSTAR: the K-number.' },
    { key: 'applicantId', label: 'Applicant id', type: 'text', required: true, half: true, placeholder: 'e.g. 123456789', desc: 'FDA: the company’s D-U-N-S number, nine digits with no dashes.' },
    { key: 'applicantName', label: 'Applicant name', type: 'text', required: true },
    { key: 'contactName', label: 'Regulatory contact', type: 'text', half: true, desc: 'Named in FDA’s Module 1 backbone; an FDA eCTD package needs the name, telephone and e-mail.' },
    { key: 'contactPhone', label: 'Contact telephone', type: 'text', half: true, placeholder: 'e.g. +1 301 555 0100' },
    { key: 'contactEmail', label: 'Contact e-mail', type: 'text', half: true },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the change.' },
  ],
});
const ASSEMBLE_FORM = (def: string | undefined, packages: PackageOption[] | null): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · governed transition',
  title: 'Assemble bundle',
  sub: 'Builds the eCTD bundle for a locked package through the canonical packager and records the structural findings on it. Transmit refuses a bundle that carries error-severity findings.',
  governed: 'Governed transition — your reason is recorded with the assembly. Assembly does not re-authenticate you; transmit does. If the ledger entry cannot be written, the bundle is still built and the response says so.',
  submitLabel: 'Assemble',
  fields: [
    PACKAGE_FIELD(def, packages),
    { key: 'region', label: 'Region', type: 'select', options: ['FDA', 'EMA', 'PMDA', 'CA'], default: 'FDA', half: true },
    { key: 'sequence', label: 'Sequence', type: 'text', default: '0000', half: true, placeholder: '0000', desc: 'Four digits. 0000 is the original filing.' },
    {
      key: 'submissionType', label: 'Submission type', type: 'text', half: true, placeholder: 'e.g. Original Application',
      // "amendment" is the word that comes to mind and the one FDA has no
      // submission-type code for: on FDA it is a SUB-type (below). The full
      // list travels with the refusal rather than being restated here.
      desc: 'Required for any sequence after 0000: only the original is an original by definition. FDA matches a term from its fixed list exactly — an IND amendment is an Original Application; supplements are for an approved NDA or BLA. Other regions take their own term. A term that cannot be filed is refused with the list.',
    },
    /* FDA's sub-type and submission-id (sweep F04, 2026-10-01): without them
       every follow-up was declared the Original of a new regulatory activity. */
    {
      key: 'submissionSubType', label: 'Sub-type (FDA)', type: 'text', half: true, placeholder: 'e.g. Amendment',
      desc: 'What this sequence is within its regulatory activity: Original, Amendment, Resubmission, Report, Correspondence… Required for an FDA sequence after 0000.',
    },
    {
      key: 'submissionId', label: 'Activity it continues (FDA)', type: 'text', half: true, placeholder: 'e.g. 0000',
      desc: 'The first sequence of the regulatory activity this one belongs to — 0000 for an amendment to the original IND. Leave empty for a sequence that opens its own.',
    },
    {
      key: 'withdraw', label: 'Withdraw from the application', type: 'textarea',
      placeholder: '2.5/clinical-overview.pdf',
      // Withdrawal is explicit and can only be: a document simply left out of a
      // sequence stays on file, because inferring withdrawal from absence would
      // delete a dossier the first time somebody filed a two-document amendment.
      desc: 'Optional. One document per line as section/filename, exactly as the filed sequence recorded it — this withdraws it from the application at the agency. Leaving a document out of a sequence does not withdraw it; it stays on file unchanged.',
    },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the assembly.' },
  ],
});

/** `section/filename` per line → the withdrawal list the assemble route takes.
 *  A CTD section carries dots, never a slash, so the first slash separates. */
export function parseWithdrawals(raw: string | undefined): Array<{ ctdSection: string; fileName: string }> {
  return (raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const cut = line.indexOf('/');
      return cut > 0
        ? { ctdSection: line.slice(0, cut).trim(), fileName: line.slice(cut + 1).trim() }
        : { ctdSection: '', fileName: line };
    })
    .filter((w) => w.ctdSection && w.fileName);
}

/* Gateway names: gatewayLabels.ts (one map, shared with the Submission Center). */

/* The transmit form's options carry the route's keys as values and a name as
   the label — it offered the raw keys ("pmda_gateway") and lowercase region
   slugs ("fda") as the choices themselves. */
const REGIONS = ['fda', 'ema', 'pmda', 'ca'].map((value) => ({ value, label: value.toUpperCase() }));
const GATEWAYS = ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg'].map((value) => ({ value, label: gatewayLabel(value) }));

async function readData<T = any>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; raw: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, raw: parsed };
  } catch (err) {
    // 2026-09-28 (M-0928-1): apiRequest THROWS ApiRequestError on every non-2xx
    // but 401, carrying the status and the parsed error body. A bare catch
    // flattened that to status 0 / raw null, so every refusal branch below
    // (transmit 409/412/422, identifiers 400/404, assemble 404/409/400) was dead
    // and each refusal read "HTTP 0". Only a failure with no response (network,
    // abort) is status 0 now.
    if (err instanceof ApiRequestError) {
      return { ok: false, status: err.status, data: null, raw: err.payload ?? null };
    }
    return { ok: false, status: 0, data: null, raw: null };
  }
}
const TRANSMIT_FORM = (def: string | undefined, packages: PackageOption[] | null): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · §11 re-authentication',
  title: 'Transmit to agency gateway',
  sub: 'The transmit is gated server-side: your credentials are re-verified, the structural gate runs, and the transmittal is recorded before transport.',
  governed: true, submitLabel: 'Transmit',
  fields: [
    { key: 'region', label: 'Region', type: 'select', options: REGIONS, default: 'fda', half: true },
    { key: 'gateway', label: 'Gateway', type: 'select', options: GATEWAYS, default: 'esg', half: true },
    PACKAGE_FIELD(def, packages),
    { key: 'submissionType', label: 'Submission type', type: 'text', half: true, placeholder: 'e.g. original' },
    { key: 'reason', label: 'Reason for transmission (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the transmittal.' },
    // §11.50: what the signer asserts by transmitting. Recorded on the electronic signature.
    { key: 'meaning', label: 'Signature meaning', type: 'select', required: true, default: 'release', options: [
      { value: 'release', label: 'Release — I authorize submission to the agency' },
      { value: 'approval', label: 'Approval — I approve this package for submission' },
      { value: 'responsibility', label: 'Responsibility — I take responsibility for this package' },
      { value: 'review', label: 'Review — I reviewed this package' },
      // No "Authorship": transmitting is a release, and the server refuses a
      // transmission signed as author (assertTransmitterIndependent). Offering
      // it would only lead to a refusal after the password was typed.
    ] },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code (if enabled)', type: 'text', half: true },
  ],
});
const ROLLBACK_FORM = (id: number): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch',
  title: `Roll back transmittal #${id}`,
  sub: 'Records the rollback in this platform’s Part 11 audit trail and frees the transmit lock. '
     + 'It does NOT retract the submission at the agency — the agency still holds the transmitted '
     + 'bytes, and you must file the agency-side retraction directly (FDA: WebTrader).',
  governed: true, submitLabel: 'Roll back',
  fields: [
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code', type: 'text', half: true },
  ],
});
/* The agency did not load a filed sequence (a technical rejection — for FDA, a
   failed Ack3). Recording it is the one act that takes the sequence off the
   package's filed history, so its number can be used again. It is not a
   rollback: a rolled-back sequence stays on file, because the agency still holds
   it. The evidence is the agency's notice, uploaded to the Vault first; the
   signature is bound to that document's content hash (sweep F19). */
const TECHNICAL_REJECTION_FORM = (id: number): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · §11 re-authentication',
  title: `Record the agency’s technical rejection of transmittal #${id}`,
  sub: 'Only for a sequence the agency did not load (for FDA, a failed Ack3). Recording it takes the sequence off this '
     + 'package’s filed history, and the next assembly reuses its number. This is not a rollback: a rolled-back sequence '
     + 'stays on file, because the agency still holds it. Only the latest sequence on file qualifies, and a transmittal '
     + 'the agency accepted is refused.',
  governed: 'Governed signature — your reason, the declared meaning and the agency’s notice are recorded together, and '
     + 'the signature is bound to the notice. If any part cannot be written, nothing changes.',
  submitLabel: 'Record rejection',
  fields: [
    {
      key: 'evidenceDocumentId', label: 'Agency notice (Vault document id)', type: 'text', required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      desc: 'Upload the agency’s rejection notice to the Vault first, then enter that document’s id.',
    },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — for example, what the notice says the agency could not load.' },
    // §11.50: what the signer asserts by recording the rejection.
    { key: 'meaning', label: 'Signature meaning', type: 'select', required: true, default: 'responsibility', options: [
      { value: 'responsibility', label: 'Responsibility — I take responsibility for this record' },
      { value: 'review', label: 'Review — I reviewed the agency’s notice' },
      { value: 'approval', label: 'Approval — I approve this record' },
      { value: 'authorship', label: 'Authorship — I authored this record' },
    ] },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code (if enabled)', type: 'text', half: true },
  ],
});

/** Only a package's transmittal files a sequence, and a rejection is recorded once. */
const canRecordRejection = (t: Transmittal): boolean => t.package_id != null && !t.metadata?.technicalRejection;
/** The line under a transmittal's status once its technical rejection is recorded (sweep F19). */
function technicalRejectionNote(t: Transmittal): React.ReactNode {
  const recorded = t.metadata?.technicalRejection;
  if (!recorded) return null;
  return (
    <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>
      technical rejection recorded{recorded.sequence ? ` · sequence ${recorded.sequence} off file` : ''}
    </div>
  );
}

/** A refused governed act in the server's own words; when it gave none, only
 *  what is known — a request that never completed may still have landed. */
function refusalReason(raw: unknown, status: number): string {
  return serverMessage(raw)
    ?? (status === 0
      ? 'the request did not complete; reload the transmittal log to see whether it was recorded.'
      : `the server gave no reason (HTTP ${status}); nothing changed.`);
}

/** What the technical-rejection route answers with, as the confirmation needs it. */
interface RejectionRecorded {
  sequence?: string;
  transmittalStatus?: { previous?: string; current?: string } | null;
  staleBundleCleared?: { sequence?: string } | null;
}
/** The confirmation of a recorded technical rejection, from what the server recorded. */
function rejectionRecordedMessage(id: number, r: RejectionRecorded, signer: string | null, meaning: string): string {
  const signed = ` Signed by ${signer ?? 'you'} — meaning: ${meaning}.`;
  if (!r.sequence) return `Recorded: the agency’s technical rejection of transmittal #${id}.${signed}`;
  const status = r.transmittalStatus;
  const moved = status?.current && status.current !== status.previous ? ` Transmittal #${id} is now ${status.current}.` : '';
  const cleared = r.staleBundleCleared?.sequence
    ? ` The stored bundle for sequence ${r.staleBundleCleared.sequence} was built on it and was cleared; assemble it again.`
    : '';
  return `Recorded: the agency did not load sequence ${r.sequence} (transmittal #${id}). It is off the filed history, `
    + `and the next assembly reuses sequence ${r.sequence}.${moved}${cleared}${signed}`;
}

/**
 * The toast for a transmit 409. Two refusals answer 409 and are told apart by
 * the code in `details`: a sequence already on file as another bundle is not
 * the active-transmittal lock, and its remedy is not a rollback — a rollback
 * does not un-file (sweep F19) — so that one is said in the server's own words.
 * The error envelope is { error, details }: the lock holder's id and status
 * travel in details (they were read from a `data` key that an error response
 * never carries, so the toast always said "#?" / "in flight").
 */
function transmitConflictMessage(raw: any): string {
  const held = raw?.details ?? raw?.data ?? raw;
  if (held?.code === 'SEQUENCE_ALREADY_FILED') {
    return 'Not transmitted — ' + (serverMessage(raw)
      ?? `${held.sequence ? `sequence ${held.sequence}` : 'this sequence'} is already on file as a different bundle.`);
  }
  return `Not transmitted — transmittal #${held?.transmittalId ?? '?'} is already active (${held?.status ?? 'in flight'}). Roll it back first.`;
}

export function GatewayTransmittals({ onAsk }: SurfaceViewProps) {
  /* AnA on this surface. It discarded SurfaceViewProps entirely as `_props`, on
     the last screen before bytes leave for an agency — the point at which an
     unconfigured gateway or an unacknowledged transmittal most needs
     explaining. */
  const ask = onAsk;
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  /* The org's submission packages for the picker; null = the list could not be
     loaded (the forms then fall back to the numeric id and say so). */
  const [packages, setPackages] = useState<PackageOption[] | null>(null);
  const [rows, setRows] = useState<Transmittal[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<'transmit' | 'identifiers' | 'assemble' | { rollback: number } | { rejection: number } | null>(null);
  /* The package id of the operator's last action, so the next form is prefilled
     with it — the record → assemble → transmit loop is worked on one package. */
  const [lastPackageId, setLastPackageId] = useState<string>('');
  const [statusView, setStatusView] = useState<{ id: number; body: Record<string, unknown> } | null>(null);
  /* A 422 from the structural gate carries the findings recorded on the stored
     bundle at assembly (details.findings). The toast used to show only the
     summary line ("N errors; re-assemble after fixing"), so the operator never
     saw WHICH rule refused — e.g. the finding that names the regulatory
     identifiers still to be recorded. The findings are rendered in a card so
     the refusal is actionable; it clears on the next attempt or a success. */
  /* `findingsState` is the four-state judgment of the findings read — set where the
     findings were obtained, from positive evidence that the gate or the preflight
     ran, never derived from the list being empty. */
  const [refusal, setRefusal] = useState<{ source: 'transmit' | 'assemble'; message: string; findings: RefusalFinding[]; findingsState: AssessmentState; fetchFailure?: string; notSaved?: string } | null>(null);
  const [toast, fireToast] = useToast();
  /* The signer named in the transmit confirmation — the authenticated user,
     resolved the way SubmissionCenter resolves it. */
  const authUser = useAuthUser();
  const signerName = authUser
    ? (authUser.displayName || `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() || authUser.email || null)
    : null;

  const load = useCallback(async () => {
    setState('loading');
    const [g, t, p] = await Promise.all([
      readData<GatewayInfo[]>('GET', '/api/mdx/gateways'),
      readData<Transmittal[]>('GET', '/api/mdx/gateways/transmittals'),
      readData<PackageOption[]>('GET', '/api/submission-ops/packages'),
    ]);
    // The package list feeds the picker only; its failure must not hide the
    // gateways or the transmittal log, so it degrades to the numeric id.
    setPackages(p.ok && Array.isArray(p.data) ? p.data : null);
    // Fail to 'error' if EITHER read fails. Previously this required BOTH to
    // fail (&&), so a single failed read (e.g. the transmittal log) rendered its
    // honest-empty copy ("No transmittals yet") as if the org genuinely had
    // none — a false negative on the last screen before bytes leave for an
    // agency, where the transmittal log is exactly what a user checks to confirm
    // what has or hasn't already been sent.
    if (!t.ok || !g.ok) { setState('error'); return; }
    setGateways(Array.isArray(g.data) ? g.data : []);
    setRows(Array.isArray(t.data) ? t.data : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const transmit = useCallback(async (v: Record<string, string>) => {
    const region = v.region || 'fda';
    const gateway = v.gateway || 'esg';
    const body: Record<string, unknown> = {
      reason: v.reason,
      meaning: v.meaning || 'release',
      reauth: { password: v.password, totp: v.totp || undefined },
    };
    if (v.packageId) body.packageId = Number(v.packageId);
    if (v.submissionType) body.submissionType = v.submissionType;
    setLastPackageId(v.packageId ?? '');
    setRefusal(null);
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/${region}/${gateway}/transmit`, body);
    // Every refusal closes the drawer: the rejected password must not sit in
    // the field for a resubmit, and the toast carries the reason.
    if (status === 401) { setDialog(null); fireToast('Not transmitted — re-authentication failed (§11). Nothing left the platform.', 'error'); return; }
    if (status === 409) {
      // The active-transmittal lock, or a sequence already on file as another bundle.
      setDialog(null);
      fireToast(transmitConflictMessage(raw), 'error');
      return;
    }
    if (status === 412) { setDialog(null); fireToast('Not transmitted — gateway credentials are not configured for this environment.', 'error'); return; }
    if (status === 422) {
      const message = String((raw as any)?.error ?? 'validation failed');
      // Close the drawer so the findings card is not mounted beneath its overlay.
      setDialog(null);
      const findings = refusalFindings(raw);
      // The structural gate ran — a 422 from it is that evidence — so an empty list
      // is a refusal that carried no findings, not a clean bundle.
      setRefusal({ source: 'transmit', message, findings, findingsState: assessmentState({ scopeExists: true, findingCount: findings.length, assessmentRan: Array.isArray((raw as any)?.details?.findings) }) });
      /* QA 2026-10-08 (j6): the server sentence already ends in a period, so the
         toast ended "..", and a gateway this organization has no credentials for
         went unmentioned although it is the next refusal waiting. Both from the
         data on this screen: the refusal, and the gateway table's credential state. */
      const rows = gateways.filter((g) => g.gateway === gateway && String(g.region ?? '').toLowerCase() === region.toLowerCase());
      const noCredentials = rows.length > 0 && rows.every((g) => g.configured === false)
        ? ` ${gatewayLabel(gateway)} credentials are also not configured for this organization, so nothing could be sent through it yet.`
        : '';
      fireToast('Not transmitted — the structural gate rejected the bundle: ' + message.replace(/[.\s]+$/, '') + '.' + noCredentials, 'error');
      return;
    }
    if (!ok) { setDialog(null); fireToast(`Transmit failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing was sent') + '.', 'error'); return; }
    setDialog(null);
    // The gateway result is flattened onto data and its tracking field is
    // transmissionId (it was read as a nested transactionId, which no gateway
    // sends, so the confirmation never showed the reference).
    const dataOut = (raw as any)?.data ?? {};
    const txId = dataOut.transmissionId ?? dataOut.result?.transmissionId ?? dataOut.result?.transactionId ?? dataOut.transactionId;
    // The transmission is real even when its governed-action ledger entry could
    // not be written; the server says so and an irreversible send must not read
    // as an unqualified success.
    const ledgerLost = dataOut.ledgerWriteFailed
      ? ' ' + String(dataOut.ledgerWarning ?? 'The governed-action ledger entry for this transmission could not be written; record it manually.')
      : '';
    // The server re-assesses the package content after the send; a change that
    // landed while the bytes were leaving is announced, never folded into a
    // clean confirmation.
    const contentChanged = dataOut.contentAfterTransmit === 'drift'
      ? ' ' + String(dataOut.contentWarning ?? 'The package content changed while the transmission was in progress; re-assemble before any further transmission.')
      : '';
    // 2026-09-28 (Q-0928-3): the §11.50 meaning the signer declared was
    // persisted on the electronic signature and never shown back. Said here —
    // but only when the ledger transaction that carries the signature
    // committed; when it was lost there is no signature to name.
    const meaning = String(body.meaning);
    const signed = dataOut.ledgerWriteFailed
      ? ''
      : ' Signed by ' + (signerName ?? 'you') + ' — meaning: ' + meaning + '.';
    fireToast(
      'Transmitted via ' + region.toUpperCase() + ' / ' + gatewayLabel(gateway) + (txId ? ' · gateway ref ' + txId : '') + '.' + signed + ledgerLost + contentChanged,
      ledgerLost || contentChanged ? 'error' : undefined,
    );
    void load();
  }, [load, fireToast, signerName, gateways]);

  const checkStatus = useCallback(async (id: number) => {
    const { ok, status, data, raw } = await readData<Record<string, unknown>>('GET', `/api/mdx/gateways/transmittals/${id}/status`);
    if (!ok || !data) {
      /* `raw.error` is as often an enum token (GATEWAY_NOT_CONFIGURED) as a
         sentence, and a token in a toast is internals shown as copy. The shared
         reader keeps the sentence, drops the token, and also finds the ones this
         missed entirely — `message`, and the `detail` a governed refusal puts
         its reason in. */
      const reason = serverMessage(raw) ?? `HTTP ${status}`;
      fireToast(`Status check failed: ${reason}.`, 'error');
      return;
    }
    setStatusView({ id, body: data });
    void load();
  }, [load, fireToast]);

  const downloadAck = useCallback(async (id: number) => {
    try {
      const res = await apiRequest('GET', `/api/mdx/gateways/transmittals/${id}/ack`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        fireToast('No ACK available — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.', 'error');
        return;
      }
      const provenance = res.headers.get('X-Ack-Provenance');
      downloadBlob(
        provenance === 'agency'
          ? `agency-acknowledgement-${id}.txt`
          : `concept2cure-transmittal-record-${id}-NOT-AN-AGENCY-ACK.txt`,
        await res.blob(),
      );
      fireToast(provenance === 'agency'
        ? 'Agency acknowledgment downloaded — the agency’s own bytes.'
        : 'Downloaded this platform’s transmittal record. It is NOT an agency acknowledgment — obtain the agency receipt from the agency portal.');
    } catch (e) {
      fireToast('ACK download failed — ' + redactInternals(e instanceof Error ? e.message : '', 'the acknowledgment could not be read') + '.', 'error');
    }
  }, [fireToast]);

  /* Record the agency identifiers the Module 1 backbone carries. The assemble
     gate refuses to fabricate them (REGULATORY-IDENTIFIER-MISSING blocks
     transmit), so this is how an operator supplies them. */
  const recordIdentifiers = useCallback(async (v: Record<string, string>) => {
    setLastPackageId(v.packageId ?? '');
    const { ok, status, raw } = await readData('PUT', `/api/submission-ops/packages/${encodeURIComponent(v.packageId)}/regulatory-identifiers`, {
      applicationNumber: v.applicationNumber, applicantId: v.applicantId, applicantName: v.applicantName, reason: v.reason,
      // Sent only when any of its fields is filled: a 510(k) or non-US package needs none.
      ...([v.contactName, v.contactPhone, v.contactEmail].some((x) => x?.trim())
        ? { contact: { name: v.contactName?.trim() || undefined, phone: v.contactPhone?.trim() || undefined, email: v.contactEmail?.trim() || undefined } }
        : {}),
    });
    if (status === 400) { fireToast('Not recorded — ' + ((raw as any)?.error ?? 'validation failed') + (String((raw as any)?.error ?? '').endsWith('.') ? '' : '.'), 'error'); return; }
    if (status === 404) { fireToast('Not recorded — no package with that id in this tenant.', 'error'); return; }
    if (!ok) { fireToast(`Not recorded (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing changed') + '.', 'error'); return; }
    const d = (raw as any)?.data ?? {};
    setDialog(null);
    // The identifiers finding is resolved; any OTHER finding on the card still
    // stands (a packager refusal is not fixed by recording an application
    // number), so only the resolved one leaves the card.
    setRefusal((prev) => {
      if (!prev) return null;
      const remaining = prev.findings.filter((f) => f.ruleId !== IDENTIFIERS_RULE);
      if (remaining.length === 0) return null;
      return {
        ...prev,
        findings: remaining,
        fetchFailure: undefined,
        message: 'Identifiers recorded. The findings below remain from the last assembly and still stand; assemble again to refresh them.',
      };
    });
    fireToast(
      'Identifiers recorded on package ' + (d.packageId ?? v.packageId)
        + (d.staleBundleCleared
          ? '. The previously assembled bundle carried the old identifiers and was cleared — assemble again before transmitting.'
          : d.changed ? '. Assemble the bundle before transmitting.' : ' (unchanged).')
        + (d.ledgerWriteFailed ? ' The governance ledger could not be written — the change is recorded but not audited.' : ''),
      d.ledgerWriteFailed ? 'error' : undefined,
    );
  }, [fireToast]);

  /* Assemble the bundle through the canonical packager. A packager refusal
     (422) and a bundle that carries error findings are both rendered in the
     findings card — transmit would refuse either, and the operator should see
     why before trying. */
  /** The findings preflight serves for a package's stored bundle, with the
   *  honest states a failed or empty read must keep (see assessmentState).
   *  `assemblyErrors` is the count the assembly just reported, when there is one. */
  const loadFindings = useCallback(async (id: string, assemblyErrors?: number) => {
    const pf = await readData('POST', `/api/submission-ops/packages/${id}/preflight`, {});
    const body = (pf.raw as any)?.data ?? {};
    const rawFindings = body?.validation?.findings ?? body?.findings;
    const findings = pf.ok ? sortFindings(rawFindings) : [];
    // A failed findings fetch is said, not shown as an empty table under a
    // message that counts errors. Whether the preflight RAN is read from the
    // payload carrying a findings list at all — never from that list being
    // empty, which is the state that means "we have not looked".
    const findingsState = assessmentState({
      unreadable: !pf.ok,
      scopeExists: true,
      findingCount: findings.length,
      assessmentRan: pf.ok && Array.isArray(rawFindings),
    });
    const fetchFailure = !pf.ok
      ? `The findings could not be loaded (HTTP ${pf.status}${(pf.raw as any)?.error ? ': ' + (pf.raw as any).error : ''}); use Reload findings to try again.`
      : findingsState === 'not-assessed'
        ? 'Preflight did not return an itemized findings list; use Reload findings to try again.'
        : findingsState === 'assessed-clear' && assemblyErrors != null && assemblyErrors > 0
          ? `Preflight lists no findings on the stored bundle, yet assembly counted ${assemblyErrors}; the two disagree — reload the findings before transmitting.`
          : undefined;
    // The server says when it could not save the run's summary; portfolio
    // rollups read that summary, so the operator hears it here.
    const notSaved = pf.ok && body?.persisted === false
      ? 'The preflight summary could not be saved; portfolio rollups will not reflect this run.'
      : undefined;
    const errorCount = typeof body?.errorCount === 'number' ? body.errorCount : findings.filter((f) => f.severity === 'error').length;
    return { ok: pf.ok, findings, findingsState, fetchFailure, notSaved, errorCount };
  }, []);

  const assemble = useCallback(async (v: Record<string, string>) => {
    setLastPackageId(v.packageId ?? '');
    setRefusal(null);
    const body: Record<string, unknown> = { reason: v.reason };
    if (v.region) body.region = v.region;
    if (v.sequence) body.sequence = v.sequence;
    // The form asked for these; sending them is the whole point. Without the
    // submission type a follow-up sequence is refused for want of a value the
    // operator supplied and this never forwarded.
    if (v.submissionType?.trim()) body.submissionType = v.submissionType.trim();
    if (v.submissionSubType?.trim()) body.submissionSubType = v.submissionSubType.trim();
    if (v.submissionId?.trim()) body.submissionId = v.submissionId.trim();
    const withdraw = parseWithdrawals(v.withdraw);
    if (withdraw.length > 0) body.withdraw = withdraw;
    const id = encodeURIComponent(v.packageId);
    const { ok, status, raw } = await readData('POST', `/api/submission-ops/packages/${id}/assemble`, body);
    if (status === 404) { fireToast('Not assembled — no package with that id in this tenant.', 'error'); return; }
    if (status === 409) { fireToast('Not assembled — ' + ((raw as any)?.error ?? 'the package is not locked') + '.', 'error'); return; }
    if (status === 400) { fireToast('Not assembled — ' + ((raw as any)?.error ?? 'validation failed') + '.', 'error'); return; }
    if (status === 422) {
      const message = String((raw as any)?.error ?? 'the packager refused the bundle');
      const cleared = (raw as any)?.staleBundleCleared
        ? ' The previously assembled bundle was cleared; this package has no transmittable bundle now.'
        : '';
      const ledgerNote = (raw as any)?.ledgerWriteFailed ? ' The governance ledger could not be written for this refusal.' : '';
      setDialog(null);
      const findings = sortFindings((raw as any)?.validation?.findings);
      setRefusal({ source: 'assemble', message: message + '.' + cleared + ledgerNote, findings, findingsState: assessmentState({ scopeExists: true, findingCount: findings.length, assessmentRan: Array.isArray((raw as any)?.validation?.findings) }) });
      fireToast('Not assembled — ' + message + '.' + cleared, 'error');
      return;
    }
    if (!ok) { fireToast(`Assembly failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing was built') + '.', 'error'); return; }
    const d = (raw as any)?.data ?? {};
    const b = d.bundle ?? {};
    const errors = Number(b.validation?.errorCount ?? 0);
    const warnings = Number(b.validation?.warningCount ?? 0);
    // The bundle is real even when its governed-action ledger entry could not
    // be written; the server says so and the operator must hear it.
    const ledger = (raw as any)?.ledgerWriteFailed
      ? ' ' + String((raw as any)?.ledgerWarning ?? 'The governed-action ledger entry could not be written; record this assembly manually.')
      : '';
    // A follow-up sequence carries what CHANGED, so say what it does to what is
    // already on file rather than leaving the operator to infer it from a leaf
    // count that is smaller than the package.
    const life = b.lifecycle?.summary;
    const lifecycleNote = life && (b.sequence ?? '0000') !== '0000'
      ? ` Sequence ${b.sequence}: ${life.new} new, ${life.replace} replaced, ${life.unchanged} left unchanged on file` +
        // A withdrawal is the one irreversible thing a sequence does to what is
        // already at the agency, so it is never folded into the other counts.
        (life.delete > 0 ? `, ${life.delete} withdrawn from the application.` : '.')
      : '';
    setDialog(null);
    if (errors > 0) {
      // The bundle exists, but transmit will refuse it. The findings live on the
      // package's stored descriptor; the preflight route serves them.
      const loaded = await loadFindings(id, errors);
      setRefusal({
        source: 'assemble',
        message: `Bundle assembled for ${d.packageId ?? v.packageId} with ${errors} error-severity finding${errors === 1 ? '' : 's'}; transmit will refuse it until they are resolved.`,
        findings: loaded.findings,
        findingsState: loaded.findingsState,
        fetchFailure: loaded.fetchFailure,
        notSaved: loaded.notSaved,
      });
      fireToast(`Bundle assembled with ${errors} error-severity finding${errors === 1 ? '' : 's'} — transmit will refuse it. See the findings below.${ledger}`, 'error');
      return;
    }
    // No error-severity findings is not "ready": the transmit gate still checks
    // region identity, the gateway size limit and the operator's conformance
    // opt-ins before bytes leave. Say what was proven, not more.
    fireToast(`Bundle assembled for ${d.packageId ?? v.packageId} · ${b.leafCount ?? '?'} leaves · ${warnings} warning${warnings === 1 ? '' : 's'} · sha256 ${String(b.sha256 ?? '').slice(0, 12)}. No error-severity findings; the transmit gate still checks region, size and conformance opt-ins.${lifecycleNote}${ledger}`, ledger ? 'error' : undefined);
  }, [fireToast, loadFindings]);

  /** Re-run preflight for the last package and show what it reports now. */
  const reloadFindings = useCallback(async () => {
    const id = lastPackageId;
    if (!id) return;
    const loaded = await loadFindings(id);
    // What preflight REPORTS is a claim about what it found, so it is stated
    // only once the run returned an itemized findings list — the positive
    // evidence `assessmentState` carries. A zero error count also looks exactly
    // like a preflight that never itemized anything, and "no error-severity
    // findings" over that state tells the operator the bundle is clear of
    // blockers when nothing has looked for them.
    let message: string;
    if (!loaded.ok) {
      message = `Preflight could not be run for package ${id}.`;
    } else if (!hasAnswer(loaded.findingsState) || loaded.findingsState === 'not-assessed') {
      message = `Preflight ran for package ${id} but returned no itemized findings list, so no finding exists to report and nothing on this bundle is cleared.`;
    } else if (loaded.errorCount > 0) {
      message = `Preflight reports ${loaded.errorCount} error-severity finding${loaded.errorCount === 1 ? '' : 's'} on the stored bundle for package ${id}; transmit will refuse it until they are resolved.`;
    } else {
      message = `Preflight reports no error-severity findings on the stored bundle for package ${id}; the transmit gate still checks region, size and conformance opt-ins.`;
    }
    setRefusal({
      source: 'assemble',
      message,
      findings: loaded.findings,
      findingsState: loaded.findingsState,
      fetchFailure: loaded.fetchFailure,
      notSaved: loaded.notSaved,
    });
  }, [lastPackageId, loadFindings]);

  const rollback = useCallback(async (v: Record<string, string>) => {
    if (!dialog || typeof dialog !== 'object' || !('rollback' in dialog)) return;
    const id = dialog.rollback;
    // The drawer closes first, on every outcome: a refused password must not
    // sit in it for a resubmit, and the toast must not sit beneath it.
    setDialog(null);
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/transmittals/${id}/rollback`, {
      reason: v.reason, reauth: v.password ? { password: v.password, totp: v.totp || undefined } : undefined,
    });
    if (status === 401) { fireToast('Not rolled back — re-authentication failed.', 'error'); return; }
    if (!ok) { fireToast('Not rolled back — ' + refusalReason(raw, status), 'error'); return; }
    fireToast(`Transmittal #${id} marked rolled back in the audit trail. The agency still holds the transmitted bytes — file the agency-side retraction separately.`);
    void load();
  }, [dialog, load, fireToast]);

  /* The agency did not load the sequence this transmittal filed. The server
     takes it off the filed history only with the agency's notice as evidence,
     under re-authentication and a declared meaning, and refuses anything but
     the latest sequence on file; every refusal is said in its own words. */
  const recordRejection = useCallback(async (v: Record<string, string>) => {
    if (!dialog || typeof dialog !== 'object' || !('rejection' in dialog)) return;
    const id = dialog.rejection;
    // Closes first, as rollback does.
    setDialog(null);
    const meaning = v.meaning || 'responsibility';
    const { ok, status, data, raw } = await readData<RejectionRecorded>('POST', `/api/mdx/gateways/transmittals/${id}/technical-rejection`, {
      evidenceDocumentId: (v.evidenceDocumentId ?? '').trim(),
      reason: v.reason,
      meaning,
      reauth: v.password ? { password: v.password, totp: v.totp || undefined } : undefined,
    });
    if (status === 401) { fireToast('Not recorded — re-authentication failed. Nothing changed.', 'error'); return; }
    if (!ok) { fireToast('Not recorded — ' + refusalReason(raw, status), 'error'); return; }
    // A 2xx is a recorded rejection even when its body cannot be read.
    fireToast(rejectionRecordedMessage(id, data ?? {}, signerName, meaning));
    void load();
  }, [dialog, load, fireToast, signerName]);

  /* WHAT ANA SEES HERE. This is the last screen before bytes leave for an
     agency, so the payload is deliberately about CAPABILITY and OUTCOME, not
     volume. Which gateways hold credentials decides what can be sent at all —
     an unconfigured gateway is the single most common reason a transmit cannot
     happen, and it is a fact about the deployment that no amount of retrying
     changes.

     Failures travel by error_class rather than message: the classes are a
     bounded vocabulary worth reasoning over, while messages are unbounded
     gateway text that would flood a payload sent on every turn.

     Nothing here implies a transmittal can be recalled. A rollback marks the
     audit trail; the agency still holds the bytes. The surface says so in its
     own toast, and the context says so too, so AnA cannot offer to undo a
     transmission. */
  const configuredGateways = gateways.filter((g) => g.configured);
  const anaContext = useMemo(
    () => ({
      summary: state === 'loading'
        ? 'Agency gateways and transmittals, still loading.'
        : state === 'error'
          ? 'Agency gateways could not be reached — the dispatch layer is unavailable, which is not the same as having no gateways.'
          : `Agency transmittals: ${configuredGateways.length} of ${gateways.length} gateway(s) hold credentials; ` +
            `${rows.length} transmittal(s) logged.`,
      facts: {
        dispatchState: state,
        gatewaysTotal: gateways.length,
        gatewaysConfigured: configuredGateways.length,
        gatewaysAwaitingCredentials: gateways.filter((g) => !g.configured).map((g) => g.gateway ?? g.name ?? g.region).filter(Boolean),
        transmittalCount: rows.length,
        byStatus: rows.reduce<Record<string, number>>(
          (acc, r) => ({ ...acc, [r.status ?? 'unknown']: (acc[r.status ?? 'unknown'] ?? 0) + 1 }),
          {},
        ),
        failureClasses: [...new Set(rows.map((r) => r.error_class).filter(Boolean))],
        awaitingAcknowledgement: rows.filter((r) => r.submitted_at && !r.ack_received_at).length,
        // A rollback is an audit-trail act, not a recall.
        rollbackRetractsAtAgency: false,
      },
      availableActions: [
        'Explain which gateways can actually transmit and what the others are missing',
        'Explain why a transmittal failed, from its error class',
        'Explain what a rollback does and does not undo at the agency',
      ],
    }),
    [state, gateways, configuredGateways.length, rows],
  );
  usePublishSurfaceContext('gateway-transmittals', anaContext);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Agency gateways</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {ask && <button className="reg-cta" onClick={() => ask('Explain our agency gateway posture: which gateways hold credentials and can transmit, what the unconfigured ones are missing, and which transmittals are still awaiting acknowledgement. Do not treat an unreachable dispatch layer as having no gateways.')}>{I.sparkles} Explain gateway posture</button>}
            <button className="btn" style={{ height: 32 }} onClick={() => setDialog('identifiers')}>{I.penLine} Record identifiers</button>
            <button className="btn" style={{ height: 32 }} onClick={() => setDialog('assemble')}>{I.layers} Assemble bundle</button>
            <button className="btn primary" style={{ height: 32 }} onClick={() => setDialog('transmit')}>{I.upload} Transmit</button>
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {state === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading gateways…" /></div>
            : state === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t reach the dispatch layer" hint="The dispatch layer didn’t respond. Sign in to your tenant and retry." /></div>
            : gateways.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No gateways registered" hint="Region gateways (FDA ESG, EMA CESP, PMDA, Health Canada) appear here with their credential status." /></div>
            : <table className="reg-tbl"><thead><tr><th>Gateway</th><th>Region</th><th>Environment</th><th style={{ textAlign: 'right' }}>Credentials</th></tr></thead>
              <tbody>{gateways.map((g, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{g.name != null ? String(g.name) : gatewayLabel(g.gateway)}</td>
                  <td className="mono">{String(g.region ?? '—').toUpperCase()}</td>
                  <td>{String(g.environment ?? '—')}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + (g.configured ? 'ok' : 'warn')}>{g.configured ? 'configured' : 'not configured'}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Transmittal log</span><span className="s">{rows.length}</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="No transmittals yet" hint="Every transmit is recorded here with its gateway reference, status, acknowledgment, and rollback history." /></div>
            : <table className="reg-tbl"><thead><tr><th>#</th><th>Route</th><th>Gateway ref</th><th>Status</th><th>Submitted</th><th>Transmitted by</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.id}>
                  <td className="mono">#{t.id}</td>
                  {/* region is nullable on partially-migrated transmittal rows; the gateways
                      table above already renders the same field the same way when it is absent. */}
                  <td>{String(t.region ?? '—').toUpperCase()} / {gatewayLabel(t.gateway)}{t.submission_type ? ' · ' + t.submission_type : ''}
                    {accountLine(t) && <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>{accountLine(t)}</div>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.transmission_id ?? '—'}</td>
                  {/* status is likewise nullable (a row written before its gateway replied);
                      no chip is honest, an invented tone is not — same guard as error_message below. */}
                  <td>{t.status && <span className={'rd-chip tone-' + statusTone(t.status)}>{t.status}</span>}
                    {t.error_message && <div style={{ fontSize: 11, color: 'var(--error)' }}>{t.error_message}</div>}
                    {technicalRejectionNote(t)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.submitted_at ? new Date(t.submitted_at).toLocaleString() : '—'}</td>
                  {/* Who: resolved to a person by the server; a bare id is shown as such, never as a name. */}
                  <td>{t.submitted_by_name ?? (t.submitted_by != null ? `user #${t.submitted_by}` : '—')}
                    {/* 2026-09-28 (Q-0928-3): the §11.50 meaning declared at transmit, as
                        recorded on the row with its signature. A row without it says nothing
                        — never an invented meaning. */}
                    {t.metadata?.signature?.meaning && <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>signed · meaning: {t.metadata.signature.meaning}</div>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => checkStatus(t.id)}>{I.zap} Status</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => downloadAck(t.id)} disabled={!t.ack_received_at} title={t.ack_received_at ? 'Download the acknowledgment or transmittal record — the file states which' : 'Nothing to download yet'}>{I.download} ACK</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ rollback: t.id })}>{I.rotateCcw} Rollback</button>
                    {canRecordRejection(t) && (
                      <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ rejection: t.id })}
                        title="Record that the agency did not load the sequence this transmittal filed">{I.alertTriangle} Technical rejection</button>
                    )}
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {statusView && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Gateway status · transmittal #{statusView.id}</span><span className="s">{statusView.body.source === 'stored' ? 'last recorded state · the agency was not asked' : 'live poll'}</span></div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            <table className="reg-tbl"><tbody>
              {Object.entries(statusView.body).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }} className="mono">{String(v)}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {refusal && (
        <div className="pj-card" role="region" aria-label={refusal.source === 'transmit' ? 'Structural gate refusal' : 'Packager refusal'}>
          <div className="pj-card-h">
            <span className="t">{refusal.source === 'transmit' ? 'Structural gate refused the transmit' : 'Bundle not transmittable'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {refusal.findings.some((f) => f.ruleId === IDENTIFIERS_RULE) && (
                <button className="nda-open" onClick={() => setDialog('identifiers')}>{I.penLine} Record identifiers</button>
              )}
              {/* Preflight is re-runnable from here: a failed load, a changed
                  package, or a stale card all have the same remedy. */}
              {lastPackageId && (
                <button className="nda-open" onClick={() => { void reloadFindings(); }}>{I.rotateCcw} Reload findings</button>
              )}
              <span className="s">
                {refusal.fetchFailure && refusal.findings.length === 0
                  ? 'findings unavailable'
                  : `${refusal.findings.length} finding${refusal.findings.length === 1 ? '' : 's'}`}
              </span>
            </span>
          </div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            <div style={{ padding: '10px 16px', fontSize: 12 }}>
              {refusal.message}{' '}
              {refusal.findingsState !== 'assessed-with-findings'
                ? (refusal.fetchFailure ?? 'The refusal did not include an itemized findings list. Assemble the package again, then transmit.')
                : refusal.source === 'transmit'
                  ? 'These findings were recorded on the stored bundle when it was assembled. Resolve them, assemble the package again, then transmit.'
                  : 'Resolve the findings, then assemble the package again.'}
              {refusal.notSaved && <div style={{ marginTop: 6 }} role="status">{refusal.notSaved}</div>}
            </div>
            {/* Severity is stated as text in its own column — the chip's tone
                alone must not be the only carrier of meaning. */}
            {refusal.findings.length > 0 && (
              <table className="reg-tbl"><thead><tr><th>Rule</th><th>Severity</th><th>Finding</th></tr></thead>
                <tbody>{refusal.findings.map((f, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      <span className={'rd-chip tone-' + (f.severity === 'error' ? 'err' : f.severity === 'warning' ? 'warn' : 'ok')}>{f.ruleId ?? 'finding'}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{f.severity ?? '—'}</td>
                    <td>{f.message ?? '—'}</td>
                  </tr>))}</tbody></table>
            )}
          </div>
        </div>
      )}

      {dialog === 'transmit' && <C2CForm config={TRANSMIT_FORM(lastPackageId || undefined, packages)} onCancel={() => setDialog(null)} onSubmit={transmit} />}
      {dialog === 'identifiers' && <C2CForm config={IDENTIFIERS_FORM(lastPackageId || undefined, packages)} onCancel={() => setDialog(null)} onSubmit={recordIdentifiers} />}
      {dialog === 'assemble' && <C2CForm config={ASSEMBLE_FORM(lastPackageId || undefined, packages)} onCancel={() => setDialog(null)} onSubmit={assemble} />}
      {dialog && typeof dialog === 'object' && 'rollback' in dialog && <C2CForm config={ROLLBACK_FORM(dialog.rollback)} onCancel={() => setDialog(null)} onSubmit={rollback} />}
      {dialog && typeof dialog === 'object' && 'rejection' in dialog && <C2CForm config={TECHNICAL_REJECTION_FORM(dialog.rejection)} onCancel={() => setDialog(null)} onSubmit={recordRejection} />}
      <C2CToast msg={toast} />
    </div>
  );
}
