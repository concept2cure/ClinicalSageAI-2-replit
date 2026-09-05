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
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormField } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';

interface GatewayInfo { region?: string; gateway?: string; name?: string; configured?: boolean; environment?: string; [k: string]: unknown; }
interface Transmittal {
  // region/status are declared nullable because the log genuinely serves rows
  // that have them null — a narrowed SELECT, or a row written before its gateway
  // replied. The render guards below exist for those rows, not for a bad envelope.
  id: number; region?: string | null; gateway?: string | null; format?: string | null; submission_type?: string | null;
  transmission_id?: string | null; status?: string | null; error_class?: string | null; error_message?: string | null;
  submitted_at?: string | null; ack_received_at?: string | null; completed_at?: string | null;
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

/** The numeric submission package id the dispatch layer uses, shared by the
 *  transmit, assemble and identifier forms so an operator works with ONE id. */
const PACKAGE_FIELD = (def?: string): C2CFormField => ({
  key: 'packageId', label: 'Package id', type: 'number', required: true, half: true, default: def,
  desc: 'Numeric submission package id — the same id the transmit form takes.',
});
const IDENTIFIERS_FORM = (def?: string): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · governed change',
  title: 'Record regulatory identifiers',
  sub: 'The agency application number and applicant identity the Module 1 backbone carries. Recorded on the package with your reason. A bundle assembled under different identifiers is cleared and must be assembled again.',
  // The default banner asserts an audit entry will be written; this route
  // documents the case where it cannot be, so say what actually happens.
  governed: 'Governed change — your reason is recorded with it in the audit trail. If the ledger entry cannot be written, the change is still applied and the response says so.',
  submitLabel: 'Record',
  fields: [
    PACKAGE_FIELD(def),
    { key: 'applicationNumber', label: 'Application number', type: 'text', required: true, half: true, placeholder: 'e.g. IND123456', desc: 'Letters, digits, ".", "_" or "-"; up to 64 characters.' },
    { key: 'applicantId', label: 'Applicant id', type: 'text', required: true, half: true, placeholder: 'e.g. DUNS number', desc: 'Same character set as the application number.' },
    { key: 'applicantName', label: 'Applicant name', type: 'text', required: true },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the change.' },
  ],
});
const ASSEMBLE_FORM = (def?: string): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch · governed transition',
  title: 'Assemble bundle',
  sub: 'Builds the eCTD bundle for a locked package through the canonical packager and records the structural findings on it. Transmit refuses a bundle that carries error-severity findings.',
  governed: 'Governed transition — your reason is recorded with the assembly. Assembly does not re-authenticate you; transmit does. If the ledger entry cannot be written, the bundle is still built and the response says so.',
  submitLabel: 'Assemble',
  fields: [
    PACKAGE_FIELD(def),
    { key: 'region', label: 'Region', type: 'select', options: ['FDA', 'EMA', 'PMDA', 'CA'], default: 'FDA', half: true },
    { key: 'sequence', label: 'Sequence', type: 'text', default: '0000', half: true, placeholder: '0000', desc: 'Four digits.' },
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the assembly.' },
  ],
});

const REGIONS = ['fda', 'ema', 'pmda', 'ca'];
const GATEWAYS = ['esg', 'cesp', 'eudamed', 'pmda_gateway', 'hc_cesg'];

async function readData<T = any>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; raw: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, raw: parsed };
  } catch { return { ok: false, status: 0, data: null, raw: null }; }
}
function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v.includes('ack') || v.includes('complete') || v.includes('success')) return 'ok';
  if (v.includes('fail') || v.includes('error') || v.includes('reject')) return 'err';
  return 'warn';
}

