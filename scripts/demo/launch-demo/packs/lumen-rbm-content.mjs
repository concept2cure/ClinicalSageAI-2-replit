/**
 * launch-demo/packs/lumen-rbm-content.mjs — the LMN-201 risk-based monitoring
 * story, for lumen-rbm.mjs.
 *
 * SYNTHETIC. Nothing here is Lumen Bioscience data or the RePreve study's
 * monitoring record. The study shape (Phase 2/3, randomized, placebo-controlled,
 * 375 planned, sustained clinical cure at week 12) is the public listing the
 * pack's LMN201_DESIGN already cites; every site, investigator, subject,
 * indicator value, tolerance limit, signal and action is invented for the
 * demonstration. Sites and investigators are fictional and name no real
 * institution or person.
 *
 * The story: eight US sites; site 104 trends high-risk over six monthly
 * extracts (AE entry lag and query aging climb), which shows as an amber and a
 * red KRI, a flagged subject, a triggered on-site visit and an open issue.
 */
import { demoTitle } from '../lib.mjs';

const T = (name) => demoTitle('lumen', name);
const SYN = 'Synthetic demonstration content, not actual study data.';

/** Fictional sites. Numbers are what records carry; names appear only in detail text. */
export const SITES = [
  { n: '101', name: 'Cedar Valley Research Center (fictional), Columbus, OH', pi: 'Dr. Imogen Varga' },
  { n: '102', name: 'Bayfront Digestive Health Research (fictional), Tampa, FL', pi: 'Dr. Tobias Renfield' },
  { n: '103', name: 'Mesa Ridge Clinical Trials (fictional), Phoenix, AZ', pi: 'Dr. Priya Castellane' },
  { n: '104', name: 'Northgate Infectious Disease Associates (fictional), Newark, NJ', pi: 'Dr. Marcus Oyelaran' },
  { n: '105', name: 'Prairie Wind Medical Research (fictional), Omaha, NE', pi: 'Dr. Helena Strand' },
  { n: '106', name: 'Cascade Gastroenterology Research (fictional), Portland, OR', pi: 'Dr. Julian Ashcombe' },
  { n: '107', name: 'Riverbend Clinical Studies (fictional), Memphis, TN', pi: 'Dr. Naomi Petrakis' },
  { n: '108', name: 'Highland Pines Research Institute (fictional), Asheville, NC', pi: 'Dr. Owen Takahara' },
];
const site = (n) => SITES.find((s) => s.n === n);
const siteLabel = (n) => `site ${n} (${site(n).name}; PI ${site(n).pi}, fictional)`;

export const ASSESSMENT_TITLE = T('LMN-201 RePreve — risk assessment (RACT), synthetic');

/** Study-specific critical-to-quality factors, added to the ICH E6(R3) default register. */
export const CTQ_FACTORS = [
  { category: 'efficacy', factor: T('Week-12 sustained clinical cure: CDI recurrence ascertainment (diarrhoea episodes with stool toxin testing)'),
    description: `A recurrence missed or tested outside the window misclassifies the primary endpoint. ${SYN}`,
    l: 3, i: 5, det: 3, status: 'mitigating', owner: 'Ana Author',
    mitigation: 'eDiary prompt at 3 or more unformed stools in 24 h; unscheduled visit within 48 h; central-lab toxin EIA; QTL on missing week-12 assessments.' },
  { category: 'compliance', factor: T('Standard-of-care antibiotic course completed and documented before randomization'),
    description: `Undocumented vancomycin or fidaxomicin courses make eligibility unverifiable. ${SYN}`,
    l: 3, i: 4, det: 2, status: 'open', owner: 'Rhea Reviewer',
    mitigation: 'Eligibility checklist with SoC course dates; central eligibility review of the first three subjects at each site.' },
  { category: 'efficacy', factor: T('Enteric capsule dosing adherence through the treatment period'),
    description: `Missed doses dilute the treatment effect. ${SYN}`,
    l: 3, i: 3, det: 2, status: 'mitigating', owner: 'Ana Author',
    mitigation: 'Capsule counts at each visit; eDiary dosing log; KRI on eDiary compliance.' },
  { category: 'data_integrity', factor: T('Blinding of capsule appearance and dispensing at site pharmacies'),
    description: `Unblinding would bias recurrence ascertainment. ${SYN}`,
    l: 2, i: 4, det: 3, status: 'accepted', owner: 'Rhea Reviewer',
    mitigation: 'Matched placebo capsules; unblinded pharmacist log reviewed remotely each month.' },
];

/** Six monthly extracts; the last is two days old so the board reads it as current. */
export const PERIOD_DAYS_AGO = [152, 122, 91, 61, 30, 2];

