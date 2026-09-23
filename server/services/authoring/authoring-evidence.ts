/**
 * Authoring evidence writers — the Part 11 records every authoring mutation
 * produces, factored out of server/routes/authoring.router.ts (WM, 2026-09-21,
 * docs/design/ANA_DOCUMENT_CANVAS.md) so the document/section creators in
 * authoring-documents.ts can be called from the router AND from the AnA tool
 * without a second copy of the audit or revision writer.
 *
 * Three things moved here, byte-for-byte in what they write:
 *
 *   • writeAuthoringAuditTrail — was the router's `createAuditTrail(req, …)`.
 *     The request is replaced by an {@link AuthoringAuditContext} the router
 *     builds from the verified JWT (its `createAuditTrail` is now a one-line
 *     adapter) and the tool builds from its ToolContext. The statements, the
 *     pool-vs-transaction branching and the failure policy are unchanged.
 *   • createRevision — the hash-chained doc_revisions writer.
 *   • bindingColumnState — the three-valued c2c_document_id column probe.
 *
 * Everything takes its executor explicitly; nothing here imports the pool, so
 * a test harness that mocks the database for the router covers this module
 * through the router's own pool without a second mock.
 */

import crypto from 'crypto';
import { writeChainedAuditRow } from '../auditService';
import { recordAuditRow } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import {
  computeChainHash,
  sha256Hex,
  type RevisionOrigin,
} from './revision-ledger';

const logger = createScopedLogger('authoring-evidence');

// A minimal "thing that runs a query" — satisfied by both the shared Pool and a
// pooled client obtained via pool.connect(). Lifecycle mutations run all their
// writes on ONE such client inside a BEGIN/COMMIT so a mid-way failure ROLLs
// BACK rather than leaving partial state.
export type Queryable = { query: (text: string, params?: unknown[]) => Promise<any> };

/**
 * Who is acting, as the audit row records it, plus the pool the standalone
 * path compares its executor against. The router derives every field from the
 * verified principal (never a caller-supplied header); the AnA tool derives
 * them from its ToolContext, which has no request and therefore no IP, agent
 * or session — recorded as the router already records an absent one.
 */
export interface AuthoringAuditContext {
  tenantId: number;
  /** The verified principal id; undefined when the caller has none. */
  actorId: string | undefined;
  /** `x-user-email` as the router re-derives it; 'unknown' when absent. */
  actorEmail: string;
  /** `x-roles` as the router re-derives it; 'unknown' when absent. */
  actorRole: string;
  ipAddress: string;
  userAgent: string;
  /** The caller's session id, or a fresh one per audit row. */
  sessionId?: string;
  /** The shared pool: the executor is compared against it to pick the path. */
  pool: Queryable;
}

// Comprehensive audit logging for 21 CFR Part 11 compliance
export interface CreateAuditTrailOptions {
  /**
   * Set when the CALLER writes its own, richer `writeChainedAuditRow` for this
   * act — freeze, e-sign and sign each do, with action-specific detail worth
   * keeping. Without this they would get TWO entries in the hash chain for one
   * act, which is not a cosmetic duplicate: the chain is the tamper-evidence,
   * and a reader counting governed events would double-count exactly the three
   * that matter most.
   *
   * One act, one entry. Anything that does not set this gets its chained entry
   * written here.
   */
  chainedRowWrittenByCaller?: true;
}

export interface AuthoringAuditEntry {
  docId: string | string[] | undefined;
  sectionId: string | string[] | undefined | null;
  operationType: string;
  beforeContent: string | null;
  afterContent: string | null;
  changeReason: string | null;
  metadata?: Record<string, unknown>;
  // When part of a lifecycle transaction, the caller passes its BEGIN'd client
  // so the audit row commits (or rolls back) atomically with the mutation it
  // records. Defaults to the pool for standalone callers.
  executor?: Queryable;
  auditOpts?: CreateAuditTrailOptions;
}

const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');

/**
 * The secondary index entry / chained ledger entry for an audit row — the
 * half of the writer that depends on WHICH executor the row was written on.
 * Split out of {@link writeAuthoringAuditTrail} only so each half stays under
 * the function-length rule; the two always run together.
 */
