export type DocumentParserProvider = 'docling' | 'unstructured' | 'tika' | 'tesseract.js';

export interface IntakeFileDescriptor {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
}

export interface TikaMetadataResult {
  contentType: string;
  detectedType?: string;
  isScannedPdf: boolean;
  languageHints: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface ParsedDocumentSection {
  id: string;
  title: string;
  level: number;
  text: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface ParsedDocument {
  provider: DocumentParserProvider;
  text: string;
  sections: ParsedDocumentSection[];
  confidence: number;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export interface IntakePipelineReport {
  requestId: string;
  file: IntakeFileDescriptor;
  tika: TikaMetadataResult;
  ocrApplied: boolean;
  primaryParse: ParsedDocument;
  fallbackParse?: ParsedDocument;
  selectedProvider: DocumentParserProvider;
  provenance: Array<{
    step: string;
    provider: string;
    startedAt: string;
    completedAt: string;
    success: boolean;
    details?: string;
  }>;
}

export interface CitationNormalized {
  citationId: string;
  sourceText: string;
  cslJson?: Record<string, unknown>;
  renderedApa?: string;
  doi?: string;
  pmid?: string;
}

export interface CitationNormalizationPayload {
  sourceDocumentId: string;
  references: CitationNormalized[];
}

export interface DocumentQualityIssue {
  checker: 'vale' | 'languagetool' | 'concept2cure';
  severity: 'info' | 'warning' | 'error';
  message: string;
  offsetStart?: number;
  offsetEnd?: number;
  ruleId?: string;
}

export interface DocumentQualityReport {
  artifactId: string;
  versionId: string;
  advisoryMode: boolean;
  generatedAt: string;
  issues: DocumentQualityIssue[];
}

export interface ReviewDiffArtifact {
  artifactId: string;
  fromVersionId: string;
  toVersionId: string;
  redlinesJson: Record<string, unknown>;
  diff2html: string;
  generatedAt: string;
}

export interface PdfValidationReport {
  validator: 'verapdf';
  compliant: boolean;
  profile: string;
  failures: Array<{
    ruleId: string;
    message: string;
    objectRef?: string;
  }>;
  rawSummary?: string;
}
