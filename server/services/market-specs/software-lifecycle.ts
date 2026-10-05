/**
 * Medical device software lifecycle (IEC 62304) — software safety classification
 * and the per-class lifecycle deliverables, with reviewer questions.
 *
 * WHY THIS EXISTS (audit gap): software documentation deficiencies are a common
 * device finding, but no IEC 62304 structure was modelled. This classifies software
 * into safety Class A/B/C and returns the lifecycle deliverables required for that
 * class (architecture/detailed design escalate with class), plus the reviewer's
 * software questions (SOUP, cybersecurity, V&V).
 *
 * HONESTY: reflects IEC 62304:2006+A1:2015 process structure + the FDA software/
 * cybersecurity guidance themes. It is the required deliverable set + reviewer
 * questions, not the V&V evidence itself.
 *
 * FDA DOCUMENTATION LEVEL (added 2026-10-05): FDA's 2023 device software
 * guidance replaced the 2005 "Level of Concern" with a Basic or Enhanced
 * Documentation Level. Enhanced turns on the hazard a software failure could
 * present BEFORE risk controls; the IEC 62304 class above is assigned AFTER
 * external risk controls. The two are separate determinations and this module
 * keeps them separate: `fdaDocumentationLevel` never reads an IEC class, and an
 * absent fact is `undetermined`, never Basic. Cybersecurity documentation is a
 * separate branch keyed on cyber-device status (FD&C Act §524B), not on level.
 * The reviewer engines (device-510k-auditor, pma-auditor, reviewer-personas,
 * device-shadow-reviewer) read these functions rather than keeping prose.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/software-lifecycle
 */

import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';

export type SoftwareSafetyClass = 'A' | 'B' | 'C';

export interface SoftwareClassification {
  class: SoftwareSafetyClass;
  rationale: string;
  caveat: string;
}

const SW_CAVEAT =
  'Per IEC 62304 §4.3: classification is determined after considering risk-control measures external to the software. Confirm against the software risk analysis.';

/**
 * Classify software into IEC 62304 safety class from the worst-case harm a software
 * failure could contribute to (after external risk controls).
 */
export function classifySoftware(facts: {
  canContributeToDeathOrSeriousInjury?: boolean;
  canContributeToNonSeriousInjury?: boolean;
}): SoftwareClassification {
  if (facts.canContributeToDeathOrSeriousInjury) {
    return { class: 'C', rationale: 'A software failure could contribute to death or SERIOUS injury.', caveat: SW_CAVEAT };
  }
  if (facts.canContributeToNonSeriousInjury) {
    return { class: 'B', rationale: 'A software failure could contribute to NON-serious injury.', caveat: SW_CAVEAT };
  }
  return { class: 'A', rationale: 'No injury or damage to health is possible from a software failure.', caveat: SW_CAVEAT };
}

export interface SoftwareDeliverable {
  id: string;
  clause: string;
  title: string;
  /** The safety classes for which the deliverable is required. */
  classes: SoftwareSafetyClass[];
}

/** IEC 62304 lifecycle deliverables, with the classes each applies to. */
export const SOFTWARE_DELIVERABLES: SoftwareDeliverable[] = [
  { id: 'development_plan', clause: '5.1', title: 'Software development plan', classes: ['A', 'B', 'C'] },
  { id: 'requirements', clause: '5.2', title: 'Software requirements specification', classes: ['A', 'B', 'C'] },
  { id: 'architecture', clause: '5.3', title: 'Software architectural design', classes: ['B', 'C'] },
  { id: 'detailed_design', clause: '5.4', title: 'Software detailed design', classes: ['C'] },
  { id: 'unit_implementation', clause: '5.5', title: 'Unit implementation and verification', classes: ['A', 'B', 'C'] },
  { id: 'integration_testing', clause: '5.6', title: 'Software integration and integration testing', classes: ['B', 'C'] },
  { id: 'system_testing', clause: '5.7', title: 'Software system testing', classes: ['A', 'B', 'C'] },
  { id: 'release', clause: '5.8', title: 'Software release (incl. known anomalies)', classes: ['A', 'B', 'C'] },
  { id: 'risk_management', clause: '7', title: 'Software risk management (incl. SOUP)', classes: ['A', 'B', 'C'] },
  { id: 'configuration_management', clause: '8', title: 'Software configuration management', classes: ['A', 'B', 'C'] },
  { id: 'problem_resolution', clause: '9', title: 'Software problem resolution', classes: ['A', 'B', 'C'] },
];

