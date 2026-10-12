/**
 * Audit-trail attestation — the signed answer to "has this trail been altered?"
 *
 * ── WHY THIS SCREEN ─────────────────────────────────────────────────────────
 * `GET /api/tenant-export/attestation` walks the tenant's `audit_events` hash
 * chain, recomputes every row's hash, reports any broken link, and HMAC-signs
 * the result so an external auditor can verify the platform issued it and that
 * it was not edited afterwards (21 CFR Part 11 §11.10(e);
 * `server/services/tenant-export/attestation-report.service.ts`). Pulling it
 * records its own audit row naming who asked and what verdict came back.
 *
 * It had no caller anywhere in the client. The eight reports beside it on this
 * surface each answer "what happened"; this is the only one that answers
 * "and can you prove the record of what happened is intact" — which is the
 * question an inspector asks first.
 *
 * ── THE DISTINCTION THIS SCREEN EXISTS TO HOLD ──────────────────────────────
 * The verdict has four values and the service's own interface says it outright:
 * UNVERIFIABLE is "NOT a synonym for INTACT". It means rows exist that carry no
 * hash, so there is nothing to check — the absence of evidence, not evidence of
 * integrity. Rows written before the hash-chain trigger was applied can never
 * honestly be given one (hashing history after the fact produces a chain that
 * is self-consistent and proves nothing about the period it claims to cover),
 * so a tenant with history predating the chain has a period nobody can attest
 * to, permanently. This panel reports that split as a fact rather than
 * averaging it into a verdict, and never renders UNVERIFIABLE or EMPTY as a
 * pass.
 *
 * @module client/src/concept2cure/v2/surfaces/ComplianceAttestation
 */
import React, { useCallback, useRef, useState } from 'react';

import { canAttestAuditTrail } from '@shared/constants/permissions';
import { useAuthUser } from '@/services/portal/authService';

import { I } from '../icons';
import { apiCall, apiErrorText } from '../apiCall';
import { ErrorState } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';

/** The report body, as `AttestationReport` defines it. */
export interface AttestationReport {
  schemaVersion: string;
  organization: { id: number; slug: string; name: string };
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  totalEntries: number;
  /** Entries carrying a record hash — the ones that CAN be attested. */
  hashedEntries: number;
  /** Entries with no hash. Above zero and the trail is not fully covered. */
  unhashedEntries: number;
  brokenLinks: number;
  brokenLinkSamples: Array<{ id: string; sequenceNumber: number }>;
  firstSequenceNumber: number | null;
  lastSequenceNumber: number | null;
  attestation: 'INTACT' | 'BROKEN' | 'EMPTY' | 'UNVERIFIABLE';
  unverifiableReason?: string;
  signature: { algorithm: string; keyId: string; value: string };
}

/**
 * What each verdict means, in the words a reader needs, and whether it is an
 * assurance at all.
 *
 * `assuring` drives nothing but the tone: no verdict but INTACT may be styled
 * as a pass, and INTACT itself is only a pass over the hashed period, which
 * {@link coverageSentence} states separately.
 */
export const ATTESTATION_VERDICT: Readonly<
  Record<string, { label: string; meaning: string; assuring: boolean }>
> = {
  INTACT: {
    label: 'Links intact',
    meaning:
      'Every audit entry in the attested period carries a hash, and each one names the hash of the entry ' +
      'before it, with no link out of step.',
    assuring: true,
  },
  BROKEN: {
    label: 'Links broken',
    meaning:
      'At least one entry does not name the hash of the entry before it. The chain has been altered, or ' +
      'the records are corrupt. The affected entries are listed below.',
    assuring: false,
  },
  EMPTY: {
    label: 'No entries',
    meaning:
      'This organisation has no audit entries at all, so there is nothing to attest to. This is not a ' +
      'statement that the trail is intact.',
    assuring: false,
  },
  UNVERIFIABLE: {
    label: 'Not verifiable',
    meaning:
      'Audit entries exist but some or all carry no hash, so there is nothing to check them against. This ' +
      'is not a statement that the trail is intact.',
    assuring: false,
  },
};

/**
 * How much of the trail the verdict actually covers.
 *
 * PURE. An INTACT verdict over a trail that is only partly hashed would be
 * read as covering the whole history, so the coverage is stated beside the
 * verdict whenever any entry is unhashed — never folded into it.
 */
