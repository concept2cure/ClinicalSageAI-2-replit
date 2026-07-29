(() => {
/**
 * Post-market vigilance data — MDR/FSCA reports, CAPA workflow, signals
 * trending, MAUDE/FAERS feeds.
 *
 * Regulatory frame:
 *   • US 21 CFR 803 — Medical Device Reporting (death/serious-injury within
 *     30 days; malfunction within 5; user-facility imposes 10).
 *   • EU MDR Art. 87 — Serious incident report (15 calendar days; death/
 *     unanticipated public-health threat: 2 days).
 *   • FSCA = Field Safety Corrective Action; FSN = Field Safety Notice.
 */

const PV_METRICS = [
  { label: 'Open signals',           metric: '14', meta: '4 critical · 7 review · 3 watching',     tone: 'err' },
  { label: 'MDRs due in <72h',       metric: '2',  meta: 'BX-204 30-day · CV-330 5-day',           tone: 'warn' },
  { label: 'CAPAs in flight',        metric: '6',  meta: '2 investigation · 3 action · 1 verify' },
  { label: 'Median triage time',     metric: '11', unit: 'd', meta: 'Target ≤ 7 d' },
];

/* Active vigilance signals — clustered by device, root-cause stub, and
   severity. Each can roll up to an MDR, an FSCA, or a CAPA. */
const PV_SIGNALS = [
  { id: 'SIG-2186', device: 'BX-204', source: 'MAUDE',         opened: '3d ago',  severity: 'critical', kind: 'unexplained-trend', count: 28, vs: '+340%', summary: 'Sensor lift-off events in users >85kg — clustered at week 2 of wear', owner: 'JC', state: 'investigate' },
  { id: 'SIG-2184', device: 'CV-330', source: 'complaint',     opened: '5h ago',  severity: 'critical', kind: 'serious-injury',    count: 1,  vs: '—',     summary: 'Battery EOL alarm did not trigger; device went silent at 11 mo', owner: 'MW', state: 'mdr-30d' },
  { id: 'SIG-2181', device: 'BX-204', source: 'FAERS',          opened: '12h ago', severity: 'critical', kind: 'serious-injury',    count: 3,  vs: 'new',   summary: 'Severe hypoglycemia with no alarm — algorithm under review',     owner: 'JC', state: 'mdr-30d' },
  { id: 'SIG-2179', device: 'OR-801', source: 'EUDAMED',        opened: '2d ago',  severity: 'review',   kind: 'malfunction',        count: 7,  vs: '+45%',  summary: 'Screw head stripping during insertion — torque-tool incompatibility', owner: 'SM', state: 'fsca-evaluate' },
  { id: 'SIG-2174', device: 'PM-660', source: 'support',        opened: '1d ago',  severity: 'review',   kind: 'cyber',              count: 2,  vs: 'new',   summary: 'CVE-2026-12881 in OTS BLE stack — exploit unlikely (auth required)', owner: 'PS', state: 'patch-q3' },
  { id: 'SIG-2171', device: 'CV-330', source: 'complaint',      opened: '4d ago',  severity: 'review',   kind: 'use-error',          count: 12, vs: '+8%',   summary: 'Clinicians programming wrong sensing vector — IFU clarification needed', owner: 'MW', state: 'investigate' },
  { id: 'SIG-2168', device: 'BX-204', source: 'social',         opened: '6d ago',  severity: 'watching', kind: 'user-experience',    count: 41, vs: '+12%',  summary: 'Adhesive failure in humid climates — see CAPA-0214 root cause',   owner: 'AK', state: 'closed-trend' },
  { id: 'SIG-2164', device: 'OR-801', source: 'literature',     opened: '11d ago', severity: 'watching', kind: 'literature',         count: 1,  vs: 'new',   summary: 'JBJS case report — single screw fracture at 14 mo, off-label use',  owner: 'SM', state: 'review-q4' },
];

/* MDR / FSN tracker — every reportable event with its regulatory clock. */
const PV_MDRS = [
  { id: 'MDR-0091', device: 'CV-330', authority: 'FDA',      kind: '5-day',    eventType: 'malfunction',     opened: '4d ago', dueIn: '23h',  state: 'draft',   author: 'MW' },
  { id: 'MDR-0090', device: 'BX-204', authority: 'FDA',      kind: '30-day',   eventType: 'serious-injury',  opened: '12d ago', dueIn: '18d', state: 'review',  author: 'JC' },
  { id: 'MDR-0089', device: 'BX-204', authority: 'EUDAMED',  kind: '15-day',   eventType: 'serious-injury',  opened: '8d ago',  dueIn: '7d',  state: 'review',  author: 'AM' },
  { id: 'MDR-0088', device: 'OR-801', authority: 'EUDAMED',  kind: 'trend',    eventType: 'malfunction',     opened: '21d ago', dueIn: '—',   state: 'filed',   author: 'SM' },
  { id: 'MDR-0086', device: 'CV-330', authority: 'PMDA',     kind: '30-day',   eventType: 'death',           opened: '38d ago', dueIn: '—',   state: 'filed',   author: 'MW' },
];

/* CAPA — Corrective and Preventive Action workflow. Standard 6 phases. */
const PV_CAPA_STAGES = [
  { id: 'open',         label: 'Open',         desc: 'Triaged from signal' },
  { id: 'investigate',  label: 'Investigate',  desc: 'Root-cause analysis' },
  { id: 'action',       label: 'Action',       desc: 'Containment + corrective' },
  { id: 'verify',       label: 'Verify',       desc: 'Effectiveness check' },
  { id: 'close',        label: 'Close',        desc: 'Approved + filed' },
];
const PV_CAPAS = [
  { id: 'CAPA-0218', title: 'Sensor lift-off in users >85kg — adhesive Rev D rollout',  device: 'BX-204', stage: 'action',      owner: 'AK', opened: '21d ago', sla: '14d', critical: true,  linked: ['SIG-2186','ECR-1071'] },
  { id: 'CAPA-0217', title: 'CV-330 battery EOL alarm — firmware OTA + field correction',device:'CV-330', stage: 'investigate', owner: 'MW', opened: '5d ago',  sla: '60d', critical: true,  linked: ['SIG-2184','MDR-0091'] },
  { id: 'CAPA-0216', title: 'CGM rapid-drop algorithm — false-positive review',         device: 'BX-204', stage: 'investigate', owner: 'JC', opened: '12d ago', sla: '60d', critical: true,  linked: ['SIG-2181','MDR-0090'] },
  { id: 'CAPA-0215', title: 'OR-801 screw head stripping — supplier change',            device: 'OR-801', stage: 'verify',      owner: 'SM', opened: '54d ago', sla: '90d', critical: false, linked: ['SIG-2179','ECR-1063'] },
  { id: 'CAPA-0214', title: 'BX-204 humid-climate adhesive — IFU update + bonding',     device: 'BX-204', stage: 'close',       owner: 'AK', opened: '88d ago', sla: '90d', critical: false, linked: ['SIG-2168'] },
  { id: 'CAPA-0213', title: 'PM-660 BLE stack CVE — patch + customer notice',           device: 'PM-660', stage: 'action',      owner: 'PS', opened: '6d ago',  sla: '30d', critical: false, linked: ['SIG-2174'] },
];

/* PMS plan execution — periodic safety surveillance per device. */
const PV_PMS_PLAN = [
  { device: 'BX-204', last: '2026-04-30', next: 'Q3 review · Jul 31', psur: 'EU MDR PSUR annual', source: 'MAUDE + EUDAMED + complaints', signals: 23, state: 'on-track' },
  { device: 'CV-330', last: '2026-04-22', next: 'Q3 review · Jul 22', psur: 'EU MDR PSUR annual', source: 'MAUDE + EUDAMED + complaints + literature', signals: 17, state: 'on-track' },
  { device: 'OR-801', last: '2026-03-15', next: 'Q3 review · Aug 15', psur: 'EU MDR PSUR 2-year',  source: 'MAUDE + EUDAMED', signals: 9, state: 'on-track' },
  { device: 'PM-660', last: '2026-04-04', next: 'Q3 review · Aug 04', psur: 'PMSR 2-year',         source: 'support + cyber feeds', signals: 4, state: 'on-track' },
];

/* Trending — 8 weeks of weekly counts per device. Drives the sparkline. */
const PV_TRENDS = [
  { device: 'BX-204', weeks: [12,11,14,18,22,28,31,34], severityMix: { critical: 4, review: 11, watching: 19 } },
  { device: 'CV-330', weeks: [3,4,5,4,6,7,9,8],          severityMix: { critical: 2, review: 4,  watching: 2  } },
  { device: 'OR-801', weeks: [6,6,7,8,9,11,10,12],       severityMix: { critical: 0, review: 7,  watching: 5  } },
  { device: 'PM-660', weeks: [1,2,1,3,2,3,4,3],          severityMix: { critical: 0, review: 2,  watching: 1  } },
];


// Window globals (kit harness only — codebase uses ESM imports)
window.PV_METRICS = PV_METRICS;
window.PV_SIGNALS = PV_SIGNALS;
window.PV_MDRS = PV_MDRS;
window.PV_CAPA_STAGES = PV_CAPA_STAGES;
window.PV_CAPAS = PV_CAPAS;
window.PV_PMS_PLAN = PV_PMS_PLAN;
window.PV_TRENDS = PV_TRENDS;

})();
