/**
 * launch-demo/packs/lumen-qms-content.mjs — the Quality story of the Lumen
 * demonstration, as data for lumen-qms.mjs.
 *
 * SYNTHETIC. Every site, person, supplier, lot excursion, audit and decision
 * below is fictional and written for a demonstration. No company named here is
 * a real company, and nothing here is a Lumen Bioscience record. The story
 * follows the LMN-201 RePreve project the Lumen pack seeds (lumen-content.mjs:
 * the Site 104 missed week-12 visit, the Site 107 AE reporting lag, the
 * courier requalification after a shipment excursion, lots LMN201-DP-2405/2406).
 *
 * Dates are days from the day the seed runs, so "overdue" stays overdue.
 */
import { demoTitle } from '../lib.mjs';

export const PACK = 'lumen';
export const T = (name) => demoTitle(PACK, name);
export const SYNTHETIC = 'Synthetic demonstration data: fictional sites, people, suppliers and events. Not a Lumen Bioscience record.';
export const PROVENANCE = { demoPack: PACK, synthetic: true, note: SYNTHETIC };

/* ── Controlled documents (SOPs) ─────────────────────────────────────────── */

export const SOPS = [
  {
    key: 'deviation', docNumber: 'LMN-SOP-201', name: 'SOP-201 Clinical Protocol Deviation Management', target: 'effective',
    body: {
      purpose: 'Defines how protocol deviations in sponsored clinical trials are detected, recorded, classified, investigated and closed, and when a deviation raises a CAPA. Synthetic demonstration SOP.',
      scope: 'All Lumen demo clinical trials, starting with LMN-201 RePreve, at every investigator site and vendor. Excludes manufacturing deviations, which follow the GMP deviation procedure.',
      responsibilities: 'Site monitor (CRA): detects and reports a deviation within 2 working days. Clinical operations lead: classifies it and leads the investigation. QA lead: approves root cause and resolution and signs the close. Medical monitor: assesses impact on participant safety and the primary endpoint.',
      definitions: 'Protocol deviation: any departure from the approved protocol, including a visit outside its window. Major: may affect participant safety, rights or the reliability of primary endpoint data. Minor: neither.',
      procedure: '1. Record the deviation in the Quality deviation register the day it is confirmed. 2. Classify it and assess impact on the week-12 primary endpoint. 3. Investigate and record the root cause. 4. Record the resolution and send it for approval. 5. QA signs the close. 6. Raise a CAPA for every major deviation and for any deviation that recurs at a site.',
      references: 'ICH E6(R3) Good Clinical Practice; ICH E3 section 10.2; 21 CFR 312.60 and 312.62; LMN-201 RePreve protocol.',
      revision_history: 'v1.0: first issue for the LMN-201 RePreve programme (synthetic demo).',
    },
  },
  {
    key: 'coldchain', docNumber: 'LMN-SOP-202', name: 'SOP-202 Investigational Product Cold-Chain Shipment and Excursions', target: 'effective',
    body: {
      purpose: 'Defines how investigational product is shipped at 2–8 °C from the manufacturer to depots and sites, and how a temperature excursion is assessed, dispositioned and reported. Synthetic demonstration SOP.',
      scope: 'LMN-201 enteric capsule kits and any other refrigerated investigational product shipped for Lumen demo trials.',
      responsibilities: 'Supply chain lead: books qualified shippers and lanes. Courier: returns the data-logger file within 24 hours of delivery. QA lead: assesses every excursion, records the nonconformance and signs its disposition.',
      definitions: 'Excursion: any logged temperature outside 2–8 °C. Allowable excursion: one covered by stability data on file for the lot.',
      procedure: '1. Ship only in qualified shippers with a calibrated data logger. 2. On receipt, the depot reads the logger before releasing kits to stock. 3. On an excursion, quarantine the kits and record a nonconformance. 4. QA dispositions the kits against stability data. 5. Raise a CAPA when the shipper or lane caused the excursion.',
      references: '21 CFR 312.57; EU GMP Annex 13; WHO TRS 961 Annex 9; LMN201-DP stability protocol.',
      revision_history: 'v1.0: first issue (synthetic demo).',
    },
  },
  {
    key: 'tmf', docNumber: 'LMN-SOP-203', name: 'SOP-203 Trial Master File Management in the Vault', target: 'draft',
    body: {
      purpose: 'Defines how the Trial Master File is kept in the Vault: what is filed, by whom, how quickly, and how completeness is checked. Synthetic demonstration SOP.',
      scope: 'The sponsor TMF of every Lumen demo clinical trial, kept in the project Vault.',
      responsibilities: 'TMF owner: keeps the TMF index and runs the monthly completeness check. Document owners: file within 10 working days of finalisation. QA: audits the TMF at least yearly.',
      procedure: '1. File each essential document in the Vault against its TMF Reference Model artifact. 2. Complete the metadata before filing. 3. Run the completeness report monthly and resolve gaps within 30 days.',
      references: 'ICH E6(R3) Appendix C; TMF Reference Model v3.3; 21 CFR Part 11.',
    },
  },
];

