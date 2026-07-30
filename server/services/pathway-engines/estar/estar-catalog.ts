/**
 * eSTAR submission catalog — every submission the eSTAR program can carry.
 *
 * "File into all eSTAR needs" enumerated in one place: each marketing pathway,
 * PMA supplement type, Q-Submission sub-type, IDE, and 513(g) request, with the
 * facts a filing surface needs — which FDA center receives it, which template
 * family + program submission type it maps to, the OMB control numbers (resolved
 * from the version registry), the applicable device variants, and the review
 * clock where FDA publishes one.
 *
 * This complements (does not replace) the readiness mappers: the mappers answer
 * "is the content complete for pathway X?"; the catalog answers "what are all the
 * things a client can file, and what does each one entail?" It is the backbone of
 * the eSTAR registration/eligibility model (see estar-registration.ts) and of any
 * "start a submission" picker.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network. Review-clock
 * days are populated ONLY where FDA publishes a statutory/MDUFA figure; where FDA
 * does not, the field is left undefined rather than guessed (a note carries the
 * nuance). Nothing here is invented.
 *
 * @module server/services/pathway-engines/estar/estar-catalog
 */

import {
  type EstarProgramSubmissionType,
  type EstarTemplateFamily,
  familiesForSubmissionType,
  currentVersionFor,
} from './estar-versions';

/** FDA center that receives the submission. Most device eSTARs may go to either. */
export type FdaCenter = 'cdrh' | 'cber' | 'either';

/**
 * Fine-grained catalog key. One per distinct thing a client files — so PMA and its
 * supplement types are separate keys, and each Q-Submission sub-type is its own key.
 */
export type EstarCatalogKey =
  // nIVD / IVD marketing pathways
  | '510k'
  | 'de_novo'
  // PMA family (21 CFR 814)
  | 'pma_original'
  | 'pma_panel_track_supplement'
  | 'pma_180_day_supplement'
  | 'pma_real_time_supplement'
  | 'pma_30_day_notice'
  | 'pma_135_day_supplement'
  // Q-Submission program (Q-Sub) sub-types
  | 'qsub_pre_submission'
  | 'qsub_submission_issue_request'
  | 'qsub_informational_meeting'
  | 'qsub_study_risk_determination'
  | 'qsub_pma_day_100_meeting'
  | 'qsub_accessory_classification_request'
  // Other early-submission requests
  | 'ide'
  | '513g';

export interface EstarCatalogEntry {
  /** Fine-grained catalog key. */
  key: EstarCatalogKey;
  /** Display label. */
  label: string;
  /** Short description of what the submission is for. */
  description: string;
  /** The program-level submission type (maps to template family + OMB). */
  programType: EstarProgramSubmissionType;
  /** FDA center(s) that receive it. */
  center: FdaCenter;
  /** Which device variants apply. PreSTAR pathways apply to both nIVD and IVD. */
  appliesToVariants: Array<'device' | 'ivd'>;
  /**
   * FDA review clock in calendar/FDA days where FDA publishes a figure; undefined
   * where FDA does not commit to a fixed clock (a `reviewNote` carries the nuance).
   */
  reviewGoalDays?: number;
  /** Nuance about the review clock or the submission's role. */
  reviewNote?: string;
  /** Primary governing regulation / guidance reference. */
  regulatoryRef: string;
}

/**
 * The full catalog. Ordered marketing → PMA family → Q-Sub sub-types → IDE → 513(g),
 * which is the natural lifecycle/severity order a picker should present.
 */
