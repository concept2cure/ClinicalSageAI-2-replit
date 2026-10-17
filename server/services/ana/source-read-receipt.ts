/** Current-source checks for host-admitted legacy span history.
 * Exact extraction/actor checks are transient; the existing table does not persist them. */
import { createHash, randomUUID } from 'node:crypto';
import { getTenantScope } from '../../db/tenantStore.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';
import type { Queryable, CatalogDocumentRow } from '../vault/document-catalog.service.js';
import type { SourceAdmissionReceiptV2 } from '../../../shared/ana/source-admission-receipts.js';
import type { DeferredReadReceipt } from './read-receipts.js';

export interface AnaSourceReadSnapshot {
  organizationId: number; userId: number; programId: string;
  documentId: string; contentHash: string; extractedTextSha256: string;
  totalChars: number; span: { start: number; end: number };
  threadId?: string | null;
}
type ReceiptClient = Queryable & { release(error?: Error): void };
export interface SourceReadReceiptDependencies {
  connect(): Promise<ReceiptClient>;
  admitScope: typeof import('./source-read-scope.js').admitAnaSourceReadScope;
  loadDocument: typeof import('../vault/document-catalog-document.js').loadDocumentForAdmittedScope;
  holdActor: typeof import('../vault/document-catalog-admission.js').admitCatalogActor;
  appendAdmission?: typeof import('./source-admission-receipt-store.js').appendSourceAdmissionReceipt;
}
export interface SourceReadReceiptOptions { signal?: AbortSignal }
export interface SourceAdmissionWriteOutcome {
  checkpoint: 'host_budget_admitted'; receiptId: string; outcome: 'recorded' | 'already_recorded';
  legacyReceipt: 'recorded' | 'not_recorded_permission_denied';
}
interface ReceiptAdmission { text: string; admittedRole: string; }
const privateAdmissionIdentities = new WeakMap<DeferredReadReceipt, Readonly<{ admissionId: string; toolUseId: string }>>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const digest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export class SourceReadSnapshotError extends Error {
  readonly code = 'ANA_SOURCE_READ_CHANGED';
  constructor() {
    super('Current source access or the exact source text could not be verified. Read the current source again.');
    this.name = 'SourceReadSnapshotError';
  }
}
interface ReceiptRecovery {
  organizationId: number; actorId: number; documentId: string;
  receiptId?: string; legacyReceiptId?: string | number;
}
export class SourceReadCommitUnconfirmedError extends Error {
  readonly code = 'ANA_SOURCE_READ_COMMIT_UNCONFIRMED';
  readonly outcome = 'unconfirmed';
  readonly recovery: Readonly<ReceiptRecovery>;
  constructor(recovery: ReceiptRecovery) {
    super('The source read transaction could not be confirmed. Check its retained history before retrying.');
    this.name = 'SourceReadCommitUnconfirmedError';
    this.recovery = Object.freeze({ ...recovery });
  }
}
interface ReceiptTransactionState { began: boolean; commitAttempted: boolean; discardConnection?: Error }
function recoveryFor(r: DeferredReadReceipt, ids: Pick<ReceiptRecovery, 'receiptId' | 'legacyReceiptId'> = {}): ReceiptRecovery {
  return { organizationId: r.sourceSnapshot.organizationId, actorId: r.sourceSnapshot.userId,
    documentId: r.documentId, ...ids };
}
async function commitReceiptTransaction(q: ReceiptClient, state: ReceiptTransactionState, recovery: ReceiptRecovery): Promise<void> {
  state.commitAttempted = true;
  try { await q.query('COMMIT'); state.began = false; }
  catch {
    state.discardConnection = new SourceReadCommitUnconfirmedError(recovery);
    throw state.discardConnection;
  }
}
async function releaseReceiptTransaction(q: ReceiptClient, state: ReceiptTransactionState): Promise<void> {
  try {
    // Once COMMIT was sent, a subsequent ROLLBACK cannot establish whether it committed.
    if (state.began && !state.commitAttempted) {
      try { await q.query('ROLLBACK'); }
      catch (error) { state.discardConnection = error instanceof Error ? error : new Error('Source receipt rollback could not be confirmed'); }
    }
  } finally { q.release(state.discardConnection); }
}
function refuse(): never { throw new SourceReadSnapshotError(); }
function checkCancellation(opts: SourceReadReceiptOptions): void {
  if (opts.signal?.aborted) refuse();
}

