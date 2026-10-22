/**
 * Compliance-checklist reasoning engine + training-gating (shared foundation)
 *
 * Pure, DB-free, LLM-free. Two jobs:
 *  1. Resolve, for a research activity profile, the REQUIRED committee approvals,
 *     the REQUIRED personnel training, and the procedural steps — each citation-
 *     backed and versioned (the "auto-updating compliance checklist that changes
 *     when regulations change"). Bump RULE_VERSION on any change.
 *  2. The training gate: given a roster's training records, decide whether the
 *     required training is current for everyone ("no index until trained").
 *
 * This is the deterministic spine the IRB/IACUC/IBC committees and sponsored
 * programs draw on. An LLM/AnA narrates ON TOP; it never invents the structure.
 *
 * @module server/services/research-compliance/compliance-checklist
 */

import type { TrainingType } from '../../../shared/schema/research-compliance';

export const RULE_VERSION = '2026-06-01';

export type Region = 'us' | 'eu' | 'other';
export type FundingSource = 'nih' | 'nsf' | 'barda' | 'dod' | 'industry' | 'internal' | 'other';

const REGIONS: readonly Region[] = ['us', 'eu', 'other'];
const FUNDING_SOURCES: readonly FundingSource[] = ['nih', 'nsf', 'barda', 'dod', 'industry', 'internal', 'other'];
const FEDERAL_FUNDING: readonly FundingSource[] = ['nih', 'nsf', 'barda', 'dod'];

/**
 * The facts a checklist is resolved from. Three-valued: null is "not stated",
 * which is not "no". 2026-10-15: these were plain booleans and every caller read
 * an unstated fact as false (funding as 'other', region as 'us'), so a study
 * nobody described resolved to no approvals and no training.
 */
export interface ActivityProfile {
  involvesHumanSubjects: boolean | null;
  involvesAnimals: boolean | null;
  involvesRecombinantDNA: boolean | null;
  involvesHumanGeneTransfer: boolean | null;
  fundingSource: FundingSource | null;
  /**
   * The rules in this RULE_VERSION cite U.S. federal requirements only. A stated
   * non-U.S. region is therefore resolved as not determined (U.S. rules only);
   * an unstated one is read under the U.S. rules, as before.
   */
  region: Region | null;
}

export type ProfileFact = keyof ActivityProfile;

const FACT_LABEL: Record<ProfileFact, string> = {
  involvesHumanSubjects: 'human-subjects involvement',
  involvesAnimals: 'animal involvement',
  involvesRecombinantDNA: 'recombinant/synthetic nucleic acid involvement',
  involvesHumanGeneTransfer: 'human gene transfer involvement',
  fundingSource: 'funding source',
  region: 'region',
};

export type CommitteeApproval = 'IRB' | 'IACUC' | 'IBC';

export interface RequiredApproval {
  committee: CommitteeApproval;
  reason: string;
  citation: string;
}

export interface RequiredTraining {
  trainingType: TrainingType;
  appliesTo: 'all_personnel' | 'animal_handlers' | 'investigators';
  citation: string;
}

export interface ChecklistStep {
  order: number;
  step: string;
  basis: string;
}

/** A committee approval a fact not stated could require: listed, not omitted. */
export interface UndeterminedApproval {
  committee: CommitteeApproval;
  /** The unstated facts that would settle whether it is required. */
  dependsOn: ProfileFact[];
  reason: string;
  citation: string;
}

/** Training a fact not stated could require: listed, not omitted. */
export interface UndeterminedTraining extends RequiredTraining {
  /** The unstated facts that would settle whether it is required. */
  dependsOn: ProfileFact[];
  reason: string;
}

export interface ComplianceChecklist {
  ruleVersion: string;
  requiredApprovals: RequiredApproval[];
  requiredTraining: RequiredTraining[];
  undeterminedApprovals: UndeterminedApproval[];
  undeterminedTraining: UndeterminedTraining[];
  /** Every fact of the profile that was not stated, whether or not a rule reads it. */
  unstatedFacts: ProfileFact[];
  /** True only when nothing is undetermined, i.e. the required lists are complete. */
  determined: boolean;
  steps: ChecklistStep[];
}

