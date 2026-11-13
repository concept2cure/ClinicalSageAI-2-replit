/**
 * audit_events rows for tests, hashed the way the trigger hashes them.
 *
 * The walk of this chain (../audit-event-chain.ts) re-computes each row's hash,
 * so a fixture with made-up hashes ('h1', 'h2') is no longer a chain: every
 * row would read as altered. These builders seal each row over its own
 * preimage, and let a test break exactly the thing it is about.
 *
 * Self-consistency only: that the preimage equals what the real trigger
 * hashes is proven separately, against the real trigger, in
 * audit-event-chain.pglite.test.ts.
 */
import { auditEventRecordHash, type AuditEventChainRow } from '../audit-event-chain';

export interface ChainSpec {
  id: number | string;
  org: number;
  seq: number;
  /**
   * The predecessor pointer. Omitted: the hash of the previous sealed row of
   * the same organisation (null for its first row), as the trigger writes it.
   * `null` or a string: exactly that, to build a blanked or wrong pointer.
   */
  prev?: string | null;
  /**
   * The stored hash. Omitted: sealed over the row's own preimage. `null`: an
   * unhashed row (written before the trigger). A string: exactly that, to
   * build a row whose content no longer matches its hash.
   */
  hash?: string | null;
  /** Any covered field, to vary content. */
  fields?: Partial<Pick<AuditEventChainRow, 'event_type' | 'entity_type' | 'entity_id' | 'user_id' | 'user_name' | 'timestamp_text' | 'reason'>>;
}

/** Rows in the order given, each organisation chained on its own. */
export function chainRows(specs: readonly ChainSpec[]): AuditEventChainRow[] {
  const headByOrg = new Map<number, string | null>();
  return specs.map((spec) => {
    const row: AuditEventChainRow = {
      id: spec.id,
      organization_id: spec.org,
      sequence_number: spec.seq,
      event_type: 'document.approved',
      entity_type: 'document',
      entity_id: 100 + spec.seq,
      user_id: 7,
      user_name: 'A. Rivera',
      timestamp_text: `2026-11-10 07:26:${String(spec.seq % 60).padStart(2, '0')}.891025`,
      reason: null,
      ...spec.fields,
      record_hash: null,
      previous_hash: spec.prev === undefined ? headByOrg.get(spec.org) ?? null : spec.prev,
    };
    row.record_hash = spec.hash === undefined ? auditEventRecordHash(row) : spec.hash;
    headByOrg.set(spec.org, row.record_hash);
    return row;
  });
}

/** A sound chain of `count` rows for one organisation, ids `${org}0${seq}`-style numbers. */
export function soundChain(org: number, count: number, firstId = org * 100 + 1): AuditEventChainRow[] {
  return chainRows(Array.from({ length: count }, (_, i) => ({ id: firstId + i, org, seq: i + 1 })));
}

/** A row as the older fixtures wrote it: hashes that are names, not hashes. */
export interface SymbolicRow {
  id: number | string;
  organization_id: number;
  sequence_number: number;
  record_hash: string | null;
  previous_hash: string | null;
}

/**
 * Turn a fixture written with named hashes ('h1', then 'h2' pointing at 'h1')
 * into the chain it meant. A pointer that names an earlier row's hash becomes
 * that row's real hash; a pointer that names nothing ('TAMPERED') stays a wrong
 * pointer; a null hash stays an unhashed row. Each hashed row is sealed over
 * its own preimage, so the only thing wrong with a row is what its fixture
 * made wrong.
 */
export function sealSymbolic(rows: readonly SymbolicRow[]): AuditEventChainRow[] {
  const real = new Map<string, string>();
  return rows.map((r) => {
    const row: AuditEventChainRow = {
      id: r.id,
      organization_id: r.organization_id,
      sequence_number: r.sequence_number,
      event_type: 'document.approved',
      entity_type: 'document',
      entity_id: 100 + r.sequence_number,
      user_id: 7,
      user_name: 'A. Rivera',
      timestamp_text: `2026-11-10 07:26:${String(r.sequence_number % 60).padStart(2, '0')}.891025`,
      reason: null,
      record_hash: null,
      previous_hash: r.previous_hash === null ? null : real.get(`${r.organization_id}:${r.previous_hash}`) ?? r.previous_hash,
    };
    if (r.record_hash !== null) {
      row.record_hash = auditEventRecordHash(row);
      real.set(`${r.organization_id}:${r.record_hash}`, row.record_hash);
    }
    return row;
  });
}
