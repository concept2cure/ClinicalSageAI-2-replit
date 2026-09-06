/**
 * Tamper-Proof Audit Log System
 *
 * FDA 21 CFR Part 11 Compliant - Cryptographic Integrity
 *
 * Implements immutable, cryptographically-verified audit logs using
 * hash chains (similar to blockchain). Each entry contains:
 *   1. Content hash of the audit data
 *   2. Hash of the previous entry (chain)
 *   3. Timestamp
 *   4. Digital signature (optional, for high-security deployments)
 *
 * Any tampering with historical records breaks the hash chain and
 * is immediately detectable through verification.
 *
 * Compliance Requirements Met:
 * - FDA 21 CFR Part 11.10(e): Audit trails
 * - FDA 21 CFR Part 11.10(k.2): Electronic signatures
 * - ICH E6(R2) 5.5.3: Data integrity
 *
 * @module TamperProofAuditLog
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11, ICH E6(R2), GAMP 5
 */

import { Pool } from 'pg';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { isIP } from 'node:net';

/**
 * `audit.tamper_proof_log.ip_address` is INET, and callers routinely supply a
 * SENTINEL STRING rather than an address:
 *
 *   server/routes/authoring.router.ts:520  `req.ip || req.connection?.remoteAddress || 'unknown'`
 *   server/routes/authoring.router.ts:641  `ip: 'legacy-call'` (internal, non-HTTP call)
 *
 * Postgres rejects those with 22P02 `invalid input syntax for type inet`, and
 * because every write here is best-effort behind a catch, the whole Part 11
 * tamper-proof entry was discarded — silently — for any audit event that had no
 * real client IP. The first sentinel is the general case: it fires whenever
 * `req.ip` is absent, not just on the legacy path.
 *
 * NULL is the honest encoding of "this action had no client address", and INET
 * accepts it. Anything that is not a real IP becomes NULL.
 *
 * Normalised ONCE, before the content hash is computed, and the same value is
 * used for the hash and the column — otherwise the verifier (which rebuilds the
 * hash from the stored row, ip_address included) would compare a hash over
 * 'unknown' against a stored NULL and report tampering on a row nobody touched.
 */
export function normalizeInetOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // X-Forwarded-For style lists arrive as "client, proxy1, proxy2".
  const first = value.split(',')[0]!.trim();
  return isIP(first) === 0 ? null : first;
}

// =============================================================================
// Types
// =============================================================================

export type AuditEventType =
  // Authentication Events
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'LOGIN_FAILED'
  | 'SESSION_EXPIRED'
  | 'PASSWORD_CHANGED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  // Data Events
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'RECORD_VIEWED'
  // Document Events
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_SIGNED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED'
  // Council Events
  | 'COUNCIL_SESSION_STARTED'
  | 'COUNCIL_SESSION_COMPLETED'
  | 'COUNCIL_SESSION_FAILED'
  | 'AGENT_EXECUTION_STARTED'
  | 'AGENT_EXECUTION_COMPLETED'
  | 'AGENT_EXECUTION_FAILED'
  // Verification Events
  | 'DATA_VERIFICATION_PASSED'
  | 'DATA_VERIFICATION_FAILED'
  | 'DATA_DISCREPANCY_DETECTED'
  // System Events
  | 'SYSTEM_STARTUP'
  | 'SYSTEM_SHUTDOWN'
  | 'CONFIG_CHANGED'
  | 'CIRCUIT_BREAKER_OPENED'
  | 'CIRCUIT_BREAKER_CLOSED'
  | 'LLM_FALLBACK_USED'
  // Security Events
  | 'PROMPT_INJECTION_BLOCKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS'
  | 'AUDIT_VERIFICATION_PASSED'
  | 'AUDIT_VERIFICATION_FAILED';