/* ── Deviations: LMN-201 RePreve sites ───────────────────────────────────── */

export const DEVIATIONS = [
  {
    key: 'visit', number: 'LMN-DEV-2026-014', target: 'closed', detected: -34, targetClose: -4,
    title: 'Site 104: week-12 visit outside the protocol window (participant 104-007)',
    description: 'Participant 104-007 attended the week-12 visit 4 days after the ±3-day window closed. The primary endpoint assessment (sustained clinical cure at week 12) was performed late. ' + SYNTHETIC,
    deviationType: 'unplanned', classification: 'major', category: 'process', location: 'Site 104 (fictional investigator site)', productName: 'LMN-201 RePreve (Phase 2/3)',
    impactLevel: 'medium',
    immediateActions: 'Medical monitor assessed the late visit; no recurrence symptoms reported between day 84 and day 91. Data flagged for the estimand sensitivity analysis.',
    rootCause: 'The site scheduled visits from the randomisation date rather than the first dose date, and the EDC gave no warning before the window closed.',
    resolution: 'Site 104 coordinators retrained on the visit schedule; window calculation corrected; CAPA raised to add an EDC visit-window alert at every site.',
  },
  {
    key: 'sae', number: 'LMN-DEV-2026-015', target: 'under_investigation', detected: -18, targetClose: -3,
    title: 'Site 107: two serious adverse events reported to the sponsor after the 24-hour window',
    description: 'Two SAEs (hospitalisation for dehydration; fall with wrist fracture) reached the sponsor 3 and 5 days after site awareness. Found from the AE reporting-lag key risk indicator. ' + SYNTHETIC,
    deviationType: 'unplanned', classification: 'major', category: 'human_error', location: 'Site 107 (fictional investigator site)', productName: 'LMN-201 RePreve (Phase 2/3)',
    impactLevel: 'high',
    immediateActions: 'Both SAEs entered in the safety database and assessed for expedited reporting; triggered monitoring visit scheduled.',
  },
  {
    key: 'consent', number: 'LMN-DEV-2026-016', target: 'open', detected: -6, targetClose: 24,
    title: 'Site 102: participant re-consented on ICF version 3 eleven days after IRB approval',
    description: 'One participant continued study visits on ICF version 2 for eleven days after the central IRB approved version 3, which added the updated risk language. ' + SYNTHETIC,
    deviationType: 'unplanned', classification: 'minor', category: 'documentation', location: 'Site 102 (fictional investigator site)', productName: 'LMN-201 RePreve (Phase 2/3)',
  },
  {
    key: 'irt', number: 'LMN-DEV-2026-017', target: 'pending_approval', detected: -25, targetClose: 5,
    title: 'Site 105: kit dispensed before the screening toxin result was entered in the EDC',
    description: 'IRT dispensed a kit to participant 105-012 before the positive C. difficile toxin result was entered in the EDC. The result was positive and on file at the site lab; eligibility was met. ' + SYNTHETIC,
    deviationType: 'unplanned', classification: 'minor', category: 'process', location: 'Site 105 (fictional investigator site)', productName: 'LMN-201 RePreve (Phase 2/3)',
    impactLevel: 'low',
    immediateActions: 'Eligibility confirmed from the site lab report; EDC entry completed the same day.',
    rootCause: 'The IRT randomisation step did not require the EDC toxin field, so the site randomised from the paper lab report.',
    resolution: 'IRT configuration change requested to require the EDC toxin result before randomisation; site reminded of the eligibility sequence.',
  },
];

