/** Device submission hub -- seed data for five FDA/EU pathways. */

import {
  pmaPathway, cerPathway, ivdrPathway,
  DV_PCCP, DV_CAPA, DV_INSPECTION,
} from './device-data-ext';

export { DV_PCCP, DV_CAPA, DV_INSPECTION };

export interface Provenance { src: string; conf: string; audit: string; }
export interface DeviceInfo { name: string; code: string; className: string; regNumber: string; panel: string; kind: string; }
export interface DeviceSection { id: string; num: string; title: string; required: boolean; status: string; guidance: string; tab?: string; }
export interface ContentBlock { h: string; p: string; prov: Provenance; }
export interface Finding { sev: string; text: string; }
export interface ValidatorCheck { check: string; result: string; detail: string; }
export interface DeviceForm { id: string; name: string; title: string; status: string; }
export interface RiskRow { id: string; hazard: string; cat: string; l: number; i: number; rl: number; ri: number; status: string; mitigation: string; }
export interface PerformanceTest { test: string; accept: string; result: string; pass: boolean; }
export interface PerformanceGroup { id: string; label: string; tests: PerformanceTest[]; }

export interface PredicateCandidate {
  id: string; name: string; cleared: string; adequacy: number; band: string | null; role: string;
  factors: Array<{ f: string; a: number; m: number }> | null;
  why: string[]; concerns: string[];
}

export interface PredicateData {
  rubric: string;
  candidates: PredicateCandidate[];
  matrix: Array<{ c: string; subj: string; pred: string; se: string }>;
  determination: string;
  determinationNote: string;
  flow: Array<{ step: string; answer: string; basis: string }>;
}

export interface DeviceMarket {
  id: string; flag: string; authority: string; instrument: string; classRule: string;
  format: string; language: string; udi: string; localRep: boolean; mdsap: boolean; readiness: number;
  reqs: Array<{ r: string; have: boolean }>;
  demands: string[];
}

export interface DevicePathway {
  id: string; label: string; full: string; agency: string; region: string; framework: string;
  device: DeviceInfo; readiness: number; updated: string; version: string;
  sections: DeviceSection[]; tabs: string[];
  content: Record<string, ContentBlock[]>;
  predicate: PredicateData | null;
  classification?: Record<string, unknown>;
  risk?: { standard: string; count: number; extreme: number; rows: RiskRow[] };
  performance?: { groups: PerformanceGroup[] };
  assembly: Record<string, unknown>;
  findings: Finding[];
  ana: { section: string; activity: Array<{ type: string; text: string; when: string }>; actions: Array<{ id: string; label: string; icon: string; prompt: string }> };
  forms?: DeviceForm[];
  reviewsim?: Record<string, unknown>;
  humanfactors?: Record<string, unknown>;
  changeAssessment?: Record<string, unknown>;
  cyber?: Record<string, unknown>;
  registration?: Record<string, unknown>;
  dhf?: Record<string, unknown>;
  clinical?: Record<string, unknown>;
  manufacturing?: Record<string, unknown>;
  equivalence?: Record<string, unknown>;
  gspr?: Record<string, unknown>;
  literature?: Record<string, unknown>;
  pms?: Record<string, unknown>;
  cdx?: Record<string, unknown>;
  cerconformance?: Record<string, unknown>;
  gsprfull?: Record<string, unknown>;
  postmarketdocs?: Record<string, unknown>;
  globalmarkets?: Record<string, unknown>;
  traceability17511?: Record<string, unknown>;
}

export interface DeviceHubData {
  order: readonly string[];
  pathways: Record<string, DevicePathway>;
  markets: DeviceMarket[];
  mdsap: { authority: string; note: string };
}

