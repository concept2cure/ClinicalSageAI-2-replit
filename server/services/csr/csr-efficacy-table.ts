/**
 * §11.4 efficacy results tables, as the approved SAP output reports them:
 * imported, never computed (design decision 2). Moved from
 * csr-tabulation-builders.ts unchanged, with the CDISC pilot D10 additions
 * (2026-10-30): an armless result (no arm, such as a dose-response test) with
 * its method and population, and the stated "Efficacy results not supplied"
 * row for a source that declares it carries none.
 */
import type { GeneratedTable } from '../module3Composer.js';
import type { EfficacyResult, StudyData } from '../csr-tabulation-builders.js';

const interval = (i: { lower: number; upper: number; level: string }) => `${i.lower.toFixed(2)}–${i.upper.toFixed(2)} (${i.level})`;
/** Three places, as p-values are; never rounded up to certainty or down to impossibility. */
const probability = (p: number) => (p > 0.999 && p < 1 ? '>0.999' : p > 0 && p < 0.001 ? '<0.001' : p.toFixed(3));

function efficacyRow(endpoint: string, r: EfficacyResult, armIdToName: Map<string, string>, bayesian: boolean, described: boolean): string[] {
  return [
    endpoint,
    r.armId === undefined ? '—' : armIdToName.get(r.armId) || r.armId,
    r.display,
    r.ci ? interval(r.ci) : '—',
    r.pValue !== undefined ? r.pValue.toFixed(3) : '—',
    ...(bayesian ? [
      r.credibleInterval ? interval(r.credibleInterval) : '—',
      r.posteriorProbability ? probability(r.posteriorProbability.value) : '—',
      r.posteriorProbability ? r.posteriorProbability.hypothesis : '—',
    ] : []),
    ...(described ? [r.method ?? '—', r.population ?? '—'] : []),
    r.comparatorArmId ? armIdToName.get(r.comparatorArmId) || r.comparatorArmId : '—',
  ];
}

export function buildEfficacyTable(
  study: StudyData,
  type: 'primary' | 'secondary'
): GeneratedTable {
  const results = study.efficacy.filter(e => e.endpointType === type);
  const byEndpoint = new Map<string, EfficacyResult[]>();
  for (const r of results) {
    const list = byEndpoint.get(r.endpointName) || [];
    list.push(r);
    byEndpoint.set(r.endpointName, list);
  }

  const armIdToName = new Map(study.treatmentArms.map(a => [a.armId, a.armName]));

  // The Bayesian columns appear only when a result carries them, so a table
  // built from a source without them is byte-identical to before (its
  // scientific-review receipts hash these cells).
  const bayesian = results.some(r => r.credibleInterval || r.posteriorProbability);
  // Method and population columns likewise appear only when a result states them (D10, 2026-10-30).
  const described = results.some(r => r.method !== undefined || r.population !== undefined);
  const rows: string[][] = [];
  for (const [endpoint, armResults] of byEndpoint) {
    for (const r of armResults) rows.push(efficacyRow(endpoint, r, armIdToName, bayesian, described));
  }

  const headers = ['Endpoint', 'Arm', 'Result', 'CI', 'p-value',
    ...(bayesian ? ['Credible interval', 'Posterior probability', 'Posterior hypothesis'] : []),
    ...(described ? ['Method', 'Population'] : []), 'vs Comparator'];
  // A source that declares efficacy not supplied says so, never a blank or zero row.
  const empty = study.efficacyStatus === 'not-supplied' ? ['Efficacy results not supplied', ...headers.slice(1).map(() => '—')]
    : ['No data', ...headers.slice(1).map(() => '')];
  return {
    title: type === 'primary'
      ? '§11.4 — Primary Efficacy Endpoint Results'
      : '§11.4 — Secondary Efficacy Endpoint Results',
    headers,
    rows: rows.length > 0 ? rows : [empty],
  };
}
