/**
 * The audit_events hash chain, walked once, the way its trigger wrote it.
 *
 * Split out of chainIntegrityMonitor.ts (`summarizeChainLinkage`) and completed
 * with the content re-derivation routes/part11-compliance.ts already had, so
 * that every reader of this chain gives the same verdict for the same rows.
 *
 * ── What already existed, and why it had to become one walk ─────────────────
 * Five places walked this chain, in four strengths:
 *
 *   routes/part11-compliance.ts               pointer + content
 *   services/audit/signedAuditExport.ts       pointer only
 *   services/audit/chainIntegrityMonitor.ts   pointer only
 *   jobs/auditChainOrganizationVerdicts.ts    pointer only (the monitor's walk)
 *   services/tenant-export/attestation-report.service.ts   pointer only
 *
 * So the audit trail's banner, the signed export's manifest, the compliance
 * report's attestation, the monitor's alert and the tenant's signed attestation
 * could each say something different about one chain. The pointer-only walks
 * passed a row whose fields were altered with its stored hashes left alone, and
 * every copy shared one hole: a row whose `previous_hash` is NULL although its
 * predecessor WAS hashed fell through the break condition as a verified link —
 * so deleting an entry and blanking its successor's pointer hid the removal.
 * Fixing that in one copy left it in the others, which is what duplication
 * costs here.
 *
 * ── One preimage, rendered by the database ──────────────────────────────────
 * The trigger (db/migrations/20260222_audit_events_hash_chain.sql) hashes
 * `NEW.timestamp::text`. `audit_events.timestamp` is `timestamp` WITHOUT time
 * zone, written by now() with microseconds, and node-postgres hands this
 * process a JS Date that has already lost them. No JavaScript rendering can
 * reproduce the hashed bytes (AUD-02, 2026-11-10: every trigger-written row
 * read as a broken link). So the walk takes the timestamp as the database's
 * own text — {@link AUDIT_EVENT_CHAIN_COLUMNS} selects it — and refuses rows
 * selected without it rather than guess.
 *
 * ── Both halves, always ─────────────────────────────────────────────────────
 * CONTENT (re-derivation) catches a row whose covered fields were altered. An
 *   attacker who also recomputes that row's hash makes it self-consistent, so
 *   content alone is not enough.
 * POINTER (contiguity) catches that rewrite: the successor still points at the
 *   old hash. Pointer alone never looks at content.
 *
 * ── What the hash does NOT cover ────────────────────────────────────────────
 * The trigger's recipe commits to nine fields ({@link AUDIT_EVENT_HASH_FIELDS}).
 * It does not include `old_values`, `new_values`, `changed_fields`, `metadata`,
 * `comments`, `user_role`, `ip_address` or `session_id`. An entry whose before
 * and after values were edited in place still re-derives. Every sentence this
 * module lets a caller print says so ({@link describeAuditEventChain}); a
 * verdict that reads as covering the whole row would be a claim stronger than
 * its check.
 *
 * Pure: no database, no clock, no IO. Callers run the query and pass the rows.
 *
 * @module server/services/audit/audit-event-chain
 */
import crypto from 'crypto';

/**
 * The select list every reader of this chain uses.
 *
 * `timestamp_text` is the timestamp as Postgres renders it, which is the only
 * form that equals what the trigger hashed. It is rendered in the reader's
 * session, so a session with a non-default DateStyle would render it
 * differently from the writer's; this application never sets one.
 */
export const AUDIT_EVENT_CHAIN_COLUMNS = `id, organization_id, sequence_number, event_type, entity_type,
              entity_id, user_id, user_name, "timestamp"::text AS timestamp_text, reason,
              record_hash, previous_hash`;

/** The order a chain is walked in: one chain per organisation, by sequence. */
export const AUDIT_EVENT_CHAIN_ORDER = `organization_id, sequence_number ASC`;

/**
 * The two statements that read this chain, whole. Every reader runs one of
 * them as it stands, so no reader builds SQL text: the only things joined here
 * are the two constants above, and the organisation is a bind parameter ($1).
 * (`ci:sql-interpolation` refuses a value spliced into a query's text, and a
 * select list spliced in at each call site looks the same to it.)
 */
