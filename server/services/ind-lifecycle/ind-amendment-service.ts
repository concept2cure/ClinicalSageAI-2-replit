/**
 * IND Amendment Service — 21 CFR 312.30 (protocol) + 312.31 (information)
 *
 * Pure (no-DB) planners that turn a set of changed documents into an eCTD
 * amendment plan: which sequence type to open, and which CTD leaves to create
 * (each with a lifecycle operation new|replace|append|delete), typed against the
 * submissions enums (shared/schema/submissions.ts).
 *
 * Two amendment classes under Part 312:
 *   - PROTOCOL AMENDMENT (312.30): a new protocol, a change to an existing
 *     protocol, or a new investigator. Goes into CTD Module 5 (clinical) with the
 *     cover correspondence in Module 1.
 *   - INFORMATION AMENDMENT (312.31): new CMC, pharmacology/toxicology, or other
 *     information not covered by a protocol amendment or safety report. Routed to
 *     the relevant CTD module (3 = CMC, 4 = nonclinical, 2 = summaries).
 *
 * eCTD lifecycle: a brand-new document is `new`; a revised version of a leaf the
 * agency already holds is `replace`; supplementary content is `append`; a
 * withdrawn leaf is `delete`. (submissionLeaves.lifecycleOp.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES:
 *   - PURE: no DB, no audit — persistence is wired in the sibling modules.
 *     Tracked drafts: ind-amendment-persistence.createAmendmentDraft persists the
 *     plan to ind_amendments (org-scoped + audited; POST
 *     /api/ind-lifecycle/submission/:id/amendments). eCTD filing:
 *     ind-lifecycle-persistence.persistAmendmentPlan feeds `planIndAmendment(...)`
 *     output through submission-service to create the ectd_sequences row (type
 *     'amendment') and its submission_leaves rows (tenant-scoped + audited; POST
 *     /api/ind-lifecycle/amendment/file, which also marks a tracked draft filed).
 *     The leaf section codes + documentType hints here map directly onto
 *     submission_leaves.sectionCode / documentType.
 *   - The CTD section mapping in `SECTION_FOR_CATEGORY` is a sensible default for
 *     common IND content; confirm against your region module profile before
 *     filing. Unmapped categories fall back to Module 1 cover (m1.2) and are
 *     flagged in `warnings`.
 *   - lifecycleOp is inferred from each ChangedDocument.changeKind; if your intake
 *     does not distinguish add vs revise, default to 'new' and have a human
 *     confirm replacements (replacing the wrong leaf GUID corrupts the lifecycle).
 *
 * @module server/services/ind-lifecycle/ind-amendment-service
 */

// Reuse the eCTD enum literals declared against the submissions schema in the
// safety-report service (single source of truth within ind-lifecycle).
import type { EctdSequenceType, LeafLifecycleOp } from './ind-safety-report-service';

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

/** The amendment class per Part 312. */
export type IndAmendmentClass = 'protocol' | 'information';

/** What kind of change a document represents (drives lifecycleOp). */
export type DocumentChangeKind = 'added' | 'revised' | 'appended' | 'withdrawn';

/**
 * Content categories the planner understands. Each maps to a CTD section + the
 * amendment class it triggers.
 */
export type ContentCategory =
  | 'protocol' // 312.30 — new/changed protocol
  | 'protocol_amendment_summary'
  | 'new_investigator' // 312.30(a) — added investigator (Form 1572)
  | 'cmc' // 312.31 — chemistry/manufacturing/controls
  | 'pharmacology_toxicology' // 312.31 — nonclinical
  | 'clinical_summary' // 312.31 — Module 2 summaries
  | 'investigators_brochure'
  | 'other';

/** A single changed document the caller wants to file. */
export interface ChangedDocument {
  documentId: string;
  title: string;
  category: ContentCategory;
  changeKind: DocumentChangeKind;
  /** Existing eCTD leaf GUID this revises/appends/withdraws (required for non-add). */
  replacesLeafGuid?: string | null;
}

