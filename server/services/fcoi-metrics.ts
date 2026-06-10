/**
 * FCOI metrics (Capability C2C-01) — in-memory counters surfaced via /api/metrics.
 *
 * Mirrors ana-ri-metrics / rag-runtime-metrics: no external deps, hand-rolled
 * Prometheus text, counters monotonic since process start. Recorded at the FCOI
 * service chokepoints; rendered by the central /api/metrics endpoint.
 *
 * @module server/services/fcoi-metrics
 */

interface FcoiMetricsState {
  disclosuresCreated: { FDA_3454: number; FDA_3455: number };
  certifications: number;
  signatureInvalidations: number;
  /** AI/gate reviews by resulting risk level. */
  reviews: { high: number; medium: number; low: number };
}

const state: FcoiMetricsState = {
  disclosuresCreated: { FDA_3454: 0, FDA_3455: 0 },
  certifications: 0,
  signatureInvalidations: 0,
  reviews: { high: 0, medium: 0, low: 0 },
};

export function recordFcoiDisclosureCreated(formType: 'FDA_3454' | 'FDA_3455'): void {
  state.disclosuresCreated[formType] += 1;
}
export function recordFcoiCertification(): void {
  state.certifications += 1;
}
export function recordFcoiSignatureInvalidation(): void {
  state.signatureInvalidations += 1;
}
export function recordFcoiReview(riskLevel: 'high' | 'medium' | 'low'): void {
  state.reviews[riskLevel] += 1;
}

export function renderFcoiMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP fcoi_disclosures_created_total Financial disclosures created, by form type');
  lines.push('# TYPE fcoi_disclosures_created_total counter');
  lines.push(`fcoi_disclosures_created_total{form="FDA_3454"} ${state.disclosuresCreated.FDA_3454}`);
  lines.push(`fcoi_disclosures_created_total{form="FDA_3455"} ${state.disclosuresCreated.FDA_3455}`);
  lines.push('# HELP fcoi_certifications_total Financial disclosure certifications (e-signatures)');
  lines.push('# TYPE fcoi_certifications_total counter');
  lines.push(`fcoi_certifications_total ${state.certifications}`);
  lines.push('# HELP fcoi_signature_invalidations_total Signatures invalidated by post-sign edits');
  lines.push('# TYPE fcoi_signature_invalidations_total counter');
  lines.push(`fcoi_signature_invalidations_total ${state.signatureInvalidations}`);
  lines.push('# HELP fcoi_reviews_total 21 CFR 54 completeness reviews, by risk level');
  lines.push('# TYPE fcoi_reviews_total counter');
  lines.push(`fcoi_reviews_total{risk="high"} ${state.reviews.high}`);
  lines.push(`fcoi_reviews_total{risk="medium"} ${state.reviews.medium}`);
  lines.push(`fcoi_reviews_total{risk="low"} ${state.reviews.low}`);
  return lines;
}

export function snapshotFcoiMetrics(): FcoiMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetFcoiMetrics(): void {
  state.disclosuresCreated = { FDA_3454: 0, FDA_3455: 0 };
  state.certifications = 0;
  state.signatureInvalidations = 0;
  state.reviews = { high: 0, medium: 0, low: 0 };
}
