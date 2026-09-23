/**
 * Separation of duties — rules in the module note of ../separation-of-duties.ts,
 * research record in docs/evidence/REGULATORY-SME/2026-09-22/.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Rows = Array<Record<string, unknown>>;
const h = vi.hoisted(() => ({
  // Keyed by a fragment of the SQL each authorship source runs.
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  fail: null as unknown,
  calls: [] as Array<{ sql: string; params: unknown[] }>,
}));
vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      h.calls.push({ sql, params });
      if (h.fail) throw h.fail;
      const key = Object.keys(h.rows).find((k) => sql.includes(k));
      return { rows: key ? h.rows[key] : [] };
    }),
  },
}));

import {
  assertSignerIsNotAuthor,
  requiresIndependence,
  resolveTargetAuthors,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
} from '../separation-of-duties';

const VERSIONS = 'c2c_document_section_versions';
const ACCEPTED = 'SELECT DISTINCT s.accepted_by';
const DOC_OWNER = 'SELECT owner_id FROM c2c_documents';

function given(rows: Record<string, Rows>): void {
  h.rows = rows;
}

beforeEach(() => {
  h.rows = {};
  h.fail = null;
  h.calls.length = 0;
});

describe('scope by 21 CFR 11.50(a)(3) meaning', () => {
  it('an authorship signature is not a separation-of-duties case', () => {
    expect(requiresIndependence('sign', 'authorship')).toBe(false);
    expect(requiresIndependence('sign', 'AUTHOR')).toBe(false);
  });

  it.each(['review', 'approval', 'responsibility', 'release', undefined, ''])(
    'meaning %s requires independence (undeclared fails closed)',
    (meaning) => expect(requiresIndependence('sign', meaning)).toBe(true),
  );

  it('lock always requires independence', () => {
    expect(requiresIndependence('lock', 'authorship')).toBe(true);
  });

  it('the author signing AS AUTHOR is allowed, without even querying', async () => {
    const r = await assertSignerIsNotAuthor('document:doc-1', 2, 9, { command: 'sign', meaning: 'authorship' });
    expect(r.checked).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
});

describe('authorship is a set from the record’s history, not one mutable column', () => {
  it('a section author is caught even when the document owner is someone else (the scaffolder)', async () => {
    given({ [VERSIONS]: [{ author_id: 9 }], [DOC_OWNER]: [{ owner_id: 1 }] });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9, { meaning: 'approval' })).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('whoever accepted a drafted section is an author of record', async () => {
    given({ [ACCEPTED]: [{ accepted_by: 9 }] });
    await expect(assertSignerIsNotAuthor('section:doc-1:2.5', 2, 9, { meaning: 'review' })).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('template scaffolds are excluded from the version-ledger query', async () => {
    given({ [DOC_OWNER]: [{ owner_id: 1 }] });
    await resolveTargetAuthors('document:doc-1', 2);
    const q = h.calls.find((c) => c.sql.includes(VERSIONS));
    expect(q?.sql).toMatch(/author_kind IS DISTINCT FROM 'template'/);
  });

  it('every source is org-scoped', async () => {
    await resolveTargetAuthors('document:doc-1', 2);
    for (const c of h.calls) expect(c.params).toContain(2);
  });

  it('a non-author passes, and the result says which sources were checked', async () => {
    given({ [VERSIONS]: [{ author_id: 9 }], [ACCEPTED]: [{ accepted_by: 7 }] });
    const r = await assertSignerIsNotAuthor('document:doc-1', 2, 10, { meaning: 'approval' });
    expect(r.checked).toBe(true);
    expect(r.reason).toMatch(/section version ledger/);
  });

  it('eCTD sequence authorship is its creator, org-scoped', async () => {
    given({ 'FROM ectd_sequences': [{ created_by: 11 }] });
    await expect(assertSignerIsNotAuthor('ectd-sequence:42', 7, 11, { meaning: 'release' })).rejects.toBeInstanceOf(SeparationOfDutiesError);
    expect(h.calls[0].sql).toContain('organization_id = $2');
  });

  it('blocker authorship uses the real org column (org_id, not organization_id)', async () => {
    given({ 'FROM c2c_blockers': [{ owner_user_id: 13 }] });
    await resolveTargetAuthors('blocker:BLK-1', 2);
    expect(h.calls[0].sql).toMatch(/\borg_id\b/);
    expect(h.calls[0].sql).not.toContain('organization_id');
  });
});

describe('an author who cannot be determined refuses the signature (409), never allows it', () => {
  it('a modelled record with no recorded author → AuthorUnresolved (was: log and allow)', async () => {
    const attempt = assertSignerIsNotAuthor('document:doc-legacy', 2, 9, { meaning: 'approval' });
    await expect(attempt).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    await expect(assertSignerIsNotAuthor('document:doc-legacy', 2, 9, { meaning: 'approval' })).rejects.toThrow(/No author is recorded/);
  });

  it.each(['submission:sub-1', 'specification:spec-1', 'batch:b-1', 'haq:x'])(
    'an approval of %s (authorship not modelled) is refused, not waved through',
    async (target) => {
      await expect(assertSignerIsNotAuthor(target, 2, 9, { meaning: 'approval' })).rejects.toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    },
  );

  it('but an authorship signature on such a record is allowed', async () => {
    await expect(assertSignerIsNotAuthor('submission:sub-1', 2, 9, { meaning: 'authorship' })).resolves.toMatchObject({ checked: false });
  });
});

describe('a failed lookup refuses the signature (503) — the check did not run', () => {
  it.each([
    ['a statement timeout', { code: '57014', message: 'canceling statement due to statement timeout' }],
    ['a dropped connection', new Error('Connection terminated unexpectedly')],
    ['an RLS / permission refusal', { code: '42501', message: 'permission denied' }],
    ['an undefined column', { code: '42703', message: 'column does not exist' }],
  ])('%s', async (_label, failure) => {
    h.fail = failure;
    const attempt = assertSignerIsNotAuthor('ectd-sequence:42', 7, 11, { meaning: 'release' });
    await expect(attempt).rejects.toBeInstanceOf(SeparationOfDutiesUnverifiedError);
  });

  it('names the target and says nothing was signed', async () => {
    h.fail = { code: '57014', message: 'timeout' };
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9)).rejects.toThrow(
      /could not be verified for "document:doc-1" \(database error 57014\)\. Nothing was signed/,
    );
  });
});
