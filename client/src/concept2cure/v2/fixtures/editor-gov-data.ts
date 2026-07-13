/* ------------------------------------------------------------------ *
 *  editor-gov-data.ts
 *  Canonical fact-drift and multi-market dossier matrix fixture data
 *  for the editor governance surface. In production these come from
 *  /api/fact-drift?programId=... and /api/dossier-matrix?programId=...
 * ------------------------------------------------------------------ */

/* -- Fact drift types ---------------------------------------------- */

export type FactValueType = 'measure' | 'categorical' | 'count';
export type FactStatus = 'active' | 'retired';
export type BindingKind = 'mirror' | 'derived';
export type BindingStatus = 'bound' | 'drifted' | 'broken';
export type DriftType = 'value_mismatch';
export type DriftSeverity = 'high' | 'medium' | 'low';
export type DriftStatus = 'open' | 'resolved';
export type TargetKind = 'section' | 'document';

export interface FactBinding {
  readonly target: string;
  readonly targetKind: TargetKind;
  readonly bindingKind: BindingKind;
  readonly bindingStatus: BindingStatus;
  readonly observedValue: string;
}

export interface FactDriftEntry {
  readonly driftType: DriftType;
  readonly severity: DriftSeverity;
  readonly expectedValue: string;
  readonly observedValue: string;
  readonly status: DriftStatus;
  readonly detectedAt: string;
  readonly detail: string;
}

export interface CanonicalFact {
  readonly id: string;
  readonly entity: string;
  readonly field: string;
  readonly label: string;
  readonly valueText: string;
  readonly unit: string | null;
  readonly valueType: FactValueType;
  readonly confidence: number;
  readonly status: FactStatus;
  readonly establishedBy: string;
  readonly bindings: readonly FactBinding[];
  readonly drift: readonly FactDriftEntry[];
}

export interface FactDriftData {
  readonly programId: string;
  readonly product: string;
  readonly facts: readonly CanonicalFact[];
}

/* -- Markets matrix types ------------------------------------------ */

export type GapSeverity = 'err' | 'warn';

export interface MarketTarget {
  readonly id: string;
  readonly agency: string;
  readonly region: string;
  readonly instrument: string;
  readonly flag: string;
}

export interface DossierModule {
  readonly id: string;
  readonly label: string;
  readonly common: boolean;
  readonly markets: Readonly<Record<string, number>>;
}

export interface MarketGap {
  readonly sev: GapSeverity;
  readonly doc: string;
  readonly note: string;
  readonly module: string;
}

export interface MarketsMatrixData {
  readonly program: string;
  readonly targets: readonly MarketTarget[];
  readonly modules: readonly DossierModule[];
  readonly gaps: Readonly<Record<string, readonly MarketGap[]>>;
}

/* -- Canonical Fact Drift data (BX-204 BLA program) ---------------- */

