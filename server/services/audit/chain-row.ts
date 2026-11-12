/**
 * One audit_logs row checked in place against the chain it claims to belong
 * to, for a reader whose answer rests on that single row (the report seal,
 * services/report-os/sealing/run-seal.ts). The recipe (the predecessor the
 * writer linked to, the hash, the HMAC seal over the link) is chain.ts's; this
 * applies it to one row. The whole-chain walk is chain.ts verifyAuditChain.
 *
 * @module server/services/audit/chain-row
 */
import { verifySeal as verifyLinkSeal, GENESIS_PREVIOUS_HASH } from './audit-hmac-seal.js';
import { AUDIT_SEAL_SEQ, LEGACY_HEAD_ORDER_SQL, deriveChainHash, type ChainRow, type PoolClient } from './chain.js';

/** One sequenced row as a single-row reader holds it (see verifySequencedRow). */
export interface SequencedRowInput extends ChainRow {
  tenant_id: number | string | null;
  sha256_chain: string | null;
  hmac_seal: string | null;
  chain_seq: number | string | bigint | null;
}

export interface SequencedRowVerdict {
  /**
   * 'linked': the row re-derives from the predecessor its writer linked it to;
   * 'unsequenced': no chain position (unchained or legacy), so nothing links it;
   * 'broken': it does not re-derive from that predecessor.
   */
  link: 'linked' | 'unsequenced' | 'broken';
  /**
   * The HMAC seal over that link, when AUDIT_HMAC_KEY is configured: 'valid',
   * 'invalid', or 'absent' (the row carries none). 'no-key' when the key is not
   * configured here, so the link is not proof against a database writer.
   */
  seal: 'valid' | 'invalid' | 'absent' | 'no-key';
}

/**
 * Verify ONE sequenced audit_logs row in place, for a reader whose answer
 * rests on that row (the report seal, report-os/sealing/run-seal.ts). The
 * writer took its position under the tenant's lock from the tenant's head:
 * the sequenced row before it, else the tenant's legacy head, else genesis.
 * The row must re-derive from exactly that predecessor, and where the HMAC
 * key is configured carry a valid seal over the link, which a database writer
 * without the key cannot produce. An unchained row (sha256_chain or chain_seq
 * NULL) is accepted by the INSERT trigger as legacy and never seen by the
 * walk, so it is reported, not trusted. The whole-chain walk is
 * verifyAuditChain; this checks one link of it.
 */
/** PostgreSQL's text form of a timestamptz: `2026-11-12 00:36:03.117+00`, as a driver in text mode returns it. */
const PG_TEXT_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:?\d{2})?$/;

/**
 * The row's timestamp as the writer hashed it. node-postgres hands a reader a
 * Date; drizzle's `execute` hands it PostgreSQL's text for the same instant.
 * The writer hashed the ISO form of that instant, so the text is read back to
 * the instant first. Until 2026-11-12 the text was hashed as it stood, and
 * every row read on a drizzle connection was reported broken. Anything that
 * is not that text form is left exactly as given.
 */
function occurredAtAsWritten(value: string | Date): string | Date {
  if (value instanceof Date || !PG_TEXT_TIMESTAMP.test(value)) return value;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at;
}

export async function verifySequencedRow(client: PoolClient, row: SequencedRowInput): Promise<SequencedRowVerdict> {
  const noKey = !process.env.AUDIT_HMAC_KEY;
  if (!row.sha256_chain || row.chain_seq == null) return { link: 'unsequenced', seal: noKey ? 'no-key' : 'absent' };
  const prior = await client.query(
    `SELECT sha256_chain FROM audit_logs
      WHERE tenant_id = $1 AND sha256_chain IS NOT NULL AND chain_seq < $2
      ORDER BY chain_seq DESC LIMIT 1`,
    [row.tenant_id, String(row.chain_seq)],
  );
  const legacy = prior.rows.length > 0
    ? prior
    : await client.query(
        `SELECT sha256_chain FROM audit_logs
          WHERE tenant_id = $1 AND sha256_chain IS NOT NULL AND chain_seq IS NULL
          ORDER BY ${LEGACY_HEAD_ORDER_SQL} LIMIT 1`,
        [row.tenant_id],
      );
  const previousHash = (legacy.rows[0]?.sha256_chain as string | undefined) ?? GENESIS_PREVIOUS_HASH;
  const asWritten = { ...row, occurred_at: occurredAtAsWritten(row.occurred_at) };
  if (deriveChainHash(asWritten, previousHash) !== row.sha256_chain) return { link: 'broken', seal: noKey ? 'no-key' : 'absent' };
  if (noKey) return { link: 'linked', seal: 'no-key' };
  if (!row.hmac_seal) return { link: 'linked', seal: 'absent' };
  const sealed = verifyLinkSeal({ recordHash: row.sha256_chain, previousHash, sequenceNumber: AUDIT_SEAL_SEQ }, row.hmac_seal);
  return { link: 'linked', seal: sealed ? 'valid' : 'invalid' };
}
