/**
 * A Reporting PDF's bytes are a function of what the export records, and its
 * metadata states the export it belongs to.
 *
 * The export route records the sha256 of the bytes it sends on the audit chain
 * (routes/report-os.ts sendRecordedPdf). That hash can be checked later only if
 * rendering the same report with the same export id and time gives the same
 * bytes. pdf-lib stamps the wall clock into /CreationDate and /ModDate and its
 * own name into /Producer at PDFDocument.create(), so two renders a second
 * apart differed, and the file's metadata named a time no page of it printed.
 * The canonical converter (services/pdf-converter.ts makeDeterministic) solves
 * the same problem for output it does not control by overwriting the dates
 * with a fixed placeholder; here the writer controls its own metadata, so it
 * states the true export time instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildRunPdf, type RunPdfInput } from '../run-pdf';
import { buildBundlePdf, type BundlePdfInput } from '../bundle-pdf';

const EXPORTED_AT = '2026-10-01T10:00:00.000Z';

const RUN: RunPdfInput = {
  run: { id: 41, runUuid: 'run-uuid-41', reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '12', status: 'partial', confidence: 64, createdAt: new Date('2026-10-01T08:00:00.000Z') },
  typeLabel: 'Executive Readiness Digest',
  report: {
    reportTypeId: 'readiness.executive_digest',
    scopeType: 'project',
    scopeId: '12',
    generatedAt: '2026-10-01T08:00:00.000Z',
    status: 'partial',
    sections: [{ id: 'executive-summary', title: 'Executive summary', blocks: [{ kind: 'summary', text: 'Readiness holds at partial.' }] }],
  },
  seal: null,
  runBy: 'Sam Lee',
  exportId: 'exp-123',
  exportedAt: EXPORTED_AT,
};

const BUNDLE: BundlePdfInput = {
  bundle: { bundleId: 'b1b2b3b4-0000-4000-8000-000000000001', name: 'Board pack', description: 'Q4 board', createdAt: '2026-09-30T12:00:00.000Z' },
  bundledBy: 'Sam Lee',
  items: [{ runId: 41, label: 'Executive Readiness Digest', scopeType: 'project', scopeId: '12', bundledStatus: 'partial', currentStatus: 'partial', confidence: 64 }],
  exportId: 'exp-9',
  exportedAt: EXPORTED_AT,
};

/** Render at two different wall-clock moments, as a re-verification months later would. */
async function twice(build: () => Promise<{ bytes: Buffer }>): Promise<[Buffer, Buffer]> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T10:00:03.000Z'));
  const first = (await build()).bytes;
  vi.setSystemTime(new Date('2027-01-15T16:42:59.000Z'));
  const second = (await build()).bytes;
  return [first, second];
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ['the run PDF', () => buildRunPdf(RUN), 'exp-123'],
  ['the bundle PDF', () => buildBundlePdf(BUNDLE), 'exp-9'],
] as const)('%s', (_label, build, exportId) => {
  it('renders the same bytes from the same recorded export, whenever it is rendered', async () => {
    const [a, b] = await twice(build);
    expect(a.equals(b), 'two renders of one export differ, so its recorded sha256 cannot be re-verified').toBe(true);
  });

  it('states the export in its metadata: the printed export time, the export id, the platform as producer', async () => {
    const doc = await PDFDocument.load((await build()).bytes, { updateMetadata: false });
    expect(doc.getCreationDate()?.toISOString()).toBe(EXPORTED_AT);
    expect(doc.getModificationDate()?.toISOString()).toBe(EXPORTED_AT);
    expect(doc.getSubject()).toContain(exportId);
    expect(doc.getProducer()).toMatch(/Concept2Cure/);
    expect(doc.getProducer() ?? '').not.toMatch(/pdf-lib/);
  });
});

it('renders nothing under an export time that is not a time', async () => {
  await expect(buildRunPdf({ ...RUN, exportedAt: 'not recorded' })).rejects.toThrow(/not a valid time/);
  await expect(buildBundlePdf({ ...BUNDLE, exportedAt: '' })).rejects.toThrow(/not a valid time/);
});