/* ── Nonconformances: drug product and its shipment ──────────────────────── */

export const NONCONFORMANCES = [
  {
    key: 'temp', number: 'LMN-NC-2026-009', source: 'supplier', product: 'LMN-201 enteric capsule kits', lot: 'LMN201-DP-2406',
    description: 'Temperature excursion in shipment: the data logger in shipper 7 of 12, from the fictional manufacturer to the EU depot, recorded up to 11.4 °C for 3 h 20 min (labelled 2–8 °C). 48 kits quarantined at the depot. ' + SYNTHETIC,
  },
  {
    key: 'label', number: 'LMN-NC-2026-007', source: 'in_process', product: 'LMN-201 enteric capsule kits', lot: 'LMN201-DP-2405',
    description: 'Kit labels on 40 kits printed with the expiry date as MM/YY instead of the approved DD-MMM-YYYY format; found at packaging line clearance. ' + SYNTHETIC,
    disposition: 'rework', rationale: 'Labels are over-labelled with the approved format under a second-person check; capsule quality is not affected.',
  },
  {
    key: 'water', number: 'LMN-NC-2026-008', source: 'final_inspection', product: 'LMN-201 enteric capsules, development sub-lot', lot: 'LMN201-DP-2404-D',
    description: 'Water content 8.4% w/w at release testing against the ≤ 8.0% w/w limit on a development sub-lot; not for clinical supply. ' + SYNTHETIC,
    disposition: 'scrap', rationale: 'Out of specification on a quality attribute linked to enteric coat integrity; the sub-lot is destroyed and was never released.',
  },
];

/* ── Suppliers (all fictional companies) ─────────────────────────────────── */

export const SUPPLIERS = [
  {
    key: 'cro', name: 'Larkmere Clinical Research', code: 'LMN-SUP-001', criticality: 'critical', standing: 'approved', reapproval: 320, lastAudit: -45, nextAudit: 135,
    scope: 'Full-service CRO for LMN-201 RePreve: site management, monitoring and TMF filing (fictional company).', iso: ['ISO 9001:2015'],
  },
  {
    key: 'lab', name: 'Thistlegate Central Laboratory', code: 'LMN-SUP-002', criticality: 'critical', standing: 'approved', reapproval: 200, lastAudit: -380, nextAudit: -16,
    scope: 'Central laboratory: C. difficile toxin testing, safety laboratory panels and sample kits (fictional company).', iso: ['ISO 15189:2022', 'CAP accredited'],
  },
  {
    key: 'cdmo', name: 'Corvane Biologics', code: 'LMN-SUP-003', criticality: 'critical', standing: 'approved', reapproval: 240, lastAudit: -70, nextAudit: 40,
    scope: 'Drug-product manufacturer (CDMO): LMN-201 enteric capsule filling, packaging, labelling and release (fictional company).', iso: ['EU GMP certificate'],
  },
  {
    key: 'courier', name: 'Glacierpath Logistics', code: 'LMN-SUP-004', criticality: 'critical', standing: 'conditional', reapproval: 60, lastAudit: -200, nextAudit: 10,
    scope: 'Cold-chain courier: 2–8 °C investigational product shipments from the manufacturer to depots and sites (fictional company).', iso: ['GDP certificate'],
  },
  {
    key: 'irt', name: 'Quorvex IRT Systems', code: 'LMN-SUP-005', criticality: 'major', standing: 'pending', reapproval: null, lastAudit: null, nextAudit: 25,
    scope: 'Interactive response technology: randomisation and IP supply management for RePreve (fictional company).', iso: [],
  },
];

export const SUPPLIER_REASON = {
  approved: 'Qualification audit and quality agreement on file; approved for LMN-201 clinical supply (demo seed, second signer).',
  conditional: 'Conditionally approved while the shipment excursion LMN-NC-2026-009 is investigated; requalification audit due (demo seed, second signer).',
};

/* ── Internal audits ─────────────────────────────────────────────────────── */