const pathway510k: DevicePathway = {
  id: '510k', label: '510(k)', full: 'Premarket Notification 510(k)', agency: 'FDA · CDRH', region: 'United States',
  framework: '21 CFR 807 Subpart E · Substantial Equivalence (21 CFR 807.3)',
  device: { name: 'Aurora CGM System', code: 'QBJ', className: 'Class II', regNumber: '21 CFR 862.1355', panel: 'Clinical Chemistry', kind: 'Continuous glucose monitor (iCGM)' },
  readiness: 71, updated: '3m ago', version: '0.7',
  reviewsim: { verdict: 'additional_information_likely', riskTier: 'standard', readiness: 74, cycles: 2,
    findings: [
      { sev: 'major', area: 'Substantial equivalence', text: 'Intended-use alignment with predicate K221847 not fully established (drift risk from the predictive alarm).', fix: 'Demonstrate same intended use as the predicate, or address the new question of safety/effectiveness with data.' },
      { sev: 'deficiency', area: 'Cybersecurity', text: 'Premarket cyber package (threat model / SBOM) incomplete.', fix: 'Provide the SPDF cybersecurity package (threat model, SBOM, vulnerability-management plan).' },
      { sev: 'deficiency', area: 'Analytical — stability', text: 'Real-time stability supporting the 15-day wear claim still maturing.', fix: 'Provide real-time stability for the marketed claim (accelerated is supportive only).' }],
    strengths: ['Precision/reproducibility (EP05) established', 'Detection capability (LoB/LoD/LoQ, EP17) established', 'Interference/cross-reactivity (EP07) addressed'] },
  humanfactors: { framework: 'IEC 62366-1', completeness: 70,
    elements: [
      { k: 'Use specification', have: true }, { k: 'User profiles', have: true }, { k: 'Use environments', have: true },
      { k: 'UI characteristics', have: true }, { k: 'Known use problems', have: true }, { k: 'Hazard-related use scenarios', have: true },
      { k: 'Critical tasks', have: true }, { k: 'Formative evaluation', have: false }, { k: 'Summative evaluation', have: false }, { k: 'HFE/UE report', have: false }],
    critical: [
      { task: 'Responding to a low-glucose alert', error: 'User dismisses alert without corrective action', sev: 'critical', mitigated: true },
      { task: 'Sensor insertion', error: 'Incorrect placement degrades accuracy', sev: 'serious', mitigated: true },
      { task: 'Manual calibration entry (legacy mode)', error: 'Mistyped blood-glucose value', sev: 'serious', mitigated: false }],
    residualAcceptable: false },
  sections: [
    { id: 'k1', num: '1', title: 'Cover Letter', required: true, status: 'complete', guidance: '21 CFR 807.87' },
    { id: 'k2', num: '2', title: 'Indications for Use', required: true, status: 'complete', guidance: '21 CFR 807.87(e) · Form FDA 3881' },
    { id: 'k3', num: '3', title: '510(k) Summary', required: true, status: 'draft', guidance: '21 CFR 807.92' },
    { id: 'k4', num: '4', title: 'Device Description', required: true, status: 'complete', guidance: '21 CFR 807.87(d)' },
    { id: 'k5', num: '5', title: 'Substantial Equivalence Comparison', required: true, status: 'draft', guidance: '21 CFR 807.87(f)', tab: 'predicate' },
    { id: 'k6', num: '6', title: 'Performance Testing — Bench', required: true, status: 'draft', guidance: 'FDA Premarket Content', tab: 'performance' },
    { id: 'k7', num: '7', title: 'Biocompatibility', required: true, status: 'not_started', guidance: 'ISO 10993-1', tab: 'performance' },
    { id: 'k8', num: '8', title: 'Software Documentation', required: false, status: 'draft', guidance: 'IEC 62304 · FDA Software Guidance', tab: 'performance' },
    { id: 'k9', num: '9', title: 'Labeling', required: true, status: 'draft', guidance: '21 CFR 801' },
    { id: 'k10', num: '10', title: 'Sterilization & Shelf Life', required: false, status: 'not_started', guidance: 'FDA Shelf Life Guidance' },
  ],
  tabs: ['document', 'predicate', 'classification', 'risk', 'performance', 'forms', 'assembly'],
  content: {
    k3: [
      { h: '3.1  Device description summary', p: 'The Aurora CGM System is a factory-calibrated continuous glucose monitoring system intended for persons aged 18 and older with diabetes mellitus. The system comprises a single-use sensor/transmitter and a display application, reporting interstitial glucose every five minutes for up to 15 days of wear.', prov: { src: 'Device master record · DMR v4', conf: 'High', audit: 'AUD-5501' } },
      { h: '3.2  Predicate & substantial equivalence', p: 'Substantial equivalence is claimed to predicate K221847 (Dexsense G6). The subject and predicate share the same intended use, fundamental technology and sensing principle; differences in wear duration and calibration are supported by the performance testing in §6 and raise no new questions of safety or effectiveness.', prov: { src: 'SE worksheet · §5', conf: 'Medium', audit: 'AUD-5503' } },
    ],
    k5: [
      { h: '5.1  Predicate device identification', p: 'Primary predicate: K221847 (Dexsense G6 Continuous Glucose Monitoring System), cleared 14 March 2023. Reference device DEN200051 is cited for the iCGM special-controls performance criteria.', prov: { src: 'Predicate K221847', conf: 'High', audit: 'AUD-5512' } },
      { h: '5.2  Substantial-equivalence comparison', p: 'The comparison below maps each technological characteristic of the subject device against the predicate. Differences are adjudicated against the §6 performance data and the iCGM special controls. No difference raises a new question of safety or effectiveness.', prov: { src: 'SE matrix', conf: 'Medium', audit: 'AUD-5513' } },
    ],
    k4: [
      { h: '4.1  Physical description & principles of operation', p: 'The sensor uses a glucose-oxidase electrochemical transducer with a factory calibration code. The transmitter conditions and transmits the signal over BLE to the display application, which renders trend, rate-of-change and threshold alerts.', prov: { src: 'DMR v4 · Engineering', conf: 'High', audit: 'AUD-5520' } },
    ],
  },
  predicate: {
    rubric: 'Weighted rubric (sum=100): product code 30 · intended use 25 · technology 20 · panel 8 · recency 7 · decision 6 · adverse 4. Bands: ≥75 adequate · ≥50 marginal.',
    candidates: [
      { id: 'K221847', name: 'Dexsense G6 CGM System', cleared: '2023-03-14', adequacy: 90, band: 'adequate', role: 'Primary predicate',
        factors: [{ f: 'Product code (QBJ)', a: 30, m: 30 }, { f: 'Intended use', a: 25, m: 25 }, { f: 'Technological characteristics', a: 10, m: 20 }, { f: 'Review panel', a: 8, m: 8 }, { f: 'Clearance recency (~3y)', a: 7, m: 7 }, { f: 'Decision type (SE)', a: 6, m: 6 }, { f: 'Adverse status (none)', a: 4, m: 4 }],
        why: ['Same intended use (CGM ≥18y)', 'Same factory-calibration principle', 'iCGM special controls met'],
        concerns: ['Technology only partially aligned — 15-day wear & predictive alarm need a performance bridge (§6).'] },
      { id: 'K203117', name: 'GlucoTrend 4 CGM', cleared: '2021-11-02', adequacy: 60, band: 'marginal', role: 'Alternate',
        factors: [{ f: 'Product code', a: 0, m: 30 }, { f: 'Intended use', a: 25, m: 25 }, { f: 'Technological characteristics', a: 10, m: 20 }, { f: 'Review panel', a: 8, m: 8 }, { f: 'Clearance recency (~5y)', a: 7, m: 7 }, { f: 'Decision type (SE)', a: 6, m: 6 }, { f: 'Adverse status (none)', a: 4, m: 4 }],
        why: ['Same intended use', 'Transcutaneous sensor'],
        concerns: ['Different product code weakens the SE basis', 'Older calibration algorithm — weaker technology match'] },
      { id: 'DEN200051', name: 'iCGM special-controls (reference)', cleared: '2020-06-15', adequacy: 0, band: null, role: 'Reference device',
        factors: null, why: ['Cited for iCGM special-controls performance criteria only'], concerns: [] },
    ],
    matrix: [
      { c: 'Intended use', subj: 'CGM, persons ≥ 18 y', pred: 'CGM, persons ≥ 18 y', se: 'Same' },
      { c: 'Fundamental technology', subj: 'Electrochemical glucose-oxidase', pred: 'Electrochemical glucose-oxidase', se: 'Same' },
      { c: 'Sensor wear', subj: '15 days', pred: '10 days', se: 'Different' },
      { c: 'Calibration', subj: 'Factory', pred: 'Factory', se: 'Same' },
      { c: 'MARD (overall)', subj: '8.2%', pred: '9.0%', se: 'Equivalent' },
      { c: 'Alarms', subj: 'Threshold + predictive', pred: 'Threshold', se: 'Different' },
    ],
    determination: 'SE',
    determinationNote: 'Same intended use and same fundamental scientific technology; the differences (wear duration, predictive alarm) are supported by §6 performance and the iCGM special controls — no new questions of safety or effectiveness.',
    flow: [
      { step: 'Same intended use as predicate?', answer: 'Yes', basis: '21 CFR 807.3(i)' },
      { step: 'Same technological characteristics?', answer: 'No — different wear duration & alarm', basis: '21 CFR 807.3(j)' },
      { step: 'Different characteristics raise new questions of safety/effectiveness?', answer: 'No', basis: '21 CFR 807.100(b)' },
      { step: 'Performance data demonstrate substantial equivalence?', answer: 'Yes — §6 bench + clinical MARD', basis: 'iCGM special controls' },
    ],
  },
  classification: { regulation: '21 CFR 862.1355', productCode: 'QBJ', className: 'Class II', panel: 'Clinical Chemistry', reviewPanel: 'CDRH / OHT3', deviceType: 'Integrated continuous glucose monitoring system',
    specialControls: ['iCGM special controls (DEN200051)', 'Clinical accuracy (MARD) acceptance', 'Cybersecurity per FDA premarket guidance', 'Human factors / use-related risk'],
    rationale: 'Reclassified to Class II via the De Novo (DEN200051) establishing the iCGM generic type and its special controls; subject device meets those controls.' },
  risk: { standard: 'ISO 14971:2019', count: 14, extreme: 1, rows: [
    { id: 'r1', hazard: 'Falsely low reading suppresses corrective action', cat: 'Clinical', l: 3, i: 5, rl: 2, ri: 4, status: 'mitigating', mitigation: 'Predictive low alert + MARD ≤10% acceptance; redundant threshold alarm.' },
    { id: 'r2', hazard: 'BLE link loss → missed alerts', cat: 'Software', l: 3, i: 4, rl: 2, ri: 3, status: 'open', mitigation: 'Store-and-forward buffer; loss-of-signal alarm within 20 min (IEC 62304 hazard trace).' },
    { id: 'r3', hazard: 'Sensor adhesive reaction', cat: 'Biocompat', l: 2, i: 2, rl: 1, ri: 2, status: 'mitigating', mitigation: 'ISO 10993-10 irritation/sensitization passed; labeling warning.' },
    { id: 'r4', hazard: 'Cybersecurity — unauthorized command', cat: 'Security', l: 2, i: 4, rl: 1, ri: 3, status: 'open', mitigation: 'Signed firmware, BLE pairing auth; threat model per FDA premarket cyber guidance.' },
  ] },
  performance: { groups: [
    { id: 'bench', label: 'Bench performance (§6)', tests: [
      { test: 'Accuracy — MARD overall', accept: '≤ 10%', result: '8.2%', pass: true },
      { test: 'Accuracy — hypoglycemia (<70 mg/dL)', accept: '≥ 90% within ±15 mg/dL', result: '92.4%', pass: true },
      { test: 'Sensor service life', accept: '15 days', result: '15 days (n=120)', pass: true },
    ] },
    { id: 'biocompat', label: 'Biocompatibility (ISO 10993)', tests: [
      { test: 'Cytotoxicity (10993-5)', accept: 'Non-cytotoxic', result: 'Pass', pass: true },
      { test: 'Sensitization (10993-10)', accept: 'Non-sensitizer', result: 'Pass', pass: true },
      { test: 'Irritation (10993-23)', accept: 'Negligible', result: 'Pass', pass: true },
    ] },
    { id: 'sw', label: 'Software & cybersecurity (IEC 62304)', tests: [
      { test: 'Level of concern', accept: 'Documented', result: 'Moderate', pass: true },
      { test: 'V&V coverage', accept: '100% req traced', result: '100%', pass: true },
      { test: 'Cybersecurity SBOM + threat model', accept: 'Provided', result: 'Draft — pending', pass: false },
    ] },
    { id: 'emc', label: 'Electrical safety / EMC (IEC 60601)', tests: [
      { test: 'IEC 60601-1 electrical safety', accept: 'Pass', result: 'Pass', pass: true },
      { test: 'IEC 60601-1-2 EMC', accept: 'Pass', result: 'Pass', pass: true },
    ] },
  ] },
  forms: [
    { id: '3514', name: 'Form FDA 3514', title: 'CDRH Premarket Review Submission Cover Sheet', status: 'complete' },
    { id: '3881', name: 'Form FDA 3881', title: 'Indications for Use', status: 'complete' },
    { id: '3601', name: 'Form FDA 3601', title: 'Premarket Submission Cover Sheet (user fee)', status: 'draft' },
    { id: '3654', name: 'Form FDA 3654', title: 'CDRH Premarket Approval / De Novo (n/a for 510k)', status: 'na' },
  ],
  assembly: { format: 'eSTAR (electronic Submission Template And Resource)', officialEstarPdf: false,
    officialNote: 'The platform assembles a complete content package mapped to eSTAR sections. The official FDA eSTAR PDF template is not vendored in this environment, so a true submittable eSTAR is not produced — vendoring the FDA PDF is the only remaining step.',
    validator: [
      { check: 'All required sections present', result: 'pass', detail: '8 / 8 required sections have content' },
      { check: 'Indications for Use (3881) attached', result: 'pass', detail: 'Form FDA 3881 complete' },
      { check: 'SE comparison table populated', result: 'pass', detail: '6 characteristics adjudicated' },
      { check: 'Cybersecurity documentation', result: 'fail', detail: 'SBOM + threat model still in draft (§8)' },
      { check: 'eValidator structural errors', result: 'pass', detail: '0 errors · 2 warnings' },
    ],
    canTransmit: false,
    transmitNote: 'Dispatch gate is CLOSED: 1 validation failure (cybersecurity) and the official eSTAR PDF is not vendored. Gate opens when validationErrors = 0 and unacknowledged shadow criticals = 0.',
    gateway: 'FDA ESG (AS2)' },
  cyber: { framework: 'FDA FD&C Act §524B', readiness: 63,
    artifacts: [
      { k: 'SBOM (NTIA minimum elements)', have: true }, { k: 'Threat model', have: false }, { k: 'Vulnerability management plan', have: true },
      { k: 'Security testing', have: true }, { k: 'Secure-by-design evidence', have: true }, { k: 'Coordinated disclosure policy', have: false },
      { k: 'Patchability plan', have: true }, { k: 'Security risk assessment', have: false }],
    sbom: { components: 42, complete: 38, vulnerableComponents: 2, knownVulns: 3, ntia: 'NTIA minimum elements' } },
  registration: { scheme: 'FDA · 21 CFR 807 — establishment registration & listing', items: [
    { k: 'FURLS owner/operator account', have: true }, { k: 'Establishment registered (807.20)', have: true },
    { k: 'Annual registration fee paid', have: true }, { k: 'Device listed (807.25)', have: false },
    { k: 'Premarket status established', have: true }, { k: 'U.S. Agent (if foreign)', have: true }],
    note: 'Device listing follows clearance — list within 30 days of marketing.' },
  changeAssessment: { pending: 'Sensor wear extension 10→15 days + predictive-alert algorithm update',
    fda: { decision: 'new_510k', rationale: 'Software change introduces a new risk control (predictive low alert); real-time stability for the 15-day claim still maturing — new 510(k) indicated.', triggers: ['Software change introduces or modifies a risk control.', 'Change could significantly affect safety or effectiveness.'] },
    eu: { significant: true, rationale: 'Significant software change affecting diagnosis / therapy output.', triggers: ['Significant software change affecting diagnosis/therapy.'] },
    guidance: 'FDA 2017 "Deciding When to Submit a 510(k) for a Change" · EU MDCG 2020-3' },
  dhf: { completeness: 66, tracedShare: 0.78, auditReady: false,
    elements: [
      { el: 'designPlan', label: 'Design & development plan', have: true, ref: '820.30(b)' },
      { el: 'designInputs', label: 'Design inputs', have: true, ref: '820.30(c)' },
      { el: 'designOutputs', label: 'Design outputs', have: true, ref: '820.30(d)' },
      { el: 'designReviews', label: 'Design reviews (independent)', have: true, ref: '820.30(e)' },
      { el: 'designVerification', label: 'Design verification (pass)', have: true, ref: '820.30(f)' },
      { el: 'designValidation', label: 'Design validation (prod.-equiv.)', have: false, ref: '820.30(g)' },
      { el: 'designTransfer', label: 'Design transfer documented', have: false, ref: '820.30(h)' },
      { el: 'designChanges', label: 'Design changes reviewed/verified', have: true, ref: '820.30(i)' },
      { el: 'traceability', label: 'Full requirements↔V&V traceability', have: false, ref: '820.30(j)' }],
    blockers: ['Design validation not on production-equivalent units (820.30(g)).', '3/14 design inputs not fully traced to outputs + V&V.'] },
  findings: [
    { sev: 'critical', text: '§8 cybersecurity SBOM + threat model in draft — blocks eSTAR validation.' },
    { sev: 'critical', text: '§7 Biocompatibility not started — required section.' },
    { sev: 'warning', text: '§5 SE comparison: predictive-alarm difference needs explicit new-questions rationale.' },
    { sev: 'info', text: '§10 sterilization optional for this device type (non-sterile, patient-applied).' },
  ],
  ana: { section: '§5 Substantial Equivalence', activity: [
    { type: 'edit', text: 'SE matrix: MARD row linked to §6 bench data', when: '8m ago' },
    { type: 'alert', text: 'Predictive-alarm difference flagged — needs rationale', when: '35m ago' }],
    actions: [
      { id: 'draft', label: 'Draft SE rationale', icon: 'penLine', prompt: 'Draft the §5 substantial-equivalence new-questions rationale for the predictive-alarm and 15-day wear differences vs predicate K221847.' },
      { id: 'predicate', label: 'Compare predicates', icon: 'gitCompare', prompt: 'Compare predicates K221847 and K203117 and recommend the strongest SE basis for the Aurora CGM.' },
      { id: 'se', label: 'Run SE flowchart', icon: 'gitBranch', prompt: 'Walk the 21 CFR 807.3 substantial-equivalence decision flowchart for the Aurora CGM vs K221847.' },
      { id: 'estar', label: 'Assemble eSTAR section', icon: 'fileCheck', prompt: 'Assemble the §5 eSTAR content from the SE comparison table.' },
    ] },
};