export function coverageSentence(r: AttestationReport): string | null {
  if (r.totalEntries === 0) return null;
  if (r.unhashedEntries === 0) {
    return `All ${r.totalEntries.toLocaleString()} entries are hashed, so the verdict covers the whole trail.`;
  }
  if (r.hashedEntries === 0) {
    return (
      `None of the ${r.totalEntries.toLocaleString()} entries carries a hash, so no part of this trail can be ` +
      'attested to.'
    );
  }
  return (
    `${r.hashedEntries.toLocaleString()} of ${r.totalEntries.toLocaleString()} entries are hashed. The verdict ` +
    `covers those; the remaining ${r.unhashedEntries.toLocaleString()} were written before the hash chain was ` +
    'applied and cannot honestly be attested to — computing hashes for them after the fact would prove nothing ' +
    'about the period they cover.'
  );
}

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-400)' };
const box: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 18,
};
const verdictChip = (assuring: boolean, known: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
  padding: '4px 11px', borderRadius: 999,
  border: '1px solid var(--border)',
  ...(assuring
    ? { color: 'var(--success)', background: 'var(--success-muted)' }
    : known
      ? { color: 'var(--warning)', background: 'var(--warning-muted)' }
      : { color: 'var(--text-300)', background: 'var(--bg-050)' }),
});

type State =
  | { k: 'idle' }
  | { k: 'running' }
  | { k: 'done'; report: AttestationReport }
  | { k: 'failed'; message: string; forbidden: boolean };

/** One counted fact of the report. */
function Fact({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--text-400)', fontWeight: 600 }}>{term}</dt>
      <dd style={{ margin: 0, color: 'var(--text-200)' }}>{value}</dd>
    </>
  );
}

