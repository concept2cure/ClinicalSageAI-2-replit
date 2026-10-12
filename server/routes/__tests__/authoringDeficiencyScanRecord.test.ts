/**
 * The section check reads the canonical regulatory record — and stops
 * attributing a keyword heuristic to an agency.
 *
 * TWO DEFECTS MET HERE.
 *
 * 1. THE CHECK KNEW FIVE SECTIONS OUT OF THE WHOLE CTD. Its section-specific
 *    expectations came from a table declared inside the handler
 *    (`const ctdRequiredElements`) covering exactly 3.2.S.1, 3.2.S.2, 3.2.S.3,
 *    3.2.S.4 and 3.2.S.7. An author drafting 2.5 (Clinical Overview), 2.7.3,
 *    2.7.4 or 4.2.3 was told nothing about what the section must contain, while
 *    server/services/ind/ctd/authoring-guidance.ts has carried
 *    `keyContentElements` for all 134 registered codes the whole time.
 *
 *    The record's elements are DESCRIPTIONS ("Product development rationale
 *    linking unmet need, MOA, and program design (2.5.1)"), so a substring test
 *    over them would flag essentially every element of every section. They are
 *    therefore served as a READ-ONLY statement of what the section must
 *    contain, explicitly not verified by this scan — and the resolver
 *    (resolveRequirements / resolveSectionBriefSource) answers, so a parent
 *    code like 4.2.3, which has no entry of its own, resolves to the sections
 *    it contains instead of coming back empty, and a code the record does not
 *    index reads as "not indexed", never as "nothing required".
 *
 * 2. A KEYWORD'S ABSENCE WAS REPORTED AS AN AGENCY REQUIREMENT. The
 *    module_keywords deficiency recommended "Include discussion of <keyword> as
 *    required by FDA guidelines" — a word-presence heuristic dressed as a
 *    requirement of the agency, in the same response the handler frames as
 *    "not a compliance determination".
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-deficiency-scan-record';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';
import { CTD_AUTHORING_GUIDANCE } from '../../services/ind/ctd/authoring-guidance';

/**
 * The basis line the handler actually emits, byte for byte —
 * `basisLabel(CTD_RECORD_BASIS)` from shared/regulatory/regulatory-basis.ts.
 * Pinned as a literal and not recomputed from the constant, so changing the ref
 * has to be done deliberately in both places; the client test
 * (client/src/concept2cure/v2/__tests__/authoringSectionCheckRecord.test.tsx)
 * fixtures the same literal, so the two sides cannot drift unnoticed. Note what
 * it must keep saying: recall, not the regulator's own text.
 */
const SERVER_BASIS =
  "ICH M4 CTD content, as compiled in the platform record (recall — not checked against the regulator's text)";

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: 7, email: 'ra@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

function wireSection(code: string, content: string, module = 'M2') {
  mockQuery.mockImplementation(async (sql: unknown) => {
    if (String(sql).includes('FROM authoring_sections')) {
      return {
        rowCount: 1,
        rows: [{ id: 'S1', doc_id: 'D1', code, title: 'A section', content, module }],
      };
    }
    return { rowCount: 0, rows: [] };
  });
}

async function scan() {
  return request(makeApp())
    .post('/api/authoring/sections/S1/ai/deficiency-scan')
    .set('Authorization', await bearer())
    .send({});
}

beforeEach(() => mockQuery.mockReset());

