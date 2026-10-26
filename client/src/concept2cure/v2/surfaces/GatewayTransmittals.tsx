/**
 * Gateway transmittals — the organisation's transmission log, read-only.
 *
 * Registry id: `gateway-transmittals`.
 *
 * 2026-10-17 (audit; docs/design/FILING_SPINE.md F12, LX-13): transmit runs on
 * the sequence the person built — Submission Center, a dispatched sequence's
 * Dispatch tab, POST /api/submissions/sequences/:id/transmit. This screen used
 * to offer a second way, on a different store: a package picker over
 * /api/submission-ops/packages, "Record identifiers", "Assemble bundle" and a
 * package transmit (POST /api/mdx/gateways/:region/:gateway/transmit), plus a
 * rollback that frees that transmit's lock and is not a signature. All of it is
 * gone from here; the screen says where transmitting happens and opens the
 * sequences. Pinned by __tests__/gatewayTransmittalsReadOnly.test.tsx.
 *
 * What it reads and does (server/routes/mdx-submission-gateway.ts, mounted
 * /api/mdx, org-scoped from the JWT; envelope {data, meta}):
 *   • GET  /gateways/transmittals            — the org's transmittal log, with
 *          meta.signing.canSign: whether this person may sign
 *   • GET  /gateways/transmittals/:id/status — poll the gateway
 *   • GET  /gateways/transmittals/:id/ack    — download the ACK (binary)
 *   • POST /gateways/transmittals/:id/technical-rejection — the agency did not
 *          load the sequence a package transmittal filed: a governed sign
 *          (reason, §11.50 meaning, re-auth) carrying the agency's notice as a
 *          Vault document; the one act that takes a sequence off the filed history
 *
 * HONESTY: the log renders live data, an honest empty state, or an error — a
 * failed read is never "No transmittals yet".
 *
 * The ACK download states WHO WROTE THE BYTES. Only an FDA AS2 MDN is an agency
 * artefact; for every other gateway the platform composes a record from its own
 * transmittal row. The server sends provenance on X-Ack-Provenance and names
 * the file accordingly; the toast says which one arrived.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { listedChoices, notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, ApiRequestError, serverMessage, redactInternals } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import { stashNavParamsForTarget } from '../navParams';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';
import { gatewayLabel, transmittalStatusTone as statusTone } from '../gatewayLabels';
import { useTransmittalTarget } from './useTransmittalTarget';
import { ceremonyOpen } from '../ceremony';
import { canGovernedWrite } from '@shared/constants/permissions';
import { As2ReceiptUpload } from './As2ReceiptUpload';

interface Transmittal {
  // region/status are declared nullable because the log genuinely serves rows
  // that have them null — a narrowed SELECT, or a row written before its gateway
  // replied. The render guards below exist for those rows, not for a bad envelope.
  id: number; program_id?: string | null; region?: string | null; gateway?: string | null; format?: string | null; submission_type?: string | null;
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
    /** The sequence number a sequence transmit filed (transmitSequence). */
    sequence?: string | null;
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

async function readData<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; raw: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, raw: parsed };
  } catch (err) {
    // 2026-09-28 (M-0928-1): apiRequest THROWS ApiRequestError on every non-2xx
    // but 401, carrying the status and the parsed error body. A bare catch
    // flattened that to status 0 / raw null, so every refusal read "HTTP 0".
    // Only a failure with no response (network, abort) is status 0 now.
    if (err instanceof ApiRequestError) {
      return { ok: false, status: err.status, data: null, raw: err.payload ?? null };
    }
    return { ok: false, status: 0, data: null, raw: null };
  }
}

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
 * How a refusal names the transmittals on screen: the log number exactly as the
 * `#` column renders it, with the Gateway ref beside it when the row has one.
 * AnA cannot see this table, so a miss that lists these turns a dead end into a
 * retry with a real number (listedChoices, surfaceActions.ts).
 */
/**
 * The transmittal list's totals, from its envelope's meta. The route returns
 * the most recent page only, so the header count and AnA's facts read these —
 * a count taken from the page reported 100 for an org with 250 and hid every
 * older unacknowledged transmittal (2026-10-08, W5/D7, sweep HS-8). Each field
 * is null when not reported.
 */
