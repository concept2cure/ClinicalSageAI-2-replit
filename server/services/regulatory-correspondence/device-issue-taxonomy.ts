/**
 * The CDRH half of the correspondence issue taxonomy.
 *
 * `issue-parser.ts` shipped one taxonomy, and every section it can name is a
 * drug CTD number — `1.0`, `2.5`, `2.7.3`, `3.2.S`, `3.2.P`, `module_index`.
 * A 510(k) has none of them. Measured 2026-09-20 on a realistic CDRH Additional
 * Information letter carrying four numbered deficiencies (substantial
 * equivalence, biocompatibility, cybersecurity, labeling), the shipped parser
 * recognised **none** of them and returned one issue — a clinical-safety issue
 * mapped to CTD 2.5 / 2.7.4, matched on the word "risk" in "risk management
 * report". A CDRH Refuse to Accept letter returned `other_unclassified`,
 * severity `low`, `blocker: false`: the most severe device outcome short of
 * NSE, classified as nothing in particular, because the shipped rule reads
 * `refuse to file` — the DRUG term — and CDRH writes "Refuse to Accept".
 *
 * ── The categories already existed ──
 * `device_evidence_equivalence_issue`, `nonclinical_issue`,
 * `endpoint_labeling_issue`, `administrative_completeness` and
 * `inspection_compliance_issue` are all in `CorrespondenceIssueCategory` and
 * none was reachable: the taxonomy used six of the sixteen. The type was
 * designed for device and the rules were never written. Nothing here widens
 * the union.
 *
 * ── Why sections are per PATHWAY and not per "device" ──
 * The rule-pack section keys collide across device pathways, and the collisions
 * are not near-misses:
 *
 *     key   510(k)                        De Novo
 *     D4    Sterilization                 Software and firmware
 *     D5    Shelf life and packaging      Cybersecurity
 *     E1    Biocompatibility              Proposed labeling and IFU
 *
 * (`migrations/20260901b_estar_510k_denovo_outlines.sql`.) A taxonomy that
 * emitted one "device" key set would file a cybersecurity deficiency against
 * shelf-life documentation on one pathway and get it right on the other, with
 * nothing to show which had happened. That is the same defect class that
 * reached the eSTAR attachment resolver on 2026-09-08, where the governed
 * document class had to be narrowed for exactly this reason.
 *
 * ── Transcribed, and asserted against the source ──
 * The keys below are transcribed so the parser stays a pure function with no
 * database. `__tests__/device-issue-taxonomy.test.ts` reads the rule packs out
 * of the migration and asserts that every key named here is a real leaf of the
 * pathway it is named under — the same discipline
 * `estar-attachment-slots.INVALID_ATTACHMENT_EXTENSIONS` follows, and for the
 * same reason: this stream has shipped two transcription errors that survived
 * review.
 *
 * @module server/services/regulatory-correspondence/device-issue-taxonomy
 */

import type { CorrespondenceIssueCategory } from '@shared/types/regulatory-correspondence';

/**
 * The device pathways whose rule packs are seeded and whose section keys are
 * therefore nameable. A device letter on any other pathway still classifies —
 * it just carries no section candidates, because inventing them is the failure
 * this module exists to prevent.
 */
export type DevicePathway = 'k510' | 'denovo';

/** Pathways this taxonomy applies to at all, including those with no key map. */
export const DEVICE_SUBMISSION_TYPES = ['510k', 'de_novo', 'pma', 'ide', 'q_sub', '513g'] as const;

export interface DeviceIssueRule {
  /** A short, stable name for the device topic. Travels as `subcategory`. */
  topic: string;
  pattern: RegExp;
  category: CorrespondenceIssueCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocker: boolean;
  regulatorAskType: string;
  impactedSubmissionComponent: string;
  /** Rule-pack leaf keys, per pathway. A pathway absent here contributes none. */
  sections: Partial<Record<DevicePathway, string[]>>;
  ownerFunction: string;
  responsePackageType: string;
  evidenceNeeds: string[];
}

/**
 * Every pattern is word-anchored.
 *
 * Not stylistic: the drug taxonomy beside this one shipped four unanchored
 * keywords, one of which ("format", inside "information") fired on essentially
 * every letter FDA sends. The same test file that pins those accidents pins
 * these.
 */