describe('the scan states what the record says the section must contain', () => {
  it('serves 2.5 the record’s own nine elements, from its own entry, unverified by this check', async () => {
    wireSection('2.5', 'x'.repeat(400), 'M2');
    const s = (await scan()).body.scan_results;

    const rec = s.record_requirements;
    expect(rec).toBeTruthy();
    expect(rec.indexed).toBe(true);
    expect(rec.source).toBe('exact');
    expect(rec.answered_by).toBe('2.5');
    expect(rec.title).toMatch(/Clinical Overview/i);
    // The record's list, byte for byte — not a second copy of it.
    expect(rec.elements).toEqual(CTD_AUTHORING_GUIDANCE['2.5'].keyContentElements);
    expect(rec.elements).toHaveLength(9);
    // Said to be unverified, and said so in words the author reads.
    expect(rec.verified_by_this_check).toBe(false);
    expect(rec.note).toMatch(/does not verify/i);
    // A regulatory statement carries its basis, and recall says it is recall.
    // Exact, so the ref cannot change under the panel unnoticed.
    expect(rec.basis).toBe(SERVER_BASIS);
    expect(rec.basis).toMatch(/recall — not checked against the regulator's text/);
    // The basis a user reads names the guidance, not a path in this repository.
    expect(rec.basis).not.toMatch(/server\/|\.ts\b/);
  });

  it('does not turn the record’s descriptions into deficiencies, nor into an extra check', async () => {
    wireSection('2.5', 'x'.repeat(400), 'M2');
    const s = (await scan()).body.scan_results;

    // Nine descriptions substring-tested against prose would be nine false flags.
    expect(s.deficiencies.filter((d: any) => d.type === 'missing_ctd_element')).toEqual([]);
    // Length, module keywords, data, placeholders, structure. The record read
    // is a statement, not a check, so it must not move the denominator.
    expect(s.checks_run).toBe(5);
  });

  it('keeps 2.7.3 and 2.7.4 on their own entries', async () => {
    for (const code of ['2.7.3', '2.7.4']) {
      wireSection(code, 'x'.repeat(400), 'M2');
      const rec = (await scan()).body.scan_results.record_requirements;
      expect(rec.indexed).toBe(true);
      expect(rec.source).toBe('exact');
      expect(rec.answered_by).toBe(code);
      expect(rec.elements).toEqual(CTD_AUTHORING_GUIDANCE[code].keyContentElements);
    }
  });

  it('resolves 4.2.3 — a parent the record carries only the leaves of — to the sections it contains', async () => {
    wireSection('4.2.3', 'x'.repeat(400), 'M4');
    const rec = (await scan()).body.scan_results.record_requirements;

    expect(rec.indexed).toBe(true);
    expect(rec.source).toBe('parent');
    expect(rec.answered_by).toBe('4.2.3');
    // Not empty, and not pretending the parent has content elements of its own.
    expect(rec.elements).toEqual([]);
    expect(rec.contains.length).toBeGreaterThan(0);
    expect(rec.contains.map((c: any) => c.code)).toContain('4.2.3.3');
    expect(JSON.stringify(rec.contains)).toMatch(/Genotoxicity/);
    // The panel supplies the code, so the title must not repeat it.
    expect(rec.title).toBe('the sections it contains');
    expect(rec.title).not.toMatch(/4\.2\.3/);
    // 7 children, all of them listed.
    expect(rec.contains_omitted).toBe(0);
    expect(rec.basis).toBe(SERVER_BASIS);
  });

  it('caps a wide parent’s listing and says how many it withheld — never a silently short list', async () => {
    // 3.2.P has no entry of its own either, and the record carries far more
    // leaves under it than a compact note should print.
    wireSection('3.2.P', 'x'.repeat(400), 'M3');
    const rec = (await scan()).body.scan_results.record_requirements;

    expect(rec.indexed).toBe(true);
    expect(rec.source).toBe('parent');
    const total = Object.keys(CTD_AUTHORING_GUIDANCE).filter((c) => c.startsWith('3.2.P.')).length;
    expect(total).toBeGreaterThan(12);
    // Capped the way the record's own renderer caps it (section-brief.ts
    // LIST_CAPS.children = 12), with the remainder reported, not dropped.
    expect(rec.contains).toHaveLength(12);
    expect(rec.contains_omitted).toBe(total - 12);
  });

  it('answers a sub-section with no entry of its own from its containing section, and says so', async () => {
    // 2.7.3.1 is drafted under 2.7.3; the record registers 2.7.3, not the leaf.
    wireSection('2.7.3.1', 'x'.repeat(400), 'M2');
    const rec = (await scan()).body.scan_results.record_requirements;

    expect(rec.indexed).toBe(true);
    expect(rec.source).toBe('ancestor');
    expect(rec.answered_by).toBe('2.7.3');
    expect(rec.elements).toEqual(CTD_AUTHORING_GUIDANCE['2.7.3'].keyContentElements);
  });

  it('a code the record does not index reads as not indexed — never as nothing required', async () => {
    for (const code of ['9.9.9', 'scoped.document']) {
      wireSection(code, 'x'.repeat(400), 'M2');
      const body = (await scan()).body;
      const rec = body.scan_results.record_requirements;

      // Present and honest: fail closed, never silently omitted.
      expect(rec).toBeTruthy();
      expect(rec.indexed).toBe(false);
      // The resolver's own words.
      expect(rec.reason).toMatch(/no entry for/i);
      expect(rec.reason).toMatch(new RegExp(code.replace('.', '\\.')));
      expect(rec.elements).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/nothing required|no requirements/i);
    }
  });
});

describe('a missing keyword is not an agency requirement', () => {
  it('never says "as required by", and never attributes the keyword to the region', async () => {
    wireSection('3.2.P.1', '', 'M3');
    const body = (await scan()).body;
    const keyword = body.scan_results.deficiencies.filter((d: any) => d.type === 'missing_keyword');

    expect(keyword).toHaveLength(6);
    expect(JSON.stringify(body)).not.toMatch(/as required by/i);
    for (const d of keyword) {
      expect(String(d.recommendation)).not.toMatch(/FDA|EMA|PMDA|guidelines|required by/i);
      // It says what it is: a term the module's keyword profile expects discussed.
      expect(String(d.recommendation)).toMatch(/not an agency requirement/i);
    }
  });

  it('leaves the five-code substring check and its honest wording alone', async () => {
    wireSection('3.2.S.3', 'x'.repeat(200) + '\nTable 1\nspecification validation stability quality manufacture control\na\nb\nc', 'M3');
    const s = (await scan()).body.scan_results;

    const ctd = s.deficiencies.filter((d: any) => d.type === 'missing_ctd_element');
    expect(ctd.length).toBeGreaterThan(0);
    expect(JSON.stringify(ctd)).toMatch(/would normally discuss/);
  });
});
