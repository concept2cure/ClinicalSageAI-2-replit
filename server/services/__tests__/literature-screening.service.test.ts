/**
 * literature-screening.service — the MEDDEV 2.7/1 Rev 4 appraisal trail.
 *
 * Contract under test:
 *   - FAIL CLOSED: an article that is not in the caller's corpus is REFUSED
 *     (422-shaped ScreeningRefusal), never given a conjured corpus row; a
 *     missing table is a typed refusal naming the unapplied migration, not a
 *     swallowed success;
 *   - MEDDEV §8: an exclusion carries its reason, an inclusion carries none —
 *     enforced in the service, not only by the DB CHECK;
 *   - IDEMPOTENT per (org, entry, program, stage), with the SUPERSEDED decision
 *     returned so the route can chain an old→new audit row;
 *   - TENANCY: every statement filters on the organization, and the corpus join
 *     is filtered a second time on its own org column;
 *   - NEVER FABRICATE: an article with no stored decision is ABSENT from the
 *     read, never defaulted to 'pending'.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  recordScreeningDecision,
  getScreeningDecisions,
  normalizeExclusionReason,
  isScreeningStoreAbsent,
  ScreeningRefusal,
  SCREENING_STAGES,
  SCREENING_DECISIONS,
  type SqlExecutor,
} from '../literature-screening.service';

const ENTRY_ID = 'e0000000-0000-0000-0000-000000000001';
const DECISION_ID = 'd0000000-0000-0000-0000-000000000001';
const PROGRAM_ID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

interface HarnessOptions {
  /** Rows the corpus lookup returns; empty = article not in corpus. */
  entryRows?: Array<Record<string, unknown>>;
  /** Rows the prior-decision lookup returns; empty = first decision. */
  priorRows?: Array<Record<string, unknown>>;
  /** Rows the upsert returns. */
  upsertRows?: Array<Record<string, unknown>>;
  /** Rows the read query returns. */
  readRows?: Array<Record<string, unknown>>;
  /** When set, every statement matching this regex throws with this pg code. */
  throwOn?: { re: RegExp; code: string };
}

function makeExecutor(opts: HarnessOptions = {}): {
  executor: SqlExecutor;
  calls: Array<{ text: string; params: unknown[] }>;
} {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const executor: SqlExecutor = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (opts.throwOn && opts.throwOn.re.test(text)) {
        const err = new Error('relation does not exist') as Error & { code: string };
        err.code = opts.throwOn.code;
        throw err;
      }
      if (/FROM literature_entries/i.test(text)) {
        return { rows: opts.entryRows ?? [{ id: ENTRY_ID, title: 'Stored corpus title' }] };
      }
      if (/^\s*SELECT decision/i.test(text)) {
        return { rows: opts.priorRows ?? [] };
      }
      if (/^\s*INSERT INTO literature_screening_decisions/i.test(text)) {
        return {
          rows: opts.upsertRows ?? [
            {
              id: DECISION_ID,
              literature_entry_id: ENTRY_ID,
              program_id: null,
              stage: 'title_abstract',
              decision: 'included',
              exclusion_reason: null,
              decided_by: 42,
              decided_at: new Date('2026-08-14T10:00:00Z'),
              inserted: true,
            },
          ],
        };
      }
      return { rows: opts.readRows ?? [] };
    }),
  };
  return { executor, calls };
}

const BASE = {
  pmid: '38012345',
  stage: 'title_abstract' as const,
  decision: 'included' as const,
};

describe('vocabulary', () => {
  it('names the two MEDDEV/PRISMA passes the CER flow already uses', () => {
    // cer-report.ts:923,929 — articles_after_TITLE_ABSTRACT_screening /
    // articles_after_FULL_TEXT_screening. One vocabulary, not two.
    expect(SCREENING_STAGES).toEqual(['title_abstract', 'full_text']);
  });

  it('keeps an explicit deferral distinct from an include/exclude', () => {
    expect(SCREENING_DECISIONS).toEqual(['included', 'excluded', 'pending']);
  });
});

