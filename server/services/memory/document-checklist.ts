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
 * pure decoration move here. Behavior is intentionally identical to the previous
 * in-service implementation.
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
  uploaded: boolean;
}

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

export const DOCUMENT_CHECKLIST: DocumentChecklist[] = [
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

/**
 * Decorate the DOCUMENT_CHECKLIST template with per-item upload status given the
 * documents already ingested for a profile.
 *
 * Pure: no DB access, no tenant context. The caller is responsible for fetching
 * the tenant-scoped document list (getIngestedDocuments) and passing it in.
 * Extracted verbatim from getDocumentChecklist — matching logic is unchanged.
 */
export function computeDocumentChecklist(
  docs: ChecklistDocument[],
): DocumentChecklist[] {
  const uploadedNames = new Set(docs.map(d => d.fileName.toLowerCase()));

  return DOCUMENT_CHECKLIST.map(cat => ({
    ...cat,
    items: cat.items.map(item => ({
      ...item,
      uploaded: docs.some(d => {
        const ext = d.fileType?.toLowerCase() || '';
        const name = d.fileName.toLowerCase();
        // Check if any uploaded doc roughly matches this checklist item
        return (
          item.fileTypes.includes(ext) &&
          (name.includes(item.label.toLowerCase().split(' ')[0]) || uploadedNames.has(name))
        );
      }),
    })),
  }));
}
