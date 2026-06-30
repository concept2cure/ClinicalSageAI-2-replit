/**
 * Research Agreements (MTA/DUA/CDA) deterministic logic (Capability C2C-27)
 *
 * Pure, DB-free, LLM-free: the execution-readiness gate for a material/data/
 * confidentiality agreement and a small portfolio roll-up. The PHI rules are
 * grounded in HIPAA: data containing PHI may be shared only under a Data Use
 * Agreement with a limited data set (45 CFR 164.514(e)) or after de-identification
 * (45 CFR 164.514(b)); a plain MTA/CDA is not an adequate vehicle for PHI. Human-
 * subjects data should trace to a protocol. `asOf` is passed in for the expiration
 * check so the logic stays deterministic.
 *
 * @module server/services/research-agreements/research-agreements-logic
 */

export const RESEARCH_AGREEMENT_BASIS = 'HIPAA 45 CFR 164.514 (limited data set / de-identification)';

export type AgreementType = 'mta' | 'dua' | 'cda';
export type AgreementDirection = 'incoming' | 'outgoing';

export interface AgreementView {
  agreementType: AgreementType | string;
  direction?: AgreementDirection | string;
  title?: string | null;
  ourParty?: string | null;
  otherParty?: string | null;
  materialOrDataDescription?: string | null;
  containsPhi?: boolean;
  containsHumanData?: boolean;
  isDeidentified?: boolean;
  limitedDataSet?: boolean;
  publicationRights?: boolean;
  protocolDocumentId?: number | null;
  expirationDate?: string | null;
}

export interface AgreementFinding { severity: 'critical' | 'warning' | 'info'; message: string }

export interface AgreementReadinessResult {
  readyToExecute: boolean;
  blockers: string[];
  findings: AgreementFinding[];
  basis: string;
}

function hasText(s?: string | null): boolean { return typeof s === 'string' && s.trim().length > 0; }

/**
 * Score an agreement's execution readiness. Blockers: missing title, counterparty,
 * or material/data description; PHI present without de-identification AND without a
 * DUA limited data set; a DUA carrying PHI but not marked as a limited data set.
 * Warnings: human-subjects data not linked to a protocol; no publication rights
 * retained on an outgoing transfer. Pure — the deterministic gate the service
 * enforces on execute. (HIPAA 45 CFR 164.514.)
 */
export function evaluateAgreementReadiness(a: AgreementView): AgreementReadinessResult {
  const blockers: string[] = [];
  const findings: AgreementFinding[] = [];

  if (!hasText(a.title)) blockers.push('An agreement title is required.');
  if (!hasText(a.otherParty)) blockers.push('The counterparty (other party) is required.');
  if (!hasText(a.materialOrDataDescription)) blockers.push('A description of the material or data is required.');

  if (a.containsPhi === true) {
    const safe = a.isDeidentified === true || a.limitedDataSet === true;
    if (!safe) {
      blockers.push('Data contains PHI but is neither de-identified nor a limited data set — execute a DUA with a limited data set or de-identify first (45 CFR 164.514).');
      findings.push({ severity: 'critical', message: `PHI present without de-identification or a limited data set (${RESEARCH_AGREEMENT_BASIS}).` });
    }
    if (a.agreementType !== 'dua' && a.limitedDataSet === true) {
      blockers.push('A limited data set containing PHI must be transferred under a Data Use Agreement (DUA), not an MTA/CDA (45 CFR 164.514(e)).');
    }
    if (a.agreementType === 'dua' && a.limitedDataSet !== true && a.isDeidentified !== true) {
      findings.push({ severity: 'warning', message: 'DUA carries PHI but is not marked as a limited data set — confirm the 164.514(e) data-use terms.' });
    }
  }

  if (a.containsHumanData === true && a.protocolDocumentId == null) {
    findings.push({ severity: 'warning', message: 'Human-subjects data is not linked to a protocol — confirm IRB coverage for this transfer.' });
  }

  if (a.direction === 'outgoing' && a.publicationRights === false) {
    findings.push({ severity: 'warning', message: 'No publication rights retained on an outgoing transfer — confirm this is acceptable for academic freedom.' });
  }

  for (const b of blockers) findings.push({ severity: 'critical', message: b });

  // De-dupe findings by message to avoid double-reporting blockers also pushed above.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => { const k = `${f.severity}:${f.message}`; if (seen.has(k)) return false; seen.add(k); return true; });

  return { readyToExecute: blockers.length === 0, blockers, findings: deduped, basis: RESEARCH_AGREEMENT_BASIS };
}

// ─── Portfolio roll-up ─────────────────────────────────────────────────────────

export interface AgreementPortfolioRow extends AgreementView { status?: string | null }

export interface AgreementPortfolioSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  phiCount: number;
  expiringSoon: number;
  expired: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Summarize a set of agreements (counts by type/status, PHI, expiry). Pure. */
export function summarizeAgreementPortfolio(rows: AgreementPortfolioRow[], asOf: string): AgreementPortfolioSummary {
  const asOfMs = Date.parse(asOf);
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let phiCount = 0, expiringSoon = 0, expired = 0;
  for (const r of rows) {
    byType[r.agreementType] = (byType[r.agreementType] ?? 0) + 1;
    const st = (r.status ?? 'unknown').toString();
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (r.containsPhi === true) phiCount += 1;
    const exp = r.expirationDate ? Date.parse(r.expirationDate) : NaN;
    if (Number.isFinite(exp) && Number.isFinite(asOfMs)) {
      if (exp < asOfMs) expired += 1;
      else if (exp - asOfMs <= 90 * DAY_MS) expiringSoon += 1;
    }
  }
  return { total: rows.length, byType, byStatus, phiCount, expiringSoon, expired };
}
