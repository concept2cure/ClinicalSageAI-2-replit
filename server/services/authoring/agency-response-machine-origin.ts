/** Preserve known machine origin using the existing response revision/action pair.
 * A deterministic import is not evidence that the original author was a model. */
import { hashPayload } from '../audit/chain';
import { agencyResponseDigest } from '../agency-responses/response-logic';
import { ANA_MACHINE_AUTHOR_ID, MACHINE_AUTHOR_IDS, WORKFLOW_IMPORT_AUTHOR_ID } from './revision-ledger';
import { clauseSpans } from '../clinical-regulatory-evidence/lineage-gate';
import { comparableText, MIN_MACHINE_CLAUSE_CHARS } from '../clinical-regulatory-evidence/machine-attribution';
import { WorkflowSourceImportError } from './workflow-source-import';
import type { Queryable } from './authoring-evidence';

interface Input {
  organizationId: number; questionId: number; eventId: string; questionRef: string; questionText: string;
  responseText: string; responseRevision: number;
}
type Row = Record<string, unknown>;
interface Revision { id: string; revision: number; text: string; digest: string }
interface Receipt { revisionId: string; revision: number; digest: string; actionId: string; auditId: string; machineAuthors: string[] }
const MAX_REVISIONS = 200;
const MAX_ACTIONS = 400;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const AUTHORSHIP = 'retained saved-section lineage; copying is not a human-origin or model-qualification assertion';
const refusal = (status: 409 | 503 = 409): never => {
  throw new WorkflowSourceImportError(status, 'AGENCY_SOURCE_ORIGIN_UNVERIFIED',
    'The retained response authorship receipts could not be verified. Reconcile the response history before creating or releasing another copy.');
};
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const keys = (value: Row, expected: string[]) => Object.keys(value).sort().join('|') === [...expected].sort().join('|');
const integer = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= 2147483647;
const matches = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value);

function machineAuthors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > Object.keys(MACHINE_AUTHOR_IDS).length || new Set(value).size !== value.length) return refusal();
  if (value.some(id => typeof id !== 'string' || !Object.hasOwn(MACHINE_AUTHOR_IDS, id))) return refusal();
  return value as string[];
}
function editorFrame(value: unknown, revision: number) {
  const row = object(value);
  if (!row || !keys(row, ['documentId', 'sectionId', 'sectionSha256', 'sectionUpdatedAt', 'sourceFingerprint',
    'sourceResponseRevision', 'sourceKind', 'machineAuthors', 'authorship'])) return refusal();
  if (!matches(row.documentId, UUID) || !matches(row.sectionId, UUID) || !matches(row.sectionSha256, HASH)
    || !matches(row.sourceFingerprint, HASH)) return refusal();
  if (typeof row.sectionUpdatedAt !== 'string' || !Number.isFinite(new Date(row.sectionUpdatedAt).getTime())
    || !integer(row.sourceResponseRevision) || row.sourceResponseRevision + 1 !== revision
    || row.sourceKind !== 'agency-response' || row.authorship !== AUTHORSHIP) return refusal();
  return { documentId: row.documentId, sectionId: row.sectionId, sectionSha256: row.sectionSha256,
    sectionUpdatedAt: row.sectionUpdatedAt, sourceFingerprint: row.sourceFingerprint,
    sourceResponseRevision: row.sourceResponseRevision, sourceKind: row.sourceKind,
    machineAuthors: machineAuthors(row.machineAuthors), authorship: row.authorship };
}