export interface AuditEntry {
  id: string;
  sequenceNumber: number;
  eventType: AuditEventType;
  eventTimestamp: Date;
  userId?: string;
  userName?: string;
  sessionId?: string;
  correlationId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  details: Record<string, unknown>;
  previousHash: string;
  contentHash: string;
  chainHash: string;
  signature?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerificationResult {
  valid: boolean;
  entriesVerified: number;
  firstInvalidEntry?: number;
  invalidReason?: string;
  verifiedAt: Date;
}

// =============================================================================
// Tamper-Proof Audit Log Service
// =============================================================================

/**
 * Advisory-lock key serializing appends to the Part 11 hash chain.
 *
 * A fixed, arbitrary constant inside int64 range: any writer taking the same
 * key serializes against the others, and it collides with no other advisory
 * lock in the codebase. Transaction-scoped (pg_advisory_xact_lock), so it is
 * released by COMMIT or ROLLBACK and a crashed writer cannot hold it.
 *
 * Held as a decimal STRING, not a BigInt, on purpose: node-postgres sends text
 * parameters and PostgreSQL coerces to bigint from pg_advisory_xact_lock's
 * signature — the exact form tests/db/part11-audit-store.dbtest.ts executes
 * against a real server. A BigInt would lean on the driver's serialization of
 * a type it has no dedicated handling for, which is a dependency this Part 11
 * path does not need.
 */
const AUDIT_CHAIN_LOCK_KEY = '8213001100000001';

export class TamperProofAuditLog {
  private pool: Pool;
  private readonly hmacSecret: string;
  private readonly GENESIS_HASH = '0'.repeat(64);

