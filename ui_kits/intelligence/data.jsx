(() => {
/**
 * Intelligence kit — data fixtures for Protocol / CMC / Biostat / Reports.
 * Lands in v2 at client/src/concept2cure/intelligence/data/*.ts as TS.
 * Shape contracts are stable; do not drift without designer review.
 */

const INT_NAV = [
  { id: 'protocol',  label: 'Protocol and Study Design', icon: 'microscope', group: 'intelligence', desc: 'Study design templates, endpoint libraries, active protocols and amendments.' },
  { id: 'cmc',       label: 'CMC Module',                icon: 'beaker',     group: 'intelligence', desc: 'Chemistry, manufacturing, controls — drug substance, drug product, stability, specs.' },
  { id: 'biostat',   label: 'Biostatistics',             icon: 'sigma',      group: 'intelligence', desc: 'Statistical analysis plans, sample-size calculations, TLF packages, interim analyses.' },
  { id: 'reporting', label: 'Reports',                   icon: 'barChart3',  group: 'intelligence', desc: 'Readiness dashboards, timeline forecasts, precedent likelihood models.' },
];

/* ─── Protocol fixtures ───────────────────────────────────────── */
const PROTOCOLS = [
  { id: 'BX204-301', program: 'BX-204', indication: 'RTK-X+ solid tumors',         phase: 'Ph 3 confirmatory', sites: 84, enrolled: '120 / 480', status: 'active',   lead: 'Brooke Kim',  pi: 'Dr. R. Pillai',     amendments: 2, updated: '2 hours ago' },
  { id: 'BX204-201', program: 'BX-204', indication: 'RTK-X+ solid tumors',         phase: 'Ph 2 pivotal',      sites: 24, enrolled: '184 / 184', status: 'complete', lead: 'Brooke Kim',  pi: 'Dr. R. Pillai',     amendments: 4, updated: '4 days ago' },
  { id: 'BX301-101', program: 'BX-301', indication: 'Relapsed multiple myeloma',    phase: 'Ph 1 dose-esc',    sites: 12, enrolled: '38 / 60',  status: 'active',   lead: 'Theo Park',   pi: 'Dr. M. Acharya',    amendments: 1, updated: '5 hours ago' },
  { id: 'BX402-101', program: 'BX-402', indication: 'Pediatric ALL relapse',        phase: 'Ph 1 dose-esc',    sites: 8,  enrolled: '14 / 30',  status: 'active',   lead: 'Brooke Kim',  pi: 'Dr. L. Hernandez',  amendments: 0, updated: '1 day ago' },
  { id: 'BX513-201', program: 'BX-513', indication: 'IPF',                          phase: 'Ph 2 adaptive',    sites: 32, enrolled: '187 / 240',status: 'active',   lead: 'Ravi Nair',   pi: 'Dr. K. Yamamoto',   amendments: 3, updated: '6 hours ago' },
  { id: 'BX290-101', program: 'BX-290', indication: 'SMA gene therapy',             phase: 'Ph 1 single-dose', sites: 4,  enrolled: '6 / 12',   status: 'blocked',  lead: 'Theo Park',   pi: 'Dr. S. Liu',        amendments: 0, updated: 'overdue' },
];
const ENDPOINTS = [
  { kind: 'Oncology · ORR',     guidance: 'RECIST v1.1',        precedent: 12, hint: 'Confirmed objective response rate, blinded central read' },
  { kind: 'Oncology · PFS',     guidance: 'RECIST v1.1',        precedent: 18, hint: 'Progression-free survival, central review' },
  { kind: 'Oncology · OS',      guidance: 'ICH E9 (R1)',        precedent: 22, hint: 'Overall survival, time-to-event' },
  { kind: 'IPF · FVC',          guidance: 'ATS / ERS 2011',     precedent: 9,  hint: 'Forced vital capacity, change from baseline at 52 weeks' },
  { kind: 'SMA · CHOP-INTEND',  guidance: 'FDA 2024 gene tx',   precedent: 4,  hint: 'Children\u2019s Hospital of Philadelphia Infant Test for Neuromuscular Disorders' },
  { kind: 'MM · MRD-negativity',guidance: 'IMS 2025',           precedent: 7,  hint: 'Minimal residual disease, next-generation sequencing 10\u207b\u2075' },
  { kind: 'ALL · MRD-EFS',      guidance: 'COG AALL2031',       precedent: 6,  hint: 'MRD-stratified event-free survival, pediatric' },
];
const AMENDMENTS = [
  { id: 'BX204-301 v3.2', kind: 'Substantial', status: 'IRB pending',  what: 'Added pre-specified subgroup analysis — RTK-X IHC 2+ vs 3+', updated: '1 day ago' },
  { id: 'BX513-201 v2.4', kind: 'Substantial', status: 'IRB approved', what: 'Adaptive dose-finding stage 2: shifted enrichment threshold',  updated: '3 days ago' },
  { id: 'BX204-301 v3.1', kind: 'Non-sub',     status: 'Filed',        what: 'PK sub-study addition, exploratory only',                       updated: '1 week ago' },
];

/* ─── CMC fixtures ────────────────────────────────────────────── */
const CMC_PACKAGES = [
  { program: 'BX-204', kind: 'mAb',           ds_site: 'Raleigh, NC',     dp_site: 'Greenville, SC', shelf: '24 mo · 2-8\u00b0C', batches: 14, stability_pct: 92, status: 'active',  open: 1, blocker: 'Comparability for new viral filtration step', updated: '1 hour ago' },
  { program: 'BX-301', kind: 'Biologic IgG4', ds_site: 'Raleigh, NC',     dp_site: 'Hayward, CA',    shelf: '18 mo · 2-8\u00b0C', batches: 9,  stability_pct: 78, status: 'active',  open: 3, blocker: 'New DS supplier comparability gap',             updated: '4 hours ago' },
  { program: 'BX-402', kind: 'ADC',           ds_site: 'Raleigh, NC',     dp_site: 'Greenville, SC', shelf: '12 mo · 2-8\u00b0C', batches: 4,  stability_pct: 64, status: 'active',  open: 2, blocker: 'Payload free-drug spec under negotiation',       updated: '1 day ago' },
  { program: 'BX-513', kind: 'Small molecule',ds_site: 'Visp, CH',        dp_site: 'Indianapolis, IN', shelf: '36 mo · 25\u00b0C / 60% RH', batches: 6, stability_pct: 88, status: 'active',  open: 0, blocker: null,                                                  updated: '2 days ago' },
  { program: 'BX-620', kind: 'Small molecule',ds_site: 'Visp, CH',        dp_site: 'Indianapolis, IN', shelf: '60 mo · 25\u00b0C / 60% RH', batches: 22, stability_pct: 100,status: 'commercial', open: 0, blocker: null,                                                  updated: '6 days ago' },
  { program: 'BX-870', kind: 'Small molecule',ds_site: 'Yokohama, JP',    dp_site: 'Yokohama, JP',    shelf: '48 mo · 25\u00b0C / 60% RH', batches: 18, stability_pct: 100,status: 'commercial', open: 0, blocker: null,                                                  updated: '2 weeks ago' },
];
const STABILITY = [
  { program: 'BX-204', kind: 'Drug product · 5 mg/mL', timepoint: '36 mo (proposed)', completed: '24 / 36 mo', pct: 67 },
  { program: 'BX-204', kind: 'Drug substance · bulk',  timepoint: '24 mo',            completed: '18 / 24 mo', pct: 75 },
  { program: 'BX-301', kind: 'Drug product · 10 mg/mL',timepoint: '24 mo (proposed)', completed: '12 / 24 mo', pct: 50 },
  { program: 'BX-402', kind: 'Drug substance · ADC',   timepoint: '18 mo',            completed: '6 / 18 mo',  pct: 33 },
];

/* ─── Biostat fixtures ────────────────────────────────────────── */
const SAPS = [
  { id: 'SAP-BX204-301-v2.1', program: 'BX-204', study: 'BX204-301',  primary: 'PFS (RECIST v1.1)', alpha: '0.025 1-sided', power: '90%', size: '480 (240/240)', status: 'review',  owner: 'Brooke Kim', updated: '2 hours ago' },
  { id: 'SAP-BX204-201-v3.0', program: 'BX-204', study: 'BX204-201',  primary: 'ORR (RECIST v1.1)', alpha: '0.025 1-sided', power: '85%', size: '184 single-arm',status: 'approved',owner: 'Brooke Kim', updated: 'locked' },
  { id: 'SAP-BX513-201-v2.4', program: 'BX-513', study: 'BX513-201',  primary: 'FVC change @ 52w',  alpha: '0.05 2-sided',  power: '80%', size: '240 (1:1:1)',   status: 'drafted', owner: 'Ravi Nair',   updated: '1 day ago' },
  { id: 'SAP-BX301-101-v1.0', program: 'BX-301', study: 'BX301-101',  primary: 'MTD via mTPI',      alpha: 'n/a',           power: 'n/a',  size: '60 (dose-esc)', status: 'drafted', owner: 'Theo Park',   updated: '4 days ago' },
];
const SAMPLE_SIZE = { /* simple closed-form for the calculator card */
  alpha: 0.025, power: 0.9, delta: 0.15, sd: 0.45, expected: 480,
};
const TLF_QUEUE = [
  { id: 'TLF-204-IA1', program: 'BX-204',  what: 'Interim analysis 1 — BX204-301 pre-planned futility', dueIn: '38 days',  pct: 22, status: 'building' },
  { id: 'TLF-301-IA1', program: 'BX-301',  what: 'Interim analysis — safety run-in BX301-101',          dueIn: '54 days',  pct: 8,  status: 'queued' },
  { id: 'TLF-513-IA2', program: 'BX-513',  what: 'IA2 — biomarker substudy BX513-201',                   dueIn: '20 days',  pct: 47, status: 'building' },
];
const INTERIMS = [
  { study: 'BX204-301', kind: 'Futility', dsmb: 'Pre-planned @ 25% events', date: '2026-08-10' },
  { study: 'BX204-301', kind: 'Efficacy', dsmb: 'Pre-planned @ 50% events', date: '2027-01-22' },
  { study: 'BX513-201', kind: 'Safety run-in', dsmb: 'After 60 enrolled',   date: '2026-06-14' },
];

/* ─── Reports fixtures ────────────────────────────────────────── */
const REPORT_KPIS = {
  programs: 14,
  ready_avg: 76,
  forecast_conf: 0.84,
  precedent_hits: 1284,
};
const REPORT_BARS = [
  /* Phase 5 ports — re-aggregated for biopharma scope */
  { label: 'BX-204 NDA',  pct: 87, tone: 'ok'   },
  { label: 'BX-204 MAA',  pct: 71, tone: 'warn' },
  { label: 'BX-204 JNDA', pct: 54, tone: 'warn' },
  { label: 'BX-301 BLA',  pct: 64, tone: 'warn' },
  { label: 'BX-620 NDA',  pct: 92, tone: 'ok'   },
  { label: 'BX-620 MAA',  pct: 98, tone: 'ok'   },
  { label: 'BX-402 IND',  pct: 49, tone: 'warn' },
  { label: 'BX-513 IND',  pct: 58, tone: 'warn' },
  { label: 'BX-118 BLA',  pct: 100,tone: 'ok'   },
  { label: 'BX-290 IND',  pct: 38, tone: 'err'  },
];
const FORECAST = [
  { program: 'BX-204 NDA',  milestone: 'PDUFA goal',         target: '2026-10-09', forecast: '2026-10-22', delta: '+13d',  conf: 0.78 },
  { program: 'BX-204 MAA',  milestone: 'CHMP opinion',       target: '2027-02-14', forecast: '2027-03-04', delta: '+18d',  conf: 0.66 },
  { program: 'BX-301 BLA',  milestone: 'BLA filing',         target: '2026-09-30', forecast: '2026-11-05', delta: '+36d',  conf: 0.71 },
  { program: 'BX-402 IND',  milestone: 'Ph 2 start',         target: '2026-11-01', forecast: '2026-12-15', delta: '+44d',  conf: 0.60 },
  { program: 'BX-513 IND',  milestone: 'EoP2 meeting',       target: '2026-07-22', forecast: '2026-07-19', delta: '\u22123d', conf: 0.84 },
];
const PRECEDENT_MODELS = [
  { name: 'Approval-likelihood · accelerated approval', programs: 'BX-204 NDA, BX-301 BLA',  output: '0.81 · high',  basis: '142 oncology accelerated approvals 2014\u20132025' },
  { name: 'CRL-risk · CMC comparability',              programs: 'BX-301 BLA',               output: '0.34 · medium', basis: '1,206 BLA CRLs 2010\u20132025 with CMC findings' },
  { name: 'Day-150 LoQ projection · CHMP',             programs: 'BX-204 MAA',               output: '12 \u00b1 4',    basis: '486 CHMP procedures 2018\u20132025 (oncology)' },
];

const INT_SUGGESTIONS = {
  protocol:  ['Find precedent endpoints for BX-204 Ph3', 'Draft a Ph3 protocol amendment cover letter', 'Compare ORR vs PFS as primary'],
  cmc:       ['Comparability gap for BX-301 new DS supplier', 'Run stability projection at 36 mo for BX-204', 'Match my specs against the FDA Q6B guidance'],
  biostat:   ['Recompute sample size for BX204-301 at 85% power', 'Build the IA1 futility TLF set', 'Draft the SAP analytical method section'],
  reporting: ['Why is BX-301 BLA forecast slipping?', 'Surface every program below 60% readiness', 'Compare BX-204 to the closest two precedent NDAs'],
};

window.INT_NAV          = INT_NAV;
window.INT_SUGGESTIONS  = INT_SUGGESTIONS;
window.PROTOCOLS        = PROTOCOLS;
window.ENDPOINTS        = ENDPOINTS;
window.AMENDMENTS       = AMENDMENTS;
window.CMC_PACKAGES     = CMC_PACKAGES;
window.STABILITY        = STABILITY;
window.SAPS             = SAPS;
window.SAMPLE_SIZE      = SAMPLE_SIZE;
window.TLF_QUEUE        = TLF_QUEUE;
window.INTERIMS         = INTERIMS;
window.REPORT_KPIS      = REPORT_KPIS;
window.REPORT_BARS      = REPORT_BARS;
window.FORECAST         = FORECAST;
window.PRECEDENT_MODELS = PRECEDENT_MODELS;

})();