/** A rule's condition under three-valued logic; `holds: null` turns on the facts in `unstated`. */
interface Condition {
  holds: boolean | null;
  unstated: ProfileFact[];
}

function fact(name: ProfileFact, holds: boolean | null | undefined): Condition {
  return holds == null ? { holds: null, unstated: [name] } : { holds, unstated: [] };
}

function anyOf(...cs: Condition[]): Condition {
  if (cs.some((c) => c.holds === true)) return { holds: true, unstated: [] };
  if (cs.every((c) => c.holds === false)) return { holds: false, unstated: [] };
  return { holds: null, unstated: Array.from(new Set(cs.flatMap((c) => c.unstated))) };
}

function allOf(...cs: Condition[]): Condition {
  if (cs.some((c) => c.holds === false)) return { holds: false, unstated: [] };
  if (cs.every((c) => c.holds === true)) return { holds: true, unstated: [] };
  return { holds: null, unstated: Array.from(new Set(cs.flatMap((c) => c.unstated))) };
}

function notDetermined(unstated: ProfileFact[], requiredIf: string): string {
  return `Not determined: ${unstated.map((f) => FACT_LABEL[f]).join(', ')} not stated. Required if ${requiredIf}.`;
}

/**
 * Resolve the compliance checklist for an activity profile. Deterministic and
 * cited — this is the rule data that "changes when regulations change" (bump
 * RULE_VERSION). Pure.
 *
 * A rule whose outcome turns on a fact that was not stated is neither required
 * nor dropped: it is listed in undeterminedApprovals / undeterminedTraining with
 * the facts that would settle it. 2026-10-15: such a rule was silently omitted.
 */