export const KRIS = [
  { name: T('AE reporting lag'), metric: `Median days from adverse-event onset to EDC entry. ${SYN}`, source: 'edc', unit: 'days', dir: 'higher_worse', amber: 5, red: 10, extract: 'edc',
    values: [2.6, 2.9, 3.4, 4.8, 6.2, 7.4],
    bySite: { 101: [2, 3, 2, 3, 2, 3], 102: [3, 2, 3, 3, 3, 2], 103: [3, 3, 4, 3, 4, 4], 104: [3, 4, 6, 11, 17, 21], 105: [2, 2, 3, 2, 3, 3], 106: [3, 4, 3, 4, 4, 5], 107: [null, null, null, null, 2, 3], 108: [null, null, null, null, null, 2] } },
  { name: T('Open query aging'), metric: `Median age of open data queries. ${SYN}`, source: 'edc', unit: 'days', dir: 'higher_worse', amber: 14, red: 28, extract: 'edc',
    values: [9, 11, 13, 17, 22, 31],
    bySite: { 101: [8, 9, 10, 11, 12, 12], 102: [7, 8, 8, 9, 9, 10], 103: [10, 11, 12, 12, 13, 14], 104: [10, 14, 22, 34, 47, 58], 105: [9, 9, 10, 10, 11, 11], 106: [11, 12, 12, 13, 15, 16], 107: [null, null, null, null, 4, 6], 108: [null, null, null, null, null, 3] } },
  { name: T('Important protocol deviation rate'), metric: `Important protocol deviations per randomized subject. ${SYN}`, source: 'edc', unit: 'per subject', dir: 'higher_worse', amber: 0.3, red: 0.5, extract: 'edc',
    values: [0.06, 0.09, 0.12, 0.16, 0.21, 0.24] },
  { name: T('Missed visit rate'), metric: `Scheduled visits missed or out of window, as a share of visits due. ${SYN}`, source: 'edc', unit: '%', dir: 'higher_worse', amber: 5, red: 10, extract: 'edc',
    values: [1.8, 2.2, 2.9, 3.8, 5.4, 6.1] },
  { name: T('eDiary compliance'), metric: `Diary days completed, as a share of days expected. ${SYN}`, source: 'edc', unit: '%', dir: 'lower_worse', amber: 90, red: 80, extract: 'edc',
    values: [97, 96, 96, 95, 93, 92] },
  { name: T('Screen-failure rate'), metric: `Screen failures, as a share of subjects screened. ${SYN}`, source: 'ctms', unit: '%', dir: 'higher_worse', amber: 35, red: 50, extract: 'ctms',
    values: [44, 41, 38, 36, 34, 33] },
];

/** Values are percentages. The secondary limit is the early warning. */
export const QTLS = [
  { parameter: T('Missing week-12 primary-endpoint assessments (% of randomized subjects due)'), threshold: 8, secondaryLimit: 5, extract: 'edc',
    rationale: `Missing sustained-cure status at week 12 biases the primary efficacy estimate. ${SYN}`,
    values: [0, 1.9, 2.8, 3.6, 4.4, 5.6] },
  { parameter: T('Premature discontinuation of study treatment (% of randomized subjects)'), threshold: 15, secondaryLimit: 10, extract: 'ctms',
    rationale: `Excess discontinuation threatens power and the treatment-policy estimand. ${SYN}`,
    values: [3.1, 4.0, 5.2, 6.3, 7.5, 8.2] },
  { parameter: T('Randomized subjects with an eligibility violation (%)'), threshold: 3, secondaryLimit: 2, extract: 'edc',
    rationale: `Ineligible subjects undermine the analysis population. ${SYN}`,
    values: [0, 0, 0.8, 0.7, 1.2, 1.1] },
];

/** Subject-level metrics, in the final EDC extract; what the cohort scorer reads. */
const S = (id, ae, q, mv, dc) => ({ id, metrics: { 'AE entry lag (days)': ae, 'Open queries': q, 'Missed visits': mv, 'eDiary compliance (%)': dc } });
export const SUBJECTS = [
  S('DEMO-101-0001', 2, 1, 0, 97), S('DEMO-101-0004', 3, 2, 0, 95),
  S('DEMO-102-0002', 2, 1, 0, 100), S('DEMO-102-0006', 3, 2, 1, 100),
  S('DEMO-103-0003', 4, 3, 0, 94), S('DEMO-103-0008', 3, 2, 1, 92),
  S('DEMO-104-0005', 19, 9, 1, 90), S('DEMO-104-0009', 9, 7, 2, 86), S('DEMO-104-0011', 6, 4, 1, 93),
  S('DEMO-105-0007', 2, 1, 0, 96), S('DEMO-106-0010', 4, 3, 0, 95), S('DEMO-106-0012', 3, 2, 1, 93),
];

/** The extracts, by source and period: what the Overview's "Load extract…" takes. */
export const EXTRACTS = [
  { source: 'edc', ref: (p) => `${T(`LMN-201 RePreve EDC monthly extract M${p} — SYNTHETIC`)}.csv`, subjects: true },
  { source: 'ctms', ref: (p) => `${T(`LMN-201 RePreve CTMS monthly extract M${p} — SYNTHETIC`)}.csv`, subjects: false },
];

export const PLAN = { title: T('LMN-201 RePreve — risk-based monitoring plan'), strategy: 'hybrid' };

const kri = (name) => KRIS.find((k) => k.name === T(name));
const qtl = QTLS[0];
const last = (a) => a[a.length - 1];

