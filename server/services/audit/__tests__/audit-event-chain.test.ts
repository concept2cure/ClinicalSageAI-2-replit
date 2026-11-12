/**
 * The one walk of the audit_events hash chain: its preimage pinned to the
 * trigger's SQL, and the cases that prove neither half of the check is
 * redundant.
 *
 * Its behaviour against a real Postgres running the real trigger is in
 * audit-event-chain.pglite.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_EVENT_CHAIN_COLUMNS,
  AUDIT_EVENT_HASH_FIELDS,
  auditEventChainVerdict,
  auditEventPreimage,
  auditEventRecordHash,
  describeAuditEventChain,
  walkAuditEventChain,
  type AuditEventChainRow,
} from '../audit-event-chain';

const TRIGGER_SQL = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/20260222_audit_events_hash_chain.sql'),
  'utf8',
);

/** The fields the trigger's hash commits to, in order, read from its SQL. */
function triggerFields(): string[] {
  const start = TRIGGER_SQL.indexOf('NEW.record_hash := encode(');
  const end = TRIGGER_SQL.indexOf("'hex'", start);
  expect(start, 'the trigger no longer assigns NEW.record_hash').toBeGreaterThan(-1);
  return [...TRIGGER_SQL.slice(start, end).matchAll(/COALESCE\(\s*(?:NEW\.)?([a-z_]+)(?:::text)?\s*,/g)]
    .map(m => (m[1] === 'prev_hash' ? 'previous_hash' : m[1]));
}

function rowOf(over: Partial<AuditEventChainRow> = {}): AuditEventChainRow {
  return {
    id: 1,
    organization_id: 1,
    sequence_number: 1,
    event_type: 'document.approved',
    entity_type: 'document',
    entity_id: 42,
    user_id: 7,
    user_name: 'A. Rivera',
    timestamp_text: '2026-11-10 07:26:03.891025',
    reason: null,
    record_hash: null,
    previous_hash: null,
    ...over,
  };
}

/** A chain as the trigger writes it: each row hashed over its own preimage. */
function chainOf(count: number, org = 1): AuditEventChainRow[] {
  const rows: AuditEventChainRow[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= count; i++) {
    const r = rowOf({ id: `${org}-${i}`, organization_id: org, sequence_number: i, entity_id: 100 + i, previous_hash: prev });
    r.record_hash = auditEventRecordHash(r);
    prev = r.record_hash;
    rows.push(r);
  }
  return rows;
}

describe('the preimage is the trigger\'s own', () => {
  /* Read from the migration, not restated: if the trigger's fields or their
     order change and this module's do not, every row would stop re-deriving and
     an intact chain would be reported altered (the AUD-02 failure). */
  it('commits to the trigger\'s fields, in the trigger\'s order', () => {
    expect(triggerFields()).toEqual([...AUDIT_EVENT_HASH_FIELDS]);
  });

  /* The module re-derives from the STORED previous_hash; the trigger hashes its
     local prev_hash. They are the same bytes only because the trigger stores
     the one before hashing over the other. */
  it('rests on the trigger storing the predecessor hash it hashes', () => {
    const assign = TRIGGER_SQL.indexOf('NEW.previous_hash := prev_hash');
    const hash = TRIGGER_SQL.indexOf('NEW.record_hash :=');
    expect(assign).toBeGreaterThan(-1);
    expect(assign, 'the hash is computed before the predecessor is stored').toBeLessThan(hash);
  });

  it('is the pipe-joined fields with GENESIS for a first row', () => {
    expect(auditEventPreimage(rowOf({ sequence_number: 4, reason: 'change of plan', previous_hash: 'abc123' })))
      .toBe('4|document.approved|document|42|7|A. Rivera|2026-11-10 07:26:03.891025|change of plan|abc123');
    expect(auditEventPreimage(rowOf()).endsWith('||GENESIS')).toBe(true);
  });

  it("renders a null field as the trigger's empty string", () => {
    const p = auditEventPreimage(rowOf({ event_type: null, user_id: null, user_name: null }));
    expect(p).not.toMatch(/null|undefined/);
    expect(p.split('|').slice(1, 2)).toEqual(['']);
  });

  it('takes the timestamp as the database\'s text, selected by the canonical columns', () => {
    expect(AUDIT_EVENT_CHAIN_COLUMNS).toContain('"timestamp"::text AS timestamp_text');
  });

  /* A row selected without the database's timestamp text is a caller bug. The
     walk refuses it rather than report an intact row as altered. */
  it('refuses a row selected without the database\'s timestamp text', () => {
    const row = rowOf();
    delete (row as Partial<AuditEventChainRow>).timestamp_text;
    row.record_hash = 'x'.repeat(64);
    expect(() => walkAuditEventChain([row])).toThrow(/AUDIT_EVENT_CHAIN_COLUMNS/);
  });
});

describe('walkAuditEventChain: a chain the trigger wrote', () => {
  it('verifies every row on both halves', () => {
    const w = walkAuditEventChain(chainOf(3));
    expect(w).toMatchObject({ rowsSeen: 3, hashedRows: 3, verifiedRows: 3, unhashedRows: 0, unlinkedRows: 0 });
    expect(w.breaks).toEqual([]);
    expect(auditEventChainVerdict(w)).toBe('intact');
  });

  it('walks two organisations as two chains', () => {
    const w = walkAuditEventChain([...chainOf(2, 1), ...chainOf(2, 2)]);
    expect(w.verifiedRows).toBe(4);
    expect(w.breaks, "organisation 2's first row was read as a break in organisation 1's chain").toEqual([]);
  });

  it('an empty chain is empty, not intact', () => {
    const w = walkAuditEventChain([]);
    expect(auditEventChainVerdict(w)).toBe('empty');
    expect(describeAuditEventChain(w)).toMatch(/no chain to verify/);
  });
});

describe('why the content half is required', () => {
  /* The case the pointer-only walks passed: a field altered, the stored hashes
     left alone, so every pointer still matches. */
  it('catches a field altered with the stored hashes left alone', () => {
    const rows = chainOf(3);
    rows[1].reason = 'back-dated after the fact';
    const w = walkAuditEventChain(rows);
    expect(w.breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['content', 2]]);
    expect(auditEventChainVerdict(w)).toBe('broken');
  });

  /* A row that failed re-derivation is hashed and is NOT verified. The Part 11
     route's old loop counted every hashed row as verified. */
  it('does not count a row that failed re-derivation as verified', () => {
    const rows = chainOf(3);
    rows[1].user_name = 'Someone Else';
    const w = walkAuditEventChain(rows);
    expect(w.hashedRows).toBe(3);
    expect(w.verifiedRows).toBe(2);
  });

  it('catches each covered field', () => {
    const edits: Array<Partial<AuditEventChainRow>> = [
      { sequence_number: 99 }, { event_type: 'x' }, { entity_type: 'x' }, { entity_id: 9 },
      { user_id: 9 }, { user_name: 'x' }, { timestamp_text: '2026-11-10 07:26:03.891026' }, { reason: 'x' },
    ];
    for (const edit of edits) {
      const rows = chainOf(2);
      Object.assign(rows[1], edit);
      const w = walkAuditEventChain(rows);
      expect(w.breaks.some(b => b.kind === 'content'), `${Object.keys(edit)[0]} was altered undetected`).toBe(true);
    }
  });
});