export function resolveComplianceChecklist(p: ActivityProfile): ComplianceChecklist {
  const requiredApprovals: RequiredApproval[] = [];
  const requiredTraining: RequiredTraining[] = [];
  const undeterminedApprovals: UndeterminedApproval[] = [];
  const undeterminedTraining: UndeterminedTraining[] = [];

  const approval = (when: Condition, requiredIf: string, a: RequiredApproval) => {
    if (when.holds === true) requiredApprovals.push(a);
    else if (when.holds === null) undeterminedApprovals.push({ committee: a.committee, dependsOn: when.unstated, reason: notDetermined(when.unstated, requiredIf), citation: a.citation });
  };
  const training = (when: Condition, requiredIf: string, t: RequiredTraining) => {
    if (when.holds === true) requiredTraining.push(t);
    else if (when.holds === null) undeterminedTraining.push({ ...t, dependsOn: when.unstated, reason: notDetermined(when.unstated, requiredIf) });
  };

  const human = fact('involvesHumanSubjects', p.involvesHumanSubjects);
  const animals = fact('involvesAnimals', p.involvesAnimals);
  const geneTransfer = fact('involvesHumanGeneTransfer', p.involvesHumanGeneTransfer);
  const nucleicAcid = anyOf(fact('involvesRecombinantDNA', p.involvesRecombinantDNA), geneTransfer);
  const funding = (test: (f: FundingSource) => boolean) => fact('fundingSource', p.fundingSource == null ? null : test(p.fundingSource));
  const federal = funding((f) => FEDERAL_FUNDING.includes(f));

  // IRB for human subjects here; for human gene transfer it is added after IBC (below).
  const irb = anyOf(human, geneTransfer);
  if (human.holds === true) {
    requiredApprovals.push({ committee: 'IRB', reason: 'Research involving human subjects requires IRB review.', citation: '45 CFR 46.103; 21 CFR 56.103' });
  } else if (irb.holds === null) {
    undeterminedApprovals.push({ committee: 'IRB', dependsOn: irb.unstated, reason: notDetermined(irb.unstated, 'the activity involves human subjects or human gene transfer'), citation: '45 CFR 46.103; 21 CFR 56.103; NIH Guidelines III-C' });
  }
  training(human, 'the activity involves human subjects', { trainingType: 'citi_human_subjects', appliesTo: 'all_personnel', citation: 'NIH human-subjects protection training requirement' });
  training(allOf(human, funding((f) => f !== 'internal')), 'the activity involves human subjects and is not internally funded', { trainingType: 'citi_gcp', appliesTo: 'investigators', citation: 'ICH E6(R3) GCP; FDA/NIH GCP training' });

  approval(animals, 'the activity involves live vertebrate animals', { committee: 'IACUC', reason: 'Research involving live vertebrate animals requires IACUC approval.', citation: 'PHS Policy IV.C; AWA 9 CFR 2.31' });
  training(animals, 'the activity involves live vertebrate animals', { trainingType: 'citi_animal', appliesTo: 'animal_handlers', citation: 'PHS Policy IV.C.1.f (personnel qualifications/training)' });

  approval(nucleicAcid, 'the activity involves recombinant/synthetic nucleic acids or human gene transfer', { committee: 'IBC', reason: 'Recombinant/synthetic nucleic acid (or human gene transfer) work requires IBC registration.', citation: 'NIH Guidelines Section III' });
  training(nucleicAcid, 'the activity involves recombinant/synthetic nucleic acids or human gene transfer', { trainingType: 'biosafety', appliesTo: 'all_personnel', citation: 'NIH Guidelines; CDC/NIH BMBL' });

  // CGT typically needs IRB too (human subjects) — ensure IRB present.
  if (human.holds !== true && geneTransfer.holds === true) {
    requiredApprovals.push({ committee: 'IRB', reason: 'Human gene transfer involves human subjects and requires IRB review.', citation: '45 CFR 46; NIH Guidelines III-C' });
  }

  // FCOI / research-security disclosure for federally-funded work.
  training(federal, 'the funding is federal (NIH, NSF, BARDA or DoD)', { trainingType: 'fcoi_disclosure', appliesTo: 'investigators', citation: 'PHS FCOI 42 CFR 50 Subpart F; NSPM-33 / NOT-OD-26-017 research security' });

  // RCR training for NIH/NSF trainees.
  training(funding((f) => f === 'nih' || f === 'nsf'), 'the funding is NIH or NSF', { trainingType: 'citi_rcr', appliesTo: 'all_personnel', citation: 'NIH RCR (NOT-OD-10-019); NSF RCR (America COMPETES Act)' });

  const unstatedFacts = (Object.keys(FACT_LABEL) as ProfileFact[]).filter((f) => p[f] == null);
  const determined = undeterminedApprovals.length === 0 && undeterminedTraining.length === 0;

  const steps: ChecklistStep[] = [];
  let order = 1;
  if (!determined) {
    const deciding = Array.from(new Set([...undeterminedApprovals, ...undeterminedTraining].flatMap((u) => u.dependsOn)));
    steps.push({ order: order++, step: `State ${deciding.map((f) => FACT_LABEL[f]).join(', ')}: until then, the approvals and training listed as not determined may be required.`, basis: 'activity profile incomplete' });
  }
  steps.push({ order: order++, step: 'Confirm all listed personnel have current required training before submission (no index/account until trained).', basis: 'institutional roster gate' });
  for (const a of requiredApprovals) {
    steps.push({ order: order++, step: `Obtain ${a.committee} approval before initiating the corresponding activities.`, basis: a.citation });
  }
  if (federal.holds === true) {
    steps.push({ order: order++, step: 'File FCOI / research-security disclosures for all investigators prior to expenditure.', basis: '42 CFR 50 Subpart F; NSPM-33' });
  }

  const checklist = { ruleVersion: RULE_VERSION, requiredApprovals, requiredTraining, undeterminedApprovals, undeterminedTraining, unstatedFacts, determined, steps };
  return p.region === 'eu' || p.region === 'other' ? outsideUsRules(checklist, p.region) : checklist;
}

