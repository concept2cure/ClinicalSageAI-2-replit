import { describe, expect, it } from 'vitest';
import { DocumentIntakePipeline } from '../../server/services/documentIntelligence/intakePipeline';

describe('DocumentIntakePipeline', () => {
  it('uses unstructured fallback when docling confidence is low', async () => {
    const pipeline = new DocumentIntakePipeline({
      tika: {
        detectMetadata: async () => ({
          contentType: 'application/pdf',
          isScannedPdf: false,
          languageHints: ['en'],
          metadata: {},
        }),
      } as any,
      ocr: { run: async () => ({ applied: false }) } as any,
      docling: {
        parse: async () => ({
          provider: 'docling',
          text: 'short',
          sections: [],
          confidence: 0.2,
          warnings: [],
        }),
      } as any,
      unstructured: {
        parse: async () => ({
          provider: 'unstructured',
          text: 'This is a much longer recovered text body from fallback parser.',
          sections: [],
          confidence: 0.7,
          warnings: [],
        }),
      } as any,
    });

    const report = await pipeline.process({
      file: { filename: 'sample.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
      inputBuffer: Buffer.from('pdf-bytes'),
    });

    expect(report.selectedProvider).toBe('unstructured');
    expect(report.fallbackParse?.provider).toBe('unstructured');
    expect(report.provenance.some((step) => step.step === 'unstructured_fallback')).toBe(true);
  });

  it('invokes OCR when tika identifies scanned pdf and paths provided', async () => {
    const pipeline = new DocumentIntakePipeline({
      tika: {
        detectMetadata: async () => ({
          contentType: 'application/pdf',
          isScannedPdf: true,
          languageHints: [],
          metadata: {},
        }),
      } as any,
      ocr: { run: async () => ({ applied: true }) } as any,
      docling: {
        parse: async () => ({
          provider: 'docling',
          text: 'enough text to avoid fallback '.repeat(15),
          sections: [],
          confidence: 0.8,
          warnings: [],
        }),
      } as any,
      unstructured: { parse: async () => ({ provider: 'unstructured', text: '', sections: [], confidence: 0, warnings: [] }) } as any,
    });

    const report = await pipeline.process({
      file: { filename: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
      inputBuffer: Buffer.from('scan'),
      inputPath: '/tmp/input.pdf',
      ocrOutputPath: '/tmp/output.pdf',
    });

    expect(report.ocrApplied).toBe(true);
  });
});
