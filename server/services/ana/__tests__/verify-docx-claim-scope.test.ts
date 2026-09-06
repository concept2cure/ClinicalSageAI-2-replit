/**
 * verify_docx_against_source — the verdict may only claim what was checked.
 *
 * `expected_text` is optional: the handler's guard accepts `required_strings`
 * alone, and that is the DESIGNED path for the labeling / ODD / IND-module
 * planners, whose required_strings are section headers only. With no source
 * supplied the structural diff never runs, so `additions`/`deletions` keep their
 * initialized 0 and `ok` collapses to "no required header is missing".
 *
 * The success message nonetheless asserted BOTH that the document "reproduces
 * the source" AND that there is "no content divergence" — two claims about a
 * comparison that never happened, relayed verbatim by the model as the verdict
 * on a USPI/SmPC .docx.
 *
 * These tests drive the registered tool handler with a stubbed extractor and
 * pin the scoped claim. They fail against the pre-fix message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DOC_TEXT = '1 INDICATIONS AND USAGE\nDrug X is indicated for hypertension.\n2 DOSAGE\nTake one daily.';

vi.mock('../../ocr/index.js', () => ({
  extractDocumentText: vi.fn(async () => ({ text: DOC_TEXT, method: 'stub' })),
}));
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, promises: { ...actual.promises, readFile: vi.fn(async () => Buffer.from('x')) } };
});

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 7 } as any;

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('verify_docx_against_source');
  expect(handler, 'verify_docx_against_source handler must be registered').toBeTruthy();
  return JSON.parse(await handler!(input, CTX));
}

describe('verify_docx_against_source — claim scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT claim the document reproduces a source when none was supplied', async () => {
    const r = await run({
      input_docx_path: '/tmp/uspi.docx',
      required_strings: ['1 INDICATIONS AND USAGE', '2 DOSAGE'],
    });
    expect(r.ok).toBe(true);
    // Assert the FALSE CLAIM first, so a regression reports the defect itself
    // rather than the absence of the new bookkeeping field.
    expect(r.message).not.toMatch(/reproduces the source/i);
    expect(r.message).not.toMatch(/no content divergence\.$/i);
    expect(r.sourceDiffPerformed).toBe(false);
    // It must say plainly that no source was compared.
    expect(r.message).toMatch(/no source text was supplied/i);
    expect(r.divergence).toBeUndefined();
    expect(r.instruction).toMatch(/do not claim there is no content divergence/i);
  });

  it('still reports the required-string result honestly when one is missing', async () => {
    const r = await run({
      input_docx_path: '/tmp/uspi.docx',
      required_strings: ['1 INDICATIONS AND USAGE', '17 PATIENT COUNSELING'],
    });
    expect(r.ok).toBe(false);
    expect(r.missingRequiredStrings).toEqual(['17 PATIENT COUNSELING']);
    expect(r.message).toMatch(/NOT verified/);
    expect(r.message).not.toMatch(/vs\. source/);
  });

  it('DOES claim source fidelity when a source was actually diffed and matches', async () => {
    const r = await run({ input_docx_path: '/tmp/uspi.docx', expected_text: DOC_TEXT });
    expect(r.sourceDiffPerformed).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/reproduces the source/i);
    expect(r.divergence).toBeTruthy();
    expect(r.divergence.additions).toBe(0);
    expect(r.divergence.deletions).toBe(0);
  });

  it('reports real divergence when the document departs from the source', async () => {
    const r = await run({
      input_docx_path: '/tmp/uspi.docx',
      expected_text: 'A COMPLETELY DIFFERENT SOURCE\nWith other lines entirely.',
    });
    expect(r.sourceDiffPerformed).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/vs\. source/);
  });
});