export const AUDIT_EVENT_CHAIN_FOR_ORGANIZATION_SQL =
  `SELECT ${AUDIT_EVENT_CHAIN_COLUMNS} FROM audit_events WHERE organization_id = $1 ORDER BY ${AUDIT_EVENT_CHAIN_ORDER}`;

/** Every organisation's chain, for the platform-wide monitor. It takes no parameter. */
export const AUDIT_EVENT_CHAIN_ALL_ORGANIZATIONS_SQL =
  `SELECT ${AUDIT_EVENT_CHAIN_COLUMNS} FROM audit_events ORDER BY ${AUDIT_EVENT_CHAIN_ORDER}`;

/**
 * The fields the trigger's hash commits to, in its order. Pinned to the
 * trigger's SQL by __tests__/audit-event-chain.test.ts.
 */
export const AUDIT_EVENT_HASH_FIELDS = Object.freeze([
  'sequence_number',
  'event_type',
  'entity_type',
  'entity_id',
  'user_id',
  'user_name',
  'timestamp',
  'reason',
  'previous_hash',
] as const);

/** One audit_events row as {@link AUDIT_EVENT_CHAIN_COLUMNS} selects it. */
export interface AuditEventChainRow {
  id: number | string;
  organization_id: number;
  sequence_number: number | null;
  event_type: string | null;
  entity_type: string | null;
  entity_id: number | string | null;
  user_id: number | string | null;
  user_name: string | null;
  /** `"timestamp"::text` — the database's rendering, never a JS Date's. */
  timestamp_text: string | null;
  reason: string | null;
  /**
   * Nullable in the table and in practice: the trigger reached the applier on
   * 2026-09-10 with no backfill, and UPDATE is blocked by the immutability
   * trigger, so every row written before that deploy carries NULL permanently.
   */
  record_hash: string | null;
  previous_hash: string | null;
}

/** Why one row failed. `pointer` is a broken link; `content` is an altered row. */
export interface AuditEventChainBreak {
  id: number | string;
  sequenceNumber: number | null;
  organizationId: number;
  kind: 'pointer' | 'content';
  /** What the chain required: the predecessor's hash, or the re-derived hash. */
  expected: string;
  /** What the row carries. */
  actual: string;
}

/**
 * What a walk established. Every count is separate, because "could not be
 * checked" and "verified" may never be added together.
 */
export interface AuditEventChainWalk {
  rowsSeen: number;
  /** Rows carrying a record_hash: the only rows anything can be checked on. */
  hashedRows: number;
  /** Rows whose record_hash re-derives from the fields the hash covers. */
  verifiedRows: number;
  /** Rows carrying no record_hash. Not verifiable, never counted verified. */
  unhashedRows: number;
  /**
   * Rows whose previous_hash is empty although their predecessor WAS hashed.
   * The trigger never writes that, so the row cannot be placed in the chain.
   * It is a link that could not be checked, not a mismatch that was found, so
   * it keeps the chain off "intact" without being called a break.
   */
  unlinkedRows: number;
  breaks: AuditEventChainBreak[];
}

/** A value as the trigger's `COALESCE(x::text, '')` renders it. */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * The exact bytes the trigger hashed for this row:
 * `seq|event_type|entity_type|entity_id|user_id|user_name|timestamp::text|reason|COALESCE(prev,'GENESIS')`.
 */
export function auditEventPreimage(row: AuditEventChainRow): string {
  if (row.timestamp_text === undefined) {
    // A caller bug, not a finding: the row was selected without the database's
    // own timestamp text, so nothing this function returned could equal what
    // the trigger hashed. Refuse, rather than report an intact row as altered.
    throw new Error(
      'audit-event chain rows must be selected with AUDIT_EVENT_CHAIN_COLUMNS (timestamp_text is missing)',
    );
  }
  return (
    text(row.sequence_number) + '|' +
    text(row.event_type) + '|' +
    text(row.entity_type) + '|' +
    text(row.entity_id) + '|' +
    text(row.user_id) + '|' +
    text(row.user_name) + '|' +
    text(row.timestamp_text) + '|' +
    text(row.reason) + '|' +
    (row.previous_hash ?? 'GENESIS')
  );
}

