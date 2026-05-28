/**
 * Phase 7 · Clinical study management data.
 *
 * Ported from design-system/ui_kits/mdx/data/clinical.js.
 * Closed-enum values only — demo rows omitted for production.
 * Wire shape: GET /api/mdx/clinical/:programId
 */

import type { KitDocument, KitDocFramework } from '../components/DocumentsPanel';

export interface ClinKpi {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: 'ok' | 'warn' | 'err';
}

export interface ClinFunnelStage {
  stage: string;
  count: number;
  rate?: string;
}

export interface ClinSite {
  id: string;
  name: string;
  country: string;
  pi: string;
  status: 'active' | 'inactive' | 'pending';
  activated: string;
  enrolled: number;
  lastDeviation: string;
}

export interface ClinDeviation {
  id: string;
  site: string;
  subject: string;
  severity: 'major' | 'minor';
  kind: string;
  reported: string;
  state: 'open' | 'closed' | 'cro-review';
  summary: string;
}

export interface ClinAdjudication {
  id: string;
  subject: string;
  site: string;
  event: string;
  seriousness: 'sae' | 'non-sae';
  deviceRelated: 'likely' | 'no' | 'pending';
  reported: string;
  adjudicator: string;
  state: 'pending' | 'adjudicated';
}

export const CLIN_KPIS: ClinKpi[] = [
  { label: 'Subjects enrolled',  metric: '412', unit: '/680', meta: '61% of pivotal cohort · target Q1 2027',  tone: 'warn' },
  { label: 'Active sites',       metric: '14',  meta: '3 countries · 11 US / 2 EU / 1 UK',                     tone: 'ok' },
  { label: 'Open deviations',    metric: '6',   meta: '1 major · 5 minor · all under CRO review',              tone: 'warn' },
  { label: 'SAEs (cumulative)',  metric: '2',   meta: '1 device-related under adjudication · 1 unrelated' },
];

export const CLIN_FUNNEL: ClinFunnelStage[] = [
  { stage: 'Screened',         count: 781 },
  { stage: 'Consented',        count: 642 },
  { stage: 'Enrolled',         count: 412 },
  { stage: 'Active follow-up', count: 388 },
  { stage: 'Completed',        count: 124 },
  { stage: 'Withdrawn',        count: 24, rate: '5.8%' },
];

export const CLIN_SITES: ClinSite[] = [
  { id: 's-001', name: 'Mayo Clinic Rochester',          country: 'US', pi: 'Dr. K. Patel',    status: 'active', activated: '2024-09-12', enrolled: 68, lastDeviation: '14d ago'  },
  { id: 's-002', name: 'Cleveland Clinic',               country: 'US', pi: 'Dr. R. Sharma',   status: 'active', activated: '2024-09-22', enrolled: 54, lastDeviation: 'none'     },
  { id: 's-003', name: "Brigham & Women's Hospital",     country: 'US', pi: 'Dr. M. Chen',     status: 'active', activated: '2024-10-08', enrolled: 47, lastDeviation: '38d ago'  },
  { id: 's-004', name: 'Duke University Medical',        country: 'US', pi: 'Dr. T. Williams', status: 'active', activated: '2024-11-04', enrolled: 41, lastDeviation: '21d ago'  },
  { id: 's-005', name: 'Johns Hopkins',                  country: 'US', pi: 'Dr. N. Garcia',   status: 'active', activated: '2024-11-12', enrolled: 38, lastDeviation: '6d ago'   },
  { id: 's-006', name: 'UCSF Medical Center',            country: 'US', pi: 'Dr. L. Tanaka',   status: 'active', activated: '2024-12-01', enrolled: 35, lastDeviation: 'none'     },
  { id: 's-007', name: 'NYU Langone',                    country: 'US', pi: 'Dr. P. Roberts',  status: 'active', activated: '2024-12-15', enrolled: 28, lastDeviation: 'none'     },
  { id: 's-008', name: 'Stanford Health Care',           country: 'US', pi: 'Dr. A. Singh',    status: 'active', activated: '2025-01-08', enrolled: 24, lastDeviation: '11d ago'  },
  { id: 's-009', name: 'Mass General',                   country: 'US', pi: 'Dr. C. Ferreira', status: 'active', activated: '2025-01-22', enrolled: 22, lastDeviation: '4d ago'   },
  { id: 's-010', name: 'Columbia Presbyterian',           country: 'US', pi: 'Dr. S. Yoon',     status: 'active', activated: '2025-02-12', enrolled: 18, lastDeviation: 'none'     },
  { id: 's-011', name: 'Northwestern Memorial',          country: 'US', pi: 'Dr. J. Brown',    status: 'active', activated: '2025-03-04', enrolled: 12, lastDeviation: 'none'     },
  { id: 's-012', name: 'Charité — Universitätsmedizin', country: 'DE', pi: 'Dr. K. Müller',   status: 'active', activated: '2025-04-18', enrolled: 14, lastDeviation: '8d ago'   },
  { id: 's-013', name: 'Karolinska University Hospital', country: 'SE', pi: 'Dr. E. Lindberg', status: 'active', activated: '2025-06-02', enrolled: 7,  lastDeviation: 'none'     },
  { id: 's-014', name: 'Imperial College Healthcare',    country: 'UK', pi: 'Dr. R. Patel',    status: 'active', activated: '2025-07-22', enrolled: 4,  lastDeviation: 'none'     },
];

