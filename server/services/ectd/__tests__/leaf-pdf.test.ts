/**
 * Leaf rendering has to be reproducible or the sequence lifecycle is a no-op.
 *
 * The diff that decides whether a follow-up sequence re-files a document
 * compares the md5 of the rendered leaf against the md5 recorded when the prior
 * sequence was filed. PDFKit stamps `/CreationDate` from the wall clock at
 * one-second granularity, so before this module every leaf differed from
 * itself: `unchanged` was unreachable and every follow-up superseded the whole
 * tree at the agency. The first case here is that defect, written as a test —
 * it renders the same content twice across a second boundary.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildLeafPdf } from '../leaf-pdf';

const AT = new Date('2026-03-04T05:06:07.000Z');
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('buildLeafPdf', () => {
  it('renders the same content to the same bytes ACROSS A SECOND BOUNDARY', async () => {
    const input = { title: 'Clinical Overview — Overview (2.5)', markdown: '### A\n\nBody.\n', contentModifiedAt: AT };
    const first = await buildLeafPdf(input);
    await sleep(1100); // the granularity at which PDFKit's own timestamp moves
    const second = await buildLeafPdf(input);
    expect(md5(second)).toBe(md5(first));
    expect(first.subarray(0, 4).toString()).toBe('%PDF');
  }, 20_000);

  it('does not embed the wall clock: the same content renders identically whenever it is assembled', async () => {
    const input = { title: 'T', markdown: 'Body.', contentModifiedAt: AT };
    const bytes = await buildLeafPdf(input);
    // A run-time timestamp would appear as a PDF date literal for TODAY.
    const today = new Date().toISOString().slice(0, 4);
    const dates = [...bytes.toString('latin1').matchAll(/\(D:(\d{14})/g)].map((m) => m[1]);
    expect(dates.length).toBeGreaterThan(0);          // it does carry dates
    expect(dates.every((d) => !d.startsWith(today) || today === '2026')).toBe(true);
    expect(dates.every((d) => d.startsWith('20260304'))).toBe(true); // all of them the content's
  });

  it('is pinned against a pdfkit upgrade: the producer strings are ours, not the library version', async () => {
    const bytes = (await buildLeafPdf({ title: 'T', markdown: 'B', contentModifiedAt: AT })).toString('latin1');
    // A library version in /Producer means a dependency bump re-files every
    // leaf of every application as `replace`.
    expect(bytes).not.toMatch(/PDFKit/i);
    expect(bytes).toContain('Concept2Cure eCTD leaf renderer');
  });

  it('different content still renders differently — determinism is not collapse', async () => {
    const a = await buildLeafPdf({ title: 'T', markdown: 'One.', contentModifiedAt: AT });
    const b = await buildLeafPdf({ title: 'T', markdown: 'Two.', contentModifiedAt: AT });
    const c = await buildLeafPdf({ title: 'Other', markdown: 'One.', contentModifiedAt: AT });
    const d = await buildLeafPdf({ title: 'T', markdown: 'One.', contentModifiedAt: new Date('2026-03-05T00:00:00Z') });
    expect(new Set([md5(a), md5(b), md5(c), md5(d)]).size).toBe(4);
  });
});