describe('normalizeExclusionReason', () => {
  it('requires a reason on an exclusion (MEDDEV 2.7/1 Rev 4 §8)', () => {
    expect(() => normalizeExclusionReason('excluded', '   ')).toThrow(ScreeningRefusal);
    expect(() => normalizeExclusionReason('excluded', null)).toThrow(/must carry a reason/);
    expect(normalizeExclusionReason('excluded', '  not the subject device  ')).toBe(
      'not the subject device',
    );
  });

  it('strips a rationale from a non-exclusion so no stale reason survives', () => {
    expect(normalizeExclusionReason('included', 'left over from an earlier call')).toBeNull();
    expect(normalizeExclusionReason('pending', 'x')).toBeNull();
  });
});

describe('recordScreeningDecision — fail closed', () => {
  it('REFUSES an article that is not in the caller org corpus, writing nothing', async () => {
    const { executor, calls } = makeExecutor({ entryRows: [] });

    await expect(recordScreeningDecision(executor, 7, 42, BASE)).rejects.toMatchObject({
      code: 'ENTRY_NOT_IN_CORPUS',
      statusCode: 422,
    });

    // Exactly one statement ran: the corpus lookup. No decision was persisted,
    // and no corpus row was conjured to hang the decision on.
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/FROM literature_entries/);
    expect(calls.some((c) => /INSERT INTO/i.test(c.text))).toBe(false);
  });

  it('refuses an unattributed decision — Part 11 needs a named reviewer', async () => {
    const { executor, calls } = makeExecutor();
    await expect(recordScreeningDecision(executor, 7, 0, BASE)).rejects.toMatchObject({
      code: 'INVALID_SCREENING_INPUT',
    });
    expect(calls).toHaveLength(0);
  });

  it('refuses a bad org, a malformed pmid, an unknown stage and an unknown decision', async () => {
    const { executor } = makeExecutor();
    await expect(recordScreeningDecision(executor, 0, 42, BASE)).rejects.toThrow(ScreeningRefusal);
    await expect(
      recordScreeningDecision(executor, 7, 42, { ...BASE, pmid: 'not-a-pmid' }),
    ).rejects.toThrow(/numeric PubMed ID/);
    await expect(
      recordScreeningDecision(executor, 7, 42, { ...BASE, stage: 'abstract_only' as never }),
    ).rejects.toThrow(/Invalid screening stage/);
    await expect(
      recordScreeningDecision(executor, 7, 42, { ...BASE, decision: 'maybe' as never }),
    ).rejects.toThrow(/Invalid screening decision/);
  });

  it('refuses an exclusion with no reason before touching the database', async () => {
    const { executor, calls } = makeExecutor();
    await expect(
      recordScreeningDecision(executor, 7, 42, { ...BASE, decision: 'excluded' }),
    ).rejects.toMatchObject({ code: 'EXCLUSION_REASON_REQUIRED' });
    expect(calls).toHaveLength(0);
  });

  it('maps a missing table to a typed refusal naming the unapplied migration', async () => {
    const { executor } = makeExecutor({
      throwOn: { re: /literature_screening_decisions/i, code: '42P01' },
    });
    await expect(recordScreeningDecision(executor, 7, 42, BASE)).rejects.toMatchObject({
      code: 'SCREENING_STORE_ABSENT',
      statusCode: 422,
    });
  });

  it('lets a genuine database error propagate — a failed write is never reported as stored', async () => {
    const { executor } = makeExecutor({
      throwOn: { re: /literature_screening_decisions/i, code: '40001' },
    });
    await expect(recordScreeningDecision(executor, 7, 42, BASE)).rejects.not.toBeInstanceOf(
      ScreeningRefusal,
    );
  });

  it('refuses when the upsert returns no row — nothing persisted, nothing claimed', async () => {
    const { executor } = makeExecutor({ upsertRows: [] });
    await expect(recordScreeningDecision(executor, 7, 42, BASE)).rejects.toThrow(
      /returned no row — nothing was persisted/,
    );
  });
});

describe('recordScreeningDecision — tenancy', () => {
  it('scopes the corpus lookup to the caller organization and the PubMed source', async () => {
    const { executor, calls } = makeExecutor();
    await recordScreeningDecision(executor, 7, 42, BASE);

    const lookup = calls.find((c) => /FROM literature_entries/i.test(c.text))!;
    expect(lookup.text).toMatch(/organization_id::text = \$1::text/);
    expect(lookup.params[0]).toBe('7');
    expect(lookup.params[1]).toBe('PubMed');
    expect(lookup.params[2]).toBe('38012345');
  });

  it('carries the organization onto every screening statement, from the request not the payload', async () => {
    const { executor, calls } = makeExecutor();
    await recordScreeningDecision(executor, 7, 42, BASE);

    for (const call of calls.filter((c) => /literature_screening_decisions/i.test(c.text))) {
      expect(call.text).toMatch(/organization_id/);
      expect(call.params[0]).toBe(7);
    }
  });
});