/** No prompt/result fields can provide actor authority or source attestation. */
export function validAnaSourceSnapshot(s: AnaSourceReadSnapshot | undefined): s is AnaSourceReadSnapshot {
  return !!s && validSourceIdentity(s) && validSourceBounds(s) && validThreadId(s.threadId);
}
function validSourceIdentity(s: AnaSourceReadSnapshot): boolean {
  return positive(s.organizationId) && positive(s.userId)
    && typeof s.programId === 'string' && UUID.test(s.programId)
    && typeof s.documentId === 'string' && UUID.test(s.documentId)
    && typeof s.contentHash === 'string' && SHA.test(s.contentHash)
    && typeof s.extractedTextSha256 === 'string' && SHA.test(s.extractedTextSha256);
}
function validSourceBounds(s: AnaSourceReadSnapshot): boolean {
  return positive(s.totalChars) && !!s.span && Number.isSafeInteger(s.span.start)
    && Number.isSafeInteger(s.span.end) && s.span.start >= 0
    && s.span.end > s.span.start && s.span.end <= s.totalChars;
}
function validThreadId(id: unknown): boolean {
  return id === undefined || id === null || (typeof id === 'string' && id.length > 0 && id.length <= 2000);
}

function privateDeferralIdentity(r: DeferredReadReceipt, serverToolUseId?: string) {
  if (serverToolUseId === undefined) return privateAdmissionIdentities.get(r);
  if (typeof serverToolUseId !== 'string' || !serverToolUseId) refuse();
  return Object.freeze({ admissionId: randomUUID(), toolUseId: serverToolUseId });
}

/** A private synchronous snapshot. The caller's object cannot change a pending read. */
export function snapshotDeferredReadReceipt(r: DeferredReadReceipt, serverToolUseId?: string): DeferredReadReceipt {
  if (!validAnaSourceSnapshot(r.sourceSnapshot) || r.documentId !== r.sourceSnapshot.documentId
    || r.contentHash !== r.sourceSnapshot.contentHash || r.readBy !== r.sourceSnapshot.userId
    || r.span.start !== r.sourceSnapshot.span.start || r.span.end !== r.sourceSnapshot.span.end
    || typeof r.result !== 'string' || !r.result.length
    || (r.resultSha256 !== undefined && r.resultSha256 !== digest(r.result))) refuse();
  const span = Object.freeze({ start: r.span.start, end: r.span.end });
  const sourceSnapshot = Object.freeze({ ...r.sourceSnapshot, span: Object.freeze({ ...span }) });
  // Caller fields never mint identity. A new actual deferral generates its
  // own ID; a verification/retry preserves only privately registered origin.
  const identity = privateDeferralIdentity(r, serverToolUseId);
  const pinned = Object.freeze({ documentId: r.documentId, contentHash: r.contentHash, span,
    readBy: r.readBy, result: r.result, sourceSnapshot, resultSha256: digest(r.result),
    ...(identity ? { admissionId: identity.admissionId, toolUseId: identity.toolUseId } : {}) });
  if (identity) privateAdmissionIdentities.set(pinned, identity);
  return pinned;
}

async function defaultDependencies(): Promise<SourceReadReceiptDependencies> {
  const [db, svc, scope, actor] = await Promise.all([
    import('../../db.js'), import('../vault/document-catalog-document.js'), import('./source-read-scope.js'),
    import('../vault/document-catalog-admission.js'),
  ]);
  return { connect: () => db.pool.connect(), loadDocument: svc.loadDocumentForAdmittedScope,
    admitScope: (q, input) => scope.admitAnaSourceReadScope(q, input), holdActor: actor.admitCatalogActor };
}

function sourceMatches(doc: CatalogDocumentRow | null, s: AnaSourceReadSnapshot): doc is CatalogDocumentRow & { extractedText: string } {
  return !!doc && doc.id === s.documentId && doc.organizationId === s.organizationId
    && doc.programId.toLowerCase() === s.programId.toLowerCase()
    && doc.contentHash === s.contentHash && !!doc.catalog && doc.catalog.contentHash === doc.contentHash
    && doc.catalog.status !== 'extraction_failed' && doc.disposition !== 'remove_data' && doc.disposition !== 'supersede'
    && typeof doc.extractedText === 'string' && !!doc.extractedText.trim()
    && doc.extractedText.length === s.totalChars && digest(doc.extractedText) === s.extractedTextSha256.toLowerCase();
}