async function writeAuditIndexOrChain(
  ctx: AuthoringAuditContext,
  entry: AuthoringAuditEntry,
  executor: Queryable,
  hashes: { before: string | null; after: string | null; sessionId: string },
): Promise<void> {
  // Reflect into the central audit_logs table so the unified audit query
  // sees authoring events alongside every other governed mutation. The
  // dedicated authoring_audit_trail row remains the rich record (full
  // before/after content + content hashes); this is the index entry.
  //
  // ONLY on the standalone path (executor === pool). auditService.logAction
  // opens its OWN connection and runs its OWN BEGIN/COMMIT — and, on a write
  // failure, its OWN ROLLBACK. When enlisted in a CALLER's transaction that
  // self-managed transaction is a second, independent transaction: if it
  // commits, it commits an audit row for an action the caller may still roll
  // back; if it rolls back, it tears down the caller's in-flight transaction
  // out from under it. The authoritative record is the authoring_audit_trail
  // row written on the caller's client; it commits and rolls back atomically
  // with the mutation. The secondary index is skipped for transactional
  // mutations rather than written on a competing transaction that can
  // disagree with the outcome.
  const chainDetails = {
    docId: entry.docId,
    sectionId: entry.sectionId,
    operationType: entry.operationType,
    contentHashBefore: hashes.before,
    contentHashAfter: hashes.after,
    changeReason: entry.changeReason ?? null,
    actorRole: ctx.actorRole,
    sessionId: hashes.sessionId,
  };
  const action = `authoring.section.${entry.operationType}`;
  const resourceType = entry.sectionId ? 'authoring_section' : 'authoring_document';
  const resourceId = String(entry.sectionId ?? entry.docId ?? '');

  if (executor === ctx.pool) {
    /* WO-16C #133. Was `void auditService.logAction({…})`. `logAction` never
       rejects on a persistence failure, so the discarded AuditWriteResult was
       the only place a lost row was visible. The outcome is NOT plumbed out to
       callers: this row is the secondary INDEX entry — the authoring_audit_trail
       row is the §11.10(e) record and commits with the mutation. Losing THIS row
       degrades the unified audit_logs query; it does not lose the record of the
       change, so it is logged at error severity with what was actually lost. */
    const indexRow = await recordAuditRow({
      tenantId: ctx.tenantId,
      userId: ctx.actorEmail,
      action,
      resourceType,
      resourceId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: chainDetails,
    });
    if (!indexRow.persisted) {
      console.error(
        '[authoring] audit_logs index entry NOT written for ' +
          `${action} on ${resourceType} ${resourceId}; the authoritative ` +
          'authoring_audit_trail row exists, but this event is missing from the ' +
          'unified audit query',
      );
    }
  } else if (!entry.auditOpts?.chainedRowWrittenByCaller) {
    /* §11.10(e) — ENLISTED IN THE CALLER'S TRANSACTION.
     *
     * `writeChainedAuditRow` takes a client and issues plain statements on it,
     * which is why the freeze, e-sign and sign handlers reach for it — the
     * audit row lands or the whole mutation rolls back, and the two can never
     * disagree. Every transactional authoring act gets its chained entry here.
     *
     * Awaited, not fire-and-forget: an audit row that cannot be written must
     * take the mutation down with it (the caller rethrows on the transactional
     * path for exactly this reason). */
    await writeChainedAuditRow(executor, {
      tenantId: ctx.tenantId,
      userId: ctx.actorId,
      action,
      resourceType,
      resourceId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: chainDetails,
    });
  }
}

/**
 * Part 11 change record: operation, actor, before/after content, a SHA-256 of
 * each side, reason, IP, user agent, session — into authoring_audit_trail, plus
 * the index/chain entry. Was the router's `createAuditTrail`.
 */
