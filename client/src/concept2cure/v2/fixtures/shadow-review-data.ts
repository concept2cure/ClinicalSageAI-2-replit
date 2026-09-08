/**
 * Shadow-review fixture data -- ported from kit app/shadow-review-data.jsx.
 * Reviewer lenses, illustrative findings, and the VERBATIM deterministic
 * risk aggregation from shadow-review-service.ts.
 */

/* -- Interfaces -- */

export interface ShadowLens {
  id: string;
  label: string;
  agency: string;
  region: string;
  gates: { rtf: string; crl: string };
  blurb: string;
  dims: string[];
}

export interface ShadowFinding {
  dimension: 'rtf' | 'crl' | 'format' | 'nb';
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  detail?: string;
  basis?: string;
  recommendation?: string;
  leafRef?: string;
}

export interface ShadowSequence {
  code: string;
  app: string;
  seq: string;
  type: string;
  region: string;
  leaves: number;
}

export interface ShadowRisk {
  rtf: number;
  crl: number;
}

/* -- VERBATIM aggregateRisk (deterministic, pure) -- */

const SEVERITY_WEIGHT: Record<string, number> = { critical: 1, major: 0.6, minor: 0.25, info: 0 };

export function shadowAggregateRisk(findings: ShadowFinding[]): ShadowRisk {
  function score(dims: string[]): number {
    const relevant = (findings || []).filter((f) => dims.indexOf(f.dimension) >= 0);
    if (relevant.length === 0) return 0;
    if (relevant.some((f) => f.severity === 'critical')) return 1;
    const sum = relevant.reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] || 0), 0);
    return Math.min(1, Number((sum / (relevant.length + 1) + 0.15 * Math.min(relevant.length, 3)).toFixed(3)));
  }
  return { rtf: score(['rtf', 'format']), crl: score(['crl', 'nb']) };
}

/* -- Severity and dimension maps -- */

export interface SeverityMeta {
  label: string;
  tone: string;
  rank: number;
}

export const SR_SEV: Record<string, SeverityMeta> = {
  critical: { label: 'Critical', tone: 'error', rank: 0 },
  major: { label: 'Major', tone: 'error', rank: 1 },
  minor: { label: 'Minor', tone: 'warning', rank: 2 },
  info: { label: 'Info', tone: 'idle', rank: 3 },
};

export const SR_DIM: Record<string, string> = {
  rtf: 'RTF gate',
  crl: 'CRL gate',
  format: 'Format',
  nb: 'Non-conformity',
};

/* -- Reviewer lenses -- */

export const SHADOW_LENSES: ShadowLens[] = [
  {
    id: 'fda_filing', label: 'FDA filing reviewer', agency: 'FDA', region: 'fda',
    gates: { rtf: 'Refuse-to-File (RTF)', crl: 'Complete Response Letter (CRL)' },
    blurb: 'Simulates the FDA regulatory project manager and review division at the 60-day filing gate and end-of-cycle.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'ema_d120', label: 'EMA D120 assessor', agency: 'EMA', region: 'eu',
    gates: { rtf: 'Validation (Day 0)', crl: 'Day-120 List of Questions' },
    blurb: 'Simulates the EMA (Co-)Rapporteur assessment team producing the Day-120 List of Questions.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'pmda', label: 'PMDA reviewer', agency: 'PMDA', region: 'jp',
    gates: { rtf: 'Compliance acceptance', crl: 'Interview-form review points' },
    blurb: 'Simulates the PMDA review team and the eCTD-JP compliance check.',
    dims: ['rtf', 'crl', 'format'],
  },
  {
    id: 'nb_mdr', label: 'MDR Notified Body', agency: 'NB (MDR)', region: 'eu',
    gates: { rtf: 'Completeness check', crl: 'Non-conformity (deficiency)' },
    blurb: 'Simulates a Notified Body technical-documentation assessor under EU MDR 2017/745.',
    dims: ['nb', 'format'],
  },
  {
    id: 'nb_ivdr', label: 'IVDR Notified Body', agency: 'NB (IVDR)', region: 'eu',
    gates: { rtf: 'Completeness check', crl: 'Non-conformity (deficiency)' },
    blurb: 'Simulates a Notified Body technical-documentation assessor under EU IVDR 2017/746.',
    dims: ['nb', 'format'],
  },
];

export function shadowLens(id: string): ShadowLens {
  return SHADOW_LENSES.find((l) => l.id === id) || SHADOW_LENSES[0];
}

/* -- Sample sequence -- */


/* -- Sample findings per lens -- */

