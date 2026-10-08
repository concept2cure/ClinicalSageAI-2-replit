/**
 * "Assemble a test package" on the Dispatch tab (F10, with F11 merged in;
 * docs/design/FILING_SPINE.md §7.2).
 *
 * POST /api/submissions/sequences/:seqId/assemble (server/routes/submissions.ts)
 * runs the real eCTD publisher over the sequence's canonical leaves and answers
 * what it built and what in those leaves would stop the package being
 * transmitted. It writes an ECTD_ASSEMBLE audit row and keeps no package: the
 * staged files are removed once the descriptor is read. It sends nothing to
 * any agency.
 *
 * Everything shown comes from the server's answer:
 *   • the transmit blockers, verbatim, one per line. The server checks only the
 *     placed leaves (assembledTransmitBlockers), so an empty list is never
 *     shown as ready to send: the dispatch gate on the same tab still applies;
 *   • what was materialized, skipped and left unresolved, as counts it sent;
 *   • a definite refusal (422 ECTD_ASSEMBLE_BLOCKED, 409, 403, …) in the
 *     server's own words, with no package claimed;
 *   • an outcome the client cannot judge (a 5xx, a dropped connection, an OK
 *     with no body) as unknown, never as "not assembled": the server may have
 *     built the package and written its audit row;
 *   • an audit entry the server could not persist, in its own words, on a
 *     success and on a refusal alike.
 * The request carries no agency identifiers, so the server names the
 * application and the applicant with dry-run placeholders
 * (package-identity.ts dryRunPackageIdentity); this control says so without
 * printing one, since the Dispatch tab never shows a placeholder as an
 * identifier (2026-10-08), and labels the hash as the test package's own.
 *
 * @module client/src/concept2cure/v2/surfaces/SequenceAssembleTestPackage
 */

import React from 'react';
import { I } from '../icons';
import { clause, mutateVerbatim } from './SubmissionSeqWorkspaces';

/** The route's success body (sanitized: no server paths). */
interface AssembleAnswer {
  ok?: boolean;
  sha256?: string;
  format?: string;
  sizeBytes?: number;
  materialized?: number;
  skipped?: unknown[];
  unresolvedLeaves?: unknown[];
  unfinalized?: number;
  transmitBlockers?: unknown[];
  auditTrail?: { persisted?: boolean; chained?: boolean; message?: string } | null;
}

type Run =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; answer: AssembleAnswer }
  | { phase: 'refused'; text: string; audit: string | null }
  | { phase: 'unknown'; text: string | null };

const count = (v: unknown): number => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The audit sentence, or null when the entry was persisted and chained. */
function auditLine(a: AssembleAnswer['auditTrail'], what = 'assembly'): string | null {
  if (a?.persisted === true && a.chained === true) return null;
  if (a?.persisted === true) return `The ${what} audit entry is not confirmed in retrievable history.`;
  if (a && typeof a.message === 'string' && a.message.trim()) return a.message;
  return `The server did not confirm that the ${what} audit entry was written.`;
}

/** The refusal's audit outcome, read from the refusal body the server sent.
 *  Only a blocked assembly (ECTD_ASSEMBLE_BLOCKED) is audited as a refusal; a
 *  role or validation refusal writes no such row, so nothing is said of one. */
function refusalAudit(body: unknown, code: string | undefined): string | null {
  const a = body && typeof body === 'object' ? (body as { auditTrail?: unknown }).auditTrail : undefined;
  if (a && typeof a === 'object') return auditLine(a as AssembleAnswer['auditTrail'], 'refusal');
  return code === 'ECTD_ASSEMBLE_BLOCKED' ? auditLine(null, 'refusal') : null;
}