export interface IndAmendmentInput {
  organizationId: string;
  projectId: string;
  indNumber: string;
  changedDocuments: ChangedDocument[];
}

// ---------------------------------------------------------------------------
// Output plan
// ---------------------------------------------------------------------------

export interface PlannedLeaf {
  documentId: string;
  sectionCode: string; // submission_leaves.sectionCode
  title: string;
  granularity: string | null;
  lifecycleOp: LeafLifecycleOp; // submission_leaves.lifecycleOp
  documentType: string; // submission_leaves.documentType hint
  /** Leaf GUID being superseded (for replace/append/delete). */
  parentLeafGuid: string | null;
  /** Which amendment class this leaf belongs to. */
  amendmentClass: IndAmendmentClass;
  cfrRef: string;
}

export interface IndAmendmentPlan {
  /** Always 'amendment' for 312.30 / 312.31 filings (vs 'annual' / 'response'). */
  sequenceType: EctdSequenceType;
  region: 'fda';
  /** Drives submissions.lifecycleStage. */
  lifecycleStage: 'amendment';
  indNumber: string;
  organizationId: string;
  projectId: string;
  /** Classes present in this amendment (a single sequence can carry both). */
  amendmentClasses: IndAmendmentClass[];
  leaves: PlannedLeaf[];
  /** Non-fatal advisories (e.g. unmapped category, missing replace GUID). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Category → CTD mapping
// ---------------------------------------------------------------------------

interface CategoryMapping {
  sectionCode: string;
  amendmentClass: IndAmendmentClass;
  documentType: string;
  cfrRef: string;
}

const SECTION_FOR_CATEGORY: Record<ContentCategory, CategoryMapping> = {
  protocol: {
    sectionCode: 'm5.3.5.1',
    amendmentClass: 'protocol',
    documentType: 'protocol',
    cfrRef: '312.30(b)',
  },
  // Placement follows the FDA eCTD Module 1 vocabulary (controlled-vocab/cv-v4-data):
  // m1.12.1 is PRE-IND CORRESPONDENCE and m1.12.2 is REQUEST TO CHARGE — a 312.30
  // amendment summary and a new investigator's Form 1572 were filed under both. The
  // summary of a protocol amendment is cover-letter content (m1.2); a Form 1572 is
  // a form (m1.1).
  protocol_amendment_summary: {
    sectionCode: 'm1.2',
    amendmentClass: 'protocol',
    documentType: 'protocol_amendment_summary',
    cfrRef: '312.30(b)',
  },
  new_investigator: {
    sectionCode: 'm1.1',
    amendmentClass: 'protocol',
    documentType: 'form_1572',
    cfrRef: '312.30(a)',
  },
  cmc: {
    sectionCode: 'm3.2',
    amendmentClass: 'information',
    documentType: 'cmc',
    cfrRef: '312.31(a)(1)',
  },
  pharmacology_toxicology: {
    sectionCode: 'm4.2',
    amendmentClass: 'information',
    documentType: 'pharmacology_toxicology',
    cfrRef: '312.31(a)(1)',
  },
  clinical_summary: {
    sectionCode: 'm2.5',
    amendmentClass: 'information',
    documentType: 'clinical_summary',
    cfrRef: '312.31(a)(1)',
  },
  // m1.14.4.1 is the INVESTIGATOR BROCHURE; m1.14.4.2 is investigational drug
  // LABELING. An IB revision was filed under labeling.
  investigators_brochure: {
    sectionCode: 'm1.14.4.1',
    amendmentClass: 'information',
    documentType: 'investigators_brochure',
    cfrRef: '312.31(a)(1)',
  },
  other: {
    sectionCode: 'm1.2',
    amendmentClass: 'information',
    documentType: 'other',
    cfrRef: '312.31',
  },
};

// ---------------------------------------------------------------------------
// lifecycleOp inference
// ---------------------------------------------------------------------------

/** Map a document change kind to an eCTD leaf lifecycle operation. Pure. */
export function lifecycleOpForChange(kind: DocumentChangeKind): LeafLifecycleOp {
  switch (kind) {
    case 'added':
      return 'new';
    case 'revised':
      return 'replace';
    case 'appended':
      return 'append';
    case 'withdrawn':
      return 'delete';
  }
}

// ---------------------------------------------------------------------------
// Planner (pure)
// ---------------------------------------------------------------------------

/**
 * Plan an IND amendment from a set of changed documents. Produces an eCTD
 * amendment plan (sequence type 'amendment', one leaf per document with its
 * lifecycle op + CTD placement). Pure / deterministic.
 *
 * Throws if no documents are supplied (nothing to file).
 */
export function planIndAmendment(input: IndAmendmentInput): IndAmendmentPlan {
  if (input.changedDocuments.length === 0) {
    throw new Error('IND_AMENDMENT_NO_DOCUMENTS: at least one changed document is required.');
  }

  const warnings: string[] = [];
  const classesPresent = new Set<IndAmendmentClass>();

  const leaves: PlannedLeaf[] = input.changedDocuments.map((doc) => {
    const mapping = SECTION_FOR_CATEGORY[doc.category] ?? SECTION_FOR_CATEGORY.other;
    if (!SECTION_FOR_CATEGORY[doc.category]) {
      warnings.push(
        `Document "${doc.title}" has unmapped category "${doc.category}"; routed to ${mapping.sectionCode} (Module 1 cover). Confirm placement.`,
      );
    }

    const lifecycleOp = lifecycleOpForChange(doc.changeKind);

    // replace/append/delete require the prior leaf GUID to attach to the lifecycle.
    if (lifecycleOp !== 'new' && !doc.replacesLeafGuid) {
      warnings.push(
        `Document "${doc.title}" is a ${doc.changeKind} (lifecycleOp ${lifecycleOp}) but no prior leaf GUID was supplied; it cannot attach to the eCTD lifecycle until one is provided.`,
      );
    }

    classesPresent.add(mapping.amendmentClass);

    return {
      documentId: doc.documentId,
      sectionCode: mapping.sectionCode,
      title: doc.title,
      granularity: 'leaf',
      lifecycleOp,
      documentType: mapping.documentType,
      parentLeafGuid: doc.replacesLeafGuid ?? null,
      amendmentClass: mapping.amendmentClass,
      cfrRef: mapping.cfrRef,
    };
  });

  // Every IND amendment carries a cover letter in Module 1 (m1.2). Add one if the
  // caller did not already include one. This keyed on the section, so any other
  // m1.2 content (an `other` document, a protocol amendment summary) silently
  // stood in for the cover letter and the amendment shipped without one.
  const hasCover = leaves.some((l) => l.documentType === 'cover_letter');
  if (!hasCover) {
    leaves.unshift({
      documentId: `cover:${input.indNumber}`,
      sectionCode: 'm1.2',
      title: `Cover Letter — IND ${input.indNumber} amendment`,
      granularity: 'leaf',
      lifecycleOp: 'new',
      documentType: 'cover_letter',
      parentLeafGuid: null,
      // Cover letter belongs to whichever class(es) the amendment carries; tag as
      // the predominant class for routing (protocol takes precedence if present).
      amendmentClass: classesPresent.has('protocol') ? 'protocol' : 'information',
      cfrRef: '312.30/312.31',
    });
  }

  return {
    sequenceType: 'amendment',
    region: 'fda',
    lifecycleStage: 'amendment',
    indNumber: input.indNumber,
    organizationId: input.organizationId,
    projectId: input.projectId,
    amendmentClasses: Array.from(classesPresent).sort(),
    leaves,
    warnings,
  };
}

/**
 * Convenience: split a plan's leaves by amendment class — useful when a sponsor
 * SOP files protocol (312.30) and information (312.31) amendments as separate
 * sequences. Pure.
 */
export function partitionByClass(plan: IndAmendmentPlan): Record<IndAmendmentClass, PlannedLeaf[]> {
  return {
    protocol: plan.leaves.filter((l) => l.amendmentClass === 'protocol'),
    information: plan.leaves.filter((l) => l.amendmentClass === 'information'),
  };
}