interface LogMeta { total: number | null; hasMore: boolean | null; byStatus: Record<string, number> | null; awaitingAcknowledgement: number | null }
const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function readLogMeta(raw: unknown): LogMeta | null {
  const m = (raw as { meta?: unknown } | null)?.meta;
  if (!m || typeof m !== 'object') return null;
  const meta = m as Record<string, unknown>;
  const byStatus = meta.byStatus && typeof meta.byStatus === 'object' && !Array.isArray(meta.byStatus)
    ? (meta.byStatus as Record<string, number>)
    : null;
  return {
    total: finiteOrNull(meta.total),
    hasMore: typeof meta.hasMore === 'boolean' ? meta.hasMore : null,
    byStatus,
    awaitingAcknowledgement: finiteOrNull(meta.awaitingAcknowledgement),
  };
}
/** The log header's count: "N of TOTAL" when the page is not the whole log. */
function logCountLabel(listed: number, meta: LogMeta | null): string {
  return meta?.hasMore && meta.total != null ? `${listed} of ${meta.total}` : String(listed);
}
/** Said above the log when it is a page of a longer one. */
function logTruncationNote(listed: number, meta: LogMeta | null): string | null {
  if (!meta?.hasMore) return null;
  return meta.total != null
    ? `Showing the ${listed} most recently submitted of ${meta.total} transmittals. Older transmittals are not listed here.`
    : `Showing the ${listed} most recently submitted transmittals. Older transmittals are not listed here.`;
}
/** The log's part of AnA's summary: the server's total, or that it was not reported. */
function logSummary(listed: number, meta: LogMeta | null): string {
  if (meta?.total == null) return `${listed} transmittal(s) listed; the log’s total was not reported.`;
  return `${meta.total} transmittal(s) logged${meta.hasMore ? ` (the ${listed} most recent listed here)` : ''}.`;
}

function transmittalChoices(rows: ReadonlyArray<Transmittal>): string[] {
  return rows.map((t) => `#${t.id}${t.transmission_id ? ` · ${t.transmission_id}` : ''}`);
}

/**
 * The transmittal a name picks out of the log on screen — log number first
 * ("#12" or "12"), then an exact gateway reference, then a unique containment
 * on the reference. Resolved against the rows the table renders and nothing
 * else: this is the person's own table, not a lookup over anything they cannot
 * see. A miss returns the candidates it did match so the caller can say how
 * many, and never guesses between them.
 */
