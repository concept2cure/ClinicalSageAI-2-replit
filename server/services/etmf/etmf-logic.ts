/**
 * eTMF deterministic logic (Capability C2C-08)
 *
 * Pure, DB-free, LLM-free: the DIA TMF Reference Model zone catalog, a keyword-
 * based artifact auto-classifier (the deterministic baseline an LLM can refine),
 * and the completeness gap-check that feeds inspection readiness. Grounded in the
 * DIA TMF Reference Model and ICH E6(R2) §8.
 *
 * @module server/services/etmf/etmf-logic
 */

import type { ArtifactStatus } from '../../../shared/schema/etmf';

/** DIA TMF Reference Model zones (v3). */
export const TMF_ZONES: Array<{ zone: number; name: string }> = [
  { zone: 1, name: 'Trial Management' },
  { zone: 2, name: 'Central Trial Documents' },
  { zone: 3, name: 'Regulatory' },
  { zone: 4, name: 'IRB / IEC and Other Approvals' },
  { zone: 5, name: 'Site Management' },
  { zone: 6, name: 'IP and Trial Supplies' },
  { zone: 7, name: 'Safety Reporting' },
  { zone: 8, name: 'Central and Local Testing' },
  { zone: 9, name: 'Third Parties' },
  { zone: 10, name: 'Data Management' },
  { zone: 11, name: 'Statistics' },
];

const ZONE_NAME = new Map(TMF_ZONES.map((z) => [z.zone, z.name]));
export function zoneName(zone: number): string {
  return ZONE_NAME.get(zone) ?? 'Unknown';
}

/** Keyword → zone rules (first match wins). The deterministic auto-classifier baseline. */
const CLASSIFY_RULES: Array<{ zone: number; section: string; keywords: RegExp }> = [
  { zone: 4, section: 'IRB/IEC Approval', keywords: /\b(irb|iec|ethics|informed consent|consent form|icf|assent)\b/i },
  { zone: 3, section: 'Regulatory Submission', keywords: /\b(ind|cta|regulatory|competent authority|form fda 1572|1572|fda)\b/i },
  { zone: 7, section: 'Safety Reporting', keywords: /\b(sae|susar|safety|adverse|dsur|pharmacovigilance)\b/i },
  { zone: 6, section: 'IP Management', keywords: /\b(investigational product|drug accountability|ip\b|randomi[sz]ation|unblinding|label)\b/i },
  { zone: 5, section: 'Site Management', keywords: /\b(site|delegation log|cv\b|curriculum vitae|training log|monitoring visit|1572)\b/i },
  { zone: 11, section: 'Statistics', keywords: /\b(statistical analysis plan|\bsap\b|randomi[sz]ation list|statistics)\b/i },
  { zone: 10, section: 'Data Management', keywords: /\b(data management plan|\bdmp\b|crf|case report form|edit check|database lock)\b/i },
  { zone: 8, section: 'Testing', keywords: /\b(laboratory|lab manual|central lab|sample handling|assay)\b/i },
  { zone: 9, section: 'Third Parties', keywords: /\b(vendor|cro\b|contract|agreement|sow\b)\b/i },
  { zone: 2, section: 'Central Trial Documents', keywords: /\b(protocol|investigator brochure|\bib\b|sample (icf|crf))\b/i },
  { zone: 1, section: 'Trial Management', keywords: /\b(trial plan|communication plan|tmf plan|oversight|kickoff)\b/i },
];

export interface Classification {
  zone: number;
  zoneName: string;
  section: string;
  confidence: 'matched' | 'default';
}

/**
 * Auto-classify an artifact by name into a DIA RM zone. Deterministic keyword
 * matching; defaults to Zone 2 (Central Trial Documents) when nothing matches.
 * Pure.
 */
export function classifyArtifact(artifactName: string): Classification {
  for (const rule of CLASSIFY_RULES) {
    if (rule.keywords.test(artifactName)) {
      return { zone: rule.zone, zoneName: zoneName(rule.zone), section: rule.section, confidence: 'matched' };
    }
  }
  return { zone: 2, zoneName: zoneName(2), section: 'Central Trial Documents', confidence: 'default' };
}

/** An artifact "counts as present" when it is received, in review, or final. */
function isPresent(status: ArtifactStatus): boolean {
  return status === 'received' || status === 'in_review' || status === 'final';
}

export interface CompletenessArtifact {
  zone: number;
  artifactName: string;
  expected: boolean;
  completenessRequired: boolean;
  status: ArtifactStatus;
}

export interface CompletenessResult {
  completenessPct: number;
  totalRequired: number;
  present: number;
  gaps: Array<{ zone: number; zoneName: string; artifactName: string; status: ArtifactStatus }>;
  byZone: Record<number, { required: number; present: number }>;
  verdict: 'inspection_ready' | 'minor_gaps' | 'at_risk';
}

/**
 * Completeness gap-check. The denominator is the expected + completeness-required
 * artifacts; the numerator is those present (received/in_review/final). Missing,
 * still-expected, or in_review-but-not-final required artifacts are listed as
 * gaps. Pure — feeds inspection readiness (C2C-13).
 */
export function evaluateCompleteness(artifacts: CompletenessArtifact[]): CompletenessResult {
  const required = artifacts.filter((a) => a.expected && a.completenessRequired && a.status !== 'not_applicable');
  const byZone: Record<number, { required: number; present: number }> = {};
  const gaps: CompletenessResult['gaps'] = [];
  let present = 0;
  for (const a of required) {
    byZone[a.zone] ??= { required: 0, present: 0 };
    byZone[a.zone].required += 1;
    // For inspection readiness, "present" means final; received/in_review are partial gaps.
    if (a.status === 'final') {
      present += 1;
      byZone[a.zone].present += 1;
    } else {
      gaps.push({ zone: a.zone, zoneName: zoneName(a.zone), artifactName: a.artifactName, status: a.status });
    }
  }
  const totalRequired = required.length;
  const completenessPct = totalRequired === 0 ? 100 : Math.round((present / totalRequired) * 100);
  const verdict: CompletenessResult['verdict'] = completenessPct >= 98 ? 'inspection_ready' : completenessPct >= 85 ? 'minor_gaps' : 'at_risk';
  return { completenessPct, totalRequired, present, gaps, byZone, verdict };
}