  constructor(pool: Pool) {
    this.pool = pool;

    // HMAC secret signs the tamper-evident hash chain. A predictable secret
    // would let anyone with the source forge or recompute the chain, defeating
    // the 21 CFR Part 11 integrity guarantee. Fail closed in production: a
    // missing secret is a fatal misconfiguration, not a warning to ignore.
    const secret = process.env.AUDIT_HMAC_SECRET || '';
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[FATAL] AUDIT_HMAC_SECRET is required in production. ' +
            'The tamper-proof audit chain cannot sign records without a ' +
            'cryptographically random secret. Refusing to start.'
        );
      }
      console.warn(
        '[SECURITY WARNING] AUDIT_HMAC_SECRET not set. Using a non-production ' +
          'development fallback — audit-chain integrity is NOT guaranteed. ' +
          'Set AUDIT_HMAC_SECRET before deploying.'
      );
      // Development-only fallback. Never reached in production (throws above).
      this.hmacSecret = 'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION';
    } else {
      this.hmacSecret = secret;
    }
  }

  /**
   * Verify the tamper-proof store is present and usable. Does NOT create it.
   *
   * ── Why this stopped creating the table ──────────────────────────────────
   * This method used to run CREATE SCHEMA / CREATE TABLE / CREATE TRIGGER on the
   * request pool. On a correctly least-privileged deployment that can never
   * succeed: the runtime connects as the non-superuser `app_service` role, and
   * the `audit` schema is granted append-only (SELECT, INSERT — see
   * SCHEMA_PRIVILEGE_OVERRIDES in scripts/db/provision-app-role.mjs) precisely
   * so a compromised application process cannot rewrite the audit trail. DDL
   * there is exactly what must be refused, and it was: `permission denied for
   * schema audit`, which the caller logged "(non-fatal)" and swallowed, falling
   * back to a console writer.
   *
   * The result, verified by booting the production build against a database
   * provisioned by install-fresh + deploy-migrate: the table did not exist, the
   * Part 11 store a QA unit audits first was silently absent, and the platform
   * reported itself healthy. A control that reports success while doing nothing
   * is worse than an absent one — so the table is now owned by
   * db/migrations/20260813_audit_tamper_proof_log.sql (applied by the OWNER via
   * deploy-migrate), and this method's only job is to say plainly whether it is
   * there.
   *
   * @throws when the store is absent or unwritable, with the remedy named.
   */
  async initialize(): Promise<void> {
    const presence = await this.pool.query(
      `SELECT to_regclass('audit.tamper_proof_log') IS NOT NULL AS present`,
    );

    if (!presence.rows[0]?.present) {
      throw new Error(
        '[AuditLog] audit.tamper_proof_log does not exist. The 21 CFR Part 11 ' +
          'tamper-proof store is owned by db/migrations/20260813_audit_tamper_proof_log.sql ' +
          'and applied by `node scripts/db/deploy-migrate.mjs`, which runs as the ' +
          'database OWNER. The runtime role is deliberately append-only on the audit ' +
          'schema and cannot create it. Run the deploy migration.',
      );
    }

    // Presence is not usability: the role also needs INSERT. Checking it here
    // means a misconfigured grant surfaces at startup with the remedy named,
    // rather than as a failed audit write during a regulated action.
    const writable = await this.pool.query(
      `SELECT current_user AS role,
              has_table_privilege(current_user, 'audit.tamper_proof_log', 'INSERT') AS can_insert`,
    );
    if (!writable.rows[0]?.can_insert) {
      throw new Error(
        `[AuditLog] role "${writable.rows[0]?.role}" cannot INSERT into ` +
          'audit.tamper_proof_log. Re-run scripts/db/provision-app-role.mjs (or ' +
          'deploy-migrate, which refreshes grants) to restore the append-only grant.',
      );
    }
  }

  /**
   * Write an audit entry with hash chain integrity
   */
  async log(
    eventType: AuditEventType,
    action: string,
    details: Record<string, unknown>,
    context?: {
      userId?: string;
      userName?: string;
      sessionId?: string;
      correlationId?: string;
      resourceType?: string;
      resourceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Serialize chain writes with a transaction-scoped advisory lock.
      //
      // This replaced `... ORDER BY sequence_number DESC LIMIT 1 FOR UPDATE`,
      // which was wrong twice over:
      //
      //  1. It did not serialize anything on an EMPTY table. `FOR UPDATE` locks
      //     the rows it returns, and on the first writes there are none — so two
      //     concurrent writers both read zero rows, both chained onto GENESIS,
      //     and the chain forked. Under RLS the same fork recurs per tenant,
      //     while the daily sweep verifies globally.
      //  2. Row locking requires the UPDATE privilege. The runtime role is
      //     granted SELECT + INSERT only on the audit schema — deliberately, so
      //     a compromised application process cannot rewrite the trail — so
      //     every attributed write failed with "permission denied for table
      //     tamper_proof_log" once the append-only grant was actually in force.
      //     The boot security self-test surfaced exactly that.
      //
      // An advisory lock has neither problem: it is independent of whether any
      // row exists, and it needs no table privilege. `pg_advisory_xact_lock`
      // releases at COMMIT/ROLLBACK, so a failed write cannot strand it.
      await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_CHAIN_LOCK_KEY]);

      // Get the previous entry's chain hash (for hash chain)
      const prevResult = await client.query(
        `SELECT chain_hash, sequence_number FROM audit.tamper_proof_log
         ORDER BY sequence_number DESC LIMIT 1`
      );

      const previousHash = prevResult.rows[0]?.chain_hash || this.GENESIS_HASH;
      const prevSequence = prevResult.rows[0]?.sequence_number || 0;

      // Create content hash (hash of the audit data)
      const entryId = uuidv4();
      const timestamp = new Date();
      // Resolved once so the hashed value and the stored column can never
      // disagree — see normalizeInetOrNull.
      const ipAddress = normalizeInetOrNull(context?.ipAddress);
      const contentHash = this.computeHash(
        TamperProofAuditLog.stringifyForHash(
          TamperProofAuditLog.buildContentData({
            eventType,
            action,
            details,
            timestamp,
            userId: context?.userId,
            userName: context?.userName,
            sessionId: context?.sessionId,
            correlationId: context?.correlationId,
            resourceType: context?.resourceType,
            resourceId: context?.resourceId,
            ipAddress,
            userAgent: context?.userAgent,
          }),
        ),
      );

      // Create chain hash (content hash + previous hash)
      const chainHash = this.computeChainHash(contentHash, previousHash);

      // Optional: Create HMAC signature for additional integrity
      const signature = this.computeSignature(chainHash);

      // Insert the entry
      await client.query(
        `INSERT INTO audit.tamper_proof_log (
          id, event_type, event_timestamp, user_id, user_name, session_id,
          correlation_id, resource_type, resource_id, action, details,
          previous_hash, content_hash, chain_hash, signature,
          ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          entryId,
          eventType,
          timestamp,
          context?.userId,
          context?.userName,
          context?.sessionId,
          context?.correlationId,
          context?.resourceType,
          context?.resourceId,
          action,
          JSON.stringify(details),
          previousHash,
          contentHash,
          chainHash,
          signature,
          ipAddress,
          context?.userAgent,
        ]
      );

      await client.query('COMMIT');

      return entryId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[AuditLog] Failed to write audit entry:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify the integrity of the entire audit chain
   */
  async verifyChain(startSequence?: number, endSequence?: number): Promise<VerificationResult> {
    const verifiedAt = new Date();

    let query = `
      SELECT * FROM audit.tamper_proof_log
      WHERE 1=1
    `;
    const params: (number | undefined)[] = [];

    if (startSequence !== undefined) {
      params.push(startSequence);
      query += ` AND sequence_number >= $${params.length}`;
    }
    if (endSequence !== undefined) {
      params.push(endSequence);
      query += ` AND sequence_number <= $${params.length}`;
    }

    query += ` ORDER BY sequence_number ASC`;

    const result = await this.pool.query(query, params);

    let expectedPreviousHash = this.GENESIS_HASH;
    let entriesVerified = 0;

    // If starting from a non-genesis entry, get the previous hash
    if (startSequence && startSequence > 1) {
      const prevResult = await this.pool.query(
        `SELECT chain_hash FROM audit.tamper_proof_log
         WHERE sequence_number = $1`,
        [startSequence - 1]
      );
      if (prevResult.rows[0]) {
        expectedPreviousHash = prevResult.rows[0].chain_hash;
      }
    }

    for (const row of result.rows) {
      entriesVerified++;

      // Verify previous hash matches
      if (row.previous_hash !== expectedPreviousHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Chain broken: previous_hash mismatch at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Recompute content hash. MUST mirror the write path byte-for-byte —
      // including ip_address / user_agent — or an untampered entry written with
      // client context would falsely fail (and, conversely, those fields would
      // not actually be covered by the integrity check). Shared via
      // buildContentData so the writer and verifier can never drift.
      //
      // The row's `details` arrives here re-keyed by Postgres (jsonb canonical
      // order), which is why the bytes are produced by stringifyForHash rather
      // than JSON.stringify — see canonicalize() for the failure it fixes.
      const contentData = TamperProofAuditLog.buildContentData({
        eventType: row.event_type,
        action: row.action,
        details: row.details,
        timestamp: row.event_timestamp,
        userId: row.user_id,
        userName: row.user_name,
        sessionId: row.session_id,
        correlationId: row.correlation_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
      });

      const expectedContentHash = this.computeHash(
        TamperProofAuditLog.stringifyForHash(contentData),
      );

      // Rows written before the canonicalization fix carry a hash over the
      // non-canonical bytes. Accept those too, so this fix does not itself
      // report every historical entry as tampered.
      const matchesContentHash =
        row.content_hash === expectedContentHash ||
        row.content_hash ===
          this.computeHash(TamperProofAuditLog.legacyStringifyForVerify(contentData));

      if (!matchesContentHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Content tampered: content_hash mismatch at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Verify chain hash
      const expectedChainHash = this.computeChainHash(row.content_hash, row.previous_hash);
      if (row.chain_hash !== expectedChainHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Chain hash invalid at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Verify signature if present
      if (row.signature) {
        const expectedSignature = this.computeSignature(row.chain_hash);
        if (!this.timingSafeCompare(row.signature, expectedSignature)) {
          return {
            valid: false,
            entriesVerified,
            firstInvalidEntry: row.sequence_number,
            invalidReason: `Signature invalid at sequence ${row.sequence_number}`,
            verifiedAt,
          };
        }
      }

      expectedPreviousHash = row.chain_hash;
    }

    // Log successful verification
    await this.log(
      'AUDIT_VERIFICATION_PASSED',
      'Audit chain verification completed successfully',
      {
        entriesVerified,
        startSequence,
        endSequence,
        verifiedAt: verifiedAt.toISOString(),
      },
      { correlationId: `verify-${Date.now()}` }
    );

    return {
      valid: true,
      entriesVerified,
      verifiedAt,
    };
  }

  /**
   * Get recent audit entries
   */
  async getRecentEntries(limit: number = 100): Promise<AuditEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit.tamper_proof_log
       ORDER BY sequence_number DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(this.rowToEntry);
  }

  /**
   * Search audit log by criteria
   */
  async search(criteria: {
    eventType?: AuditEventType;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    correlationId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<AuditEntry[]> {
    let query = `SELECT * FROM audit.tamper_proof_log WHERE 1=1`;
    const params: unknown[] = [];

    if (criteria.eventType) {
      params.push(criteria.eventType);
      query += ` AND event_type = $${params.length}`;
    }
    if (criteria.userId) {
      params.push(criteria.userId);
      query += ` AND user_id = $${params.length}`;
    }
    if (criteria.resourceType) {
      params.push(criteria.resourceType);
      query += ` AND resource_type = $${params.length}`;
    }
    if (criteria.resourceId) {
      params.push(criteria.resourceId);
      query += ` AND resource_id = $${params.length}`;
    }
    if (criteria.correlationId) {
      params.push(criteria.correlationId);
      query += ` AND correlation_id = $${params.length}`;
    }
    if (criteria.fromDate) {
      params.push(criteria.fromDate);
      query += ` AND event_timestamp >= $${params.length}`;
    }
    if (criteria.toDate) {
      params.push(criteria.toDate);
      query += ` AND event_timestamp <= $${params.length}`;
    }

    query += ` ORDER BY sequence_number DESC`;

    if (criteria.limit) {
      params.push(criteria.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToEntry);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Canonical, deterministic content object that the content hash is computed
   * over. The writer ({@link log}) and the verifier ({@link verifyChain}) BOTH
   * build it through this method so they cannot drift on which fields are
   * covered or in what key order — a prerequisite for 21 CFR Part 11 §11.10(e)
   * tamper-evidence.
   *
   * Two invariants matter:
   *   1. EVERY persisted field that defines the event is included (notably
   *      ip_address / user_agent, which the verifier previously omitted — so
   *      they were both (a) able to break verification of an untampered row and
   *      (b) NOT actually protected by the hash, i.e. silently tamperable).
   *   2. A nullish field is OMITTED (not serialized as null). This makes a value
   *      absent at write time (`undefined` in `context`) and the same value read
   *      back from Postgres as `null` produce byte-identical JSON, so the
   *      recomputed hash matches the stored one.
   */
  static buildContentData(input: {
    eventType: unknown;
    action: unknown;
    details: unknown;
    timestamp: Date | string;
    userId?: unknown;
    userName?: unknown;
    sessionId?: unknown;
    correlationId?: unknown;
    resourceType?: unknown;
    resourceId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
  }): Record<string, unknown> {
    const out: Record<string, unknown> = {
      eventType: input.eventType,
      action: input.action,
      details: input.details,
      timestamp:
        input.timestamp instanceof Date ? input.timestamp.toISOString() : input.timestamp,
    };
    // Fixed key order; nullish fields are dropped so write (undefined) and
    // read-back (null) serialize identically.
    const optional: Array<[string, unknown]> = [
      ['userId', input.userId],
      ['userName', input.userName],
      ['sessionId', input.sessionId],
      ['correlationId', input.correlationId],
      ['resourceType', input.resourceType],
      ['resourceId', input.resourceId],
      ['ipAddress', input.ipAddress],
      ['userAgent', input.userAgent],
    ];
    for (const [k, v] of optional) {
      if (v !== undefined && v !== null) out[k] = v;
    }
    return out;
  }

  /**
   * Serialize content data to the exact bytes that get hashed.
   *
   * WHY THIS IS NOT `JSON.stringify`
   * `details` is a jsonb column. Postgres does not store jsonb as the text it
   * received — it parses it and re-serializes object keys in its own canonical
   * order (shortest key first, then bytewise). So the object the writer holds in
   * memory and the object the verifier reads back are equal in VALUE but differ
   * in KEY ORDER, and JSON.stringify is order-sensitive. Every entry whose
   * `details` had two or more keys not already in Postgres' order therefore
   * hashed one way on write and a different way on read, and verifyChain()
   * reported the untampered row as "Content tampered".
   *
   * That is not a cosmetic failure: audit_chain_integrity is a critical check in
   * the security self-test, so a correct, untampered chain failed it — and in
   * production that check blocks boot. Observed on a freshly provisioned
   * database whose chain contained exactly one entry, written by the verifier
   * itself ({entriesVerified, startSequence, endSequence, verifiedAt} — four
   * keys, insertion order ≠ jsonb order).
   *
   * The fix is to hash a representation that is invariant under key reordering:
   * recursively sort object keys before serializing. Arrays keep their order
   * (order is semantic there); scalars are untouched. Both the writer and the
   * verifier go through this one function, so the round trip through jsonb can
   * no longer change the bytes being hashed.
   *
   * `buildContentData`'s fixed top-level key order is kept rather than relied
   * upon — it is what makes the pre-fix format reproducible for
   * `legacyStringifyForVerify` below.
   */
  private static canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => TamperProofAuditLog.canonicalize(v));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) {
        // Drop nullish for the same reason buildContentData does: `undefined` at
        // write time and `null` read back from Postgres must serialize alike.
        if (src[key] !== undefined && src[key] !== null) {
          out[key] = TamperProofAuditLog.canonicalize(src[key]);
        }
      }
      return out;
    }
    return value;
  }

  /** The bytes hashed for an entry's content hash. Order-invariant. */
  static stringifyForHash(contentData: Record<string, unknown>): string {
    return JSON.stringify(TamperProofAuditLog.canonicalize(contentData));
  }

  /**
   * The pre-canonicalization serialization, retained ONLY so verifyChain() can
   * still validate rows written before this fix.
   *
   * Entries written by the old code hashed `JSON.stringify(contentData)` with
   * whatever key order the writer's object happened to have. For the subset
   * where that order already matched Postgres' jsonb order (single-key details,
   * or details that were already canonical) the stored hash is legitimate and
   * must keep verifying — otherwise this fix would itself report every historical
   * row as tampered, which is the same false alarm in the opposite direction.
   *
   * This weakens nothing: both forms are deterministic functions of the same
   * content, so an attacker who edits a persisted field still fails both.
   */
  private static legacyStringifyForVerify(contentData: Record<string, unknown>): string {
    return JSON.stringify(contentData);
  }

  private computeHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private computeChainHash(contentHash: string, previousHash: string): string {
    return createHash('sha256')
      .update(contentHash + previousHash)
      .digest('hex');
  }

  private computeSignature(chainHash: string): string {
    return createHmac('sha256', this.hmacSecret).update(chainHash).digest('hex');
  }

  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      sequenceNumber: Number(row.sequence_number),
      eventType: row.event_type as AuditEventType,
      eventTimestamp: row.event_timestamp as Date,
      userId: row.user_id as string | undefined,
      userName: row.user_name as string | undefined,
      sessionId: row.session_id as string | undefined,
      correlationId: row.correlation_id as string | undefined,
      resourceType: row.resource_type as string | undefined,
      resourceId: row.resource_id as string | undefined,
      action: row.action as string,
      details: row.details as Record<string, unknown>,
      previousHash: row.previous_hash as string,
      contentHash: row.content_hash as string,
      chainHash: row.chain_hash as string,
      signature: row.signature as string | undefined,
      ipAddress: row.ip_address as string | undefined,
      userAgent: row.user_agent as string | undefined,
    };
  }
}

// =============================================================================
// Global Instance
// =============================================================================

let auditLogInstance: TamperProofAuditLog | null = null;

export function getTamperProofAuditLog(pool: Pool): TamperProofAuditLog {
  if (!auditLogInstance) {
    auditLogInstance = new TamperProofAuditLog(pool);
  }
  return auditLogInstance;
}