function resolveTransmittal(
  rows: ReadonlyArray<Transmittal>,
  raw: string,
): { match: Transmittal } | { hits: Transmittal[] } {
  const wanted = raw.trim().replace(/^#/, '').trim();
  const lower = wanted.toLowerCase();
  const byNumber = rows.find((t) => String(t.id) === wanted);
  if (byNumber) return { match: byNumber };
  // Only a non-empty name matches a reference: a row whose Gateway ref column
  // reads '—' holds null, and an empty name would otherwise equal it and pick
  // that row — a bare "#" would silently resolve to whichever row has no ref.
  const byRef = lower ? rows.find((t) => (t.transmission_id ?? '').toLowerCase() === lower) : undefined;
  if (byRef) return { match: byRef };
  const hits = lower ? rows.filter((t) => (t.transmission_id ?? '').toLowerCase().includes(lower)) : [];
  return hits.length === 1 ? { match: hits[0] } : { hits };
}

export function GatewayTransmittals({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  /* Whether this person may sign the technical rejection, as the server's
     signing-authority check answers it (GET /gateways/transmittals
     meta.signing). false hides it; null or absent hides nothing, because
     unknown is not "you cannot" and the server still decides.
     QA 2026-10-08 (j6): a manager reached a signature's password. */
  const [canSign, setCanSign] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Transmittal[]>([]);
  const [logMeta, setLogMeta] = useState<LogMeta | null>(null);
  const linked = useTransmittalTarget<Transmittal>();
  const logRows = linked.record ? [linked.record,...rows.filter(row=>row.id!==linked.record?.id)] : rows;
  useEffect(()=>{
    if(linked.state==='ready' && linked.record && !ceremonyOpen()) {
      const row=document.getElementById(`transmittal-row-${linked.record.id}`);
      row?.focus();row?.scrollIntoView?.({block:'nearest'});
    }
  },[linked.state,linked.record]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<{ rejection: number } | null>(null);
  const [statusView, setStatusView] = useState<{ id: number; body: Record<string, unknown> } | null>(null);
  const [toast, fireToast] = useToast();
  /* The signer named in the rejection confirmation — the authenticated user,
     resolved the way SubmissionCenter resolves it. */
  const authUser = useAuthUser();
  const signerName = authUser
    ? (authUser.displayName || `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() || authUser.email || null)
    : null;

  const load = useCallback(async () => {
    setState('loading');
    const t = await readData<Transmittal[]>('GET', '/api/mdx/gateways/transmittals');
    if (!t.ok) { setState('error'); return; }
    const signing = t.raw?.meta?.signing?.canSign;
    setCanSign(typeof signing === 'boolean' ? signing : null);
    setRows(Array.isArray(t.data) ? t.data : []);
    setLogMeta(readLogMeta(t.raw));
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  /* Transmit is on the sequence. A transmittal row records the sequence NUMBER
     it filed, not the sequence, so this cannot open one sequence's Dispatch tab
     without guessing; it opens the Submission Center's sequence list, through
     the hand-off that screen reads (submissionNavTarget.ts). */
  const openSequences = useCallback(() => {
    stashNavParamsForTarget('submission-center', { ws: 'sequences' });
    onNav('submission-center');
  }, [onNav]);

  const checkStatus = useCallback(async (id: number) => {
    const { ok, status, data, raw } = await readData<Record<string, unknown>>('GET', `/api/mdx/gateways/transmittals/${id}/status`);
    if (!ok || !data) {
      /* `raw.error` is as often an enum token (GATEWAY_NOT_CONFIGURED) as a
         sentence; the shared reader keeps the sentence and drops the token. */
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

  /* The agency did not load the sequence this transmittal filed. The server
     takes it off the filed history only with the agency's notice as evidence,
     under re-authentication and a declared meaning, and refuses anything but
     the latest sequence on file; every refusal is said in its own words. */
  const recordRejection = useCallback(async (v: Record<string, string>) => {
    if (!dialog) return;
    const id = dialog.rejection;
    // The drawer closes first, on every outcome: a refused password must not
    // sit in it for a resubmit, and the toast must not sit beneath it.
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

  /** A technical rejection is a signed act: offered only on a row that can take
   *  one, and not to someone the server says may not sign. */
  const offerRejection = (t: Transmittal): boolean => canSign !== false && canRecordRejection(t);

  /* WHAT ANA SEES HERE: the log's outcome, by status and error class (a bounded
     vocabulary; messages are unbounded gateway text), and that this screen
     sends nothing — transmitting is on the sequence. */
  const anaContext = useMemo(
    () => ({
      summary: state === 'loading'
        ? 'The transmittal log is still loading.'
        : state === 'error'
          ? 'The transmittal log could not be read — which is not the same as nothing having been sent.'
          : `Transmittal log: ${logSummary(rows.length, logMeta)} This screen is read-only; ` +
            'a sequence is transmitted from its Dispatch tab in the Submission Center.',
      facts: {
        logState: state,
        // Over the whole log, from the server; null when it did not say. A count
        // taken from the listed page understated both (sweep HS-8).
        transmittalCount: logMeta?.total ?? null,
        transmittalsListed: rows.length,
        logTruncated: logMeta?.hasMore ?? null,
        byStatus: logMeta?.byStatus ?? null,
        failureClasses: [...new Set(rows.map((r) => r.error_class).filter(Boolean))],
        awaitingAcknowledgement: logMeta?.awaitingAcknowledgement ?? null,
        transmitsFromThisScreen: false,
      },
      availableActions: [
        'Explain why a transmittal failed, from its error class',
        'Explain which transmittals are still awaiting acknowledgement',
        // The one operation she can take here (submission-gateway.show-status):
        // the row's own Status control. Everything else on the log is a read she
        // explains, or a signed technical rejection that stays a person's act.
        "Show one transmittal's gateway status, by its log number or gateway reference",
      ],
    }),
    [state, rows, logMeta],
  );
  usePublishSurfaceContext('gateway-transmittals', anaContext);

  /* AnA operates this log through the row's own Status control (checkStatus).
     The screen is read-only since the 2026-10-17 audit (FILING_SPINE F12):
     transmit, assemble and unsigned rollback left it for the sequence's
     Dispatch tab, and with them the refusal card the old
     `submission-gateway.reload-findings` action drove — so that action left the
     registry in the same change that brought this one onto the new screen. The
     signed technical rejection stays a person's own click. The handler is
     synchronous and the read is not, so the detail says what was STARTED; the
     card and the toast carry the server's answer. */
  useSurfaceActionHandlers('gateway-transmittals', {
    'submission-gateway.show-status': (params) => {
      const raw = (params.transmittal ?? '').trim();
      // `logRows`, not `rows`: a transmittal linked from another screen is
      // pinned at the top of the table even when the log read does not carry
      // it, and a person can press its Status button — so AnA can name it too.
      const logged = () => listedChoices(transmittalChoices(logRows), 'Transmittals logged');
      if (!raw) {
        return {
          ok: false,
          reason: 'Name a transmittal to show — its log number as listed (e.g. "#12") or its gateway reference.' + logged(),
        };
      }
      if (state === 'loading') return { ok: false, reason: 'The transmittal log is still loading.', retry: true };
      if (state === 'error') {
        // Never reported as an empty log: this is the table an operator reads to
        // confirm what has or has not already been sent to an agency.
        return {
          ok: false,
          reason:
            'The transmittal log could not be read, so no transmittals are listed to show a status for. ' +
            'That is not the same as this organization having none.',
        };
      }
      if (logRows.length === 0) {
        return { ok: false, reason: 'No transmittals have been logged for this organization yet, so there is none to show a status for.' };
      }
      const found = resolveTransmittal(logRows, raw);
      if (!('match' in found)) {
        return {
          ok: false,
          reason:
            found.hits.length > 1
              ? `"${raw}" matches ${found.hits.length} transmittals — name one exactly.` +
                listedChoices(transmittalChoices(found.hits), 'Matched')
              : `No transmittal "${raw}" in this log.` + logged(),
        };
      }
      const t = found.match;
      // The card for this row is already on screen, and the Status control
      // re-reads the whole log on success; say so rather than re-polling the
      // agency for what the person is looking at.
      if (statusView?.id === t.id) return { ok: true, detail: `Already showing the gateway status for transmittal #${t.id}` };
      void checkStatus(t.id);
      return {
        ok: true,
        detail:
          `Showing the gateway status for transmittal #${t.id} — the card appears below when the gateway ` +
          'answers, and a gateway that refuses reports its reason instead.',
      };
    },
  });
  /* The ready signal for the hold above. Gated on the read SETTLING and nothing
     else: a failed read must reach a held action as the handler's own refusal,
     not as a twenty-second timeout (surfaceReadySignal.test.ts). */
  useEffect(() => {
    if (state !== 'loading') notifySurfaceActionReady('gateway-transmittals');
  }, [state]);

  return (
    <div className="cm-body">
      {linked.id && <div className="pj-card" role={linked.state==='error'?'alert':'status'}>
        <div className="pj-card-b">{linked.state==='loading' ? 'Loading the linked transmittal…' : linked.state==='error'
          ? <>The linked transmittal could not be read in this project, or is no longer available. No other row was selected. <button className="btn ghost" onClick={linked.retry}>Retry linked transmittal</button></>
          : <>Linked transmittal #{linked.record?.id} is selected in the log below.</>}</div>
      </div>}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Transmittal log</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {state === 'ready' && <span className="s">{logCountLabel(rows.length, logMeta)}</span>}
            {ask && <button className="reg-cta" onClick={() => ask('Explain our transmittal log: which transmittals failed and why, from their error class, and which are still awaiting acknowledgement. Do not treat an unreadable log as nothing sent.')}>{I.sparkles} Explain the log</button>}
          </span>
        </div>
        <div className="pj-card-b" role="note" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>
            Transmit from the sequence: open the submission, pick its dispatched sequence, and transmit it from the Dispatch tab,
            under its own Part 11 e-signature. This log lists what was sent and does not send anything.
          </span>
          <button className="btn" style={{ height: 32 }} onClick={openSequences}>{I.right} Open the sequences in Submission Center</button>
        </div>
        {canSign === false && (
          <div className="pj-card-b" role="note" style={{ fontSize: 12 }}>
            Recording a technical rejection is an electronic signature, and your role does not sign (21 CFR Part 11 §11.10(g)),
            so it is not offered to you. A colleague whose role carries signing authority records it.
          </div>
        )}
        {state === 'ready' && logTruncationNote(rows.length, logMeta) && (
          <div className="pj-card-b" role="note" style={{ fontSize: 12 }}>{logTruncationNote(rows.length, logMeta)}</div>
        )}
        <div className="pj-card-b" style={{ padding: 0 }}>
          {state === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="Loading the transmittal log…" /></div>
            : state === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t read the transmittal log" hint="The log did not respond, so whether anything was sent is not shown here. Sign in to your tenant and retry." /></div>
            : rows.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="No transmittals yet" hint="Every transmission is recorded here with its gateway reference, status and acknowledgment." /></div>
            : <table className="reg-tbl"><thead><tr><th>#</th><th>Route</th><th>Gateway ref</th><th>Status</th><th>Submitted</th><th>Transmitted by</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{logRows.map((t) => (
                <tr key={t.id} id={`transmittal-row-${t.id}`} tabIndex={linked.record?.id===t.id?-1:undefined}
                  aria-label={linked.record?.id===t.id?`Linked transmittal #${t.id}`:undefined}>
                  <td className="mono">#{t.id}</td>
                  {/* region is nullable on partially-migrated transmittal rows. */}
                  <td>{String(t.region ?? '—').toUpperCase()} / {gatewayLabel(t.gateway)}{t.submission_type ? ' · ' + t.submission_type : ''}
                    {t.metadata?.sequence ? <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>sequence {t.metadata.sequence}</div> : null}
                    {accountLine(t) && <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>{accountLine(t)}</div>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.transmission_id ?? '—'}</td>
                  {/* status is likewise nullable (a row written before its gateway replied);
                       no chip is honest, an invented tone is not. */}
                  <TransmittalStatusCell t={t} />
                  <td style={{ whiteSpace: 'nowrap' }}>{t.submitted_at ? new Date(t.submitted_at).toLocaleString() : '—'}</td>
                  <TransmittalSignatureCell t={t} />
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => checkStatus(t.id)}>{I.zap} Status</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => downloadAck(t.id)} disabled={!t.ack_received_at} title={t.ack_received_at ? 'Download the acknowledgment or transmittal record — the file states which' : 'Nothing to download yet'}>{I.download} ACK</button>
                    {t.region === 'fda' && t.gateway === 'esg' && canGovernedWrite(authUser) && <As2ReceiptUpload transmittalId={t.id} onRecorded={load} />}
                    {offerRejection(t) && (
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

      {dialog && <C2CForm config={TECHNICAL_REJECTION_FORM(dialog.rejection)} onCancel={() => setDialog(null)} onSubmit={recordRejection} />}
      <C2CToast msg={toast} />
    </div>
  );
}

function TransmittalStatusCell({ t }: { t: Transmittal }) { return (
                  <td>{t.status && <span className={'rd-chip tone-' + statusTone(t.status)}>{t.status}</span>}
                    {t.error_message && <div style={{ fontSize: 11, color: 'var(--error)' }}>{t.error_message}</div>}
                    {technicalRejectionNote(t)}</td>
  ); }
function TransmittalSignatureCell({ t }: { t: Transmittal }) { return (
                  <td>{t.submitted_by_name ?? (t.submitted_by != null ? `user #${t.submitted_by}` : '—')}
                    {/* 2026-09-28 (Q-0928-3): the §11.50 meaning declared at transmit, as
                        recorded on the row with its signature. A row without it says nothing
                        — never an invented meaning. */}
                    {t.metadata?.signature?.meaning && <div style={{ fontSize: 11, color: 'var(--muted, inherit)' }}>signed · meaning: {t.metadata.signature.meaning}</div>}</td>
  ); }
