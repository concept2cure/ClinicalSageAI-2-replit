/**
 * Precedent Intelligence fixture data -- ported verbatim from kit
 * app/precedent-engine.jsx.
 *
 * Grounded in the route schemas (SearchSchema / IngestSchema fields) from
 * server/routes/precedent-engine.ts + services/precedent-engine.
 */

/* ── Types ── */

export interface PrecedentResult {
  clearanceNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  clearanceType: string;
  decisionOutcome: string;
  productCode: string;
  therapeuticArea: string;
  cycle: number;
  match: number;
  riskFactors: string[];
  predicateKNumber: string | null;
}

export interface RiskFactor {
  label: string;
  severity: 'high' | 'medium' | 'low';
  note: string;
}

export interface RiskAnalysis {
  overall: string;
  score: number;
  factors: RiskFactor[];
}

export interface Strategy {
  recommendation: string;
  predicate: string;
  rationale: string[];
  altPathways: { p: string; when: string }[];
}

export interface ClaimResult {
  verdict: 'supported' | 'unsupported';
  confidence: number;
  precedents: string[];
  note: string;
}

export interface PatternAnalysis {
  title: string;
  rate: string;
  items: string[];
}

export interface PeQuery {
  submissionType: string;
  therapeuticArea: string;
  indication: string;
  productCode: string;
}

/* ── Fixture data ── */





/** Map severity to chip tone class. */
export function severityTone(s: string): string {
  return s === 'high' ? 'warn' : s === 'medium' ? 'ai' : 'idle';
}
