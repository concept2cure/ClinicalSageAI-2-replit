/**
 * The Data Origins PDF must hash the same every time it is printed.
 *
 * This backs a claim made in a CI allowlist. `scripts/ci/check-pdf-runtime-canonicality.mjs`
 * lets data-origins-pdf.ts call pdfkit directly — outside the canonical
 * converter — on the stated grounds that its output is still reproducible. A
 * justification written in an allowlist comment is not evidence, so it is
 * asserted here against real bytes.
 *
 * Why it matters more here than elsewhere: this document exists to tell a
 * reviewer where a passage came from. If its own SHA-256 changes on every
 * render, it cannot be filed, cited, or bound to an audit chain — the one
 * artefact in the platform least able to afford an unstable hash would have one.
 *
 * ── WHY THIS FILE IS SHAPED THE WAY IT IS ─────────────────────────────────────
 * The first version of this test passed everywhere and proved nothing. It
 * rendered twice back to back, and its own comment argued a delay was
 * unnecessary because a surviving clock value "would make this test flaky
 * rather than failing". That was wrong in the direction that matters: two
 * renders take ~40 ms, pdfkit stamps its dates to whole-second resolution, so
 * the two values agreed on virtually every run. The bug shipped green and was
 * caught by a CI runner slow enough to straddle a second boundary.
 *
 * So determinism is now asserted two ways, and neither can pass by luck:
 *
 *   1. BY VALUE — every `(D:…)` date in the file must equal the one derived
 *      from `report.generatedAt`. This holds on a single render, so it does not
 *      depend on two renders happening to disagree. A clock reading anywhere in
 *      the output fails it immediately.
 *   2. BY BYTES — two renders separated by a *real* clock tick must be
 *      identical. This is the end-to-end claim, with the timing hole closed.
 *
 * Verified against the defect: with the fix reverted, (1) fails on any run and
 * (2) fails on every run, diverging at byte 1737 on `17 0 obj (D:…)`.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { renderDataOriginsPdf } from '../data-origins-pdf';
import type { SelectionOrigins } from '../span-lineage.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Every `(D:…)` date literal in the file, wherever pdfkit put it. */
const dateLiterals = (b: Buffer): string[] => b.toString('latin1').match(/\(D:[^)]*\)/g) ?? [];

/**
 * Block until the wall clock's second changes.
 *
 * pdfkit renders dates at whole-second resolution, so a leaked clock value is
 * only observable across a second boundary. Sleeping a flat 1000 ms would
 * *usually* cross one; waiting for the digit to actually change always does,
 * and typically costs ~500 ms rather than a full second.
 */
async function crossASecondBoundary(): Promise<void> {
  const startedIn = Math.floor(Date.now() / 1000);
  while (Math.floor(Date.now() / 1000) === startedIn) {
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 5));
  }
}

/**
 * A report with both provenance kinds and an unattributed gap.
 *
 * `generatedAt` is deliberately a moment in the past that no CI run can be
 * happening at. If the fixture used "today", a clock-derived date would match
 * the expected literal during the one second per day when they coincide, and
 * the by-value assertion below would have a hole in exactly the place this
 * whole file exists to close.
 */
const REPORT = {
  documentTable: 'authoring_sections',
  documentId: 'doc-1',
  generatedAt: '2025-03-09T11:22:33.000Z',
  selection: { charStart: 0, charEnd: 120, text: 'The NOAEL was 30 mg/kg/day.' },
  coveragePercent: 78,
  counts: { total: 2, fromSources: 1, authorAsserted: 1, stale: 1 },
  origins: [
    {
      charStart: 0, charEnd: 60, usage: 'quoted',
      provenanceKind: 'cre_evidence_source', referenceId: '42',
      payloadSha256: 'a'.repeat(64), sourceTitle: 'TOX-2025-014',
      sourceLocator: 'p. 47, Table 12', confidence: 0.94,
      state: 'changed', assertedBy: null,
    },
    {
      charStart: 60, charEnd: 100, usage: 'asserted',
      provenanceKind: 'author_assertion', referenceId: null,
      payloadSha256: null, sourceTitle: null, sourceLocator: null,
      confidence: null, state: 'current', assertedBy: 'sarah@example.com',
    },
  ],
  uncovered: [{ charStart: 100, charEnd: 120 }],
} as unknown as SelectionOrigins;