/**
 * A stated non-U.S. region. 2026-10-15: no rule read region, so an EU study was
 * told it required IRB review under 45 CFR 46, NIH training and PHS FCOI
 * disclosure, and the checklist read determined. What the U.S. rules would
 * require (or leave open) is listed as not determined, without the U.S.
 * citations; rules for other regions are not written in this version.
 */
function outsideUsRules(c: ComplianceChecklist, region: Region): ComplianceChecklist {
  const reason = `Not determined (U.S. rules only): region '${region}' is stated, and rule version ${RULE_VERSION} holds U.S. federal requirements only.`;
  const citation = `No rule for region '${region}' in rule version ${RULE_VERSION}`;
  const committees = Array.from(new Set([...c.requiredApprovals, ...c.undeterminedApprovals].map((a) => a.committee)));
  const trainings = [...c.requiredTraining, ...c.undeterminedTraining].filter(
    (t, i, all) => all.findIndex((o) => o.trainingType === t.trainingType) === i,
  );
  return {
    ...c,
    requiredApprovals: [],
    requiredTraining: [],
    undeterminedApprovals: committees.map((committee) => ({ committee, dependsOn: ['region'], reason, citation })),
    undeterminedTraining: trainings.map((t) => ({ trainingType: t.trainingType, appliesTo: t.appliesTo, citation, dependsOn: ['region'], reason })),
    determined: false,
    steps: [{ order: 1, step: `Determine the committee approvals and training this activity requires under the law of region '${region}': this checklist applies U.S. rules only.`, basis: reason }],
  };
}

export type ActivityProfileRead = { ok: true; profile: ActivityProfile } | { ok: false; error: string };

/**
 * Read an activity profile from request or tool input. A fact that is absent or
 * null was not stated and stays null: it is never read as false, and funding
 * source and region are never defaulted. A value of the wrong kind is refused,
 * naming its key. `keys` renames a fact's input key (AnA tools use snake_case).
 */
export function readActivityProfile(input: Record<string, unknown>, keys: Partial<Record<ProfileFact, string>> = {}): ActivityProfileRead {
  const problems: string[] = [];
  const keyOf = (f: ProfileFact): string => keys[f] ?? f;
  const flag = (f: ProfileFact): boolean | null => {
    const v = input[keyOf(f)];
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v;
    problems.push(`${keyOf(f)} must be true or false`);
    return null;
  };
  const oneOf = <T extends string>(f: ProfileFact, allowed: readonly T[]): T | null => {
    const v = input[keyOf(f)];
    if (v === undefined || v === null) return null;
    const match = allowed.find((a) => a === v);
    if (match === undefined) problems.push(`${keyOf(f)} must be one of ${allowed.join(', ')}`);
    return match ?? null;
  };
  const profile: ActivityProfile = {
    involvesHumanSubjects: flag('involvesHumanSubjects'),
    involvesAnimals: flag('involvesAnimals'),
    involvesRecombinantDNA: flag('involvesRecombinantDNA'),
    involvesHumanGeneTransfer: flag('involvesHumanGeneTransfer'),
    fundingSource: oneOf('fundingSource', FUNDING_SOURCES),
    region: oneOf('region', REGIONS),
  };
  return problems.length > 0
    ? { ok: false, error: `${problems.join('; ')}. Omit a fact that has not been stated; what it decides is then reported as not determined.` }
    : { ok: true, profile };
}

// ─── Training gate ───────────────────────────────────────────────────────────

function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
}

export interface TrainingRecord {
  personnelId: number;
  personnelName: string;
  trainingType: TrainingType | string;
  completedDate?: string | null;
  expiresDate?: string | null;
}