describe('why the pointer half is required', () => {
  /* Rewritten AND re-hashed: the row is self-consistent and passes content, but
     its successor still points at the old hash. */
  it('catches a rewritten row whose own hash was recomputed', () => {
    const rows = chainOf(3);
    rows[1].reason = 'rewritten';
    rows[1].record_hash = auditEventRecordHash(rows[1]);
    const w = walkAuditEventChain(rows);
    expect(w.breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['pointer', 3]]);
  });

  it('catches a removed entry by the pointer its successor still carries', () => {
    const rows = chainOf(4);
    rows.splice(1, 1);
    const w = walkAuditEventChain(rows);
    expect(w.breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['pointer', 3]]);
  });
});

describe('what could not be checked is counted, not assumed', () => {
  /* THE HOLE EVERY COPY SHARED. Remove an entry, blank its successor's pointer:
     the pointer-only walks skipped the comparison for a null pointer and
     reported the chain intact. Blanking the pointer changes the preimage, so it
     is a content break here; with the hash recomputed as well, the row is
     unplaceable and the chain is not intact. */
  it('does not let a removal be hidden by blanking the successor\'s pointer', () => {
    const rows = chainOf(3);
    rows.splice(1, 1);
    rows[1].previous_hash = null;
    const blanked = walkAuditEventChain(rows);
    expect(auditEventChainVerdict(blanked), 'a blanked pointer hid a removed entry').not.toBe('intact');
    expect(blanked.breaks.some(b => b.kind === 'content')).toBe(true);

    rows[1].record_hash = auditEventRecordHash(rows[1]);
    const rehashed = walkAuditEventChain(rows);
    expect(rehashed.unlinkedRows).toBe(1);
    expect(rehashed.breaks, 'an unplaceable row is not a mismatch that was found').toEqual([]);
    expect(auditEventChainVerdict(rehashed)).toBe('unverified');
  });

  it('does not count a first row as unlinked', () => {
    expect(walkAuditEventChain(chainOf(1)).unlinkedRows).toBe(0);
  });

  it('never counts an unhashed row as verified, and does not accuse the row after it', () => {
    const rows = chainOf(3);
    rows[1].record_hash = null;
    const w = walkAuditEventChain(rows);
    expect(w).toMatchObject({ unhashedRows: 1, hashedRows: 2, verifiedRows: 2 });
    expect(w.breaks, 'the row after an unhashed row was accused of a broken link').toEqual([]);
    expect(auditEventChainVerdict(w)).toBe('unverified');
  });

  it('reads an empty-string hash as no hash', () => {
    const rows = chainOf(2);
    rows[0].record_hash = '';
    expect(walkAuditEventChain(rows).unhashedRows).toBe(1);
  });

  it('a break outranks a gap', () => {
    const rows = chainOf(4);
    rows[0].record_hash = null;
    rows[3].reason = 'altered';
    expect(auditEventChainVerdict(walkAuditEventChain(rows))).toBe('broken');
  });
});