/** `2025-03-09T11:22:33.000Z` in PDF date syntax — pdfkit writes UTC, so this is TZ-independent. */
const EXPECTED_DATE = '(D:20250309112233Z)';

describe('the Data Origins report hashes the same every time', () => {
  it('every date in the file comes from the report, not from the clock', async () => {
    const dates = dateLiterals(await renderDataOriginsPdf(REPORT));

    // Non-vacuous: if pdfkit ever stopped writing dates at all, the set
    // comparison below would pass trivially and stop testing anything.
    expect(dates.length).toBeGreaterThan(0);
    expect(new Set(dates)).toEqual(new Set([EXPECTED_DATE]));
  }, 30_000);

  it('two renders separated by a real clock tick are byte-identical', async () => {
    const a = await renderDataOriginsPdf(REPORT, { documentTitle: 'M2.4', requestedBy: 'sarah' });
    await crossASecondBoundary();
    const b = await renderDataOriginsPdf(REPORT, { documentTitle: 'M2.4', requestedBy: 'sarah' });

    expect(sha(a)).toBe(sha(b));
    expect(a.equals(b)).toBe(true);
  }, 30_000);

  it('still produces a real PDF, not an empty or truncated buffer', async () => {
    const pdf = await renderDataOriginsPdf(REPORT);
    const raw = pdf.toString('latin1');

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true); // not truncated mid-write

    // The determinism step must not have stripped the content along with the
    // metadata — an empty PDF is perfectly reproducible and perfectly useless.
    // The report's TEXT is not assertable here: pdfkit writes it into FlateDecode
    // content streams, so 'Data Origins' does not appear in the raw bytes and a
    // string match would only ever prove the test wrong. Structure is what is
    // checkable without decompressing: a page tree, and a body substantial
    // enough that the sections above were actually drawn.
    expect(raw).toContain('/Type /Page');
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);

  it('a different report still yields a different hash', async () => {
    // Without this the tests above pass just as well on a function that returns
    // a constant. Determinism has to mean "same input, same bytes", not
    // "same bytes regardless of input".
    const a = await renderDataOriginsPdf(REPORT);
    const b = await renderDataOriginsPdf({
      ...REPORT, coveragePercent: 12, uncovered: [{ charStart: 0, charEnd: 120 }],
    } as unknown as SelectionOrigins);
    expect(sha(a)).not.toBe(sha(b));
  }, 30_000);

  it('the same report generated at a different moment yields a different hash', async () => {
    // The date is bound to report content, so it must still VARY with that
    // content. This is what separates the fix from the lazy version of it —
    // hardcoding one constant date would satisfy every other test in this file
    // while making two genuinely different reports collide.
    const later = { ...REPORT, generatedAt: '2025-03-09T11:22:34.000Z' } as unknown as SelectionOrigins;

    expect(dateLiterals(await renderDataOriginsPdf(later))).not.toContain(EXPECTED_DATE);
    expect(sha(await renderDataOriginsPdf(REPORT))).not.toBe(sha(await renderDataOriginsPdf(later)));
  }, 30_000);

  it('a malformed generatedAt falls back to a FIXED date, never to the clock', async () => {
    // The path least likely to be exercised is the one where a clock-based
    // fallback would hide: a report whose timestamp is absent or unparseable
    // would quietly go back to being non-reproducible, and nothing else in this
    // file would notice. The fallback is the epoch, and it is asserted.
    const broken = { ...REPORT, generatedAt: 'not a date' } as unknown as SelectionOrigins;

    const a = await renderDataOriginsPdf(broken);
    await crossASecondBoundary();
    const b = await renderDataOriginsPdf(broken);

    expect(new Set(dateLiterals(a))).toEqual(new Set(['(D:19700101000000Z)']));
    expect(a.equals(b)).toBe(true);
  }, 30_000);
});