export const ESTAR_CATALOG: EstarCatalogEntry[] = [
  // ── Marketing pathways (nIVD / IVD eSTAR) ─────────────────────────────────
  {
    key: '510k',
    label: '510(k) Premarket Notification',
    description: 'Demonstrate substantial equivalence to a legally marketed predicate device.',
    programType: '510k',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 90,
    regulatoryRef: '21 CFR 807 Subpart E',
  },
  {
    key: 'de_novo',
    label: 'De Novo Classification Request',
    description: 'Risk-based classification for a novel low/moderate-risk device with no predicate.',
    programType: 'de_novo',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 150,
    regulatoryRef: '21 CFR 860 Subpart D; Section 513(f)(2) FD&C Act',
  },

  // ── PMA family (21 CFR 814) ───────────────────────────────────────────────
  {
    key: 'pma_original',
    label: 'Original PMA',
    description: 'Premarket approval application establishing safety and effectiveness for a Class III device.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.20; Section 515 FD&C Act',
  },
  {
    key: 'pma_panel_track_supplement',
    label: 'PMA Panel-Track Supplement (PTS)',
    description: 'Significant change (e.g., new indication) needing new clinical data and often advisory-panel review.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.39; PMA Supplement Decision-Making guidance',
  },
  {
    key: 'pma_180_day_supplement',
    label: 'PMA 180-Day Supplement',
    description: 'Significant change in design, components, or labeling affecting safety/effectiveness, without a panel track.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 180,
    regulatoryRef: '21 CFR 814.39(a)',
  },
  {
    key: 'pma_real_time_supplement',
    label: 'PMA Real-Time (RT) Supplement',
    description: 'Minor change to design, software, or labeling reviewed interactively in a real-time meeting.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewNote: 'Reviewed in a scheduled real-time interaction rather than on a fixed statutory clock.',
    regulatoryRef: '21 CFR 814.39(e); Real-Time PMA Supplements guidance',
  },
  {
    key: 'pma_30_day_notice',
    label: 'PMA 30-Day Notice',
    description: 'Notice of a manufacturing-process or method change; effective 30 days after FDA receipt unless FDA acts.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 30,
    reviewNote: 'If FDA finds the change needs fuller review, the notice converts to a 135-day supplement.',
    regulatoryRef: '21 CFR 814.39(f); Section 515(d)(6) FD&C Act',
  },
  {
    key: 'pma_135_day_supplement',
    label: 'PMA 135-Day Supplement',
    description: 'A 30-day notice FDA determines requires fuller review, reviewed on a 135-day clock.',
    programType: 'pma',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 135,
    regulatoryRef: '21 CFR 814.39(f); Section 515(d)(6) FD&C Act',
  },

  // ── Q-Submission program (PreSTAR) ────────────────────────────────────────
  {
    key: 'qsub_pre_submission',
    label: 'Pre-Submission (Pre-Sub)',
    description: 'Formal written request for FDA feedback on a planned submission or study.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 70,
    reviewNote: 'FDA aims to provide written feedback within 70 days, or hold a meeting near that time.',
    regulatoryRef: 'Q-Submission Program guidance (Requests for Feedback and Meetings for Medical Device Submissions)',
  },
  {
    key: 'qsub_submission_issue_request',
    label: 'Submission Issue Request (SIR)',
    description: 'Request for feedback to resolve deficiencies on a pending submission placed on hold.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    regulatoryRef: 'Q-Submission Program guidance',
  },
  {
    key: 'qsub_informational_meeting',
    label: 'Informational Meeting',
    description: 'Share information with FDA (e.g., pipeline overview) with no request for feedback or decision.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    regulatoryRef: 'Q-Submission Program guidance',
  },
  {
    key: 'qsub_study_risk_determination',
    label: 'Study Risk Determination (SRD)',
    description: 'Request FDA’s determination of significant-risk / nonsignificant-risk / exempt status for a study.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    regulatoryRef: 'Q-Submission Program guidance; 21 CFR 812.2',
  },
  {
    key: 'qsub_pma_day_100_meeting',
    label: 'PMA Day 100 Meeting',
    description: 'Statutory meeting to discuss the review status of a filed original PMA within ~100 days of filing.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 100,
    reviewNote: 'Held within ~100 days of the PMA filing date.',
    regulatoryRef: 'Section 515(d)(3) FD&C Act; Q-Submission Program guidance',
  },
  {
    key: 'qsub_accessory_classification_request',
    label: 'Accessory Classification Request',
    description: 'Request risk-based classification of a device accessory distinct from its parent device.',
    programType: 'q_sub',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    regulatoryRef: 'Section 513(f)(6) FD&C Act; Medical Device Accessories guidance',
  },

  // ── Other early-submission requests (PreSTAR) ─────────────────────────────
  {
    key: 'ide',
    label: 'Investigational Device Exemption (IDE)',
    description: 'Approval to use an investigational device in a clinical study to collect safety/effectiveness data.',
    programType: 'ide',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 30,
    reviewNote: 'FDA has 30 days to act; the study may begin if not disapproved. PreSTAR covers originals and supplements/amendments, not IDE reports.',
    regulatoryRef: '21 CFR 812; Section 520(g) FD&C Act',
  },
  {
    key: '513g',
    label: '513(g) Request for Information',
    description: 'Request FDA’s view on the classification and applicable requirements for a device.',
    programType: '513g',
    center: 'either',
    appliesToVariants: ['device', 'ivd'],
    reviewGoalDays: 60,
    reviewNote: 'MDUFA goal to respond within 60 days.',
    regulatoryRef: 'Section 513(g) FD&C Act; 513(g) Requests for Information guidance',
  },
];

