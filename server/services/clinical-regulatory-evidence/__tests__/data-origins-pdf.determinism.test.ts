/**
 * The Data Origins PDF must hash the same every time it is printed.
 *
 * This backs a claim made in a CI allowlist. `scripts/ci/check-pdf-runtime-canonicality.mjs`
 * lets data-origins-pdf.ts call pdfkit directly — outside the canonical
 * converter — on the stated grounds that it still routes its bytes through that
 * converter's `makeDeterministic()`. A justification in an allowlist comment is
 * not evidence, and `makeDeterministic()` was written for LibreOffice and
 * Puppeteer output, not pdfkit's. So it is asserted here against real bytes.
 *
 * Why it matters more here than elsewhere: this document exists to tell a
 * reviewer where a passage came from. If its own SHA-256 changes on every
 * render, it cannot be filed, cited, or bound to an audit chain — the one
 * artefact in the platform least able to afford an unstable hash would have one.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { renderDataOriginsPdf } from '../data-origins-pdf';
import type { SelectionOrigins } from '../span-lineage.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** A report with both provenance kinds and an unattributed gap. */
const REPORT = {
  documentTable: 'authoring_sections',
  documentId: 'doc-1',
  generatedAt: '2026-08-04T00:00:00.000Z',
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

describe('the Data Origins report hashes the same every time', () => {
  it('two renders of the same report are byte-identical', async () => {
    const a = await renderDataOriginsPdf(REPORT, { documentTitle: 'M2.4', requestedBy: 'sarah' });
    // Any per-run metadata pdfkit stamps (CreationDate, ModDate, /ID) would land
    // between these two calls. A sleep is not needed: the fields are written at
    // render time from the clock, so if they survived, the two buffers would
    // differ whenever the clock ticks — and this test would be flaky rather than
    // failing. Comparing hashes directly is the assertion; the guard against a
    // silently-passing version of it is the negative test below.
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
    // Without this the first test passes just as well on a function that returns
    // a constant. Determinism has to mean "same input, same bytes", not
    // "same bytes regardless of input".
    const a = await renderDataOriginsPdf(REPORT);
    const b = await renderDataOriginsPdf({
      ...REPORT, coveragePercent: 12, uncovered: [{ charStart: 0, charEnd: 120 }],
    } as unknown as SelectionOrigins);
    expect(sha(a)).not.toBe(sha(b));
  }, 30_000);
});