/** SHA-256, hex, over UTF-8: the trigger's `encode(sha256(convert_to(…,'UTF8')),'hex')`. */
export function auditEventRecordHash(row: AuditEventChainRow): string {
  return crypto.createHash('sha256').update(auditEventPreimage(row), 'utf8').digest('hex');
}

/**
 * Walk a chain. `rows` MUST be ordered by {@link AUDIT_EVENT_CHAIN_ORDER}.
 * Each organisation is its own chain (the trigger reads its predecessor
 * `WHERE organization_id = NEW.organization_id`), so an organisation's first
 * row is a genesis row and never a break in another's.
 *
 * An unhashed row cannot be a link, so it is counted and the predecessor hash
 * is CLEARED rather than carried forward: its successor's pointer cannot be
 * compared and is not accused. The successor's own content is still
 * re-derived, because that needs no predecessor.
 */
export function walkAuditEventChain(rows: readonly AuditEventChainRow[]): AuditEventChainWalk {
  const prevHashByOrg = new Map<number, string | null>();
  const walk: AuditEventChainWalk = {
    rowsSeen: rows.length,
    hashedRows: 0,
    verifiedRows: 0,
    unhashedRows: 0,
    unlinkedRows: 0,
    breaks: [],
  };

  for (const row of rows) {
    const org = row.organization_id;
    const expectedPrev = prevHashByOrg.get(org) ?? null;

    if (!row.record_hash) {
      walk.unhashedRows++;
      prevHashByOrg.set(org, null);
      continue;
    }
    walk.hashedRows++;

    // POINTER.
    if (expectedPrev !== null) {
      if (!row.previous_hash) {
        walk.unlinkedRows++;
      } else if (row.previous_hash !== expectedPrev) {
        walk.breaks.push({
          id: row.id,
          sequenceNumber: row.sequence_number,
          organizationId: org,
          kind: 'pointer',
          expected: expectedPrev,
          actual: row.previous_hash,
        });
      }
    }

    // CONTENT. Counted verified only when it re-derived: a row that failed
    // here is hashed, and is not verified.
    const rederived = auditEventRecordHash(row);
    if (rederived === row.record_hash) {
      walk.verifiedRows++;
    } else {
      walk.breaks.push({
        id: row.id,
        sequenceNumber: row.sequence_number,
        organizationId: org,
        kind: 'content',
        expected: rederived,
        actual: row.record_hash,
      });
    }

    prevHashByOrg.set(org, row.record_hash);
  }

  return walk;
}

/** The three verdicts a walk supports, in the precedence every reader uses. */
export type AuditEventChainVerdict = 'empty' | 'broken' | 'unverified' | 'intact';

/**
 * A positive finding outranks "cannot tell", and "cannot tell" outranks intact.
 * Only a chain in which EVERY row was hashed, placed and re-derived is intact.
 */
export function auditEventChainVerdict(walk: AuditEventChainWalk): AuditEventChainVerdict {
  if (walk.rowsSeen === 0) return 'empty';
  if (walk.breaks.length > 0) return 'broken';
  if (walk.unhashedRows > 0 || walk.unlinkedRows > 0) return 'unverified';
  return 'intact';
}

/**
 * Why a chain with no break is still not intact, as a clause for a manifest or
 * a job's status — the wording the signed export's manifest, the monitor and
 * the per-organisation verdict job already carried, kept so stored manifests
 * and the gates that read them say the same thing before and after the walk
 * became one. Null when nothing was left unchecked.
 *
 * {@link describeAuditEventChain} is the sentence for a person; this is the
 * record's own term for the same fact.
 */
