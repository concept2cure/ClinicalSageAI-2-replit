/**
 * Quality-system template family — the controlled-document types a client
 * builds their internal quality system from.
 *
 * One family ("Quality system") with seven document types. Each type maps to a
 * `qms_documents.doc_type` and carries the standard controlled-procedure
 * section skeleton (Purpose → Approval). The catalog is server-curated — like
 * `server/services/regulatory/templateCatalog.ts`, these templates are not
 * user-uploaded; clients instantiate documents from them.
 *
 * Surfaced by `GET /api/mdx/qms/templates`; consumed by
 * `POST /api/mdx/qms/documents` (a `templateKey` seeds `metadata.sections`).
 *
 * @module server/services/qms/sopTemplates
 */

export type QmsDocType =
  | 'manual'
  | 'policy'
  | 'sop'
  | 'wi'
  | 'form'
  | 'protocol'
  | 'curriculum';

export interface SopSection {
  /** Stable section key. */
  key: string;
  /** Sentence-case display label. */
  label: string;
  /** Display order within the document. */
  order: number;
  /** One-line authoring guidance shown in the outline. */
  hint?: string;
}

export interface SopTemplate {
  /** Stable catalog key (passed as `templateKey` on create). */
  key: string;
  /** Sentence-case display label. */
  label: string;
  /** The `qms_documents.doc_type` this template creates. */
  docType: QmsDocType;
  /** Family grouping shown in the template gallery. */
  family: string;
  /** One-line description. */
  description: string;
  /** Suggested document-number prefix (e.g. 'SOP-'). */
  numberPrefix: string;
  /** Default QMS category for the document register. */
  category: string;
  /** The controlled section skeleton. */
  sections: SopSection[];
}

/**
 * The standard controlled-procedure structure, applied to every quality-system
 * document type. Order follows ISO 13485 / 21 CFR 820 house style:
 * Purpose · Scope · Responsibilities · Definitions · Procedure · References ·
 * Attachments · Revision history · Approval.
 */
export const STANDARD_SECTIONS: SopSection[] = [
  { key: 'purpose',          label: 'Purpose',          order: 1, hint: 'Why this document exists and what it governs.' },
  { key: 'scope',            label: 'Scope',            order: 2, hint: 'What and who it applies to, with explicit exclusions.' },
  { key: 'responsibilities', label: 'Responsibilities', order: 3, hint: 'Roles accountable for each step.' },
  { key: 'definitions',      label: 'Definitions',      order: 4, hint: 'Terms, abbreviations, and acronyms used.' },
  { key: 'procedure',        label: 'Procedure',        order: 5, hint: 'The step-by-step controlled process.' },
  { key: 'references',       label: 'References',       order: 6, hint: 'Regulations, standards, and linked documents.' },
  { key: 'attachments',      label: 'Attachments',      order: 7, hint: 'Forms, templates, and records this document produces.' },
  { key: 'revision_history', label: 'Revision history', order: 8, hint: 'Version, date, author, and a summary of each change.' },
  { key: 'approval',         label: 'Approval',         order: 9, hint: 'Author, reviewer, and approver signatures.' },
];

/** A defensive copy of the standard skeleton so callers cannot mutate it. */
function standardSections(): SopSection[] {
  return STANDARD_SECTIONS.map((s) => ({ ...s }));
}

export const SOP_TEMPLATES: SopTemplate[] = [
  {
    key: 'quality_manual',
    label: 'Quality manual',
    docType: 'manual',
    family: 'Quality system',
    numberPrefix: 'QM-',
    category: 'mgmt',
    description: 'Top-level description of the quality management system and how it meets ISO 13485 and 21 CFR 820.',
    sections: standardSections(),
  },
  {
    key: 'policy',
    label: 'Policy',
    docType: 'policy',
    family: 'Quality system',
    numberPrefix: 'POL-',
    category: 'mgmt',
    description: 'A governing statement of intent — quality policy, data-integrity policy, or training policy.',
    sections: standardSections(),
  },
  {
    key: 'sop',
    label: 'Standard operating procedure',
    docType: 'sop',
    family: 'Quality system',
    numberPrefix: 'SOP-',
    category: 'production',
    description: 'A controlled, step-by-step procedure for a repeatable process.',
    sections: standardSections(),
  },
  {
    key: 'work_instruction',
    label: 'Work instruction',
    docType: 'wi',
    family: 'Quality system',
    numberPrefix: 'WI-',
    category: 'production',
    description: 'Task-level detail that supports an SOP — how to perform one step.',
    sections: standardSections(),
  },
  {
    key: 'form',
    label: 'Form',
    docType: 'form',
    family: 'Quality system',
    numberPrefix: 'FORM-',
    category: 'misc',
    description: 'A controlled template that captures a record when completed.',
    sections: standardSections(),
  },
  {
    key: 'validation_protocol',
    label: 'Validation protocol',
    docType: 'protocol',
    family: 'Quality system',
    numberPrefix: 'VP-',
    category: 'design',
    description: 'An IQ/OQ/PQ or process-validation protocol with acceptance criteria.',
    sections: standardSections(),
  },
  {
    key: 'training_curriculum',
    label: 'Training curriculum',
    docType: 'curriculum',
    family: 'Quality system',
    numberPrefix: 'TC-',
    category: 'training',
    description: 'The role-based training plan that ties controlled documents to their required readers.',
    sections: standardSections(),
  },
];

/** Look up a template by its catalog key. */
export function getSopTemplate(key: string): SopTemplate | undefined {
  return SOP_TEMPLATES.find((t) => t.key === key);
}