describe('recordScreeningDecision — upsert semantics', () => {
  it('infers the ORG-LEVEL partial index when programId is null', async () => {
    const { executor, calls } = makeExecutor();
    await recordScreeningDecision(executor, 7, 42, BASE);

    const upsert = calls.find((c) => /^\s*INSERT INTO/i.test(c.text))!;
    expect(upsert.text).toMatch(
      /ON CONFLICT \(organization_id, literature_entry_id, stage\) WHERE program_id IS NULL/,
    );
    expect(upsert.params[2]).toBeNull();
  });

  it('infers the PROGRAM-SCOPED partial index when a programId is given', async () => {
    const { executor, calls } = makeExecutor();
    await recordScreeningDecision(executor, 7, 42, { ...BASE, programId: PROGRAM_ID });

    const upsert = calls.find((c) => /^\s*INSERT INTO/i.test(c.text))!;
    expect(upsert.text).toMatch(
      /ON CONFLICT \(organization_id, literature_entry_id, program_id, stage\) WHERE program_id IS NOT NULL/,
    );
    expect(upsert.params[2]).toBe(PROGRAM_ID);
  });

  it('reads the prior decision with IS NOT DISTINCT FROM so NULL program matches NULL', async () => {
    const { executor, calls } = makeExecutor();
    await recordScreeningDecision(executor, 7, 42, BASE);

    const prior = calls.find((c) => /^\s*SELECT decision/i.test(c.text))!;
    expect(prior.text).toMatch(/program_id IS NOT DISTINCT FROM \$3::uuid/);
  });

  it('returns the SUPERSEDED decision so the audit row can record old→new', async () => {
    const { executor } = makeExecutor({
      priorRows: [
        {
          decision: 'excluded',
          exclusion_reason: 'wrong population',
          decided_by: 9,
          decided_at: new Date('2026-08-01T09:00:00Z'),
        },
      ],
      upsertRows: [
        {
          id: DECISION_ID,
          literature_entry_id: ENTRY_ID,
          program_id: null,
          stage: 'title_abstract',
          decision: 'included',
          exclusion_reason: null,
          decided_by: 42,
          decided_at: new Date('2026-08-14T10:00:00Z'),
          inserted: false,
        },
      ],
    });

    const result = await recordScreeningDecision(executor, 7, 42, BASE);

    expect(result.outcome).toBe('updated');
    expect(result.superseded).toEqual({
      decision: 'excluded',
      exclusionReason: 'wrong population',
      decidedBy: 9,
      decidedAt: '2026-08-01T09:00:00.000Z',
    });
    expect(result.current.decision).toBe('included');
    expect(result.current.exclusionReason).toBeNull();
  });

  it('reports a first decision as created with no superseded value', async () => {
    const { executor } = makeExecutor();
    const result = await recordScreeningDecision(executor, 7, 42, BASE);
    expect(result.outcome).toBe('created');
    expect(result.superseded).toBeNull();
    expect(result.current.title).toBe('Stored corpus title');
  });

  it('persists the trimmed exclusion reason on an exclusion', async () => {
    const { executor, calls } = makeExecutor({
      upsertRows: [
        {
          id: DECISION_ID,
          literature_entry_id: ENTRY_ID,
          program_id: null,
          stage: 'full_text',
          decision: 'excluded',
          exclusion_reason: 'not the subject device',
          decided_by: 42,
          decided_at: new Date('2026-08-14T10:00:00Z'),
          inserted: true,
        },
      ],
    });

    const result = await recordScreeningDecision(executor, 7, 42, {
      pmid: '38012345',
      stage: 'full_text',
      decision: 'excluded',
      exclusionReason: '  not the subject device  ',
    });

    const upsert = calls.find((c) => /^\s*INSERT INTO/i.test(c.text))!;
    expect(upsert.params[5]).toBe('not the subject device');
    expect(result.current.exclusionReason).toBe('not the subject device');
  });
});

