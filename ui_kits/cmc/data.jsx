(() => {
/* CMC · Module 3 — kit data. Mapped to server/api/cmc/* + services/cmc/*.
 * RPI portfolio metrics, §3.2.S/§3.2.P build state, QbD CQA/CPP, control
 * strategy, ICH compliance, stability, change simulator. */

const CMC_RPI = { score: 64, irOverdue: 2, m3Missing: 3, stabilityCov: '12 / 24 mo', trend: '+6' };

/* CTD §3.2 build state — drug substance s.1-s.7, drug product p.1-p.8. */
const CMC_SECTIONS = [
  { key: 's.2.2', label: 'Manufacture · description of process', scope: 'DS', status: 'review',   conv: 88 },
  { key: 's.3.2', label: 'Impurities',                          scope: 'DS', status: 'drafted',  conv: 71 },
  { key: 's.4.1', label: 'Specification',                       scope: 'DS', status: 'review',   conv: 92 },
  { key: 's.4.2', label: 'Analytical procedures',               scope: 'DS', status: 'drafted',  conv: 64 },
  { key: 's.7',   label: 'Stability',                           scope: 'DS', status: 'todo',     conv: 33 },
  { key: 'p.3.3', label: 'Description of manufacturing process', scope: 'DP', status: 'drafted', conv: 70 },
  { key: 'p.5.1', label: 'Specification',                       scope: 'DP', status: 'review',   conv: 85 },
  { key: 'p.8.1', label: 'Stability summary and conclusion',    scope: 'DP', status: 'todo',     conv: 41 },
];

/* QbD — Critical Quality Attributes + Critical Process Parameters. */
const CMC_CQA = [
  { name: 'Aggregation (HMW)', material: 'Drug substance', ich: ['Q6B'],        method: 'SEC-HPLC',      accept: '≤ 2.0%',   linked: true },
  { name: 'Charge variants',   material: 'Drug substance', ich: ['Q6B'],        method: 'iCIEF',          accept: 'Main ≥ 60%', linked: true },
  { name: 'Related substances',material: 'Drug product',   ich: ['Q3B(R2)','Q6A'], method: 'RP-HPLC',     accept: '≤ 0.5% any', linked: true },
  { name: 'Sub-visible particles', material: 'Drug product', ich: ['Q6B'],      method: null,             accept: 'USP <788>',  linked: false },
];
const CMC_CPP = [
  { name: 'Bioreactor pH',     step: 'Cell culture',  range: '6.9–7.1',    ich: ['Q8(R2)'] },
  { name: 'Viral inactivation time', step: 'Low-pH hold', range: '≥ 60 min', ich: ['Q5A'] },
  { name: 'Fill temperature',  step: 'Aseptic fill',  range: null,         ich: ['Q8(R2)'] },
];

/* ICH compliance rollup — Q-series checked at FDA RTF. */
const CMC_ICH = [
  { g: 'Q1A(R2)', status: 'warning' }, { g: 'Q2(R1)', status: 'fail' }, { g: 'Q3A(R2)', status: 'pass' },
  { g: 'Q3B(R2)', status: 'pass' },    { g: 'Q3D(R2)', status: 'warning' }, { g: 'Q6A', status: 'pass' },
  { g: 'Q6B', status: 'pass' },        { g: 'Q8(R2)', status: 'warning' }, { g: 'Q9', status: 'pass' }, { g: 'Q10', status: 'pass' },
];

/* AI oversight insights (deriveInsights shape). */
const CMC_INSIGHTS = [
  { ico: 'warn',  title: 'Shelf-life claim likely fails review', sub: 'Rule P8-003 · insufficient long-term data', tone: 'err',  cmd: 'Lower the BX-301 shelf-life claim or add a Q1E projection + stability commitment' },
  { ico: 'warn',  title: 'Sub-visible particles CQA has no validated method', sub: 'ICH Q2(R1) gap · §3.2.P.5.2', tone: 'warn', cmd: 'Link or develop a validated method for the sub-visible particles CQA (USP <788>)' },
  { ico: 'beaker',title: 'Fill-temperature CPP lacks a documented range', sub: 'DoE needed per ICH Q8(R2)', tone: 'warn', cmd: 'Establish the aseptic fill-temperature operating range by DoE per ICH Q8(R2)' },
];

const CMC_CHANGES = [
  { type: 'API supplier change', product: 'BX-301', supac: 'Level 2', markets: 'FDA · EMA', filing: 'CBE-30 + Type II variation', risk: 'med' },
  { type: 'Process scale-up 2,000→5,000 L', product: 'BX-301', supac: 'Level 3', markets: 'FDA · EMA · PMDA', filing: 'Prior-approval supplement', risk: 'high' },
];

const CMC_SUGGESTIONS = [
  'Generate the drug-substance control strategy from current quality data',
  'Run the ICH compliance check and show every gap',
  'Simulate the API supplier change and tell me the filing path',
  'What is blocking my shelf-life claim?',
];

/* CMC workstream sub-nav — each maps to a server/api/cmc route family. */
const CMC_NAV = [
  { id: 'overview',     label: 'Module 3 overview',  icon: 'beaker' },
  { id: 'specs',        label: 'Specifications',     icon: 'list' },
  { id: 'stability',    label: 'Stability program',  icon: 'thermometer' },
  { id: 'batch',        label: 'Batch records',      icon: 'box' },
  { id: 'change',       label: 'Change simulator',   icon: 'shuffle' },
  { id: 'blueprint',    label: 'Blueprint generator',icon: 'layout' },
  { id: 'global',       label: 'Global compliance',  icon: 'globe' },
  { id: 'copilot',      label: 'CMC copilot',        icon: 'sparkles' },
];

/* Specifications (specificationRoutes.ts) — release + shelf-life, DS + DP. */
const CMC_SPECS = [
  { attr: 'Appearance',          material: 'DS', method: 'Visual',    release: 'Clear, colorless', shelf: 'Clear, colorless', ich: 'Q6B', status: 'approved' },
  { attr: 'Assay (protein)',     material: 'DS', method: 'UV (A280)', release: '95–105% label',    shelf: '90–110% label',    ich: 'Q6B', status: 'approved' },
  { attr: 'Aggregation (HMW)',   material: 'DS', method: 'SEC-HPLC',  release: '≤ 2.0%',           shelf: '≤ 5.0%',           ich: 'Q6B', status: 'review' },
  { attr: 'Charge variants',     material: 'DS', method: 'iCIEF',     release: 'Main ≥ 60%',       shelf: 'Main ≥ 55%',       ich: 'Q6B', status: 'review' },
  { attr: 'Sub-visible particles',material:'DP', method: 'USP <788>', release: 'Meets <788>',      shelf: 'Meets <788>',      ich: 'Q6B', status: 'draft' },
  { attr: 'pH',                  material: 'DP', method: 'Potentiometry', release: '5.8–6.2',      shelf: '5.6–6.4',          ich: 'Q6A', status: 'approved' },
];

/* Stability (stabilityRoutes.ts) — studies, conditions, timepoints. */
const CMC_STABILITY = [
  { study: 'DS-STAB-301', material: 'Drug substance', cond: '-40 °C long-term', completed: '18/24 mo', trend: 'stable', proj: '24 mo', pct: 75 },
  { study: 'DP-STAB-301', material: 'Drug product 10 mg/mL', cond: '2–8 °C long-term', completed: '12/24 mo', trend: 'aggregation rising', proj: '18 mo at risk', pct: 50 },
  { study: 'DP-ACC-301',  material: 'Drug product', cond: '25 °C / 60% RH accel', completed: '6/6 mo', trend: 'within limits', proj: 'supports 18 mo', pct: 100 },
];

/* Batch records (batchRecordRoutes.ts) — with deviations. */
const CMC_BATCHES = [
  { batch: 'BX301-DS-014', stage: 'Drug substance', date: '2026-04-02', yield: '4.2 g/L', dev: 0, status: 'released' },
  { batch: 'BX301-DS-013', stage: 'Drug substance', date: '2026-02-18', yield: '3.9 g/L', dev: 1, status: 'released' },
  { batch: 'BX301-DP-009', stage: 'Drug product',   date: '2026-04-20', yield: '98.1%',  dev: 0, status: 'released' },
  { batch: 'BX301-DP-010', stage: 'Drug product',   date: '2026-05-15', yield: '91.4%',  dev: 2, status: 'investigation' },
];

/* Blueprint generator (blueprintRoutes.ts) — §3.2 sections to auto-compose. */
const CMC_BLUEPRINT = [
  { key: 's.2.2', label: 'Description of manufacturing process', ready: true,  sources: 'Batch records + process data' },
  { key: 's.4.1', label: 'Specification',                        ready: true,  sources: 'Spec table + methods' },
  { key: 's.7.1', label: 'Stability summary',                    ready: false, sources: 'Stability studies (12/24 mo)' },
  { key: 'p.5.1', label: 'Specification (DP)',                   ready: true,  sources: 'DP spec table' },
  { key: 'p.8.1', label: 'Stability summary and conclusion',     ready: false, sources: 'DP stability (at risk)' },
];

/* Global compliance (global-compliance.js) — per-market readiness. */
const CMC_GLOBAL = [
  { market: 'FDA',          base: 'ICH', ready: 71, gap: 'Q2 method validation' },
  { market: 'EMA',          base: 'ICH', ready: 64, gap: 'Regional annex + ASMF' },
  { market: 'PMDA',         base: 'ICH', ready: 48, gap: 'JP-specific release tests' },
  { market: 'Health Canada',base: 'ICH', ready: 70, gap: 'CTD module 3 regional' },
  { market: 'NMPA',         base: 'ICH', ready: 32, gap: 'Local testing + dossier translation' },
];

Object.assign(window, { CMC_RPI, CMC_SECTIONS, CMC_CQA, CMC_CPP, CMC_ICH, CMC_INSIGHTS, CMC_CHANGES, CMC_SUGGESTIONS,
  CMC_NAV, CMC_SPECS, CMC_STABILITY, CMC_BATCHES, CMC_BLUEPRINT, CMC_GLOBAL });
})();