export async function writeAuthoringAuditTrail(
  ctx: AuthoringAuditContext,
  entry: AuthoringAuditEntry,
): Promise<void> {
  const executor = entry.executor ?? ctx.pool;
  try {
    const sessionId = ctx.sessionId || crypto.randomUUID();
    // Calculate content hashes
    const hashBefore = entry.beforeContent ? sha256(entry.beforeContent) : null;
    const hashAfter = entry.afterContent ? sha256(entry.afterContent) : null;

    await executor.query(
      `INSERT INTO authoring_audit_trail
       (doc_id, section_id, operation_type, actor_email, actor_role,
        before_content, after_content, content_hash_before, content_hash_after,
        change_reason, metadata, ip_address, user_agent, session_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        entry.docId,
        entry.sectionId,
        entry.operationType,
        ctx.actorEmail,
        ctx.actorRole,
        entry.beforeContent,
        entry.afterContent,
        hashBefore,
        hashAfter,
        entry.changeReason,
        entry.metadata ?? {},
        ctx.ipAddress,
        ctx.userAgent,
        sessionId,
        ctx.tenantId,
      ],
    );

    logger.info(`Audit trail created: ${entry.operationType} on doc ${entry.docId} by ${ctx.actorEmail}`);

    await writeAuditIndexOrChain(ctx, entry, executor, {
      before: hashBefore,
      after: hashAfter,
      sessionId,
    });
  } catch (error) {
    // Audit logging must never fail silently in production
    console.error('CRITICAL: Failed to create audit trail:', error);
    // Enlisted in a caller transaction: the audit row and the mutation it
    // records must land together or not at all. A swallowed failure here would
    // let an un-audited change commit — so surface it and let the caller roll
    // back. Standalone callers keep the best-effort behavior (throw only in
    // production) so an audit-log outage cannot break an otherwise-valid action.
    if (executor !== ctx.pool) throw error;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Audit logging failed - operation aborted for compliance', { cause: error });
    }
  }
}

/**
 * Helper function to create revision automatically.
 *
 * LEDGER (see revision-ledger.ts and the 20260817_doc_revisions_immutable_ledger
 * migration): every revision row is a link in a per-section hash chain —
 * content hash, link to the previous revision's chain head, the write path
 * that produced it (`origin`), and a frozen snapshot of the citation inputs in
 * force at the moment of the save. UPDATE/DELETE on the table are refused by a
 * database trigger, so the history this writes is append-only by engine rule.
 * Transactional callers hold the section row lock from their own UPDATE, which
 * serializes same-section chain extension.
 *
 * `contributors`: non-human authors whose insertions this save incorporated.
 * Accepting a tracked suggestion strips the mark that named its author, so by
 * the time the content reaches here nothing in it says a model drafted the
 * words. Empty for an ordinary edit.
 */
export interface CreateRevisionArgs {
  sectionId: string | string[] | undefined;
  content: string;
  updatedBy: string;
  tenantId: number;
  origin?: RevisionOrigin;
  contributors?: { id: string; name: string }[];
}

export async function createRevision(executor: Queryable, args: CreateRevisionArgs): Promise<string> {
  const { sectionId, content, updatedBy, tenantId, origin = 'human-edit', contributors = [] } = args;
  try {
    const revisionId = crypto.randomUUID();

    // The chain head this revision extends — the section's latest revision.
    const prev = await executor.query(
      `SELECT chain_sha256 FROM doc_revisions
        WHERE section_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [sectionId, tenantId],
    );
    const prevChain: string | null = prev.rows[0]?.chain_sha256 ?? null;
    const contentSha = sha256Hex(content ?? '');
    const chain = computeChainHash({
      prevChain,
      contentSha256: contentSha,
      createdBy: updatedBy,
      origin,
    });

    // The documentary inputs this state was drafted against: the section's
    // citation set with the checksums recorded at cite time, frozen with the
    // revision. Lineage of every input, per revision, immutable.
    const cites = await executor.query(
      `SELECT id AS citation_id, source, reference_id, payload_sha256, created_at
         FROM authoring_citations
        WHERE section_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC`,
      [sectionId, tenantId],
    );
    const inputs = JSON.stringify({
      citations: cites.rows,
      ...(contributors.length ? { contributors } : {}),
    });

    await executor.query(
      `INSERT INTO doc_revisions
         (id, section_id, content, created_by, created_at, tenant_id,
          content_sha256, prev_chain_sha256, chain_sha256, origin, inputs)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)`,
      [revisionId, sectionId, content, updatedBy, tenantId, contentSha, prevChain, chain, origin, inputs],
    );
    return revisionId;
  } catch (error) {
    console.error('Error creating revision:', error);
    throw error;
  }
}

/**
 * Does `authoring_documents` carry `c2c_document_id` in THIS deployment?
 *
 * The column is added by migrations/20260728_authoring_document_governed_binding.sql,
 * whose DO-block is guarded on `c2c_documents` existing — a table from another
 * bundle. So a deployment carrying the authoring bundle without the c2c one
 * genuinely does not have the column, and every reference to it has to cope.
 *
 * Three values, not two. 'unknown' is the one that matters: a check that could
 * not RUN has not established that the column is missing, and a caller that
 * collapses it into 'absent' goes on to report a deployment fact it never
 * observed.
 */
export type BindingColumnState = 'present' | 'absent' | 'unknown';

export async function bindingColumnState(executor: Queryable): Promise<BindingColumnState> {
  return columnState(executor, 'c2c_document_id');
}

/**
 * The same three-valued probe for any authoring_documents column. The column
 * name is inlined (it is a code constant, never input — asserted below) so the
 * statement text names the column it asks about, which is what the mocked
 * router harnesses key on.
 */
export async function columnState(executor: Queryable, column: string): Promise<BindingColumnState> {
  if (!/^[a-z_][a-z0-9_]*$/.test(column)) throw new Error(`columnState: not a column name: ${column}`);
  try {
    const r = await executor.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                         AND table_name = 'authoring_documents'
                         AND column_name = '${column}') AS ok`,
    );
    return r.rows[0]?.ok === true ? 'present' : 'absent';
  } catch {
    return 'unknown';
  }
}