export const RCE_FACT_DRIFT: FactDriftData = {
  programId: 'prog-bx204-bla',
  product: 'BX-204 · BLA filing',
  facts: [
    { id: 'f1', entity: 'BX-204', field: 'primary_endpoint_orr', label: 'Primary endpoint ORR', valueText: '68.3%', unit: '%', valueType: 'measure', confidence: 0.96, status: 'active',
      establishedBy: 'BX204-201 CSR §7.1 (data-lock 2026-03-01)',
      bindings: [
        { target: '§2.7.3 Summary of Clinical Efficacy', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'drifted', observedValue: '71.2%' },
        { target: '§2.5 Clinical Overview', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: '68.3%' },
        { target: '§5.3.5.1 BX204-201 CSR', targetKind: 'document', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: '68.3%' },
      ],
      drift: [
        { driftType: 'value_mismatch', severity: 'high', expectedValue: '68.3%', observedValue: '71.2%', status: 'open', detectedAt: '2026-06-18',
          detail: '§2.7.3 states "71.2%" — likely interim lock vs final data-lock discrepancy. Reconcile before BLA submission.' },
      ],
    },
    { id: 'f2', entity: 'BX-204', field: 'manufacturing_site', label: 'Manufacturing site (drug product)', valueText: 'Lonza Basel AG (CH)', unit: null, valueType: 'categorical', confidence: 0.91, status: 'active',
      establishedBy: 'Site transfer approval notice 2026-05-14',
      bindings: [
        { target: '3.2.P.3 Drug Product — Manufacture', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: 'Lonza Basel AG (CH)' },
        { target: '§2.3 Quality Overall Summary', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'broken', observedValue: 'ITO Manufacturing KK (JP)' },
      ],
      drift: [
        { driftType: 'value_mismatch', severity: 'high', expectedValue: 'Lonza Basel AG (CH)', observedValue: 'ITO Manufacturing KK (JP)', status: 'open', detectedAt: '2026-06-22',
          detail: 'QOS §2.3 still reflects the prior manufacturing site (ITO). Site transfer canonical fact updated 2026-05-14 but section was not recompiled.' },
      ],
    },
    { id: 'f3', entity: 'BX-204', field: 'safety_population_n', label: 'Safety population N', valueText: '342', unit: 'patients', valueType: 'count', confidence: 0.99, status: 'active',
      establishedBy: 'Integrated safety dataset v4 (2026-04-22)',
      bindings: [
        { target: '§2.7.4 Summary of Clinical Safety', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'drifted', observedValue: '338' },
        { target: '§5.3.5.1 BX204-201 CSR', targetKind: 'document', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: '342' },
      ],
      drift: [
        { driftType: 'value_mismatch', severity: 'medium', expectedValue: '342', observedValue: '338', status: 'open', detectedAt: '2026-06-20',
          detail: '§2.7.4 safety summary uses N=338 from an earlier dataset version. Integrated dataset v4 finalized N=342. Four additional patients were included post-SAP amendment.' },
      ],
    },
    { id: 'f4', entity: 'BX-204', field: 'median_pfs', label: 'Median PFS (ITT)', valueText: '8.4 months', unit: 'months', valueType: 'measure', confidence: 0.88, status: 'active',
      establishedBy: 'BX204-201 CSR §7.3 (KM analysis)',
      bindings: [
        { target: '§2.7.3 Summary of Clinical Efficacy', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: '8.4 months' },
        { target: '§2.5 Clinical Overview', targetKind: 'section', bindingKind: 'mirror', bindingStatus: 'bound', observedValue: '8.4 months' },
      ],
      drift: [],
    },
    { id: 'f5', entity: 'BX-204', field: 'primary_endpoint_ci_lower', label: 'ORR 95% CI lower bound', valueText: '58.9%', unit: '%', valueType: 'measure', confidence: 0.96, status: 'active',
      establishedBy: 'BX204-201 CSR §7.1 — Clopper-Pearson exact CI',
      bindings: [
        { target: '§2.7.3 Summary of Clinical Efficacy', targetKind: 'section', bindingKind: 'derived', bindingStatus: 'bound', observedValue: '58.9%' },
      ],
      drift: [],
    },
  ],
};

/* -- Multi-market dossier matrix (BX-204 global program) ----------- */

