import { describe, expect, it } from 'vitest';
import { decideParser } from '../../services/ingestion/parserArbitration';

describe('decideParser', () => {
  it('uses docling by default when enabled and mime is supported', () => {
    const decision = decideParser({
      documentId: 'doc-1',
      sourceMimeType: 'application/pdf',
      sourceSizeBytes: 1024,
      doclingEnabled: true,
      unstructuredFallbackEnabled: true,
    });

    expect(decision.selectedParser).toBe('docling');
    expect(decision.fallbackUsed).toBe(false);
    expect(decision.fallbackTrigger).toBeNull();
  });

  it('falls back to unstructured when primary is disabled', () => {
    const decision = decideParser({
      documentId: 'doc-2',
      sourceMimeType: 'application/pdf',
      sourceSizeBytes: 1024,
      doclingEnabled: false,
      unstructuredFallbackEnabled: true,
    });

    expect(decision.selectedParser).toBe('unstructured');
    expect(decision.fallbackUsed).toBe(true);
    expect(decision.fallbackTrigger).toBe('primary_disabled');
  });

  it('falls back to unstructured when mime is unsupported', () => {
    const decision = decideParser({
      documentId: 'doc-3',
      sourceMimeType: 'application/rtf',
      sourceSizeBytes: 1024,
      doclingEnabled: true,
      unstructuredFallbackEnabled: true,
    });

    expect(decision.selectedParser).toBe('unstructured');
    expect(decision.fallbackTrigger).toBe('unsupported_mime');
  });

  it('falls back for oversized document when enabled', () => {
    const decision = decideParser({
      documentId: 'doc-4',
      sourceMimeType: 'application/pdf',
      sourceSizeBytes: 80 * 1024 * 1024,
      doclingEnabled: true,
      unstructuredFallbackEnabled: true,
    });

    expect(decision.selectedParser).toBe('unstructured');
    expect(decision.fallbackTrigger).toBe('oversized_document');
  });

  it('honors explicit parser request', () => {
    const decision = decideParser({
      documentId: 'doc-5',
      sourceMimeType: 'application/rtf',
      sourceSizeBytes: 80 * 1024 * 1024,
      requestedParser: 'docling',
      doclingEnabled: false,
      unstructuredFallbackEnabled: true,
    });

    expect(decision.selectedParser).toBe('docling');
    expect(decision.fallbackUsed).toBe(false);
  });
});