/** A training record is "current" when completed and not past its expiry. Pure. */
export function trainingStatus(rec: { completedDate?: string | null; expiresDate?: string | null }, today: string): 'current' | 'expiring' | 'expired' | 'missing' {
  if (!rec.completedDate) return 'missing';
  const exp = toDays(rec.expiresDate);
  const now = toDays(today);
  if (exp == null) return 'current'; // no expiry tracked
  if (now != null && now > exp) return 'expired';
  if (now != null && exp - now <= 30) return 'expiring';
  return 'current';
}

export interface TrainingGateResult {
  /**
   * true: every required training is current for every applicable person.
   * false: a required training is missing or expired.
   * null: nothing required is missing, but the gate cannot clear: training is
   * not determined (a fact was not stated), or nobody was evaluated.
   */
  cleared: boolean | null;
  missing: Array<{ personnelId: number; personnelName: string; trainingType: string; reason: 'missing' | 'expired' }>;
  expiringSoon: Array<{ personnelId: number; personnelName: string; trainingType: string }>;
  /** Training a fact not stated could require; the gate does not clear while any is listed. */
  undeterminedTraining: UndeterminedTraining[];
  personnelEvaluated: number;
}

/**
 * The "no index until trained" gate. For each (person, required training) pair,
 * confirm a current record exists. Investigator-only training is checked against
 * investigator personnel; animal-handler training against animal handlers; all-
 * personnel training against everyone. Pass the checklist's undeterminedTraining:
 * omit it only for a requirement list known to be complete. Pure.
 */
export function evaluateTrainingGate(
  personnel: Array<{ id: number; name: string; role: string }>,
  requiredTraining: RequiredTraining[],
  records: TrainingRecord[],
  today: string,
  undeterminedTraining: UndeterminedTraining[] = [],
): TrainingGateResult {
  const missing: TrainingGateResult['missing'] = [];
  const expiringSoon: TrainingGateResult['expiringSoon'] = [];

  const isInvestigator = (role: string) => role === 'principal_investigator' || role === 'co_investigator';
  const isAnimalHandler = (role: string) => ['principal_investigator', 'co_investigator', 'research_staff', 'veterinarian'].includes(role);

  for (const req of requiredTraining) {
    const applicable = personnel.filter((p) =>
      req.appliesTo === 'all_personnel' ? true : req.appliesTo === 'investigators' ? isInvestigator(p.role) : isAnimalHandler(p.role),
    );
    for (const person of applicable) {
      const rec = records.find((r) => r.personnelId === person.id && r.trainingType === req.trainingType);
      const status = rec ? trainingStatus(rec, today) : 'missing';
      if (status === 'missing' || status === 'expired') {
        missing.push({ personnelId: person.id, personnelName: person.name, trainingType: req.trainingType, reason: status });
      } else if (status === 'expiring') {
        expiringSoon.push({ personnelId: person.id, personnelName: person.name, trainingType: req.trainingType });
      }
    }
  }

  // 2026-10-15: cleared was `missing.length === 0`, so the gate cleared against a
  // requirement list that unstated facts had left incomplete, and over nobody.
  const unsettled = undeterminedTraining.length > 0 || (personnel.length === 0 && requiredTraining.length > 0);
  const cleared = missing.length > 0 ? false : unsettled ? null : true;
  return { cleared, missing, expiringSoon, undeterminedTraining, personnelEvaluated: personnel.length };
}

// ─── Study-onboarding orchestration ──────────────────────────────────────────

/** Which committee a required training gates (null = funding/institutional, not committee-specific). */
const TRAINING_TO_COMMITTEE: Record<string, CommitteeApproval | null> = {
  citi_human_subjects: 'IRB',
  citi_gcp: 'IRB',
  citi_animal: 'IACUC',
  biosafety: 'IBC',
  bloodborne_pathogens: 'IBC',
  fcoi_disclosure: null,
  citi_rcr: null,
};

