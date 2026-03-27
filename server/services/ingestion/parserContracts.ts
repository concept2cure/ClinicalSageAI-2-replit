export type ParserName = 'docling' | 'unstructured';

export interface ParserArbitrationInput {
  documentId: string;
  sourceMimeType: string;
  sourceSizeBytes: number;
  requestedParser?: ParserName;
  doclingEnabled: boolean;
  unstructuredFallbackEnabled: boolean;
}

export type ParserFallbackTrigger =
  | 'primary_disabled'
  | 'unsupported_mime'
  | 'primary_failed'
  | 'oversized_document'
  | null;

export interface ParserArbitrationDecision {
  decisionId: string;
  documentId: string;
  selectedParser: ParserName;
  fallbackUsed: boolean;
  fallbackTrigger: ParserFallbackTrigger;
  qualitySignals: {
    supportsTables: boolean;
    supportsHierarchy: boolean;
    confidence: number;
  };
  durationMs: number;
  decidedAt: string;
}