/**
 * Signals as a monitor logs them (Central monitoring's "Log signal"), with the
 * disposition the screen records next: Triage, or Document investigation with
 * an optional follow-up action. kri/qtl signals restate an indicator's state
 * after the extracts land; manual ones are CRA observations.
 */
export const SIGNALS = [
  { key: 's104-ae', source: 'manual', type: 'site_data_timeliness', severity: 'high', site: '104',
    title: T('Site 104 — AE onset dates entered two to three weeks after the visit'),
    detail: `Remote CRA review: at ${siteLabel('104')} the median lag from AE onset to EDC entry rose from 3 to 21 days over four monthly extracts, and two diarrhoea episodes were entered after the stool-sample window closed. ${SYN}`,
    disposition: { status: 'investigating',
      notes: 'Root cause: study coordinator post vacant since month 3; AE pages entered in batches. A for-cause on-site visit is scheduled. (Synthetic.)',
      action: { type: 'site_visit', priority: 'high', owner: 'Rhea Reviewer', dueInDays: 6,
        description: T('Triggered on-site visit — site 104 (AE timeliness; source verification of recurrence episodes)') } } },
  { key: 'kri-query', source: 'kri', type: 'kri_red', severity: 'high', site: '104',
    title: T(`KRI red — open query aging ${last(kri('Open query aging').values)} days, concentrated at site 104`),
    detail: `Study-level open query aging crossed the red limit (${kri('Open query aging').red} days) in the latest EDC extract; site 104's median is ${last(kri('Open query aging').bySite[104])} days against 10 to 16 days elsewhere. ${SYN}`,
    disposition: { status: 'triaged' } },
  { key: 'qtl-endpoint', source: 'qtl', type: 'qtl_secondary_limit', severity: 'medium', site: null,
    title: T(`QTL early warning — missing week-12 assessments at ${last(qtl.values)}% (limit ${qtl.threshold}%)`),
    detail: `The share of randomized subjects due a week-12 sustained-cure assessment without one has passed the ${qtl.secondaryLimit}% secondary limit. ${SYN}`,
    disposition: null },
  { key: 's106-soc', source: 'manual', type: 'eligibility_documentation', severity: 'medium', site: '106',
    title: T('Site 106 — standard-of-care antibiotic course not documented for two subjects'),
    detail: `Central eligibility review at ${siteLabel('106')}: the vancomycin course end date is missing for DEMO-106-0010 and DEMO-106-0012. ${SYN}`,
    disposition: { status: 'investigating', notes: 'Site asked to file pharmacy records for both courses. (Synthetic.)',
      action: { type: 'query', priority: 'medium', owner: 'Ana Author', dueInDays: 10,
        description: T('Query — site 106: document the vancomycin course for DEMO-106-0010 and DEMO-106-0012') } } },
  { key: 's102-diary', source: 'manual', type: 'data_pattern', severity: 'low', site: '102',
    title: T('Site 102 — eDiary compliance uniformly 100% (possible back-filling)'),
    detail: `Both subjects at ${siteLabel('102')} completed every diary day, each entry time-stamped within one minute of 21:00. ${SYN}`,
    disposition: { status: 'triaged' } },
  { key: 's101-temp', source: 'manual', type: 'sample_handling', severity: 'low', site: '101',
    title: T('Site 101 — stool-kit shipment temperature excursion'),
    detail: `One shipment from ${siteLabel('101')} arrived at 11 °C against a 2–8 °C requirement. ${SYN}`,
    disposition: { status: 'resolved', notes: 'Central lab confirmed both samples within validated stability; courier re-briefed. (Synthetic.)' } },
];

/** Plan actions raised directly (the Plan tab's "Add action", the signal's "Escalate"). */
export const ACTIONS = [
  { type: 'issue', priority: 'high', owner: 'Rhea Reviewer', dueInDays: -3, status: 'in_progress', signal: 's104-ae',
    description: T('Issue — site 104: six AEs entered more than 14 days after onset; reconcile against source') },
  { type: 'capa', priority: 'high', owner: 'Ana Author', dueInDays: 21, status: 'open', signal: 's104-ae',
    description: T('CAPA — site 104: retrain site staff on AE entry within 3 days; interim coordinator cover') },
  { type: 'site_visit', priority: 'medium', owner: 'Rhea Reviewer', dueInDays: -12, status: 'done',
    description: T('Routine on-site visit — site 101 (consent, IP accountability, primary-endpoint source verification)') },
  { type: 'site_visit', priority: 'medium', owner: 'Rhea Reviewer', dueInDays: 9, status: 'open',
    description: T('Remote oversight visit — site 102 (eDiary data-pattern review)') },
  { type: 'site_visit', priority: 'low', owner: 'Ana Author', dueInDays: 14, status: 'open',
    description: T('Remote oversight visit — site 105 (first-subject data review)') },
  { type: 'site_visit', priority: 'low', owner: null, dueInDays: 20, status: 'open',
    description: T('Initiation follow-up visit — site 107 (first subject screened)') },
];

export const APPROVAL_REASON = 'Demo seed: approve the synthetic LMN-201 risk assessment as the second signer so the monitoring plan derives from a signed RACT.';