export const AUDITS = [
  {
    key: 'tmf', number: 'LMN-IA-2026-03', status: 'closed', planned: -40, started: -38, completed: -33, major: 1, minor: 3, obs: 2,
    standard: 'ICH E6(R3); 21 CFR Part 11; TMF Reference Model v3.3',
    scope: 'LMN-201 RePreve Trial Master File and Vault: TMF completeness against the reference model, filing timeliness, Vault metadata and audit-trail review. Synthetic demo audit.',
  },
  {
    key: 'supply', number: 'LMN-IA-2026-04', status: 'in_progress', planned: -9, started: -7, completed: null, major: 0, minor: 1, obs: 1,
    standard: '21 CFR 312.57; EU GMP Annex 13',
    scope: 'Investigational product supply chain: manufacturer release to depot, cold-chain shipping and IRT kit reconciliation. Synthetic demo audit.',
  },
  {
    key: 'safety', number: 'LMN-IA-2026-05', status: 'planned', planned: -6,
    standard: '21 CFR 312.32; ICH E2A',
    scope: 'Safety reporting: SAE intake at sites and expedited reporting timelines for LMN-201. Synthetic demo audit.',
  },
  {
    key: 'csv', number: 'LMN-IA-2027-01', status: 'planned', planned: 55,
    standard: '21 CFR Part 11; GAMP 5',
    scope: 'Computerised systems: EDC and IRT validation status, change records and periodic access reviews. Synthetic demo audit.',
  },
];

/* ── CAPAs (LMN-201), each raised from the record it names ───────────────── */

export const CAPAS = [
  {
    key: 'visit', from: { register: 'deviation', key: 'visit' }, target: 'action_planned', targetClose: 26,
    title: 'Visit-window control at investigator sites (from LMN-DEV-2026-014)', type: 'both', source: 'deviation', riskLevel: 'high',
    assignedTo: 'Mo Monitor, clinical operations (fictional)',
    problem: 'Site 104 performed the week-12 primary endpoint visit 4 days outside its window. Visits were scheduled from randomisation, not first dose, and the EDC gave no warning. Other sites use the same scheduling tool.',
    actions: [
      { type: 'corrective', state: 'done', due: -6, owner: 'Mo Monitor (CRA, fictional)', evidence: 'Site 104 retraining log, filed in the Vault (synthetic)',
        description: 'Retrain the Site 104 coordinators on the RePreve visit schedule and the ±3-day week-12 window; file the training record in the Vault.' },
      { type: 'preventive', state: 'in_progress', due: 12, owner: 'Clinical data manager (fictional)',
        description: 'Add an EDC alert that warns each RePreve site 5 days before the week-12 window closes.' },
      { type: 'document_change', state: 'planned', due: 20, owner: 'Quinn Quality, QA lead (fictional)',
        description: 'Revise LMN-SOP-201 so every monitoring visit checks upcoming visit windows (change control LMN-CC-2026-021).' },
    ],
  },
  {
    key: 'tmf', from: { register: 'audit', key: 'tmf' }, target: 'investigation', targetClose: 45,
    title: 'TMF filing timeliness and Vault metadata completeness (from LMN-IA-2026-03)', type: 'both', source: 'internal_audit', riskLevel: 'medium',
    assignedTo: 'Rhea Reviewer, TMF owner',
    problem: 'Internal audit LMN-IA-2026-03 found 23 essential documents filed late or missing from the RePreve TMF (major) and incomplete Vault metadata on monitoring visit reports (minor).',
    actions: [
      { type: 'corrective', state: 'planned', due: 14, owner: 'Rhea Reviewer, TMF owner',
        description: 'Reconcile the RePreve TMF index against the Vault and file the 23 documents found missing or late.' },
    ],
  },
  {
    key: 'ship', from: { register: 'nonconformance', key: 'temp' }, target: 'open', targetClose: -5,
    title: 'Cold-chain shipper qualification for 2–8 °C lanes (from LMN-NC-2026-009)', type: 'corrective', source: 'nonconformance', riskLevel: 'high',
    assignedTo: 'Quinn Quality, QA lead (fictional)',
    problem: 'Shipper 7 of 12 on the manufacturer-to-EU-depot lane reached 11.4 °C for 3 h 20 min. The courier has not yet returned its pack-out and logger records for the lane.',
    actions: [
      { type: 'containment', state: 'done', due: -12, owner: 'Supply chain lead (fictional)', evidence: 'Depot quarantine record, 48 kits (synthetic)',
        description: 'Quarantine the 48 affected kits of lot LMN201-DP-2406 at the depot pending disposition.' },
    ],
  },
  {
    key: 'kits', from: { register: 'supplier', key: 'lab' }, target: 'closed_effective', targetClose: -20,
    title: 'Central-lab sample kit expiry tracking at sites', type: 'preventive', source: 'supplier', riskLevel: 'low',
    assignedTo: 'Quinn Quality, QA lead (fictional)',
    problem: 'Two sites found expired central-lab sample kits on the shelf at a monitoring visit; neither was used.',
    effectiveness: 'No expired kit used at any of the eight RePreve sites across three monthly kit-expiry reports (synthetic).',
    actions: [
      { type: 'preventive', state: 'done', due: -45, owner: 'Thistlegate kit services (fictional)', evidence: 'Three monthly kit-expiry reports (synthetic)',
        description: 'Central lab sends a monthly kit-expiry report for every site; sites replace kits 30 days before expiry.' },
    ],
  },
];

