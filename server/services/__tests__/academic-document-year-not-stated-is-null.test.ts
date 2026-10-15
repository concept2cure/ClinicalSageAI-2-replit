/**
 * A processed academic document whose metadata states no year records no year.
 *
 * What the code used to do (until 2026-10-15): processPdfDocument took
 * `documentInfo.year || new Date().getFullYear()`, so a paper whose text stated
 * no publication year was recorded — in the returned document, the on-disk
 * record and its id — as published this year.
 *
 * The model, the PDF and the disk are doubles; nothing is written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { metadata, written } = vi.hoisted(() => ({
  metadata: { value: {} as Record<string, unknown> },
  written: [] as Array<{ file: string; data: string }>,
}));

vi.mock('fs', () => {
  const fake = {
    existsSync: () => true,
    mkdirSync: () => undefined,
    readdirSync: () => [],
    readFileSync: () => Buffer.from('%PDF-1.4'),
    writeFileSync: (file: string, data: string) => {
      written.push({ file, data });
    },
  };
  return { default: fake, ...fake };
});
vi.mock('../../config/huggingface-models', () => ({ getHuggingfaceModels: () => ({}) }));
vi.mock('../../huggingface-service', () => ({
  HuggingFaceService: class {
    extractTextFromPdf = async () => 'Endpoint text of a paper.';
    extractDocumentMetadata = async () => metadata.value;
    generateSummary = async () => 'A summary.';
    extractKeyInsights = async () => [];
    generateTags = async () => [];
    generateEmbeddings = async () => [0.1, 0.2];
  },
}));

import { AcademicDocumentProcessor } from '../academic-document-processor';

beforeEach(() => {
  written.length = 0;
});

describe('processPdfDocument', () => {
  it('records no year when the metadata states none, instead of this year', async () => {
    metadata.value = { title: 'A trial', type: 'Review', source: 'J Trials', year: null };

    const doc = await new AcademicDocumentProcessor().processPdfDocument('/x/paper.pdf', 'paper.pdf');

    expect(doc.year).toBeNull();
    const saved = JSON.parse(written[0].data);
    expect(saved.year).toBeNull();
    const id = Buffer.from(saved.id, 'base64').toString();
    expect(id).toBe('A trial-J Trials-year not stated');
    expect(id).not.toContain(String(new Date().getFullYear()));
  });

  it('keeps a year the metadata states', async () => {
    metadata.value = { title: 'A trial', type: 'Review', source: 'J Trials', year: 2019 };

    const doc = await new AcademicDocumentProcessor().processPdfDocument('/x/paper.pdf', 'paper.pdf');

    expect(doc.year).toBe(2019);
  });
});