export function auditEventChainGapReason(walk: AuditEventChainWalk): string | null {
  if (walk.rowsSeen === 0) return 'no entries: there is no chain to verify';
  if (walk.hashedRows === 0) {
    return 'no row carries a record_hash: the chain has never been hashed, so no link could be checked';
  }
  if (walk.unhashedRows > 0) {
    return `${walk.unhashedRows} of ${walk.rowsSeen} rows carry no record_hash; the links through them could not be checked`;
  }
  if (walk.unlinkedRows > 0) {
    return `${walk.unlinkedRows} of ${walk.rowsSeen} rows carry no previous_hash although their predecessor was hashed; those links could not be checked`;
  }
  return null;
}

/** What the hash covers, in a reader's words. Used by every sentence below. */
export const AUDIT_EVENT_HASH_COVERS_WORDS =
  'sequence, event, entity, user, timestamp, reason and predecessor hash';

/** What it does not, in a reader's words. */
export const AUDIT_EVENT_HASH_OMITS_WORDS =
  'The before and after values of a change are not part of the hash, so this does not show they are unaltered.';

/**
 * The sentence for entries that failed, by kind. An entry that does not match
 * its recorded hash was altered; one that does not follow its predecessor was
 * moved, removed around or re-chained. An inspector needs the difference. On
 * its own because the compliance report builds it from a snapshot's counts.
 */
export function describeAuditEventBreaks(content: number, pointer: number): string {
  const parts: string[] = [];
  if (content > 0) {
    parts.push(`${content} ${content === 1 ? 'entry does' : 'entries do'} not match the hash recorded when ${content === 1 ? 'it was' : 'they were'} written`);
  }
  if (pointer > 0) {
    parts.push(`${pointer} ${pointer === 1 ? 'entry does' : 'entries do'} not follow the entry before ${pointer === 1 ? 'it' : 'them'}`);
  }
  return `${parts.join('; ')}.`;
}

/**
 * The sentence for entries that name no predecessor although the entry before
 * them was hashed. On its own because the tenant attestation, which compares
 * stored links and does not walk (attestation-report.service.ts), finds the
 * same thing and must say it in the same words.
 */
export function describeUnlinkedAuditEvents(unlinked: number, total: number): string {
  return unlinked === 1
    ? `1 of ${total} audit entries names no entry before it although one was recorded, so that link could not be checked.`
    : `${unlinked} of ${total} audit entries name no entry before them although one was recorded, so those links could not be checked.`;
}

/**
 * The one sentence a report may print about a walk, and nothing stronger.
 * Generated beside the walk so the claim cannot drift from the check, which is
 * the drift that produced HS-1008-7.
 */
export function describeAuditEventChain(walk: AuditEventChainWalk): string {
  if (walk.rowsSeen === 0) return 'There are no audit events, so there is no chain to verify.';
  if (walk.breaks.length > 0) {
    return describeAuditEventBreaks(
      walk.breaks.filter(b => b.kind === 'content').length,
      walk.breaks.filter(b => b.kind === 'pointer').length,
    );
  }
  if (walk.hashedRows === 0) {
    return walk.rowsSeen === 1
      ? 'The one audit entry carries no hash, so the chain could not be verified.'
      : `None of the ${walk.rowsSeen} audit entries carry a hash, so the chain could not be verified.`;
  }
  if (walk.unhashedRows > 0) {
    const one = walk.unhashedRows === 1;
    return `${walk.unhashedRows} of ${walk.rowsSeen} audit entries ${one ? 'carries' : 'carry'} no hash, so ${one ? 'it' : 'they'} could not be verified.`;
  }
  if (walk.unlinkedRows > 0) return describeUnlinkedAuditEvents(walk.unlinkedRows, walk.rowsSeen);
  if (walk.verifiedRows === 1) {
    return (
      `The one audit entry matches the hash recorded when it was written, computed over its ` +
      `${AUDIT_EVENT_HASH_COVERS_WORDS}. ${AUDIT_EVENT_HASH_OMITS_WORDS}`
    );
  }
  return (
    `All ${walk.verifiedRows} audit entries match the hash recorded when each was written, computed over its ` +
    `${AUDIT_EVENT_HASH_COVERS_WORDS}, and each follows the entry before it. ${AUDIT_EVENT_HASH_OMITS_WORDS}`
  );
}