export interface ApprovalReadiness {
  committee: CommitteeApproval;
  reason: string;
  citation: string;
  /** Missing/expired trainings that block submitting for THIS approval. */
  blockingGaps: Array<{ personnelId: number; personnelName: string; trainingType: string; reason: 'missing' | 'expired' }>;
  /** false on a blocking gap; null when training it needs is not determined or nobody was evaluated. */
  ready: boolean | null;
}

export interface StudyOnboardingAssessment {
  ruleVersion: string;
  requiredApprovals: RequiredApproval[];
  requiredTraining: RequiredTraining[];
  undeterminedApprovals: UndeterminedApproval[];
  undeterminedTraining: UndeterminedTraining[];
  unstatedFacts: ProfileFact[];
  steps: ChecklistStep[];
  gate: TrainingGateResult;
  approvals: ApprovalReadiness[];
  /**
   * true: every approval is determined and clear of training gaps (the team can
   * submit). false: a training gap blocks. null: not determined (a fact was not
   * stated, or nobody was evaluated).
   */
  readyToSubmit: boolean | null;
  blockers: string[];
}

/**
 * One-shot study-onboarding assessment: resolve the required approvals + training
 * for the activity profile, run the training gate over the named team, and then
 * CROSS-REFERENCE each training gap to the specific committee approval it blocks
 * (e.g. a PI missing CITI human-subjects blocks the IRB submission, not the IACUC
 * one). Answers "what do I need to stand up this study and is my team ready?" in a
 * single, defensible pass. Pure — the AnA tool loads the roster and calls this.
 */
export function assessStudyOnboarding(
  profile: ActivityProfile,
  personnel: Array<{ id: number; name: string; role: string }>,
  records: TrainingRecord[],
  today: string,
): StudyOnboardingAssessment {
  const checklist = resolveComplianceChecklist(profile);
  const gate = evaluateTrainingGate(personnel, checklist.requiredTraining, records, today, checklist.undeterminedTraining);

  const approvals: ApprovalReadiness[] = checklist.requiredApprovals.map((a) => {
    const gates = (trainingType: string) => TRAINING_TO_COMMITTEE[trainingType] === a.committee;
    const blockingGaps = gate.missing.filter((m) => gates(m.trainingType));
    // 2026-10-15: ready was `blockingGaps.length === 0`, true even when training this
    // approval needs was not determined, or nobody was checked.
    const unsettled = checklist.undeterminedTraining.some((u) => gates(u.trainingType))
      || (personnel.length === 0 && checklist.requiredTraining.some((r) => gates(r.trainingType)));
    return { committee: a.committee, reason: a.reason, citation: a.citation, blockingGaps, ready: blockingGaps.length > 0 ? false : unsettled ? null : true };
  });

  const blockers: string[] = [];
  for (const ap of approvals) {
    for (const g of ap.blockingGaps) {
      blockers.push(`${ap.committee}: ${g.personnelName} ${g.reason === 'expired' ? 'has expired' : 'is missing'} ${g.trainingType}`);
    }
  }
  // Funding/institutional training gaps (FCOI, RCR) block the study but no single committee.
  for (const m of gate.missing) {
    if (TRAINING_TO_COMMITTEE[m.trainingType] === null) {
      blockers.push(`Pre-expenditure: ${m.personnelName} ${m.reason === 'expired' ? 'has expired' : 'is missing'} ${m.trainingType}`);
    }
  }

  return {
    ruleVersion: checklist.ruleVersion,
    requiredApprovals: checklist.requiredApprovals,
    requiredTraining: checklist.requiredTraining,
    undeterminedApprovals: checklist.undeterminedApprovals,
    undeterminedTraining: checklist.undeterminedTraining,
    unstatedFacts: checklist.unstatedFacts,
    steps: checklist.steps,
    gate,
    approvals,
    // An approval that is itself undetermined also keeps this from true.
    readyToSubmit: gate.cleared === false ? false : gate.cleared === null || !checklist.determined ? null : true,
    blockers,
  };
}