const TRANSMIT_FORM: C2CFormConfig = {
  eyebrow: 'Regulatory dispatch · §11 re-authentication',
  title: 'Transmit to agency gateway',
  sub: 'The transmit is gated server-side: your credentials are re-verified, the structural gate runs, and the transmittal is recorded before transport.',
  governed: true, submitLabel: 'Transmit',
  fields: [
    { key: 'region', label: 'Region', type: 'select', options: REGIONS, default: 'fda', half: true },
    { key: 'gateway', label: 'Gateway', type: 'select', options: GATEWAYS, default: 'esg', half: true },
    { key: 'packageId', label: 'Package id (stored bundle)', type: 'number', half: true, desc: 'Numeric submission package whose stored bundle descriptor is transmitted.' },
    { key: 'submissionType', label: 'Submission type', type: 'text', half: true, placeholder: 'e.g. original' },
    { key: 'reason', label: 'Reason for transmission (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters — recorded with the transmittal.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', required: true, half: true },
    { key: 'totp', label: 'Authentication code (if enabled)', type: 'text', half: true },
  ],
};
const ROLLBACK_FORM = (id: number): C2CFormConfig => ({
  eyebrow: 'Regulatory dispatch',
  title: `Roll back transmittal #${id}`,
  sub: 'Records the rollback in this platform’s Part 11 audit trail and frees the transmit lock. '
     + 'It does NOT retract the submission at the agency — the agency still holds the transmitted '
     + 'bytes, and you must file the agency-side retraction directly (FDA: WebTrader).',
  governed: true, submitLabel: 'Roll back',
  fields: [
    { key: 'reason', label: 'Reason (governed)', type: 'textarea', required: true, placeholder: 'At least 8 characters.' },
    { key: 'password', label: 'Password (re-authentication)', type: 'password', half: true },
    { key: 'totp', label: 'Authentication code', type: 'text', half: true },
  ],
});