/* ── Change control, linked to its SOP, deviation and CAPA ───────────────── */

export const CHANGE = {
  changeNumber: 'LMN-CC-2026-021',
  title: 'Revise SOP-201 and add an EDC visit-window check for RePreve sites',
  description: 'Revise LMN-SOP-201 so monitoring visits check upcoming visit windows, and add an EDC alert 5 days before the week-12 window closes. ' + SYNTHETIC,
  changeType: 'process', classification: 'minor', riskLevel: 'low',
  reason: 'Corrective and preventive action for deviation LMN-DEV-2026-014 (week-12 visit outside its window at Site 104).',
  impactAssessment: 'No protocol amendment needed; the EDC alert is a configuration change under the vendor change process; sites are retrained on the revised SOP.',
  implementationPlan: 'Draft SOP-201 v2.0; configure and test the EDC alert in UAT; release both together; retrain monitors and sites.',
  targetInDays: 20,
};

/* ── Management reviews ──────────────────────────────────────────────────── */

export const REVIEWS = [
  {
    key: 'q3', period: 'Lumen 2026-Q3', held: -24,
    summary: 'Quality system review for the LMN-201 RePreve programme: protocol deviations (Site 104 week-12 visit, Site 107 SAE reporting lag) and their CAPAs; TMF and Vault audit LMN-IA-2026-03 (1 major, 3 minor findings); shipment excursion LMN-NC-2026-009; supplier standing (courier conditional, central-lab audit falling due); change control; SOP training. Synthetic demo review.',
    decisions: 'Fund an EDC visit-window alert at every RePreve site. Keep the courier conditional until its excursion records and requalification audit are complete. Bring the central-lab audit forward. Clear the TMF filing backlog within 30 days.',
    actions: [
      { description: 'Configure the EDC visit-window alert for every RePreve site.', owner: 'Clinical data manager (fictional)', due: 12 },
      { description: 'Complete the courier requalification audit.', owner: 'Quinn Quality, QA lead (fictional)', due: -3 },
      { description: 'Bring the central-lab audit forward into Q4.', owner: 'Quinn Quality, QA lead (fictional)', due: -10, closeNote: 'Central-lab audit scheduled; supplier notified in writing (synthetic).' },
    ],
  },
  {
    key: 'q2', period: 'Lumen 2026-Q2', held: -115,
    summary: 'Quality system review before RePreve Part B: readiness of SOPs, vendor qualification of the CRO, central lab and manufacturer, and the internal audit plan for H2. Synthetic demo review.',
    decisions: 'Approve the H2 internal audit plan (TMF, IP supply chain, safety reporting). Qualify an IRT vendor before Part B resupply.',
    actions: [
      { description: 'Issue the H2 internal audit plan.', owner: 'Quinn Quality, QA lead (fictional)', due: -90, closeNote: 'Plan issued: LMN-IA-2026-03, -04 and -05 (synthetic).' },
    ],
  },
];