function AssembleResult({ answer, sequenceNumber }: { answer: AssembleAnswer; sequenceNumber: string }) {
  const blockers = Array.isArray(answer.transmitBlockers)
    ? answer.transmitBlockers.filter((b): b is string => typeof b === 'string')
    : null;
  const audit = auditLine(answer.auditTrail);
  const facts = [
    `${plural(count(answer.materialized), 'leaf', 'leaves')} materialized`,
    `${count(answer.skipped)} skipped`,
    `${count(answer.unresolvedLeaves)} unresolved`,
    `${count(answer.unfinalized)} not approved`,
  ];
  /* Never the ok tone: a test package carries UNASSIGNED identifiers and the
     server checked only its leaves, so no answer here can mean ready to send. */
  const clear = blockers !== null && blockers.length === 0;
  return (
    <div className="sc-mt">
      <div className={clear ? 'sc-verdict' : 'sc-verdict tone-warn'} role="status">
        {clear ? I.info : I.alertTriangle} Test package for sequence {sequenceNumber} assembled and discarded. Nothing was
        sent.{' '}
        {blockers === null
          ? 'The server did not say what in its leaves would stop it being transmitted.'
          : clear
            ? 'The server found nothing in the placed leaves that would stop transmission. The package used placeholder agency identifiers, and the dispatch gate on this tab still applies.'
            : `The server found ${plural(blockers.length, 'thing', 'things')} in the placed leaves that would stop it being transmitted:`}
      </div>
      {blockers && blockers.length > 0 && (
        <ol className="sc-blockers">
          {blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
      )}
      <div className="scaf-note sc-mt">
        {facts.join(' · ')}
        {answer.format ? ` · ${answer.format}` : ''}
        {typeof answer.sizeBytes === 'number' ? ` · ${Math.max(1, Math.round(answer.sizeBytes / 1024))} KB` : ''}
        {answer.sha256 ? ` · test package SHA-256 ${answer.sha256.slice(0, 12)}…` : ''}
      </div>
      {audit && (
        <div className="sc-verdict tone-err sc-mt" role="status">
          {audit}
        </div>
      )}
    </div>
  );
}

export function SequenceAssembleTestPackage({ seq }: { seq: { id: number; sequenceNumber: string } }) {
  const [run, setRun] = React.useState<Run>({ phase: 'idle' });
  React.useEffect(() => setRun({ phase: 'idle' }), [seq.id]);

  const assemble = async () => {
    if (run.phase === 'running') return;
    setRun({ phase: 'running' });
    const r = await mutateVerbatim<AssembleAnswer>('POST', `/api/submissions/sequences/${seq.id}/assemble`, {});
    if (r.data && r.data.ok === true) setRun({ phase: 'done', answer: r.data });
    /* Only a definite refusal can say the package was not assembled. */
    else if (r.unconfirmed || !r.error) {
      // The server's words when it answered (a 5xx); none for a dropped connection.
      setRun({ phase: 'unknown', text: typeof r.status === 'number' && r.error ? r.error : null });
    } else setRun({ phase: 'refused', text: r.error, audit: refusalAudit(r.body, r.code) });
  };

  return (
    <div className="sc-mt">
      <div className="tl-spec-k sc-mb">Test package</div>
      <div className="scaf-note sc-mb">
        Assembles sequence {seq.sequenceNumber}&#39;s leaves into an eCTD package on the server, reports what in those
        leaves would stop it being transmitted, and discards it. Nothing is sent. The test package carries no agency
        identifiers: its application number and applicant are placeholders, not the ones on record.
      </div>
      <div className="cm-pushbar sc-mb">
        <button type="button" className="sc-trans-b" disabled={run.phase === 'running'} onClick={assemble}>
          {I.layers} {run.phase === 'running' ? 'Assembling the test package…' : 'Assemble a test package'}
        </button>
      </div>
      {run.phase === 'refused' && (
        <div className="sc-verdict tone-err" role="status">
          {I.alertTriangle} No test package was assembled — {clause(run.text)}.
          {run.audit && <div className="sc-mt">{run.audit}</div>}
        </div>
      )}
      {run.phase === 'unknown' && (
        <div className="sc-verdict tone-warn" role="status">
          {I.alertTriangle} Whether the test package was assembled could not be confirmed
          {run.text ? ` — ${clause(run.text)}` : ''}. Check the sequence&#39;s audit trail before assembling again.
        </div>
      )}
      {run.phase === 'done' && <AssembleResult answer={run.answer} sequenceNumber={seq.sequenceNumber} />}
    </div>
  );
}
