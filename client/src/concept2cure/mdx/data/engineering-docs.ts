/**
 * Documents the Engineering surface produces.
 *
 * Every regulatory artifact a device-engineering team is responsible for —
 * 21 CFR 820.30 design controls, ISO 14971 risk management, IEC 62304
 * software lifecycle, FDA 2023 cybersecurity guidance. Each row is a
 * single regulatory document with versioning, sections, sign-off, and
 * a route into the editor.
 *
 * Wire shape: GET /api/mdx/engineering/:programId/documents
 *
 * Status vocabulary aligns with the kit's section status pill:
 *   draft   → first-pass content, not yet reviewed
 *   review  → ready for peer review
 *   ready   → review complete, awaiting sign-off
 *   locked  → signed and version-frozen for the active submission cycle
 *   blocked → required content gap (red rail)
 */

export const ENG_DOC_FRAMEWORKS = [
  { id: '820',   label: '21 CFR 820.30', desc: 'Design controls' },
  { id: '14971', label: 'ISO 14971',     desc: 'Risk management' },
  { id: '62304', label: 'IEC 62304',     desc: 'Software lifecycle' },
  { id: 'cyber', label: 'FDA Cyber 2023',desc: 'Premarket cybersecurity' },
];

/**
 * The wire contract for GET /api/mdx/engineering/:programId/documents.
 *
 * This was `export const ENG_DOCUMENTS = [ ... ]` — example rows — and the
 * surface's row type was inferred from them (`typeof ENG_DOCUMENTS[number]`
 * in hooks/useEngineering.ts). So the API contract was defined by a fabricated
 * sample, and the sample asserted things no example should: three rows carried
 * `esigState: 'signed'` with a named signer and a date, which is an electronic
 * signature that never happened.
 *
 * The rows are gone and the contract is declared. `dhfRef` links into the DHF
 * strip; `editor` names which editor variant opens the doc; `sections` is what
 * the document-editor reads to render its left tree.
 */
export interface EngineeringDocument {
  id: string;
  framework: string;
  dhfRef: string;
  type: string;
  title: string;
  ver: string;
  /** draft | review | ready | locked | blocked — see the header. */
  status: string;
  completion: number;
  blocker: boolean;
  owner: string;
  reviewers: string[];
  lastEdit: string;
  esigRequired: boolean;
  /** na | pending | signed. `signedBy` is set only by a real signature. */
  esigState: string;
  signedBy?: string;
  sections: number;
  sectionsComplete: number;
  editor: string;
}
