/**
 * Client onboarding document checklist.
 *
 * The DOCUMENT_CHECKLIST template describes the documents a client organization
 * is expected (or recommended) to upload during intelligence onboarding, and the
 * pure computation that decorates that template with per-item "uploaded" status
 * given the list of documents already ingested for a profile.
 *
 * This is pure — a static template plus a deterministic mapping over a supplied
 * document list — with no database, tenant, or RLS context. It was lifted
 * verbatim out of client-intelligence-memory to shrink that governed file and put
 * the checklist logic under direct unit test. The tenant-scoped DB read that
 * feeds it (getIngestedDocuments) stays in the service; only the template and the
 * pure decoration move here.
 *
 * 2026-10-15: the match was `type accepted && (name has the label's first word
 * || uploadedNames.has(name))`, and uploadedNames came from the same documents,
 * so any file of an accepted type marked every item uploaded (one unrelated PDF
 * marked all 16). An item is now matched by name, and names the files it rests on.
 *
 * @module server/services/memory/document-checklist
 */

export interface DocumentChecklist {
  category: string;
  items: DocumentChecklistItem[];
}

export interface DocumentChecklistItem {
  label: string;
  description: string;
  fileTypes: string[];
  priority: 'required' | 'recommended' | 'optional';
  /**
   * An ingested file of an accepted type is NAMED for this item (two of its
   * label words in the file name). The file's content is not checked.
   */
  uploaded: boolean;
  /** The files `uploaded` rests on; empty when no file is named for the item. */
  matchedFiles: string[];
}

/** A template item: what the checklist asks for, before any document is matched. */
type ChecklistTemplateItem = Omit<DocumentChecklistItem, 'matchedFiles'>;

/**
 * Minimal shape the checklist computation needs from an ingested document.
 * Compatible with the ClientIngestedDocument rows returned by getIngestedDocuments
 * (fileName: string, fileType: string | null).
 */
export interface ChecklistDocument {
  fileName: string;
  fileType?: string | null;
}

// ─── Document Checklist Template ────────────────────────────────────────────

export const DOCUMENT_CHECKLIST: Array<{ category: string; items: ChecklistTemplateItem[] }> = [
  {
    category: 'Company Profile',
    items: [
      { label: 'Company Overview / About Us', description: 'Mission statement, company history, leadership', fileTypes: ['pdf', 'docx'], priority: 'required', uploaded: false },
      { label: 'Organizational Chart', description: 'Team structure, key departments', fileTypes: ['pdf', 'docx', 'xlsx'], priority: 'recommended', uploaded: false },
      { label: 'Corporate Presentation / Pitch Deck', description: 'Investor deck or corporate overview slides', fileTypes: ['pdf', 'pptx'], priority: 'recommended', uploaded: false },
    ],
  },
  {
    category: 'Regulatory History',
    items: [
      { label: 'Prior Submissions Log', description: 'History of regulatory filings (INDs, NDAs, 510(k)s, etc.)', fileTypes: ['xlsx', 'csv', 'pdf'], priority: 'required', uploaded: false },
      { label: 'FDA Meeting Minutes', description: 'Pre-IND, Type B/C meeting minutes or correspondence', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Regulatory Strategy Documents', description: 'Global regulatory strategy, pathway analysis', fileTypes: ['pdf', 'docx'], priority: 'required', uploaded: false },
      { label: 'Warning Letters or CRLs', description: 'Any FDA/EMA correspondence requiring response', fileTypes: ['pdf'], priority: 'optional', uploaded: false },
    ],
  },
  {
    category: 'Pipeline & Products',
    items: [
      { label: 'Pipeline Overview', description: 'Current drug/device pipeline with stages and timelines', fileTypes: ['pdf', 'xlsx', 'docx'], priority: 'required', uploaded: false },
      { label: 'Product Specifications', description: 'Detailed product/device specifications', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Clinical Development Plans', description: 'CDPs, study synopses, or development strategy', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Patent / IP Portfolio', description: 'Patent landscape or IP strategy documents', fileTypes: ['pdf', 'xlsx'], priority: 'optional', uploaded: false },
    ],
  },
  {
    category: 'Operations & Quality',
    items: [
      { label: 'Quality Management SOPs', description: 'QMS overview, key SOPs, quality policy', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Vendor / CRO Agreements', description: 'Key partnerships, outsourcing strategy', fileTypes: ['pdf', 'docx'], priority: 'optional', uploaded: false },
      { label: 'Project Timelines', description: 'Master timelines, Gantt charts, milestone tracker', fileTypes: ['xlsx', 'pdf', 'csv'], priority: 'recommended', uploaded: false },
    ],
  },
  {
    category: 'Competitive Intelligence',
    items: [
      { label: 'Competitive Landscape Analysis', description: 'Competitor mapping, market analysis', fileTypes: ['pdf', 'docx', 'xlsx'], priority: 'recommended', uploaded: false },
      { label: 'Market Research Reports', description: 'Market size, patient population, unmet need', fileTypes: ['pdf', 'docx'], priority: 'optional', uploaded: false },
    ],
  },
];

/** Words that join a label's alternatives and name no document. */
const CONNECTIVES = new Set(['or', 'and', 'of', 'the']);

/** The lower-cased words of a label or file name, a plural "s" dropped ("Minutes" meets "minute"). */
function nameWords(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w && !CONNECTIVES.has(w))
      .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
  );
}

/**
 * Whether a document is named for a checklist item: a file type the item
 * accepts, and at least two of the item's label words in the file name. One
 * shared word is not enough — "regulatory-correspondence.pdf" is not
 * "Regulatory Strategy Documents".
 */
function isNamedFor(item: ChecklistTemplateItem, doc: ChecklistDocument): boolean {
  if (!item.fileTypes.includes(doc.fileType?.toLowerCase() || '')) return false;
  const fileWords = nameWords(doc.fileName.replace(/\.[^.]+$/, ''));
  const labelWords = [...nameWords(item.label)];
  return labelWords.filter(w => fileWords.has(w)).length >= Math.min(2, labelWords.length);
}

/**
 * Decorate the DOCUMENT_CHECKLIST template with, per item, the ingested files
 * named for it.
 *
 * Pure: no DB access, no tenant context. The caller is responsible for fetching
 * the tenant-scoped document list (getIngestedDocuments) and passing it in.
 */
export function computeDocumentChecklist(
  docs: ChecklistDocument[],
): DocumentChecklist[] {
  return DOCUMENT_CHECKLIST.map(cat => ({
    ...cat,
    items: cat.items.map(item => {
      const matchedFiles = docs.filter(d => isNamedFor(item, d)).map(d => d.fileName);
      return { ...item, uploaded: matchedFiles.length > 0, matchedFiles };
    }),
  }));
}