// ─── Query functions ──────────────────────────────────────────────────────────

/** Catalog entry for a fine-grained key. */
export function getCatalogEntry(key: EstarCatalogKey): EstarCatalogEntry | undefined {
  return ESTAR_CATALOG.find((e) => e.key === key);
}

/** All catalog entries carried by a given program submission type. */
export function catalogEntriesForProgramType(
  type: EstarProgramSubmissionType,
): EstarCatalogEntry[] {
  return ESTAR_CATALOG.filter((e) => e.programType === type);
}

/** All catalog entries that apply to a device variant (device / ivd). */
export function catalogEntriesForVariant(variant: 'device' | 'ivd'): EstarCatalogEntry[] {
  return ESTAR_CATALOG.filter((e) => e.appliesToVariants.includes(variant));
}

/** All PMA-family catalog entries (original + every supplement type). */
export function pmaCatalogEntries(): EstarCatalogEntry[] {
  return catalogEntriesForProgramType('pma');
}

/** All Q-Submission sub-type catalog entries. */
export function qSubCatalogEntries(): EstarCatalogEntry[] {
  return catalogEntriesForProgramType('q_sub');
}

/**
 * Resolve the template family for a catalog entry given the device variant.
 * PreSTAR pathways always resolve to `prestar`; marketing pathways resolve to the
 * IVD or nIVD family per the variant.
 */
export function templateFamilyForEntry(
  entry: EstarCatalogEntry,
  variant: 'device' | 'ivd',
): EstarTemplateFamily {
  const families = familiesForSubmissionType(entry.programType);
  if (families.length === 1) return families[0];
  return variant === 'ivd' ? 'ivd' : 'nivd';
}

export interface ResolvedCatalogTemplate {
  entry: EstarCatalogEntry;
  variant: 'device' | 'ivd';
  family: EstarTemplateFamily;
  /** Current (recommended) template version string for that family. */
  currentVersion: string | null;
  /** OMB control numbers for that family (from the version registry). */
  ombNumbers: string[];
}

/**
 * Resolve everything a filing surface needs for one catalog entry + variant:
 * the template family, the current recommended version, and the OMB numbers.
 * Single source of truth: reads the version registry rather than restating it.
 */
export function resolveCatalogTemplate(
  key: EstarCatalogKey,
  variant: 'device' | 'ivd',
): ResolvedCatalogTemplate | undefined {
  const entry = getCatalogEntry(key);
  if (!entry) return undefined;
  const family = templateFamilyForEntry(entry, variant);
  const current = currentVersionFor(family);
  return {
    entry,
    variant,
    family,
    currentVersion: current?.version ?? null,
    ombNumbers: current?.ombNumbers ?? [],
  };
}

/** All catalog keys, in registry order. */
export function listCatalogKeys(): EstarCatalogKey[] {
  return ESTAR_CATALOG.map((e) => e.key);
}

export default {
  ESTAR_CATALOG,
  getCatalogEntry,
  catalogEntriesForProgramType,
  catalogEntriesForVariant,
  pmaCatalogEntries,
  qSubCatalogEntries,
  templateFamilyForEntry,
  resolveCatalogTemplate,
  listCatalogKeys,
};