const pathwayDeNovo: DevicePathway = {
  id: 'denovo', label: 'De Novo', full: 'De Novo Classification Request', agency: 'FDA · CDRH', region: 'United States',
  framework: '21 CFR 860 Subpart D · 513(f)(2)',
  device: { name: 'NeuroSense Closed-Loop Stimulator', code: '(none — novel)', className: 'Class II (proposed)', regNumber: 'Requested', panel: 'Neurology', kind: 'Adaptive neurostimulation, no predicate' },
  readiness: 48, updated: '1h ago', version: '0.4',
  sections: [
    { id: 'd1', num: '1', title: 'Cover Letter', required: true, status: 'complete', guidance: '21 CFR 860.260' },
    { id: 'd2', num: '2', title: 'Device Description (why no predicate)', required: true, status: 'draft', guidance: '21 CFR 860.260(b)' },
    { id: 'd3', num: '3', title: 'Proposed Classification & Special Controls', required: true, status: 'draft', guidance: '21 CFR 860.260(c)', tab: 'classification' },
    { id: 'd4', num: '4', title: 'Risk Analysis', required: true, status: 'draft', guidance: 'FDA De Novo Guidance', tab: 'risk' },
    { id: 'd5', num: '5', title: 'Performance Testing', required: true, status: 'not_started', guidance: '21 CFR 860.260(d)', tab: 'performance' },
    { id: 'd6', num: '6', title: 'Labeling', required: true, status: 'not_started', guidance: '21 CFR 801' },
  ],
  tabs: ['document', 'classification', 'risk', 'performance', 'forms', 'assembly'],
  content: {
    d2: [{ h: '2.1  Device description & absence of predicate', p: 'NeuroSense delivers closed-loop adaptive neurostimulation driven by a real-time biomarker classifier. No legally marketed predicate implements automated closed-loop titration for this indication; accordingly a De Novo classification request is appropriate rather than a 510(k).', prov: { src: 'Predicate landscape search', conf: 'High', audit: 'AUD-6101' } }],
    d3: [{ h: '3.1  Proposed classification', p: 'A Class II classification with special controls is proposed. The probable benefits outweigh the probable risks when the device is subject to the special controls enumerated below, which mitigate the identified risks to a reasonable assurance of safety and effectiveness.', prov: { src: 'Classification rationale', conf: 'Medium', audit: 'AUD-6104' } }],
  },
  predicate: null,
  classification: { regulation: 'Requested (new generic type)', productCode: 'Requested', className: 'Class II (proposed)', panel: 'Neurology', reviewPanel: 'CDRH / OHT5', deviceType: 'Adaptive closed-loop neurostimulator',
    specialControls: ['Clinical performance validation of the closed-loop classifier', 'Software V&V + algorithm change-control (PCCP)', 'Biocompatibility of implanted components', 'Electrical safety & MRI conditional labeling', 'Human factors validation'],
    rationale: 'No predicate exists; De Novo establishes a new generic type. Proposed special controls mitigate the identified risks; general controls alone are insufficient but Class III is not warranted.' },
  risk: { standard: 'ISO 14971:2019', count: 11, extreme: 2, rows: [
    { id: 'r1', hazard: 'Classifier mis-detection → over-stimulation', cat: 'Algorithm', l: 3, i: 5, rl: 2, ri: 4, status: 'open', mitigation: 'Closed-loop safety limiter; clinical validation of classifier sensitivity/specificity; PCCP.' },
    { id: 'r2', hazard: 'Lead migration', cat: 'Mechanical', l: 2, i: 4, rl: 1, ri: 3, status: 'mitigating', mitigation: 'Anchoring design; imaging follow-up in labeling.' },
  ] },
  performance: { groups: [
    { id: 'clin', label: 'Clinical performance', tests: [
      { test: 'Closed-loop classifier sensitivity', accept: '≥ 90%', result: 'pending', pass: false },
      { test: 'Responder rate vs open-loop', accept: 'Superiority', result: 'pending', pass: false }] },
    { id: 'sw', label: 'Software / algorithm (IEC 62304 + PCCP)', tests: [
      { test: 'Algorithm change-control plan (PCCP)', accept: 'Provided', result: 'Draft', pass: false }] },
  ] },
  forms: [
    { id: '3514', name: 'Form FDA 3514', title: 'CDRH Premarket Review Submission Cover Sheet', status: 'complete' },
    { id: '3881', name: 'Form FDA 3881', title: 'Indications for Use', status: 'draft' },
  ],
  assembly: { format: 'eSTAR (De Novo variant)', officialEstarPdf: false,
    officialNote: 'De Novo eSTAR content package assembles; official FDA eSTAR De Novo PDF not vendored.',
    validator: [
      { check: 'Classification rationale present', result: 'pass', detail: '§3 drafted' },
      { check: 'Special controls enumerated', result: 'pass', detail: '5 special controls' },
      { check: 'Performance data', result: 'fail', detail: '§5 clinical performance not started' },
    ], canTransmit: false, transmitNote: 'Gate closed — performance testing incomplete.', gateway: 'FDA ESG (AS2)' },
  changeAssessment: { pending: 'Algorithm improvement — revised biomarker threshold',
    fda: { decision: 'new_510k', rationale: 'Software change affects the therapeutic-decision output; risk assessment shows a modified risk control. New 510(k) indicated.', triggers: ['Software change introduces or modifies a risk control.'] },
    eu: { significant: true, rationale: 'Significant software change affecting diagnostic/therapy classification.', triggers: ['Significant software change affecting diagnosis/therapy.'] },
    guidance: 'FDA 2017 "Deciding When to Submit a 510(k) for a Software Change" · MDCG 2020-3' },
  findings: [
    { sev: 'critical', text: '§5 performance testing not started — required.' },
    { sev: 'critical', text: 'Closed-loop classifier clinical validation pending.' },
    { sev: 'warning', text: 'PCCP (algorithm change-control) still draft.' },
  ],
  ana: { section: '§3 Classification & Special Controls', activity: [
    { type: 'edit', text: 'Special controls list drafted (5)', when: '20m ago' },
    { type: 'alert', text: 'No predicate — De Novo rationale needs strengthening', when: '1h ago' }],
    actions: [
      { id: 'draft', label: 'Draft special controls', icon: 'penLine', prompt: 'Draft the proposed Class II special controls and risk-mitigation mapping for the NeuroSense De Novo.' },
      { id: 'risk', label: 'Build risk analysis', icon: 'alertTriangle', prompt: 'Build the De Novo risk analysis (ISO 14971) linking each risk to a special control.' },
    ] },
};