export function GatewayTransmittals({ onAsk }: SurfaceViewProps) {
  /* AnA on this surface. It discarded SurfaceViewProps entirely as `_props`, on
     the last screen before bytes leave for an agency — the point at which an
     unconfigured gateway or an unacknowledged transmittal most needs
     explaining. */
  const ask = onAsk;
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [rows, setRows] = useState<Transmittal[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<'transmit' | 'identifiers' | 'assemble' | { rollback: number } | null>(null);
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
  const [refusal, setRefusal] = useState<{ source: 'transmit' | 'assemble'; message: string; findings: RefusalFinding[]; fetchFailure?: string } | null>(null);
  const [toast, fireToast] = useToast();

  const load = useCallback(async () => {
    setState('loading');
    const [g, t] = await Promise.all([
      readData<GatewayInfo[]>('GET', '/api/mdx/gateways'),
      readData<Transmittal[]>('GET', '/api/mdx/gateways/transmittals'),
    ]);
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
      reauth: { password: v.password, totp: v.totp || undefined },
    };
    if (v.packageId) body.packageId = Number(v.packageId);
    if (v.submissionType) body.submissionType = v.submissionType;
    setLastPackageId(v.packageId ?? '');
    setRefusal(null);
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/${region}/${gateway}/transmit`, body);
    if (status === 401) { fireToast('Not transmitted — re-authentication failed (§11). Nothing left the platform.', 'error'); return; }
    if (status === 409) {
      // The error envelope is { error, details }: the holder's id and status
      // travel in details (they were read from a `data` key that an error
      // response never carries, so the toast always said "#?" / "in flight").
      const held = (raw as any)?.details ?? (raw as any)?.data ?? raw;
      fireToast(`Not transmitted — transmittal #${held?.transmittalId ?? '?'} is already active (${held?.status ?? 'in flight'}). Roll it back first.`, 'error');
      return;
    }
    if (status === 412) { fireToast('Not transmitted — gateway credentials are not configured for this environment.', 'error'); return; }
    if (status === 422) {
      const message = String((raw as any)?.error ?? 'validation failed');
      // Close the drawer so the findings card is not mounted beneath its overlay.
      setDialog(null);
      setRefusal({ source: 'transmit', message, findings: refusalFindings(raw) });
      fireToast('Not transmitted — the structural gate rejected the bundle: ' + message + '.', 'error');
      return;
    }
    if (!ok) { fireToast(`Transmit failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing was sent') + '.', 'error'); return; }
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
    fireToast(
      'Transmitted via ' + region.toUpperCase() + '/' + gateway + (txId ? ' · gateway ref ' + txId : '') + '.' + ledgerLost,
      ledgerLost ? 'error' : undefined,
    );
    void load();
  }, [load, fireToast]);

  const checkStatus = useCallback(async (id: number) => {
    const { ok, status, data } = await readData<Record<string, unknown>>('GET', `/api/mdx/gateways/transmittals/${id}/status`);
    if (!ok || !data) { fireToast(`Status check failed (HTTP ${status}).`, 'error'); return; }
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
      fireToast('ACK download failed — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  }, [fireToast]);

  /* Record the agency identifiers the Module 1 backbone carries. The assemble
     gate refuses to fabricate them (REGULATORY-IDENTIFIER-MISSING blocks
     transmit), so this is how an operator supplies them. */
  const recordIdentifiers = useCallback(async (v: Record<string, string>) => {
    setLastPackageId(v.packageId ?? '');
    const { ok, status, raw } = await readData('PUT', `/api/submission-ops/packages/${encodeURIComponent(v.packageId)}/regulatory-identifiers`, {
      applicationNumber: v.applicationNumber, applicantId: v.applicantId, applicantName: v.applicantName, reason: v.reason,
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
  const assemble = useCallback(async (v: Record<string, string>) => {
    setLastPackageId(v.packageId ?? '');
    setRefusal(null);
    const body: Record<string, unknown> = { reason: v.reason };
    if (v.region) body.region = v.region;
    if (v.sequence) body.sequence = v.sequence;
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
      setRefusal({ source: 'assemble', message: message + '.' + cleared + ledgerNote, findings: sortFindings((raw as any)?.validation?.findings) });
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
    setDialog(null);
    if (errors > 0) {
      // The bundle exists, but transmit will refuse it. The findings live on the
      // package's stored descriptor; the preflight route serves them.
      const pf = await readData('POST', `/api/submission-ops/packages/${id}/preflight`, {});
      const findings = pf.ok ? sortFindings((pf.raw as any)?.data?.validation?.findings ?? (pf.raw as any)?.data?.findings) : [];
      // A failed or empty findings fetch is said, not shown as an empty table
      // under a message that counts errors.
      const fetchFailure = !pf.ok
        ? `The findings could not be loaded (HTTP ${pf.status}${(pf.raw as any)?.error ? ': ' + (pf.raw as any).error : ''}); run preflight for this package to see them.`
        : findings.length === 0
          ? /* The error count above says errors exist; an empty list here means
               the itemized findings were not delivered, not that none exist —
               say that, never "no findings" (empty-state gate). */
            'Preflight did not return the itemized findings behind this error count; run preflight for this package to see them.'
          : undefined;
      setRefusal({
        source: 'assemble',
        message: `Bundle assembled for ${d.packageId ?? v.packageId} with ${errors} error-severity finding${errors === 1 ? '' : 's'}; transmit will refuse it until they are resolved.`,
        findings,
        fetchFailure,
      });
      fireToast(`Bundle assembled with ${errors} error-severity finding${errors === 1 ? '' : 's'} — transmit will refuse it. See the findings below.${ledger}`, 'error');
      return;
    }
    // No error-severity findings is not "ready": the transmit gate still checks
    // region identity, the gateway size limit and the operator's conformance
    // opt-ins before bytes leave. Say what was proven, not more.
    fireToast(`Bundle assembled for ${d.packageId ?? v.packageId} · ${b.leafCount ?? '?'} leaves · ${warnings} warning${warnings === 1 ? '' : 's'} · sha256 ${String(b.sha256 ?? '').slice(0, 12)}. No error-severity findings; the transmit gate still checks region, size and conformance opt-ins.${ledger}`, ledger ? 'error' : undefined);
  }, [fireToast]);

  const rollback = useCallback(async (v: Record<string, string>) => {
    if (!dialog || typeof dialog !== 'object') return;
    const id = dialog.rollback;
    const { ok, status, raw } = await readData('POST', `/api/mdx/gateways/transmittals/${id}/rollback`, {
      reason: v.reason, reauth: v.password ? { password: v.password, totp: v.totp || undefined } : undefined,
    });
    if (status === 401) { fireToast('Not rolled back — re-authentication failed.', 'error'); return; }
    if (!ok) { fireToast(`Rollback failed (HTTP ${status}) — ` + ((raw as any)?.error ?? 'nothing changed') + '.', 'error'); return; }
    setDialog(null);
    fireToast(`Transmittal #${id} marked rolled back in the audit trail. The agency still holds the transmitted bytes — file the agency-side retraction separately.`);
    void load();
  }, [dialog, load, fireToast]);

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
            <button className="btn primary" style={{ height: 32 }} onClick={() => setDialog('transmit')}>{I.upload || I.layers} Transmit</button>
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {state === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading gateways…" /></div>
            : state === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t reach the dispatch layer" hint="The dispatch layer didn’t respond. Sign in to your tenant and retry." /></div>
            : gateways.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No gateways registered" hint="Region gateways (FDA ESG, EMA CESP, PMDA, Health Canada) appear here with their credential status." /></div>
            : <table className="reg-tbl"><thead><tr><th>Gateway</th><th>Region</th><th>Environment</th><th style={{ textAlign: 'right' }}>Credentials</th></tr></thead>
              <tbody>{gateways.map((g, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{String(g.name ?? g.gateway ?? '—')}</td>
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
            : <table className="reg-tbl"><thead><tr><th>#</th><th>Route</th><th>Gateway ref</th><th>Status</th><th>Submitted</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.id}>
                  <td className="mono">#{t.id}</td>
                  {/* region is nullable on partially-migrated transmittal rows; the gateways
                      table above already renders the same field the same way when it is absent. */}
                  <td>{String(t.region ?? '—').toUpperCase()} / {t.gateway}{t.submission_type ? ' · ' + t.submission_type : ''}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.transmission_id ?? '—'}</td>
                  {/* status is likewise nullable (a row written before its gateway replied);
                      no chip is honest, an invented tone is not — same guard as error_message below. */}
                  <td>{t.status && <span className={'rd-chip tone-' + statusTone(t.status)}>{t.status}</span>}
                    {t.error_message && <div style={{ fontSize: 11, color: 'var(--c2c-err,#b42318)' }}>{t.error_message}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.submitted_at ? new Date(t.submitted_at).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="nda-open" onClick={() => checkStatus(t.id)}>{I.zap} Status</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => downloadAck(t.id)} disabled={!t.ack_received_at} title={t.ack_received_at ? 'Download the acknowledgment or transmittal record — the file states which' : 'Nothing to download yet'}>{I.download} ACK</button>
                    <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setDialog({ rollback: t.id })}>{I.rotateCcw} Rollback</button>
                  </td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {statusView && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Gateway status · transmittal #{statusView.id}</span><span className="s">live poll</span></div>
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
              {refusal.findings.length === 0
                ? /* An empty findings list is not a finding of "none": say the
                     list is absent, never that nothing was found — the refusal
                     itself is the only assessed fact here (empty-state gate). */
                  (refusal.fetchFailure ?? 'The refusal did not include an itemized findings list. Assemble the package again, then transmit.')
                : refusal.source === 'transmit'
                  ? 'These findings were recorded on the stored bundle when it was assembled. Resolve them, assemble the package again, then transmit.'
                  : 'Resolve the findings, then assemble the package again.'}
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

      {dialog === 'transmit' && <C2CForm config={TRANSMIT_FORM} onCancel={() => setDialog(null)} onSubmit={transmit} />}
      {dialog === 'identifiers' && <C2CForm config={IDENTIFIERS_FORM(lastPackageId || undefined)} onCancel={() => setDialog(null)} onSubmit={recordIdentifiers} />}
      {dialog === 'assemble' && <C2CForm config={ASSEMBLE_FORM(lastPackageId || undefined)} onCancel={() => setDialog(null)} onSubmit={assemble} />}
      {dialog && typeof dialog === 'object' && <C2CForm config={ROLLBACK_FORM(dialog.rollback)} onCancel={() => setDialog(null)} onSubmit={rollback} />}
      <C2CToast msg={toast} />
    </div>
  );
}
