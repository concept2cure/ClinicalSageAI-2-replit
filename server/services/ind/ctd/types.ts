/**
 * CTD authoring types — the deep, leaf-level Common Technical Document (ICH M4)
 * section model that backs real industry authoring of the FDA drug lifecycle
 * (Pre-IND → IND → amendments/safety/annual → EOP2/Pre-NDA → NDA/BLA →
 * post-approval supplements).
 *
 * `CtdSection` is a strict SUPERSET of the legacy `INDSection` shape (code,
 * title, module, moduleName, required, contentType, guidance, generationPrompt,
 * wordCountRange, dependencies) so every existing consumer of
 * `ind-section-registry` keeps working unchanged, while new consumers get the
 * leaf-level depth: per-section authoring guidance, the concrete content
 * elements a regulatory writer must include, the tables/datasets a reviewer
 * expects, and the common deficiencies that draw information requests.
 *
 * The data in this directory is REFERENCE STRUCTURE — the CTD granularity and
 * the ICH/FDA guidance pointers a submission is built against. It is advisory:
 * the sponsor owns every clinical/quality conclusion. Nothing here fabricates
 * study results; it defines WHERE results go and WHAT a complete section
 * contains.
 *
 * @module server/services/ind/ctd/types
 */

/** The FDA marketing/investigational applications that share the CTD spine. */
export type SubmissionFamily = 'IND' | 'NDA' | 'BLA';

/** How a section's body is predominantly authored. */
export type CtdContentType = 'narrative' | 'table' | 'form' | 'data' | 'list' | 'mixed';

/**
 * One authorable Common Technical Document section, at the granularity a real
 * regulatory writer drafts against (e.g. `3.2.S.4` Control of Drug Substance is
 * its own unit, not folded into a `3.2.S` blob).
 */
export interface CtdSection {
  /** CTD section code (e.g. "2.3", "3.2.S.4", "4.2.3.2", "5.3.5.1"). */
  code: string;
  /** Section title. */
  title: string;
  /** CTD module number. */
  module: 1 | 2 | 3 | 4 | 5;
  /** Human module name (e.g. "Quality (CMC)"). */
  moduleName: string;
  /** Immediate parent section code for tree navigation (e.g. "3.2.S" for "3.2.S.4"). */
  parentCode?: string;
  /**
   * Legacy flag: required for an INITIAL IND. Kept for backward compatibility
   * with existing `INDSection` consumers; derived from `requiredFor`.
   */
  required: boolean;
  /** Which submissions require this section. Drives type-specific readiness. */
  requiredFor: SubmissionFamily[];
  /** Predominant content type. */
  contentType: CtdContentType;
  /** Governing ICH/FDA/CFR reference(s) (e.g. "ICH M4Q(R1); 21 CFR 314.50(d)(1)"). */
  guidance: string;
  /**
   * How to author this section — a concise, industry-grade orientation for the
   * writer: what the section must establish, the regulatory intent, and how a
   * reviewer reads it. Advisory, not a conclusion.
   */
  authoringGuidance: string;
  /** The concrete content items a complete section must contain. */
  keyContentElements: string[];
  /** Tables / figures / datasets a reviewer expects (empty for pure narrative). */
  expectedData?: string[];
  /** Common deficiencies that draw information requests / refuse-to-file. */
  commonPitfalls?: string[];
  /** Typical drafted length range (words). */
  wordCountRange?: [number, number];
  /** Other section codes that should be drafted first / are cross-referenced. */
  dependencies?: string[];
  /** AI generation prompt template. Supports {{PRODUCT_NAME}}, {{INDICATION}}, {{SPONSOR}}, {{PHASE}}. */
  generationPrompt: string;
}

/** The lifecycle phase a document type belongs to. */
export type LifecycleCategory =
  | 'meeting' // Pre-IND, EOP2, Pre-NDA/BLA briefing packages
  | 'application' // IND, NDA, BLA
  | 'amendment' // IND protocol/CMC/information amendments
  | 'safety' // IND safety reports (7/15-day)
  | 'periodic' // IND annual report, DSUR, NDA/BLA annual report
  | 'supplement'; // PAS, CBE-30, CBE-0, post-approval changes

/** Which regulatory family a lifecycle document type sits under. */
export type LifecycleFamily = 'IND' | 'NDA' | 'BLA' | 'MEETING' | 'SUPPLEMENT';

/**
 * One administrative / type-specific component of a lifecycle document type
 * (e.g. the FDA Form 356h in an NDA, or the "Proposed Questions" in a Pre-IND
 * briefing package). CTD content sections are referenced separately via
 * `ctdSectionCodes`; components carry the guidance for the type-specific,
 * non-CTD documents.
 */
export interface LifecycleComponent {
  /** Stable component code (e.g. "1.2", "briefing.questions", "356h"). */
  code: string;
  /** Component title. */
  title: string;
  /** Whether the component is required for this document type. */
  required: boolean;
  /** Predominant content type. */
  contentType: CtdContentType;
  /** Governing reference (CFR / FDA guidance / ICH). */
  guidance: string;
  /** How to author this component. */
  authoringGuidance: string;
  /** The concrete content items the component must contain. */
  keyContentElements: string[];
  /** AI generation prompt template. */
  generationPrompt: string;
}

/**
 * A regulatory lifecycle document type — the unit a sponsor actually files or
 * brings to a meeting. Composes type-specific administrative `components` with
 * references into the shared CTD section library (`ctdSectionCodes`).
 */
export interface LifecycleDocumentType {
  /** Stable id (e.g. "ind_initial", "ind_safety_report", "nda", "pre_ind_meeting"). */
  id: string;
  /** Display label. */
  label: string;
  /** Lifecycle phase. */
  category: LifecycleCategory;
  /** Regulatory family. */
  family: LifecycleFamily;
  /** Sponsoring agency (FDA for this library). */
  agency: string;
  /** One-paragraph description of what the document type is and when it is used. */
  description: string;
  /** Regulatory basis (CFR / statute / FDA guidance / ICH). */
  regulatoryBasis: string[];
  /**
   * The canonical document-taxonomy registry id this lifecycle type maps to
   * (e.g. "US_NDA", "US_IND_SR"), when one exists. Lets a taxonomy entry the
   * product already offers resolve to this deep authoring guidance. Absent for
   * types with no standalone taxonomy entry (e.g. meeting briefing packages,
   * ISS/ISE which are components of an application).
   */
  registryId?: string;
  /** Statutory / procedural timing, when applicable (e.g. "15 calendar days"). */
  timing?: string;
  /** Type-specific administrative components (non-CTD). */
  components: LifecycleComponent[];
  /**
   * CTD section codes that this document type includes from the shared library.
   * Prefixes are allowed (e.g. "3.2.S" expands to every drafted 3.2.S.* leaf).
   */
  ctdSectionCodes?: string[];
  /** True for FDA meeting briefing packages (Pre-IND, EOP2, Pre-NDA/BLA). */
  meetingPackage?: boolean;
}

/** Whitelisted keys for a `CtdSection` — used to guarantee no excess properties. */
export const CTD_SECTION_KEYS: (keyof CtdSection)[] = [
  'code',
  'title',
  'module',
  'moduleName',
  'parentCode',
  'required',
  'requiredFor',
  'contentType',
  'guidance',
  'authoringGuidance',
  'keyContentElements',
  'expectedData',
  'commonPitfalls',
  'wordCountRange',
  'dependencies',
  'generationPrompt',
];