/** The reviewer's software questions (IEC 62304 + FDA software/cybersecurity themes). */
export const SOFTWARE_REVIEWER_QUESTIONS: string[] = [
  'Is the software safety classification (A/B/C) justified by the software risk analysis (after external risk controls)?',
  'Are SOUP (software of unknown provenance) items identified, with their requirements and known anomalies assessed?',
  'For Class B/C, is the architecture documented and segregation of safety-related items justified?',
  'Is verification traceable from requirements through system testing?',
  'Is cybersecurity addressed — threat model, an SBOM, and validated security controls?',
  'Is the software release accompanied by a documented list of residual/known anomalies and their risk evaluation?',
];

export function deliverablesForClass(cls: SoftwareSafetyClass): SoftwareDeliverable[] {
  return SOFTWARE_DELIVERABLES.filter((d) => d.classes.includes(cls));
}

export interface SoftwareDeliverableAssessment {
  class: SoftwareSafetyClass;
  ready: boolean;
  missing: string[];
  presentCount: number;
  totalRequired: number;
}

/** Assess which IEC 62304 deliverables for the class are present. */
export function assessSoftwareDeliverables(cls: SoftwareSafetyClass, presentDeliverableIds: string[]): SoftwareDeliverableAssessment {
  const present = new Set(presentDeliverableIds);
  const required = deliverablesForClass(cls);
  const missing = required.filter((d) => !present.has(d.id)).map((d) => d.id);
  return {
    class: cls,
    ready: missing.length === 0,
    missing,
    presentCount: required.length - missing.length,
    totalRequired: required.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FDA software Documentation Level (Basic / Enhanced)
// ─────────────────────────────────────────────────────────────────────────────

/** The FDA guidance the Documentation Level comes from. `issued` is the final guidance's date. */
export const FDA_DEVICE_SOFTWARE_GUIDANCE = Object.freeze({
  title: 'Content of Premarket Submissions for Device Software Functions',
  issued: '2023-06-14',
  url: 'https://www.fda.gov/media/153781/download',
});

const GUIDANCE_REF = `FDA guidance "${FDA_DEVICE_SOFTWARE_GUIDANCE.title}"`;

/**
 * The Documentation Level definition — the one statement in this section that
 * was checked against FDA's own copy (search extract of the fda.gov PDF).
 */
const DOCUMENTATION_LEVEL_DEFINITION_BASIS: RegulatoryBasis = Object.freeze({
  ref: `${GUIDANCE_REF}, Documentation Level (Enhanced where a software failure or flaw could present a hazardous situation with a probable risk of death or serious injury, assessed prior to risk control measures; otherwise Basic)`,
  confidence: 'regulator-text',
  url: FDA_DEVICE_SOFTWARE_GUIDANCE.url,
  checked: '2026-10-05',
  note: 'Search extract of the fda.gov copy; WebFetch to fda.gov is blocked in this environment, so a verbatim re-read of the PDF is owed.',
});

/** The documentation-set rows: recall until each is checked against the guidance's table. */
const SET_BASIS: RegulatoryBasis = Object.freeze({
  ref: `${GUIDANCE_REF}, recommended documentation by Documentation Level`,
  confidence: 'recall',
  url: FDA_DEVICE_SOFTWARE_GUIDANCE.url,
  note: 'Row contents from recall, corroborated by search extracts; not checked against the guidance table.',
});

export type FdaDocumentationLevel = 'basic' | 'enhanced';

export interface FdaDocumentationLevelDetermination {
  level: FdaDocumentationLevel | 'undetermined';
  rationale: string;
  basis: RegulatoryBasis[];
}

/**
 * The questionnaire answer that records the Documentation Level fact: could a
 * failure or flaw of any device software function present a hazardous situation
 * with a probable risk of death or serious injury, BEFORE risk controls (yes/no)?
 */
export const FDA_DOCUMENTATION_LEVEL_FACT = 'software_failure_probable_serious_harm_before_controls';

/** The reviewer's question, in one place for every engine that asks it. */
export const FDA_DOCUMENTATION_LEVEL_QUESTION =
  'What is the FDA software Documentation Level (Basic or Enhanced)? It is Enhanced when a failure or flaw of any ' +
  'device software function could present a hazardous situation with a probable risk of death or serious injury, ' +
  'assessed before risk controls; otherwise Basic. It is determined independently of the IEC 62304 safety class, ' +
  'which is assigned after external risk controls.';

/**
 * Determine FDA's software Documentation Level from the pre-risk-control hazard
 * fact. An absent fact is `undetermined` — never Basic, which would silently
 * shrink the documentation a reviewer expects.
 */
export function fdaDocumentationLevel(facts: {
  failureCouldPresentProbableRiskOfDeathOrSeriousInjuryBeforeRiskControls?: boolean;
}): FdaDocumentationLevelDetermination {
  const basis = [DOCUMENTATION_LEVEL_DEFINITION_BASIS];
  const fact = facts.failureCouldPresentProbableRiskOfDeathOrSeriousInjuryBeforeRiskControls;
  if (fact === true) {
    return {
      level: 'enhanced',
      rationale:
        'A software failure or flaw could present a hazardous situation with a probable risk of death or serious injury before risk controls.',
      basis,
    };
  }
  if (fact === false) {
    return {
      level: 'basic',
      rationale:
        'Recorded that no software failure or flaw could present a hazardous situation with a probable risk of death or serious injury before risk controls.',
      basis,
    };
  }
  return {
    level: 'undetermined',
    rationale:
      'The Documentation Level has not been determined: whether a software failure could present a probable risk of death or serious injury before risk controls is not recorded. The IEC 62304 class does not answer it.',
    basis,
  };
}

/** A questionnaire yes/no answer as a boolean (true/false, 'yes'/'no'); anything else is unknown. */
export function readYesNoAnswer(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
  }
  return undefined;
}

/** Read the Documentation Level fact from questionnaire answers (`FDA_DOCUMENTATION_LEVEL_FACT`). */
export function fdaDocumentationLevelFromAnswers(answers: Record<string, unknown>): FdaDocumentationLevelDetermination {
  return fdaDocumentationLevel({
    failureCouldPresentProbableRiskOfDeathOrSeriousInjuryBeforeRiskControls: readYesNoAnswer(answers[FDA_DOCUMENTATION_LEVEL_FACT]),
  });
}

/** One piece of premarket software or cybersecurity documentation. */
export interface FdaSubmissionDocumentationItem {
  id: string;
  title: string;
  /**
   * FDA's own description of the eSTAR attachment slot it files into, as the
   * template declares it (nIVD files these under /CHAPTER 3/CH3.05/CH3.05.05/).
   * The chapter token is READ from the template by
   * pathway-engines/estar/estar-attachment-slots.ts, not transcribed here.
   */
  estarSlot: string | null;
  basis: RegulatoryBasis[];
}

export interface FdaSoftwareDocumentationItem extends FdaSubmissionDocumentationItem {
  /** The Documentation Levels at which FDA recommends the item in the premarket submission. */
  levels: FdaDocumentationLevel[];
  /** What the item is at each level, where it differs. */
  detail?: Partial<Record<FdaDocumentationLevel, string>>;
}

const BOTH: FdaDocumentationLevel[] = ['basic', 'enhanced'];
const ENHANCED: FdaDocumentationLevel[] = ['enhanced'];

/** FDA's recommended software documentation by Documentation Level. Rows are recall (see SET_BASIS). */
export const FDA_SOFTWARE_DOCUMENTATION_SET: readonly FdaSoftwareDocumentationItem[] = Object.freeze([
  { id: 'documentation_level_evaluation', title: 'Documentation Level evaluation', levels: BOTH, estarSlot: null, basis: [SET_BASIS] },
  { id: 'software_description', title: 'Software description', levels: BOTH, estarSlot: 'Software/Firmware | Software Description', basis: [SET_BASIS] },
  { id: 'risk_management_file', title: 'System and software risk management file', levels: BOTH, estarSlot: 'Software/Firmware | Device Hazard Analysis', basis: [SET_BASIS] },
  { id: 'srs', title: 'Software requirements specification (SRS)', levels: BOTH, estarSlot: 'Software/Firmware | SRS', basis: [SET_BASIS] },
  { id: 'architecture_design_chart', title: 'System and software architecture design chart', levels: BOTH, estarSlot: 'Software/Firmware | Architecture Design Chart', basis: [SET_BASIS] },
  {
    id: 'development_practices',
    title: 'Software development, configuration management and maintenance practices',
    levels: BOTH,
    detail: {
      basic: 'a declaration of conformity to IEC 62304, or a summary of the life-cycle development, configuration management and maintenance activities',
      enhanced: 'the Basic content, plus the complete configuration management and maintenance plan',
    },
    estarSlot: 'Software/Firmware | Development Environment / Life Cycle Process',
    basis: [SET_BASIS],
  },
  { id: 'testing_summary', title: 'Software testing summary (unit, integration and system levels)', levels: BOTH, estarSlot: 'Software/Firmware | V&V', basis: [SET_BASIS] },
  { id: 'system_test_protocol_report', title: 'System-level test protocol and report', levels: BOTH, estarSlot: 'Software/Firmware | V&V', basis: [SET_BASIS] },
  { id: 'version_history', title: 'Software version history', levels: BOTH, estarSlot: 'Software/Firmware | Version / Revision Level History', basis: [SET_BASIS] },
  { id: 'unresolved_anomalies', title: 'Unresolved software anomalies', levels: BOTH, estarSlot: 'Software/Firmware | Unresolved Anomalies', basis: [SET_BASIS] },
  { id: 'sds', title: 'Software design specification (SDS)', levels: ENHANCED, estarSlot: 'Software/Firmware | SDS', basis: [SET_BASIS] },
  { id: 'unit_integration_test_protocols_reports', title: 'Unit and integration test protocols and reports', levels: ENHANCED, estarSlot: 'Software/Firmware | V&V', basis: [SET_BASIS] },
  {
    id: 'configuration_maintenance_plan',
    title: 'Complete configuration management and maintenance plan',
    levels: ENHANCED,
    estarSlot: 'Software/Firmware | Development Environment / Life Cycle Process',
    basis: [SET_BASIS],
  },
]);

/** The software documentation FDA recommends at a determined Documentation Level. */
export function fdaSoftwareDocumentationSet(level: FdaDocumentationLevel): FdaSoftwareDocumentationItem[] {
  return FDA_SOFTWARE_DOCUMENTATION_SET.filter((i) => i.levels.includes(level));
}

/** One line naming the set for a level, or both sets when the level is undetermined. */
export function describeFdaSoftwareDocumentation(level: FdaDocumentationLevelDetermination['level']): string {
  const titles = (l: FdaDocumentationLevel) => fdaSoftwareDocumentationSet(l).map((i) => i.title);
  if (level === 'undetermined') {
    const basic = titles('basic');
    const added = titles('enhanced').filter((t) => !basic.includes(t));
    return (
      'Determine the FDA Documentation Level first. ' +
      `Basic: ${basic.join('; ')}. Enhanced adds: ${added.join('; ')}.`
    );
  }
  return `${level === 'enhanced' ? 'Enhanced' : 'Basic'} Documentation Level: ${titles(level).join('; ')}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cybersecurity documentation — keyed on cyber-device status, not on level
// ─────────────────────────────────────────────────────────────────────────────

const CYBER_BASIS: RegulatoryBasis[] = [
  Object.freeze({
    ref: 'FD&C Act §524B (ensuring cybersecurity of devices) — premarket submissions for cyber devices',
    confidence: 'recall',
    note: 'Statutory text not read this session.',
  }) as RegulatoryBasis,
  Object.freeze({
    ref: 'FDA guidance "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions"',
    confidence: 'recall',
    note: 'Not read this session.',
  }) as RegulatoryBasis,
];

export interface FdaCybersecurityDocumentation {
  status: 'required' | 'not_required' | 'undetermined';
  rationale: string;
  items: FdaSubmissionDocumentationItem[];
  basis: RegulatoryBasis[];
}

const CYBER_ITEMS: readonly FdaSubmissionDocumentationItem[] = Object.freeze([
  { id: 'sbom', title: 'Software bill of materials (SBOM)', estarSlot: 'Cybersecurity | SBOM', basis: CYBER_BASIS },
  { id: 'threat_model', title: 'Threat model', estarSlot: 'Cybersecurity | Threat Model', basis: CYBER_BASIS },
  { id: 'cybersecurity_risk_assessment', title: 'Cybersecurity risk assessment', estarSlot: 'Cybersecurity | Risk Assessment', basis: CYBER_BASIS },
  { id: 'cybersecurity_testing', title: 'Cybersecurity testing', estarSlot: 'Cybersecurity | Testing', basis: CYBER_BASIS },
  { id: 'cybersecurity_management_plan', title: 'Plan to monitor, identify and address postmarket vulnerabilities', estarSlot: 'Cybersecurity | Management Plan', basis: CYBER_BASIS },
]);

/**
 * Cybersecurity documentation for a device, keyed on its cyber-device status
 * (`DEVICE_FLAGS` id `cyberDevice`, FD&C Act §524B) — independent of the
 * software Documentation Level. Unknown status is `undetermined`.
 */
export function fdaCybersecurityDocumentation(facts: { cyberDevice?: boolean }): FdaCybersecurityDocumentation {
  if (facts.cyberDevice === true) {
    return { status: 'required', rationale: 'The device is flagged as a cyber device (FD&C Act §524B).', items: [...CYBER_ITEMS], basis: CYBER_BASIS };
  }
  if (facts.cyberDevice === false) {
    return { status: 'not_required', rationale: 'The device is recorded as not a cyber device.', items: [], basis: CYBER_BASIS };
  }
  return {
    status: 'undetermined',
    rationale: 'Whether the device is a cyber device (FD&C Act §524B) is not recorded.',
    items: [],
    basis: CYBER_BASIS,
  };
}

/** The reviewer's cybersecurity question, asked separately from the Documentation Level. */
export const FDA_CYBER_DEVICE_QUESTION =
  'Is the device a cyber device under FD&C Act §524B, and if so does the submission include the SBOM, threat model, ' +
  'cybersecurity risk assessment and testing, and a plan to address postmarket vulnerabilities?';

export default {
  classifySoftware,
  SOFTWARE_DELIVERABLES,
  SOFTWARE_REVIEWER_QUESTIONS,
  deliverablesForClass,
  assessSoftwareDeliverables,
  fdaDocumentationLevel,
  fdaDocumentationLevelFromAnswers,
  FDA_SOFTWARE_DOCUMENTATION_SET,
  fdaSoftwareDocumentationSet,
  describeFdaSoftwareDocumentation,
  fdaCybersecurityDocumentation,
};