/** Same connection performs current actor policy and protected text reads.
 * Return is internal exact text, never a source-bearing refusal. */
async function inspectAnaSourceSnapshot(q: Queryable, snapshot: AnaSourceReadSnapshot,
  deps?: SourceReadReceiptDependencies): Promise<ReceiptAdmission> {
  if (!validAnaSourceSnapshot(snapshot)) refuse();
  const s = { ...snapshot, span: { ...snapshot.span } };
  const tenant = getTenantScope();
  if (!tenant || tenant.tenantId !== String(s.organizationId)) refuse();
  const d = deps ?? await defaultDependencies();
  await setTenantContextTx(q, s.organizationId, tenant.role);
  const scope = await d.admitScope(q, { organizationId: s.organizationId, userId: s.userId,
    projectRef: s.programId, requestedProgramId: s.programId });
  if (scope.organizationId !== s.organizationId || scope.userId !== s.userId
    || scope.programId?.toLowerCase() !== s.programId.toLowerCase()
    || !scope.accessibleProgramIds.some(id => id.toLowerCase() === s.programId.toLowerCase())) refuse();
  await setTenantContextTx(q, s.organizationId, scope.role);
  const doc = await d.loadDocument(s.documentId, s.organizationId,
    { includeText: true, executor: q, programId: s.programId, currentOnly: true });
  if (!sourceMatches(doc, s)) refuse();
  return { text: doc.extractedText.slice(s.span.start, s.span.end), admittedRole: scope.role };
}

export async function verifyAnaSourceSnapshot(q: Queryable, snapshot: AnaSourceReadSnapshot,
  deps?: SourceReadReceiptDependencies): Promise<string> {
  return (await inspectAnaSourceSnapshot(q, snapshot, deps)).text;
}

function payloadMatches(r: DeferredReadReceipt, text: string): void {
  if (r.resultSha256 !== digest(r.result)) refuse();
  let body: any;
  try { body = JSON.parse(r.result); } catch { refuse(); }
  const s = r.sourceSnapshot;
  if (!payloadIdentityMatches(body, s) || !payloadWindowMatches(body, s, text)) refuse();
}
function payloadIdentityMatches(body: any, s: AnaSourceReadSnapshot): boolean {
  return body?.ok === true && body.documentId === s.documentId && body.contentHash === s.contentHash
    && body.extractedTextSha256 === s.extractedTextSha256 && body.totalChars === s.totalChars;
}
function payloadWindowMatches(body: any, s: AnaSourceReadSnapshot, text: string): boolean {
  return body.window?.start === s.span.start && body.window?.end === s.span.end
    && body.window?.text === text && text.length === s.span.end - s.span.start;
}
function requireLegacyReceiptPersistence(saved: { rows: any[]; rowCount?: number | null }, s: AnaSourceReadSnapshot): string | number {
  const row = saved.rows[0];
  if (saved.rowCount !== 1 || saved.rows.length !== 1 || row.document_id !== s.documentId
    || row.content_hash !== s.contentHash || row.char_start !== s.span.start
    || row.char_end !== s.span.end || row.read_by !== s.userId || row.thread_id !== (s.threadId ?? null)
    || (typeof row.id !== 'string' && typeof row.id !== 'number')) {
    throw new Error('Legacy read receipt persistence could not be confirmed.');
  }
  return row.id;
}

async function verifyReceiptInsideReservation(q: Queryable, r: DeferredReadReceipt,
  d: SourceReadReceiptDependencies): Promise<ReceiptAdmission> {
  try {
    await d.holdActor(q, { organizationId: r.sourceSnapshot.organizationId,
      userId: r.sourceSnapshot.userId, programId: r.sourceSnapshot.programId }, { write: false, hold: true });
    const admission = await inspectAnaSourceSnapshot(q, r.sourceSnapshot, d);
    payloadMatches(r, admission.text);
    return admission;
  } catch {
    // Current actor/source verification did not establish admission. Keep
    // ordinary LOCK/INSERT/COMMIT policy or transport errors outside this phase.
    throw new SourceReadSnapshotError();
  }
}