export const DEVICE_ISSUE_TAXONOMY: readonly DeviceIssueRule[] = [
  {
    topic: 'refuse_to_accept',
    // CDRH's own term and its acronym. The drug taxonomy's `refuse to file`
    // and `rtf` never match a device letter — and `rtf` is one character from
    // `rta`, which is how the gap stayed invisible.
    pattern: /\brefuse to accept\b|\brta\b|\bacceptance (review|checklist)\b|\bnot accepted for substantive review\b/i,
    category: 'filing_acceptance_issue',
    severity: 'critical',
    blocker: true,
    regulatorAskType: 'acceptance_review_remediation',
    impactedSubmissionComponent: 'acceptance_checklist',
    // The administrative items an RTA most often turns on. Candidates, not a
    // verdict — every issue this parser emits carries humanReviewRequired.
    sections: { k510: ['A1', 'A5', 'A6'], denovo: ['A1', 'A4'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'acceptance_review_response',
    evidenceNeeds: ['RTA checklist item-by-item response', 'corrected administrative forms'],
  },
  {
    topic: 'additional_information_hold',
    pattern: /\badditional information\b|\bai hold\b|\bai request\b|\bplaced on hold\b|\binteractive review\b/i,
    category: 'missing_information_clarification',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'additional_information_response',
    impactedSubmissionComponent: 'submission_amendment',
    // 510(k) G2 is literally "Additional information / amendment responses".
    // The De Novo pack has no equivalent leaf, so it gets none rather than a
    // plausible-looking wrong one.
    sections: { k510: ['G2'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'additional_information_amendment',
    evidenceNeeds: ['point-by-point AI response', 'amendment cover letter'],
  },
  {
    topic: 'not_substantially_equivalent',
    pattern: /\bnot substantially equivalent\b|\bnse\b/i,
    category: 'device_evidence_equivalence_issue',
    severity: 'critical',
    blocker: true,
    regulatorAskType: 'substantial_equivalence_determination',
    impactedSubmissionComponent: 'substantial_equivalence',
    sections: { k510: ['C1', 'C2'], denovo: ['C1', 'C2'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'substantial_equivalence_response',
    evidenceNeeds: ['NSE rationale rebuttal', 'De Novo or PMA pathway assessment'],
  },
  {
    topic: 'substantial_equivalence',
    pattern: /\bsubstantial(ly)? equivalen\w*|\bpredicate\w*|\bcomparison table\b/i,
    category: 'device_evidence_equivalence_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'substantial_equivalence_clarification',
    impactedSubmissionComponent: 'substantial_equivalence',
    sections: { k510: ['C1', 'C2'], denovo: ['C1', 'C2'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'substantial_equivalence_response',
    evidenceNeeds: ['predicate comparison table', 'technological characteristics rationale'],
  },
  {
    topic: 'biocompatibility',
    pattern: /\bbiocompatib\w*|\biso 10993\b|\bcytotox\w*|\bsensitiz\w*|\birritation\b/i,
    category: 'nonclinical_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'biocompatibility_evidence',
    impactedSubmissionComponent: 'nonclinical_testing',
    sections: { k510: ['E1'], denovo: ['D2'] },
    ownerFunction: 'nonclinical',
    responsePackageType: 'nonclinical_evidence_response',
    evidenceNeeds: ['ISO 10993 endpoint matrix', 'test reports for the missing endpoints'],
  },
  {
    topic: 'software',
    pattern: /\bsoftware\b|\bfirmware\b|\biec 62304\b|\blevel of concern\b/i,
    category: 'nonclinical_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'software_documentation',
    impactedSubmissionComponent: 'software_documentation',
    sections: { k510: ['E2'], denovo: ['D4'] },
    ownerFunction: 'software_engineering',
    responsePackageType: 'software_documentation_response',
    evidenceNeeds: ['software documentation level rationale', 'V&V summary'],
  },
  {
    topic: 'cybersecurity',
    pattern: /\bcybersecur\w*|\bsbom\b|\b524b\b|\bthreat model\w*/i,
    category: 'nonclinical_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'cybersecurity_documentation',
    impactedSubmissionComponent: 'cybersecurity_documentation',
    sections: { k510: ['E3'], denovo: ['D5'] },
    ownerFunction: 'software_engineering',
    responsePackageType: 'cybersecurity_response',
    evidenceNeeds: ['threat model', 'SBOM', 'cybersecurity risk management report'],
  },
  {
    topic: 'sterilization_shelf_life',
    pattern: /\bsteriliz\w*|\breprocess\w*|\bshelf life\b|\bpyrogen\w*|\bpackag\w* validation\b/i,
    category: 'nonclinical_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'sterilization_shelf_life_evidence',
    impactedSubmissionComponent: 'nonclinical_testing',
    sections: { k510: ['D3', 'D4', 'D5'], denovo: ['D3'] },
    ownerFunction: 'nonclinical',
    responsePackageType: 'nonclinical_evidence_response',
    evidenceNeeds: ['sterilization validation report', 'shelf-life/aging protocol and data'],
  },
  {
    topic: 'electrical_emc',
    pattern: /\belectromagnetic\b|\bemc\b|\belectrical safety\b|\biec 60601\b/i,
    category: 'nonclinical_issue',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'electrical_safety_evidence',
    impactedSubmissionComponent: 'nonclinical_testing',
    sections: { k510: ['E4'], denovo: ['D6'] },
    ownerFunction: 'nonclinical',
    responsePackageType: 'nonclinical_evidence_response',
    evidenceNeeds: ['IEC 60601 test report', 'EMC test report'],
  },
  {
    topic: 'bench_performance',
    pattern: /\bbench (test\w*|performance)\b|\bperformance testing\b/i,
    category: 'nonclinical_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'bench_performance_evidence',
    impactedSubmissionComponent: 'nonclinical_testing',
    sections: { k510: ['E5'], denovo: ['D1'] },
    ownerFunction: 'nonclinical',
    responsePackageType: 'nonclinical_evidence_response',
    evidenceNeeds: ['bench test protocol and acceptance criteria', 'test reports'],
  },
  {
    topic: 'animal_study',
    pattern: /\banimal (stud\w*|performance|testing)\b|\bin vivo\b|\bglp\b/i,
    category: 'nonclinical_issue',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'animal_study_evidence',
    impactedSubmissionComponent: 'nonclinical_testing',
    sections: { k510: ['E6'], denovo: ['D7'] },
    ownerFunction: 'nonclinical',
    responsePackageType: 'nonclinical_evidence_response',
    evidenceNeeds: ['GLP animal study report'],
  },
  {
    topic: 'clinical_performance',
    pattern: /\bclinical (performance|data|stud\w*|investigation)\b/i,
    category: 'clinical_efficacy_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'clinical_performance_evidence',
    impactedSubmissionComponent: 'clinical_evidence',
    sections: { k510: ['E7'], denovo: ['D8'] },
    ownerFunction: 'clinical_development',
    responsePackageType: 'clinical_evidence_response',
    evidenceNeeds: ['clinical study report', 'statistical analysis of the endpoint in question'],
  },
  {
    topic: 'human_factors',
    pattern: /\bhuman factors\b|\busability\b|\buse[- ]related risk\b|\biec 62366\b/i,
    category: 'nonclinical_issue',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'human_factors_evidence',
    impactedSubmissionComponent: 'human_factors',
    sections: { k510: ['E8'], denovo: ['D9'] },
    ownerFunction: 'human_factors',
    responsePackageType: 'human_factors_response',
    evidenceNeeds: ['use-related risk analysis', 'summative validation report'],
  },
  {
    topic: 'labeling',
    pattern: /\b(re)?label\w*|\binstructions for use\b|\bifu\b|\bpackage insert\b/i,
    category: 'endpoint_labeling_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'labeling_revision',
    impactedSubmissionComponent: 'labeling',
    sections: { k510: ['D2'], denovo: ['E1', 'E2'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'labeling_response',
    evidenceNeeds: ['revised labeling with changes marked', 'traceability to the risk analysis'],
  },
  {
    topic: 'indications_for_use',
    pattern: /\bindications for use\b|\bintended use\b/i,
    category: 'device_evidence_equivalence_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'indications_clarification',
    impactedSubmissionComponent: 'indications_for_use',
    // An indications question is a substantial-equivalence question: the IFU
    // statement is what the predicate comparison is anchored to.
    sections: { k510: ['B2'], denovo: ['A2'] },
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'substantial_equivalence_response',
    evidenceNeeds: ['revised indications for use statement', 'impact on the predicate comparison'],
  },
  {
    topic: 'quality_system',
    pattern: /\bquality (system|management)\b|\b21 cfr 820\b|\biso 13485\b|\binspection\b/i,
    category: 'inspection_compliance_issue',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'quality_system_evidence',
    impactedSubmissionComponent: 'quality_management',
    sections: { k510: ['F1'], denovo: ['G1'] },
    ownerFunction: 'quality_assurance',
    responsePackageType: 'quality_system_response',
    evidenceNeeds: ['QMS certificate or 21 CFR 820 conformity statement'],
  },
];

/** Is this submission type a device one this taxonomy should be used for? */
export function isDeviceSubmissionType(submissionType: string | null | undefined): boolean {
  if (!submissionType) return false;
  const t = submissionType.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (DEVICE_SUBMISSION_TYPES as readonly string[]).includes(t);
}

/**
 * The rule-pack pathway whose section keys a submission type can be named in,
 * or null when there is no seeded pack for it.
 *
 * PMA, IDE, Q-Sub and 513(g) return null deliberately: they are device
 * submissions this taxonomy classifies, and their outlines are not the
 * 510(k)/De Novo packs, so naming a key from either would be a guess dressed
 * as a citation.
 */
export function devicePathwayFor(submissionType: string | null | undefined): DevicePathway | null {
  if (!submissionType) return null;
  const t = submissionType.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (t === '510k' || t === 'k510') return 'k510';
  if (t === 'de_novo' || t === 'denovo') return 'denovo';
  return null;
}

export default {
  DEVICE_ISSUE_TAXONOMY,
  DEVICE_SUBMISSION_TYPES,
  isDeviceSubmissionType,
  devicePathwayFor,
};