/** JSONB reorders keys. Rebuild this existing writer's exact JSON.stringify recipe. */
function responseFrame(value: unknown, input: Input) {
  const row = object(value);
  if (!row) return refusal();
  const hasEditor = Object.hasOwn(row, 'editorSource');
  if (!keys(row, ['communicationEventId', 'questionRef', 'responseRevision', 'responseDigest', ...(hasEditor ? ['editorSource'] : [])])) return refusal();
  if (row.communicationEventId !== input.eventId || row.questionRef !== input.questionRef
    || !integer(row.responseRevision, 1) || !matches(row.responseDigest, HASH)) return refusal();
  return { communicationEventId: row.communicationEventId, questionRef: row.questionRef,
    responseRevision: row.responseRevision, responseDigest: row.responseDigest,
    ...(hasEditor ? { editorSource: editorFrame(row.editorSource, row.responseRevision) } : {}) };
}
function verifyCurrentRevision(history: Map<number, Revision>, input: Input): void {
  const current = history.get(input.responseRevision);
  if (input.responseRevision === 0) {
    if (history.size !== 0 || input.responseText !== '') return refusal();
  } else if (!current || current.text !== input.responseText || history.size !== input.responseRevision) return refusal();
}
function revisions(rows: Row[], input: Input): Map<number, Revision> {
  if (rows.length > MAX_REVISIONS || input.responseRevision > MAX_REVISIONS) return refusal(503);
  const result = new Map<number, Revision>();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !integer(row.revision, 1) || row.revision > input.responseRevision
      || typeof row.response_text !== 'string' || row.response_text.length > 100000 || !matches(row.response_digest, HASH)) return refusal();
    if (result.has(row.revision) || agencyResponseDigest({ communicationEventId: input.eventId, questionRef: input.questionRef,
      questionText: input.questionText, responseText: row.response_text }) !== row.response_digest) return refusal();
    result.set(row.revision, { id: row.id, revision: row.revision, text: row.response_text, digest: row.response_digest });
  }
  verifyCurrentRevision(result, input);
  return result;
}
function verifyAuditPair(row: Row, frame: ReturnType<typeof responseFrame>, input: Input): void {
  if (row.domain !== 'correspondence' || row.surface !== 'communication-center' || row.command !== 'update'
    || row.audit_target !== `agency-question:${input.questionId}` || row.audit_action !== 'c2c.work.update') return refusal();
  if (typeof row.action_id !== 'string' || typeof row.audit_id !== 'string' || row.audit_row_id !== row.audit_id
    || row.ana_action_id !== row.action_id || row.audit_tenant !== input.organizationId
    || hashPayload(frame) !== row.payload_hash || !matches(row.sha256_chain, HASH)) return refusal();
}
function receipt(row: Row, history: Map<number, Revision>, input: Input): Receipt {
  const frame = responseFrame(row.payload, input);
  const revision = history.get(frame.responseRevision);
  if (!revision || revision.digest !== frame.responseDigest) return refusal();
  verifyAuditPair(row, frame, input);
  return { revisionId: revision.id, revision: revision.revision, digest: revision.digest,
    actionId: String(row.action_id), auditId: String(row.audit_id),
    machineAuthors: (frame.editorSource?.machineAuthors ?? []).filter(id => id !== WORKFLOW_IMPORT_AUTHOR_ID) };
}
function comparison(text: string): string {
  return comparableText(text).replace(/[.,;:!?](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}
function retainsMachine(current: string, original: string): boolean {
  const now = comparison(current);
  const before = comparison(original);
  if (before && now === before) return true;
  return clauseSpans(original).some(clause => {
    const text = comparison(clause.text);
    return text.length >= MIN_MACHINE_CLAUSE_CHARS && now.includes(text);
  });
}

export async function retainedAgencyResponseMachineOrigin(q: Queryable, input: Input) {
  const stored: { rows: Row[] } = await q.query(`SELECT id::text,revision,response_text,response_digest FROM agency_question_response_revisions
    WHERE organization_id=$1 AND question_id=$2 ORDER BY revision LIMIT 201`, [input.organizationId, input.questionId]);
  const history = revisions(stored.rows, input);
  const actions: { rows: Row[] } = await q.query(`SELECT a.id AS action_id,a.domain,a.surface,a.command,a.payload,a.audit_row_id::text,
      l.id::text AS audit_id,l.tenant_id AS audit_tenant,l.target AS audit_target,l.action AS audit_action,
      l.ana_action_id,l.payload_hash,l.sha256_chain
    FROM c2c_ana_actions a LEFT JOIN audit_logs l ON l.id::text=a.audit_row_id::text AND l.tenant_id=a.org_id
    WHERE a.org_id=$1 AND a.target=$2 AND a.state='executed'
      AND (a.payload ? 'responseRevision' OR a.payload ? 'editorSource')
    ORDER BY a.executed_at,a.id LIMIT 401`, [input.organizationId, `agency-question:${input.questionId}`]);
  if (actions.rows.length > MAX_ACTIONS) return refusal(503);
  const receipts = actions.rows.map(row => receipt(row, history, input));
  if (new Set(receipts.map(row => row.revision)).size !== receipts.length || receipts.length !== history.size) return refusal();
  const machine = receipts.some(row => row.machineAuthors.includes(ANA_MACHINE_AUTHOR_ID)
    && retainsMachine(input.responseText, history.get(row.revision)!.text));
  return { machine, receipts: receipts.sort((a, b) => a.revision - b.revision) };
}