/** Point-in-time handoff check. No connection survives into gateway egress. */
export async function verifyDeferredReadReceipt(receipt: DeferredReadReceipt,
  deps?: SourceReadReceiptDependencies, opts: SourceReadReceiptOptions = {}): Promise<void> {
  checkCancellation(opts);
  const r = snapshotDeferredReadReceipt(receipt);
  const d = deps ?? await defaultDependencies();
  checkCancellation(opts);
  const q = await d.connect(); const transaction: ReceiptTransactionState = { began: false, commitAttempted: false };
  try {
    checkCancellation(opts);
    await q.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'); transaction.began = true;
    checkCancellation(opts);
    const admission = await inspectAnaSourceSnapshot(q, r.sourceSnapshot, d);
    payloadMatches(r, admission.text);
    checkCancellation(opts);
    await commitReceiptTransaction(q, transaction, recoveryFor(r));
  } finally {
    await releaseReceiptTransaction(q, transaction);
  }
}

async function insertLegacyReadReceipt(q: Queryable, s: AnaSourceReadSnapshot): Promise<string | number> {
  const saved = await q.query(
    'INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by, thread_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, document_id, content_hash, char_start, char_end, read_by, thread_id',
    [s.documentId, s.contentHash, s.span.start, s.span.end, s.userId, s.threadId ?? null],
  );
  return requireLegacyReceiptPersistence(saved, s);
}

/** Both ledger paths reserve the same current source and read-only actor authority. */
async function reserveReadReceiptSource(q: Queryable, r: DeferredReadReceipt, d: SourceReadReceiptDependencies,
  opts: SourceReadReceiptOptions): Promise<ReceiptAdmission> {
  await q.query("SET LOCAL statement_timeout = '30s'");
  await lockDocumentDispositionProgram(q, r.sourceSnapshot.organizationId, r.sourceSnapshot.programId);
  await q.query('LOCK TABLE vault.document_catalog IN SHARE MODE');
  await q.query('LOCK TABLE vault.documents IN SHARE MODE');
  checkCancellation(opts);
  return verifyReceiptInsideReservation(q, r, d);
}

/** Existing columns retain legacy byte-bound host-admission history.
 * Fixed short reservations fence extraction/currentness through INSERT; no model awaits. */
export async function writeGuardedLegacyReadReceipt(receipt: DeferredReadReceipt,
  deps?: SourceReadReceiptDependencies, opts: SourceReadReceiptOptions = {}): Promise<void> {
  checkCancellation(opts);
  const r = snapshotDeferredReadReceipt(receipt);
  const d = deps ?? await defaultDependencies();
  checkCancellation(opts);
  const q = await d.connect(); const transaction: ReceiptTransactionState = { began: false, commitAttempted: false };
  try {
    checkCancellation(opts);
    await q.query('BEGIN ISOLATION LEVEL READ COMMITTED'); transaction.began = true;
    await reserveReadReceiptSource(q, r, d, opts);
    checkCancellation(opts);
    const legacyReceiptId = await insertLegacyReadReceipt(q, r.sourceSnapshot);
    checkCancellation(opts);
    await commitReceiptTransaction(q, transaction, recoveryFor(r, { legacyReceiptId }));
  } finally {
    await releaseReceiptTransaction(q, transaction);
  }
}


/** Only an actual denial of this optional legacy table INSERT is tolerated.
 * A function/schema/transport/integrity failure is not permission to declare V2 success. */
function legacyInsertPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; schema?: unknown; table?: unknown; message?: unknown };
  if (e.code !== '42501' || (e.schema !== undefined && e.schema !== 'vault') ||
      (e.table !== undefined && e.table !== 'document_read_receipts')) return false;
  return typeof e.message === 'string' && (
    /^permission denied for (?:table|relation) "?document_read_receipts"?$/i.test(e.message) ||
    /^new row violates row-level security policy for table "document_read_receipts"$/i.test(e.message)
  );
}
async function optionalLegacyReadReceipt(q: Queryable, s: AnaSourceReadSnapshot): Promise<SourceAdmissionWriteOutcome['legacyReceipt']> {
  await q.query('SAVEPOINT ana_optional_legacy_read_receipt');
  let outcome: SourceAdmissionWriteOutcome['legacyReceipt'] = 'recorded';
  try { await insertLegacyReadReceipt(q, s); }
  catch (error) {
    if (!legacyInsertPermissionDenied(error)) throw error;
    await q.query('ROLLBACK TO SAVEPOINT ana_optional_legacy_read_receipt');
    outcome = 'not_recorded_permission_denied';
  }
  await q.query('RELEASE SAVEPOINT ana_optional_legacy_read_receipt');
  return outcome;
}

async function descriptorForAdmission(r: DeferredReadReceipt, admission: ReceiptAdmission): Promise<SourceAdmissionReceiptV2> {
  const identity = privateAdmissionIdentities.get(r);
  if (!identity) throw new Error('A genuine server-deferred admission identity is required.');
  const { validateSourceAdmissionReceiptV2 } = await import('../../../shared/ana/source-admission-receipts.js');
  const s = r.sourceSnapshot;
  return validateSourceAdmissionReceiptV2({ version: 2, receiptId: identity.admissionId, checkpoint: 'host_budget_admitted',
    organizationId: s.organizationId, actorId: s.userId, admittedRole: admission.admittedRole, programId: s.programId, documentId: s.documentId,
    originalSha256: s.contentHash, extractionSha256: s.extractedTextSha256, totalChars: s.totalChars,
    ranges: [{ start: s.span.start, end: s.span.end, sha256: digest(admission.text) }], payloadSha256: r.resultSha256,
    toolUseId: identity.toolUseId, threadId: s.threadId ?? null });
}

async function appendAdmission(q: Queryable, descriptor: SourceAdmissionReceiptV2, d: SourceReadReceiptDependencies) {
  const append = d.appendAdmission ?? (await import('./source-admission-receipt-store.js')).appendSourceAdmissionReceipt;
  const result = await append(q, descriptor);
  if (result.receiptId !== descriptor.receiptId || (result.outcome !== 'recorded' && result.outcome !== 'already_recorded')) {
    throw new Error('Exact-source admission persistence could not be confirmed.');
  }
  return result;
}

/** Flagged metadata ledger; no gateway/provider request and no legacy coverage promotion. */
export async function writeGuardedSourceAdmissionReceipt(receipt: DeferredReadReceipt,
  deps?: SourceReadReceiptDependencies, opts: SourceReadReceiptOptions = {}): Promise<SourceAdmissionWriteOutcome> {
  checkCancellation(opts);
  const r = snapshotDeferredReadReceipt(receipt);
  if (!privateAdmissionIdentities.has(r)) throw new Error('A genuine server-deferred admission identity is required.');
  const d = deps ?? await defaultDependencies();
  checkCancellation(opts);
  const q = await d.connect(); const transaction: ReceiptTransactionState = { began: false, commitAttempted: false };
  try {
    checkCancellation(opts);
    await q.query('BEGIN ISOLATION LEVEL READ COMMITTED'); transaction.began = true;
    const admission = await reserveReadReceiptSource(q, r, d, opts);
    checkCancellation(opts);
    const descriptor = await descriptorForAdmission(r, admission);
    checkCancellation(opts);
    const result = await appendAdmission(q, descriptor, d);
    checkCancellation(opts);
    const legacyReceipt = await optionalLegacyReadReceipt(q, r.sourceSnapshot);
    checkCancellation(opts);
    await commitReceiptTransaction(q, transaction, recoveryFor(r, { receiptId: result.receiptId }));
    return { checkpoint: 'host_budget_admitted', ...result, legacyReceipt };
  } finally {
    await releaseReceiptTransaction(q, transaction);
  }
}

export function writeGuardedReadReceipt(receipt: DeferredReadReceipt,
  deps?: SourceReadReceiptDependencies, opts: SourceReadReceiptOptions = {}): Promise<void | SourceAdmissionWriteOutcome> {
  return process.env.ANA_DURABLE_SOURCE_READ_RECEIPTS === '1'
    ? writeGuardedSourceAdmissionReceipt(receipt, deps, opts) : writeGuardedLegacyReadReceipt(receipt, deps, opts);
}
