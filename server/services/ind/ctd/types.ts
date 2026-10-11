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

import type { RegulatoryBasis, RegulatoryConfidence } from '../../../../shared/regulatory/regulatory-basis';
import type {
  Applicability,
  ConditionId,
  ModeledJurisdiction,
  Necessity,
} from '../../../../shared/regulatory/regional-module1';
import type { DeviceFlagId } from '../../../../shared/constants/domain/device-classification';

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

// ── ICH E3 clinical study report ─────────────────────────────────────────────

/**
 * Provenance for the E3 overlay and every other regulatory fact in this
 * directory. The one declaration lives in
 * shared/regulatory/regulatory-basis.ts (with `REGULATOR_HOSTS`,
 * `basisProblems` and `basisLabel`); it is re-exported here so imports from
 * `ind/ctd` keep working.
 *
 * - `regulator-text`: wording confirmed on a regulator-hosted copy (or a
 *   vendored regulator artifact) on the date in `checked`;
 * - `recall`: known to the author, not checked against the regulator's text;
 * - `platform-convention`: how this platform recommends doing it. Not a
 *   regulatory requirement.
 */
export type { RegulatoryBasis, RegulatoryConfidence } from '../../../../shared/regulatory/regulatory-basis';

/** Alias of `RegulatoryConfidence` (was a separate declaration until 2026-10-05). */
export type E3Confidence = RegulatoryConfidence;

/** Alias of `RegulatoryBasis` (was a separate declaration until 2026-10-05). */
export type E3Basis = RegulatoryBasis;

/**
 * The one record's vocabulary, re-exported so imports from `ind/ctd` reach it
 * (docs/design/ANA_REGULATORY_RECORD.md §5). Declared in
 * shared/regulatory/regional-module1.ts; nothing here redeclares it.
 */
export type {
  ModeledJurisdiction,
  ApplicationKind,
  Necessity,
  ConditionId,
  Applicability,
  DocumentRole,
  RegionalHeading,
} from '../../../../shared/regulatory/regional-module1';

/**
 * Whether an E3 section is expected in every CSR, only when the study produced
 * its subject (a second batch, interim analyses, drug concentrations), or as
 * the reviewing authority requires. `Necessity` without 'conditional': E3 has
 * no condition-gated heading, so no E3 consumer sees the wider union.
 */
export type E3Applicability = Exclude<Necessity, 'conditional'>;

// ── Document outlines (R13) ──────────────────────────────────────────────────

/**
 * One heading of a document outline (a CSR, a protocol, a DSUR/PBRER/PADER, a
 * JP CTN, the EU CTA Annex I), with what belongs under it. Every outline the
 * platform briefs from is data of this shape, rendered by the one renderer,
 * `renderOutlineBrief` (section-brief.ts). Hierarchy is the dotted `number`.
 *
 * Reference structure: it says what a complete section contains and where each
 * part goes, never what a study found.
 */
export interface OutlineNode<A extends Necessity = Necessity> {
  /** The document's own number ("12.2.4", "16.1.9"); absent for an unnumbered heading. */
  number?: string;
  /** Heading as the governing text words it. */
  title: string;
  /** Heading in the jurisdiction's language (添付文書(案)). */
  titleLocal?: string;
  applies: A;
  /** For 'conditional': the deciding fact. Unknown ⇒ undetermined (a gap), never "not required". */
  condition?: ConditionId;
  /** What the section establishes and how a reviewer reads it. */
  purpose?: string;
  /** The content a complete section carries. */
  contains?: string[];
  /** Where that content usually comes from (platform convention unless a basis says otherwise). */
  sources?: string[];
  /** Display conventions: tables, listings, figures, placement. */
  presentation?: string[];
  /** Deficiencies a reviewer finds here. */
  pitfalls?: string[];
  /** Other headings, or CTD codes, this section is read with. */
  see?: string[];
  /** Bases beyond the outline's governing basis. Absent ⇒ the governing basis alone. */
  basis?: RegulatoryBasis[];
  /** Content not encoded: the renderer says so and adds nothing from memory. */
  headingOnly?: true;
}

/**
 * One heading of an ICH E3 clinical study report: an `OutlineNode` with E3's
 * narrower applicability. E3 numbers every heading, so `number` stays required
 * for the E3 tree's consumers.
 */
export type E3Section = OutlineNode<E3Applicability> & { number: string };

/** The registered document outlines. Each is added as data, in the commit that deletes its copies. */
export type OutlineId =
  | 'csr-e3'
  | 'protocol-m11'
  | 'dsur-e2f'
  | 'pbrer-e2c-r2'
  | 'pader-314-80'
  | 'jp-ctn'
  | 'eu-ctr-annex-i';

/** A whole document outline: its nodes, the basis that governs all of them, and its one owning file. */
export interface DocumentOutline {
  id: OutlineId;
  title: string;
  jurisdictions: ModeledJurisdiction[] | 'ich';
  /** The basis every node rests on. Non-empty: the renderer refuses an outline without one. */
  governing: RegulatoryBasis[];
  /** Words a caller may use for it ('csr', 'e3', 'pbrer', 'psur', 'protocol', 'ctn', '治験計画届'). */
  aliases: string[];
  /** The ONLY file allowed to hold this outline's number/title pairs (inventory gate). */
  owner: string;
  /** Every heading, in document order. */
  nodes: readonly OutlineNode[];
}

// ── Device dossier table of contents (F57), in eSTAR vocabulary ──────────────

/** The eSTAR template family a token belongs to: non-IVD or IVD. */
export type EstarFamily = 'nivd' | 'ivd';

/** One heading of a device dossier ToC. A token is ambiguous without its family. */
export interface DeviceTocNode {
  family: EstarFamily;
  /** eSTAR token ("CH3.05.06"). */
  token: string;
  heading: string;
  /** Parent token in the same family. */
  parent?: string;
  applies: Applicability<DeviceFlagId>;
  /** Where the same heading lives in the platform's other device records. */
  crosswalk: {
    estarSlotIds: string[];
    rulePackKeys?: { k510?: string; denovo?: string };
    pmaModule?: string;
    documentTemplateId?: string;
  };
  basis: RegulatoryBasis[];
  contains?: string[];
  pitfalls?: string[];
  /** Content not encoded: the renderer says so and adds nothing from memory. */
  headingOnly?: true;
}

// ── Application coverage ─────────────────────────────────────────────────────

/**
 * Which applications the record answers for. Region, agency, product class and
 * dossier standard are read from the GLOBAL_REGISTRY entry, never restated here.
 */
export interface ApplicationCoverage {
  /** GLOBAL_REGISTRY id. */
  registryId: string;
  status: 'modeled' | 'partial' | 'not-indexed';
  /** What must be read before the status can rise. */
  sourcesOwed?: RegulatoryBasis[];
}