function Result({ report, onSave }: { report: AttestationReport; onSave: () => void }) {
  const known = Object.prototype.hasOwnProperty.call(ATTESTATION_VERDICT, report.attestation);
  const v = ATTESTATION_VERDICT[report.attestation] ?? {
    label: report.attestation,
    meaning: 'The platform returned a verdict this screen does not recognise, so nothing is claimed about it.',
    assuring: false,
  };
  const coverage = coverageSentence(report);
  return (
    <div data-testid="attestation-result" data-verdict={report.attestation}>
      <div style={verdictChip(v.assuring, known)}>
        {v.assuring ? I.shieldCheck : I.shieldAlert} Audit trail: {v.label}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.55, margin: '9px 0 0' }}>{v.meaning}</p>
      {coverage && (
        <p
          style={{ fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.55, margin: '7px 0 0' }}
          data-testid="attestation-coverage"
        >
          {coverage}
        </p>
      )}
      {/* The server's own sentence for an unverifiable trail, when it sent one. */}
      {report.unverifiableReason && (
        <p style={{ ...muted, margin: '7px 0 0', lineHeight: 1.5 }}>{report.unverifiableReason}</p>
      )}

      <dl
        style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px',
          fontSize: 12, margin: '14px 0 0',
        }}
      >
        <Fact term="Entries" value={report.totalEntries.toLocaleString()} />
        <Fact term="Hashed" value={report.hashedEntries.toLocaleString()} />
        <Fact term="Unhashed" value={report.unhashedEntries.toLocaleString()} />
        <Fact term="Broken links" value={report.brokenLinks.toLocaleString()} />
        {report.windowStart && report.windowEnd ? (
          <Fact
            term="Period"
            value={`${new Date(report.windowStart).toLocaleDateString()} to ${new Date(report.windowEnd).toLocaleDateString()}`}
          />
        ) : null}
        <Fact term="Signature" value={`${report.signature.algorithm} · key ${report.signature.keyId}`} />
      </dl>

      {report.brokenLinkSamples.length > 0 && (
        <div style={{ marginTop: 14 }} data-testid="attestation-broken">
          <div className="ro-rep-eyebrow">Entries whose link does not recompute</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-200)' }}>
            {report.brokenLinkSamples.map((s) => (
              <li key={s.id}>
                sequence {s.sequenceNumber} — entry {s.id}
              </li>
            ))}
          </ul>
          {report.brokenLinks > report.brokenLinkSamples.length && (
            <p style={{ ...muted, marginTop: 6 }}>
              {report.brokenLinkSamples.length} of {report.brokenLinks.toLocaleString()} shown. The saved file
              carries the same samples; the full set is in the audit records themselves.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" onClick={onSave}>
          {I.download} Save signed report
        </button>
      </div>
      <p style={{ ...muted, marginTop: 8, lineHeight: 1.5 }}>
        The saved file carries a platform seal over every field but the seal itself — an HMAC the platform
        holds the key to, so it is verified by the platform operator on request, not independently by a
        recipient. Each pull is meant to leave a record on the audit trail naming who asked and the verdict
        returned; this screen cannot confirm that the record was written, so check the audit trail itself if
        the pull has to be evidenced.
      </p>
    </div>
  );
}

/**
 * The attestation panel, on the surface where an inspector's other reports are.
 *
 * Not run on mount: it walks the whole chain and records an audit row for every
 * pull, so it is an action a reader takes, not a side effect of opening a page.
 *
 * `canRun` is the catalog's reader verdict for this member; the control itself
 * is gated on the SERVER-DERIVED attestation permission, which is narrower. A
 * member without it is TOLD rather than offered a control the server will
 * refuse — the same rule the eight reports beside this one follow, and the
 * reason complianceReports.test.tsx asserts no control matching /^Run/ appears
 * for a reader.
 */
export function AuditAttestation({ canRun }: { canRun: boolean }) {
  /* WHO SEES THE CONTROL (coverage review C-24, closed 2026-10-12).
     This used to be `const mayAttest = canRun` — the catalog's READER verdict:
     owners, admins, managers, approvers and platform administrators
     (AUDIT_REPORT_READERS). The attestation route is narrower: admin and owner
     only. So a manager was offered this control and got a 403 after the click.
     The comment that stood here said the client could not close the gap
     correctly on its own, and that was right: shared/constants/permissions.ts
     states the rule — the server derives a permission from the same set its
     guard reads and "the client mirrors no role list", because mirroring one is
     how a viewer came to be offered four controls the server refused. Neither
     GOVERNED_WRITE_PERMISSION nor REPORT_FINALIZE_PERMISSION (owner/admin/
     manager) matches admin|owner, so there was no permission to read.
     There is now: AUDIT_ATTEST_PERMISSION, derived in
     `sessionPermissions` from AUDIT_ATTEST_ROLES — the same list
     routes/tenant-export.ts admits. Reading the audit trail and ATTESTING to it
     are different acts and the server always treated them so; the client now
     does too.
     BOTH are required: `canRun` keeps this screen consistent with the eight
     reports beside it (a reader is told, not offered), and the permission is the
     act's own gate. An older session with no `permissions` array offers the
     control, as the two precedents do — the server still refuses, and
     withholding a writer's control on a guess is the worse failure. */
  const authUser = useAuthUser();
  const mayAttest = canRun && canAttestAuditTrail(authUser);
  const [state, setState] = useState<State>({ k: 'idle' });
  const alive = useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async () => {
    setState({ k: 'running' });
    const res = await apiCall<AttestationReport>('GET', '/api/tenant-export/attestation');
    if (!alive.current) return;
    if (!res.ok || !res.body) {
      setState({
        k: 'failed',
        forbidden: res.status === 403,
        message: apiErrorText(res, 'The attestation could not be produced.'),
      });
      return;
    }
    setState({ k: 'done', report: res.body });
  }, []);

  const save = useCallback(() => {
    if (state.k !== 'done') return;
    const name = `${safeFileName(state.report.organization.slug || 'organization', 'organization')}_audit-attestation.json`;
    downloadBlob(name, new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' }));
  }, [state]);

  return (
    <section style={box} aria-label="Audit trail attestation">
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-100)', margin: 0 }}>
        Audit trail attestation
      </h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.55, margin: '6px 0 0' }}>
        Walks this organisation's <code>audit_events</code> store in sequence and checks that each entry names
        the hash of the entry before it, reporting any link out of step. It compares the recorded hashes; it
        does not re-derive a hash from each entry's contents, so it evidences the chain's continuity rather
        than the contents of any single entry. The governed-action store is covered separately by the audit
        trail integrity report above. Requires an organisation administrator or owner.
      </p>

      {!mayAttest && (
        <p style={{ ...muted, marginTop: 10 }} data-testid="attestation-readers">
          {I.lock} Producing an attestation is recorded against your account and is available to organisation
          administrators and owners. Other roles can run the reports above.
        </p>
      )}
      {mayAttest && state.k === 'idle' && (
        <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => void run()}>
          {I.shieldCheck} Run attestation
        </button>
      )}
      {state.k === 'running' && (
        <p role="status" style={{ ...muted, marginTop: 12 }}>
          {I.clock} Walking the audit chain…
        </p>
      )}
      {state.k === 'failed' && (
        <div style={{ marginTop: 12 }}>
          {/* A refusal is not an outage: an administrator role is the gate, and
              saying "couldn't reach the server" would send the reader to the
              wrong remedy. */}
          {state.forbidden ? (
            <div role="alert" style={{ fontSize: 13, color: 'var(--text-200)' }}>
              {I.lock} {state.message}
            </div>
          ) : (
            <ErrorState
              title="Couldn’t produce the attestation"
              message={state.message}
              retry={() => void run()}
              testId="attestation-error"
            />
          )}
        </div>
      )}
      {state.k === 'done' && (
        <div style={{ marginTop: 14 }}>
          <Result report={state.report} onSave={save} />
          <button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={() => void run()}>
            Attest again
          </button>
        </div>
      )}
    </section>
  );
}
