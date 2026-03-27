import {
  type ParserArbitrationDecision,
  type ParserArbitrationInput,
  type ParserFallbackTrigger,
} from './parserContracts';

const DOCLING_SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
]);

const LARGE_DOCUMENT_BYTES = 50 * 1024 * 1024;

function supportsDoclingMime(mimeType: string): boolean {
  return DOCLING_SUPPORTED_MIME_TYPES.has((mimeType || '').toLowerCase());
}

function makeDecisionId(documentId: string): string {
  return `parser_decision_${documentId}_${Date.now()}`;
}

export function decideParser(input: ParserArbitrationInput): ParserArbitrationDecision {
  const started = Date.now();

  let selectedParser: 'docling' | 'unstructured' = 'docling';
  let fallbackUsed = false;
  let fallbackTrigger: ParserFallbackTrigger = null;

  if (input.requestedParser) {
    selectedParser = input.requestedParser;
  } else if (!input.doclingEnabled) {
    selectedParser = 'unstructured';
    fallbackUsed = true;
    fallbackTrigger = 'primary_disabled';
  } else if (input.sourceSizeBytes > LARGE_DOCUMENT_BYTES && input.unstructuredFallbackEnabled) {
    selectedParser = 'unstructured';
    fallbackUsed = true;
    fallbackTrigger = 'oversized_document';
  } else if (!supportsDoclingMime(input.sourceMimeType) && input.unstructuredFallbackEnabled) {
    selectedParser = 'unstructured';
    fallbackUsed = true;
    fallbackTrigger = 'unsupported_mime';
  }

  if (selectedParser === 'unstructured' && !input.unstructuredFallbackEnabled && !input.requestedParser) {
    selectedParser = 'docling';
    fallbackUsed = false;
    fallbackTrigger = null;
  }

  const qualitySignals =
    selectedParser === 'docling'
      ? { supportsTables: true, supportsHierarchy: true, confidence: 0.9 }
      : { supportsTables: true, supportsHierarchy: false, confidence: 0.75 };

  return {
    decisionId: makeDecisionId(input.documentId),
    documentId: input.documentId,
    selectedParser,
    fallbackUsed,
    fallbackTrigger,
    qualitySignals,
    durationMs: Date.now() - started,
    decidedAt: new Date().toISOString(),
  };
}
