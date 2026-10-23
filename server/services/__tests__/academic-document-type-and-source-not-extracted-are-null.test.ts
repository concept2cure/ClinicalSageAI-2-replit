/**
 * A processed academic document whose metadata states no type or source
 * records neither.
 *
 * What the code used to do (until 2026-10-22): processPdfDocument took
 * `documentInfo.type || 'Academic Paper'` and `documentInfo.source || 'Unknown'`,
 * so a document whose type nobody extracted was recorded (in the returned
 * document, the on-disk record and the search results) as an academic paper,
 * and its source as a source named "Unknown".
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

describe('processPdfDocument: type and source', () => {
  it('records null for a type and a source the metadata does not state', async () => {
    metadata.value = { title: 'A trial', year: 2019 };

    const doc = await new AcademicDocumentProcessor().processPdfDocument('/x/paper.pdf', 'paper.pdf');

    expect(doc.type, "an unextracted type was recorded as 'Academic Paper'").toBeNull();
    expect(doc.source, "an unextracted source was recorded as 'Unknown'").toBeNull();
    const saved = JSON.parse(written[0].data);
    expect(saved.type).toBeNull();
    expect(saved.source).toBeNull();
    expect(Buffer.from(saved.id, 'base64').toString()).toBe('A trial-source not stated-2019');
  });

  it('keeps a type and a source the metadata states', async () => {
    metadata.value = { title: 'A trial', type: 'Review', source: 'J Trials', year: 2019 };

    const doc = await new AcademicDocumentProcessor().processPdfDocument('/x/paper.pdf', 'paper.pdf');

    expect(doc).toMatchObject({ type: 'Review', source: 'J Trials' });
  });
});