export const DV_MARKETS: DeviceMarket[] = [
  { id: 'us', flag: 'US', authority: 'FDA · CDRH', instrument: '510(k) / De Novo / PMA', classRule: '21 CFR 860 — Class I / II / III', format: 'eSTAR / eCopy', language: 'English', udi: 'GUDID', localRep: false, mdsap: false, readiness: 71, reqs: [{ r: 'Device classification', have: true }, { r: 'eSTAR content package', have: true }, { r: 'Predicate/SE or clinical evidence', have: true }, { r: 'Cybersecurity (sec. 524B)', have: false }, { r: 'Establishment registration & listing', have: true }], demands: ['eSTAR PDF on the FDA template', 'English labeling (21 CFR 801)', 'GUDID UDI submission', 'Establishment registration (21 CFR 807)'] },
  { id: 'eu', flag: 'EU', authority: 'Notified Body · EU MDR / IVDR', instrument: 'CE mark — Technical Documentation', classRule: 'MDR Rule 11 / IVDR Annex VIII (A–D)', format: 'Annex II/III Technical Documentation', language: 'All EU official languages', udi: 'EUDAMED UDI-DI', localRep: true, mdsap: false, readiness: 66, reqs: [{ r: 'Classification (Annex VIII)', have: true }, { r: 'GSPR conformity', have: false }, { r: 'Clinical / performance evaluation', have: true }, { r: 'PMS / PMCF plan', have: false }, { r: 'EU Authorised Representative', have: true }, { r: 'EUDAMED registration', have: false }], demands: ['Technical Documentation (Annex II/III)', 'EU-language IFU & labelling', 'EUDAMED UDI-DI + SRN', 'EU Authorised Representative', 'Notified-Body conformity assessment'] },
  { id: 'jp', flag: 'JP', authority: 'PMDA / MHLW', instrument: 'Shōnin (approval) / Todokede (notification)', classRule: 'JMDN — Class I–IV', format: 'STED', language: 'Japanese', udi: 'MEDIS code', localRep: true, mdsap: true, readiness: 42, reqs: [{ r: 'JMDN classification', have: true }, { r: 'STED dossier', have: false }, { r: 'Japanese labelling', have: false }, { r: 'Marketing Authorization Holder (MAH / D-MAH)', have: false }, { r: 'QMS Ordinance MHLW 169 / MDSAP', have: true }], demands: ['STED-format dossier', 'Japanese translation', 'MAH or D-MAH established in Japan', 'PMDA consultation', 'QMS Ordinance MHLW 169'] },
  { id: 'ca', flag: 'CA', authority: 'Health Canada', instrument: 'Medical Device Licence (MDL) — classes I–IV', classRule: 'CMDR risk classes I–IV', format: 'IMDRF ToC / STED', language: 'English & French', udi: 'MDALL', localRep: false, mdsap: true, readiness: 58, reqs: [{ r: 'Device classification', have: true }, { r: 'ISO 13485 MDSAP certificate', have: true }, { r: 'Safety & effectiveness evidence', have: true }, { r: 'Bilingual labelling', have: false }, { r: 'Quality plan', have: false }], demands: ['MDSAP certificate (mandatory class II–IV)', 'Bilingual EN/FR labelling', 'IMDRF Table of Contents', 'MDL application'] },
  { id: 'cn', flag: 'CN', authority: 'China NMPA', instrument: 'Class I filing / II–III registration', classRule: 'NMPA Class I / II / III', format: 'NMPA registration dossier', language: 'Chinese (Simplified)', udi: 'NMPA UDID', localRep: true, mdsap: false, readiness: 31, reqs: [{ r: 'Device classification', have: true }, { r: 'Type testing (Chinese lab)', have: false }, { r: 'Clinical evaluation / trial', have: false }, { r: 'Chinese labelling', have: false }, { r: 'In-country legal agent', have: false }, { r: 'Quality system', have: true }], demands: ['Type testing at an NMPA-recognised Chinese lab', 'Local clinical data often expected', 'Chinese labelling', 'In-country legal agent', 'NMPA UDID'] },
  { id: 'br', flag: 'BR', authority: 'Brazil ANVISA', instrument: 'Registro / Cadastro (risk-based)', classRule: 'ANVISA Class I–IV', format: 'IMDRF ToC', language: 'Portuguese', udi: 'ANVISA UDI', localRep: true, mdsap: true, readiness: 46, reqs: [{ r: 'Device classification', have: true }, { r: 'B-GMP or MDSAP certificate', have: true }, { r: 'Safety & effectiveness evidence', have: true }, { r: 'Portuguese labelling', have: false }, { r: 'Brazil Registration Holder (BRH)', have: false }], demands: ['MDSAP accepted in lieu of B-GMP for many classes', 'Portuguese labelling', 'Brazil Registration Holder', 'Registro vs Cadastro by risk class'] },
  { id: 'au', flag: 'AU', authority: 'Australia TGA', instrument: 'ARTG inclusion (classes 1–4)', classRule: 'TGA IVD classes 1–4', format: 'Conformity assessment / STED', language: 'English', udi: 'AusUDID (planned)', localRep: true, mdsap: true, readiness: 54, reqs: [{ r: 'Device classification', have: true }, { r: 'Conformity assessment evidence', have: true }, { r: 'ISO 13485 certificate', have: true }, { r: 'Australian sponsor', have: false }, { r: 'Labelling', have: true }], demands: ['EU / MDSAP conformity-assessment evidence accepted', 'Australian sponsor required', 'ARTG inclusion', 'English labelling'] },
  { id: 'uk', flag: 'UK', authority: 'UK MHRA', instrument: 'UKCA mark (UK MDR 2002)', classRule: 'UK MDR risk classes', format: 'Technical documentation', language: 'English', udi: 'UK UDI (planned)', localRep: true, mdsap: false, readiness: 60, reqs: [{ r: 'Classification', have: true }, { r: 'UK Approved Body assessment', have: false }, { r: 'UK Responsible Person (UKRP)', have: false }, { r: 'Technical documentation', have: true }, { r: 'Labelling', have: true }], demands: ['UKCA marking', 'UK Responsible Person (UKRP)', 'UK Approved Body for higher classes', 'English labelling'] },
];

export const DV: DeviceHubData = {
  order: ['510k', 'denovo', 'pma', 'cer', 'ivdr'],
  pathways: {
    '510k': pathway510k,
    'denovo': pathwayDeNovo,
    'pma': pmaPathway,
    'cer': cerPathway,
    'ivdr': ivdrPathway,
  },
  markets: DV_MARKETS,
  mdsap: { authority: 'MDSAP — AU · BR · CA · JP · US', note: 'One ISO 13485 QMS audit recognised by five regulators — foundational to the Canada, Brazil, Australia and Japan pathways.' },
};

export function getDevicePathway(id: string): DevicePathway {
  return DV.pathways[id] || DV.pathways['510k'];
}