export const RCE_MARKETS_MATRIX: MarketsMatrixData = {
  program: 'BX-204 — Global regulatory program',
  targets: [
    { id: 'fda',  agency: 'FDA',           region: 'US', instrument: 'BLA',   flag: 'US' },
    { id: 'ema',  agency: 'EMA',           region: 'EU', instrument: 'MAA',   flag: 'EU' },
    { id: 'pmda', agency: 'PMDA',          region: 'JP', instrument: 'J-NDA', flag: 'JP' },
    { id: 'mhra', agency: 'MHRA',          region: 'UK', instrument: 'NI',    flag: 'UK' },
    { id: 'hc',   agency: 'Health Canada', region: 'CA', instrument: 'NDS',   flag: 'CA' },
  ],
  modules: [
    { id: 'm1', label: 'M1 Administrative',  common: false, markets: { fda: 72, ema: 44, pmda: 18, mhra: 15, hc: 12 } },
    { id: 'm2', label: 'M2 CTD Summaries',   common: true,  markets: { fda: 64, ema: 64, pmda: 31, mhra: 64, hc: 64 } },
    { id: 'm3', label: 'M3 Quality (CMC)',    common: true,  markets: { fda: 78, ema: 78, pmda: 52, mhra: 78, hc: 78 } },
    { id: 'm4', label: 'M4 Non-Clinical',     common: true,  markets: { fda: 91, ema: 91, pmda: 91, mhra: 91, hc: 91 } },
    { id: 'm5', label: 'M5 Clinical Studies', common: true,  markets: { fda: 68, ema: 68, pmda: 41, mhra: 68, hc: 68 } },
  ],
  gaps: {
    fda: [
      { sev: 'err',  doc: '§2.7.4 Summary of Clinical Safety',       note: 'Draft — not submission-ready',   module: 'M2' },
      { sev: 'err',  doc: '3.2.A.1 Facilities & Equipment appendix', note: 'Not started',                     module: 'M3' },
      { sev: 'warn', doc: 'FDA Form 3514 cover sheet',               note: '4 required fields incomplete',    module: 'M1' },
    ],
    ema: [
      { sev: 'err',  doc: 'Risk Management Plan (M1.8)',             note: 'Not started — CHMP requires RMP for all biologics',   module: 'M1' },
      { sev: 'err',  doc: 'SmPC (M1.3.1)',                           note: 'Not started',                                          module: 'M1' },
      { sev: 'err',  doc: 'CHMP pre-submission briefing document',   note: 'Meeting scheduled Jun 2026 — not yet drafted',        module: 'M1' },
      { sev: 'warn', doc: '§2.5 Clinical Overview (CHMP format)',    note: 'FDA draft needs CHMP-specific adaptation',             module: 'M2' },
      { sev: 'warn', doc: 'Investigational Medicinal Product Dossier (M2.8)', note: 'EMA-specific requirement — not started',     module: 'M2' },
    ],
    pmda: [
      { sev: 'err',  doc: '§2.5 Clinical Overview — Japanese',       note: 'Draft exists; certified translation incomplete',       module: 'M2' },
      { sev: 'err',  doc: '§2.7.3 Clinical Efficacy Summary — JP',  note: 'Not started',                                         module: 'M2' },
      { sev: 'err',  doc: 'M1 PMDA administrative forms',            note: 'Not started — requires Japan local agent (D-MAH)',    module: 'M1' },
      { sev: 'err',  doc: '3.2.P Drug Product (PMDA format)',        note: 'Stability sections need JP-specific adaptation',       module: 'M3' },
      { sev: 'warn', doc: 'PMDA consultation briefing',              note: 'Pre-NDA consultation not yet requested',                module: 'M1' },
    ],
    mhra: [
      { sev: 'err',  doc: 'MHRA M1 administrative package',          note: 'Not started — post-Brexit format required',           module: 'M1' },
      { sev: 'err',  doc: 'UK SmPC / PIL',                           note: 'Not started',                                         module: 'M1' },
      { sev: 'warn', doc: 'MHRA pre-submission scientific advice',   note: 'Recommended for novel mechanisms — not submitted',    module: 'M1' },
    ],
    hc: [
      { sev: 'err',  doc: 'Health Canada administrative forms (HC/SC)', note: 'Not started',                                       module: 'M1' },
      { sev: 'err',  doc: 'Bilingual product labeling (EN/FR)',       note: 'Required under Food & Drugs Act — not started',      module: 'M1' },
      { sev: 'warn', doc: 'HC pre-submission meeting request',        note: 'Not yet submitted',                                   module: 'M1' },
    ],
  },
};
