/**
 * AnA document-type detection — the SSE payload contract.
 *
 * This is the single source of truth for the `detectedDocumentTemplate` object
 * carried on the `orchestration` Server-Sent Event. The server builds it in
 * server/routes/ana-ri/stream.ts; the client binds to it in
 * client/src/concept2cure/components/ana/useAnaChat.ts; the design surfaces
 * (the detected-type chip and the section-outline panel) render from it.
 *
 * Import this type on BOTH sides so the wire contract can never silently drift.
 */

/**
 * One section of a detected document's ICH/FDA structure.
 *
 * This is the client-facing subset of the server's `TemplateSection`
 * (server/services/ana-ri/document-templates.ts). The server's `guidance`
 * field is intentionally omitted — it is prompt material for generation, not
 * something the UI renders.
 */
export interface DetectedDocumentSection {
  /** Section heading, e.g. "2.5.1 Product Development Rationale". */
  heading: string;
  /** ICH/CTD code, e.g. "2.5.1", when the section carries one. */
  code?: string;
  /** Whether the section is required for a conformant document. */
  required: boolean;
  /** Target word range [min, max], when the template specifies one. */
  targetWords?: [number, number];
}

/** Regulatory authority that governs a detected document type. */
export type DetectedDocumentAuthority =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'ICH'
  | 'ISO'
  | 'Multi';

/**
 * The detected-document-template metadata forwarded to the client on the
 * `orchestration` SSE event. The server sends `null` when no document type was
 * detected for the turn (the common case — most messages are not document
 * requests).
 */
export interface DetectedDocumentTemplatePayload {
  /** Stable template id, e.g. "ctd_2_5_clinical_overview". */
  id: string;
  /** Full display name, e.g. "Clinical Overview (2.5)". */
  displayName: string;
  /** Short chip label, e.g. "Clinical Overview". */
  chipLabel: string;
  /** Governing regulatory authority. */
  authority: DetectedDocumentAuthority;
  /** Submission family, e.g. "NDA/BLA/MAA". */
  submissionFamily: string;
  /** Detection confidence, 0–1. Treatments below ~0.4 should read as tentative. */
  confidence: number;
  /**
   * The document's section structure — headings, ICH codes, required flags,
   * and word targets. Empty array if the template defines no sections.
   */
  sections: DetectedDocumentSection[];
}