export const CLIN_DEVIATIONS: ClinDeviation[] = [
  { id: 'D-0042', site: 's-009', subject: 's-009-022', severity: 'major', kind: 'inclusion',  reported: '4d ago',  state: 'cro-review', summary: 'Subject enrolled outside age window (age 76, protocol 18–75)' },
  { id: 'D-0041', site: 's-005', subject: 's-005-038', severity: 'minor', kind: 'visit',      reported: '6d ago',  state: 'closed',     summary: 'Day-30 follow-up visit completed 4d outside ±3d window' },
  { id: 'D-0040', site: 's-008', subject: 's-008-019', severity: 'minor', kind: 'sample',     reported: '11d ago', state: 'closed',     summary: 'Plasma sample shipped at +6°C (target ≤+4°C) — confirmed assay stability' },
  { id: 'D-0039', site: 's-012', subject: 's-012-011', severity: 'minor', kind: 'consent',    reported: '8d ago',  state: 'cro-review', summary: 'Consent re-signed 1d after Amendment v2.1 effective date' },
  { id: 'D-0038', site: 's-001', subject: 's-001-061', severity: 'minor', kind: 'procedure',  reported: '14d ago', state: 'closed',     summary: 'Sensor positioning 2cm distal of protocol-specified site' },
  { id: 'D-0037', site: 's-004', subject: 's-004-027', severity: 'minor', kind: 'visit',      reported: '21d ago', state: 'closed',     summary: 'Day-90 visit completed via telehealth (protocol requires in-person)' },
];

export const CLIN_ADJUDICATION: ClinAdjudication[] = [
  { id: 'AE-0008', subject: 's-001-014', site: 's-001', event: 'Severe hypoglycemia (BG 38 mg/dL) at week 3 of wear',  seriousness: 'sae',     deviceRelated: 'pending', reported: '12d ago', adjudicator: 'panel-1', state: 'pending'     },
  { id: 'AE-0007', subject: 's-005-029', site: 's-005', event: 'Skin sensitization (Type IV) at sensor site',          seriousness: 'non-sae', deviceRelated: 'likely',  reported: '34d ago', adjudicator: 'panel-1', state: 'adjudicated' },
  { id: 'AE-0006', subject: 's-002-018', site: 's-002', event: 'Hospitalization for unrelated cardiac event',          seriousness: 'sae',     deviceRelated: 'no',      reported: '48d ago', adjudicator: 'panel-1', state: 'adjudicated' },
];

export const CLIN_DOC_FRAMEWORKS: KitDocFramework[] = [
  { id: 'protocol', label: 'Protocol',    desc: 'IRB-approved + amendments' },
  { id: 'sap',      label: 'SAP',         desc: 'Statistical Analysis Plan' },
  { id: 'csr',      label: 'CSR',         desc: 'Clinical Study Report' },
  { id: 'bimo',     label: 'BIMO',        desc: 'Bioresearch monitoring readiness' },
  { id: 'dsmb',     label: 'DSMB',        desc: 'Data Safety Monitoring Board' },
];

export const CLIN_DOCUMENTS: KitDocument[] = [
  { id: 'doc-clin-protocol', framework: 'protocol', type: 'Protocol — pivotal',      title: 'CV-330 pivotal trial protocol (CL-330-PIV-001)',                          ver: 'v3.2', status: 'locked', completion: 100, blocker: false, owner: 'MW', reviewers: ['JC', 'CRO-Camille'], lastEdit: '2024-08-12', esigRequired: true,  esigState: 'signed',  signedBy: 'MW · 2024-08-10', sections: 28, sectionsComplete: 28 },
  { id: 'doc-clin-amend',    framework: 'protocol', type: 'Protocol amendment',       title: 'CL-330-PIV-001 Amendment v2.1 — extended age window for cohort B',       ver: 'v2.1', status: 'review', completion: 92,  blocker: false, owner: 'MW', reviewers: ['JC'],               lastEdit: '2d ago',    esigRequired: true,  esigState: 'pending',              sections: 4,  sectionsComplete: 4  },
  { id: 'doc-clin-sap',      framework: 'sap',      type: 'Statistical Analysis Plan', title: 'CL-330-PIV-001 SAP v2.0 — primary + secondary endpoints',              ver: 'v2.0', status: 'review', completion: 88,  blocker: false, owner: 'RA', reviewers: ['MW'],               lastEdit: '8d ago',    esigRequired: true,  esigState: 'pending',              sections: 22, sectionsComplete: 20 },
  { id: 'doc-clin-dsmb',     framework: 'dsmb',     type: 'DSMB charter',              title: 'CV-330 DSMB charter v1.4',                                              ver: 'v1.4', status: 'draft',  completion: 42,  blocker: true,  owner: 'MW', reviewers: [],                   lastEdit: '5h ago',    esigRequired: true,  esigState: 'na',      blockerNote: 'CRO sign-off pending · interim analysis criteria still in debate', sections: 11, sectionsComplete: 5  },
  { id: 'doc-clin-bimo',     framework: 'bimo',     type: 'BIMO readiness pack',       title: 'BIMO inspection-readiness packet — CV-330',                              ver: 'v0.6', status: 'draft',  completion: 48,  blocker: false, owner: 'JC', reviewers: [],                   lastEdit: '1d ago',    esigRequired: false, esigState: 'na',                           sections: 14, sectionsComplete: 7  },
];
