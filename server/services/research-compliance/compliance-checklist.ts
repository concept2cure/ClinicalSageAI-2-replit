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

export interface ActivityProfile {
  involvesHumanSubjects: boolean;
  involvesAnimals: boolean;
  involvesRecombinantDNA: boolean;
  involvesHumanGeneTransfer: boolean;
  fundingSource: FundingSource;
  region: Region;
}

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

export interface ComplianceChecklist {
  ruleVersion: string;
  requiredApprovals: RequiredApproval[];
  requiredTraining: RequiredTraining[];
  steps: ChecklistStep[];
}

/**
 * Resolve the compliance checklist for an activity profile. Deterministic and
 * cited — this is the rule data that "changes when regulations change" (bump
 * RULE_VERSION). Pure.
 */
export function resolveComplianceChecklist(p: ActivityProfile): ComplianceChecklist {
  const requiredApprovals: RequiredApproval[] = [];
  const requiredTraining: RequiredTraining[] = [];

  if (p.involvesHumanSubjects) {
    requiredApprovals.push({ committee: 'IRB', reason: 'Research involving human subjects requires IRB review.', citation: '45 CFR 46.103; 21 CFR 56.103' });
    requiredTraining.push({ trainingType: 'citi_human_subjects', appliesTo: 'all_personnel', citation: 'NIH human-subjects protection training requirement' });
    if (p.fundingSource !== 'internal') {
      requiredTraining.push({ trainingType: 'citi_gcp', appliesTo: 'investigators', citation: 'ICH E6(R2) GCP; FDA/NIH GCP training' });
    }
  }
  if (p.involvesAnimals) {
    requiredApprovals.push({ committee: 'IACUC', reason: 'Research involving live vertebrate animals requires IACUC approval.', citation: 'PHS Policy IV.C; AWA 9 CFR 2.31' });
    requiredTraining.push({ trainingType: 'citi_animal', appliesTo: 'animal_handlers', citation: 'PHS Policy IV.C.1.f (personnel qualifications/training)' });
  }
  if (p.involvesRecombinantDNA || p.involvesHumanGeneTransfer) {
    requiredApprovals.push({ committee: 'IBC', reason: 'Recombinant/synthetic nucleic acid (or human gene transfer) work requires IBC registration.', citation: 'NIH Guidelines Section III' });
    requiredTraining.push({ trainingType: 'biosafety', appliesTo: 'all_personnel', citation: 'NIH Guidelines; CDC/NIH BMBL' });
  }
  if (p.involvesHumanGeneTransfer) {
    // CGT typically needs IRB too (human subjects) — ensure IRB present.
    if (!requiredApprovals.some((a) => a.committee === 'IRB')) {
      requiredApprovals.push({ committee: 'IRB', reason: 'Human gene transfer involves human subjects and requires IRB review.', citation: '45 CFR 46; NIH Guidelines III-C' });
    }
  }

  // FCOI / research-security disclosure for federally-funded work.
  if (['nih', 'nsf', 'barda', 'dod'].includes(p.fundingSource)) {
    requiredTraining.push({ trainingType: 'fcoi_disclosure', appliesTo: 'investigators', citation: 'PHS FCOI 42 CFR 50 Subpart F; NSPM-33 / NOT-OD-26-017 research security' });
  }

  // RCR training for NIH/NSF trainees.
  if (p.fundingSource === 'nih' || p.fundingSource === 'nsf') {
    requiredTraining.push({ trainingType: 'citi_rcr', appliesTo: 'all_personnel', citation: 'NIH RCR (NOT-OD-10-019); NSF RCR (America COMPETES Act)' });
  }

  const steps: ChecklistStep[] = [];
  let order = 1;
  steps.push({ order: order++, step: 'Confirm all listed personnel have current required training before submission (no index/account until trained).', basis: 'institutional roster gate' });
  for (const a of requiredApprovals) {
    steps.push({ order: order++, step: `Obtain ${a.committee} approval before initiating the corresponding activities.`, basis: a.citation });
  }
  if (['nih', 'nsf', 'barda', 'dod'].includes(p.fundingSource)) {
    steps.push({ order: order++, step: 'File FCOI / research-security disclosures for all investigators prior to expenditure.', basis: '42 CFR 50 Subpart F; NSPM-33' });
  }

  return { ruleVersion: RULE_VERSION, requiredApprovals, requiredTraining, steps };
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
  cleared: boolean;
  missing: Array<{ personnelId: number; personnelName: string; trainingType: string; reason: 'missing' | 'expired' }>;
  expiringSoon: Array<{ personnelId: number; personnelName: string; trainingType: string }>;
}

/**
 * The "no index until trained" gate. For each (person, required training) pair,
 * confirm a current record exists. Investigator-only training is checked against
 * investigator personnel; animal-handler training against animal handlers; all-
 * personnel training against everyone. Pure.
 */
export function evaluateTrainingGate(
  personnel: Array<{ id: number; name: string; role: string }>,
  requiredTraining: RequiredTraining[],
  records: TrainingRecord[],
  today: string,
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

  return { cleared: missing.length === 0, missing, expiringSoon };
}