describe('describeAuditEventChain: the sentence never outruns the check', () => {
  it('says the entries match their recorded hash, and what the hash leaves out', () => {
    const s = describeAuditEventChain(walkAuditEventChain(chainOf(3)));
    expect(s).toMatch(/All 3 audit entries match the hash recorded/);
    expect(s).toMatch(/follows the entry before it/);
    expect(s, 'the sentence reads as covering the before and after values').toMatch(/before and after values .* not part of the hash/);
  });

  it('says one entry in the singular, with no predecessor claimed', () => {
    const s = describeAuditEventChain(walkAuditEventChain(chainOf(1)));
    expect(s).toMatch(/The one audit entry matches/);
    expect(s).not.toMatch(/follows the entry before it/);
  });

  it('names an altered entry and a broken link as different things', () => {
    const altered = chainOf(2);
    altered[1].reason = 'x';
    expect(describeAuditEventChain(walkAuditEventChain(altered))).toMatch(/1 entry does not match the hash recorded when it was written/);

    const relinked = chainOf(3);
    relinked[1].reason = 'x';
    relinked[1].record_hash = auditEventRecordHash(relinked[1]);
    expect(describeAuditEventChain(walkAuditEventChain(relinked))).toMatch(/1 entry does not follow the entry before it/);
  });

  it('never says the chain matched over entries it could not check', () => {
    const none = chainOf(2).map(r => ({ ...r, record_hash: null }));
    expect(describeAuditEventChain(walkAuditEventChain(none))).toMatch(/None of the 2 audit entries carry a hash/);

    const some = chainOf(3);
    some[0].record_hash = null;
    const s = describeAuditEventChain(walkAuditEventChain(some));
    expect(s).toMatch(/1 of 3 audit entries carries no hash, so it could not be verified\./);
    expect(s).not.toMatch(/match the hash recorded/);
  });

  /* A blanked pointer, re-hashed so the entry is self-consistent: the entry is
     hashed, so "carries no hash" would be false of it. */
  it('says an entry that names no entry before it could not be placed, in the singular and the plural', () => {
    /** Blank the pointers at `at` and re-seal every row after, so nothing else is wrong. */
    const blanked = (count: number, at: number[]) => {
      const rows = chainOf(count);
      rows.forEach((row, i) => {
        row.previous_hash = i === 0 || at.includes(i) ? null : rows[i - 1].record_hash;
        row.record_hash = auditEventRecordHash(row);
      });
      return rows;
    };
    expect(describeAuditEventChain(walkAuditEventChain(blanked(3, [2]))))
      .toBe('1 of 3 audit entries names no entry before it although one was recorded, so that link could not be checked.');

    const s = describeAuditEventChain(walkAuditEventChain(blanked(5, [2, 4])));
    expect(s).toBe('2 of 5 audit entries name no entry before them although one was recorded, so those links could not be checked.');
    expect(s).not.toMatch(/carr(y|ies) no hash|match the hash recorded/);
  });

  it('says several unhashed entries in the plural', () => {
    const some = chainOf(4);
    some[0].record_hash = null;
    some[1].record_hash = null;
    expect(describeAuditEventChain(walkAuditEventChain(some))).toMatch(/2 of 4 audit entries carry no hash, so they could not be verified\./);
  });

  it('uses a reader\'s words, with no column names', () => {
    const sentences = [
      describeAuditEventChain(walkAuditEventChain(chainOf(3))),
      describeAuditEventChain(walkAuditEventChain([])),
      describeAuditEventChain(walkAuditEventChain(chainOf(2).map(r => ({ ...r, record_hash: null })))),
    ];
    for (const s of sentences) expect(s).not.toMatch(/record_hash|previous_hash|sequence_number|timestamp_text/);
  });
});