describe('getScreeningDecisions', () => {
  it('binds the organization to BOTH tables so neither alone widens tenant scope', async () => {
    const { executor, calls } = makeExecutor({ readRows: [] });
    await getScreeningDecisions(executor, 7, {});

    const read = calls[0];
    expect(read.text).toMatch(/d\.organization_id = \$1/);
    expect(read.text).toMatch(/le\.organization_id::text = \$2::text/);
    expect(read.params[0]).toBe(7);
    expect(read.params[1]).toBe('7');
  });

  it('scopes to the exact program — NULL is a distinct scope, not a wildcard', async () => {
    const { executor, calls } = makeExecutor({ readRows: [] });
    await getScreeningDecisions(executor, 7, { programId: PROGRAM_ID });
    expect(calls[0].text).toMatch(/d\.program_id IS NOT DISTINCT FROM \$3::uuid/);
    expect(calls[0].params[2]).toBe(PROGRAM_ID);

    const second = makeExecutor({ readRows: [] });
    await getScreeningDecisions(second.executor, 7, {});
    expect(second.calls[0].params[2]).toBeNull();
  });

  it('filters to the supplied PMIDs and drops anything that is not one', async () => {
    const { executor, calls } = makeExecutor({ readRows: [] });
    await getScreeningDecisions(executor, 7, { pmids: ['38012345', 'drop-me', '99'] });
    expect(calls[0].text).toMatch(/le\.source_id = ANY\(\$5::text\[\]\)/);
    expect(calls[0].params[4]).toEqual(['38012345', '99']);
  });

  it('returns exactly what is stored — an unscreened article is ABSENT, not "pending"', async () => {
    const { executor } = makeExecutor({
      readRows: [
        {
          id: DECISION_ID,
          literature_entry_id: ENTRY_ID,
          program_id: PROGRAM_ID,
          stage: 'full_text',
          decision: 'excluded',
          exclusion_reason: 'no clinical outcome data',
          decided_by: 42,
          decided_at: new Date('2026-08-14T10:00:00Z'),
          pmid: '38012345',
          title: 'Continuous glucose monitoring in adults',
        },
      ],
    });

    const result = await getScreeningDecisions(executor, 7, { programId: PROGRAM_ID });

    expect(result.available).toBe(true);
    expect(result.decisions).toEqual([
      {
        id: DECISION_ID,
        pmid: '38012345',
        title: 'Continuous glucose monitoring in adults',
        literatureEntryId: ENTRY_ID,
        programId: PROGRAM_ID,
        stage: 'full_text',
        decision: 'excluded',
        exclusionReason: 'no clinical outcome data',
        decidedBy: 42,
        decidedAt: '2026-08-14T10:00:00.000Z',
      },
    ]);
  });

  it('degrades honestly when the store is not provisioned — never an empty "nothing screened"', async () => {
    const { executor } = makeExecutor({
      throwOn: { re: /literature_screening_decisions/i, code: '42P01' },
    });
    const result = await getScreeningDecisions(executor, 7, {});
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toMatch(/20260814b_literature_screening_decisions\.sql/);
    expect(result.decisions).toEqual([]);
  });

  it('propagates a genuine database error rather than reporting an empty trail', async () => {
    const { executor } = makeExecutor({
      throwOn: { re: /literature_screening_decisions/i, code: '57014' },
    });
    await expect(getScreeningDecisions(executor, 7, {})).rejects.toThrow();
  });

  it('rejects a stored value outside the vocabulary instead of widening the type silently', async () => {
    const { executor } = makeExecutor({
      readRows: [
        {
          id: DECISION_ID,
          literature_entry_id: ENTRY_ID,
          program_id: null,
          stage: 'title_abstract',
          decision: 'maybe_later',
          exclusion_reason: null,
          decided_by: 42,
          decided_at: new Date(),
          pmid: '38012345',
          title: 't',
        },
      ],
    });
    await expect(getScreeningDecisions(executor, 7, {})).rejects.toThrow(/outside the known vocabulary/);
  });
});

describe('isScreeningStoreAbsent', () => {
  it('recognises 42P01 only', () => {
    expect(isScreeningStoreAbsent({ code: '42P01' })).toBe(true);
    expect(isScreeningStoreAbsent({ code: '23505' })).toBe(false);
    expect(isScreeningStoreAbsent(new Error('boom'))).toBe(false);
    expect(isScreeningStoreAbsent(null)).toBe(false);
  });
});
