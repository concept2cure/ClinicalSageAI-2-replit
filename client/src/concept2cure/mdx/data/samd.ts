/**
 * Phase 7 · IEC 62304 SaMD workspace data.
 *
 * Ported from design-system/ui_kits/mdx/data/samd.js.
 * Closed-enum values only — demo rows omitted for production.
 * Wire shape: GET /api/mdx/samd/:programId
 */

import type { KitDocument, KitDocFramework } from '../components/DocumentsPanel';

export interface SamdKpi {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: 'ok' | 'warn' | 'err';
}

export interface SamdClass {
  id: 'A' | 'B' | 'C';
  label: string;
  desc: string;
}

export interface SamdReq {
  id: string;
  label: string;
  linkedSds: string;
  tests: string[];
  coverage: 'full' | 'partial' | 'none';
  anomalies: number;
}

export interface SamdOts {
  id: string;
  name: string;
  version: string;
  license: string;
  state: 'qualified' | 'review' | 'rejected';
  cves: number;
  lastReview: string;
}

export interface SamdAnomaly {
  id: string;
  kind: 'must-fix' | 'deferred';
  sr: string;
  title: string;
  found: string;
  age: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SamdPccp {
  enabled: boolean;
  modelType: string;
  scope: string;
  validation: string;
  changeFramework: string;
  lastDeployed: string;
  nextReview: string;
}

export const SAMD_KPIS: SamdKpi[] = [
  { label: 'Safety class',          metric: 'C',   meta: 'IEC 62304 §4.3 — death/serious injury possible', tone: 'err'  },
  { label: 'V&V coverage',          metric: '76',  unit: '%', meta: '218 of 287 reqs traced to test',     tone: 'warn' },
  { label: 'Unresolved anomalies',  metric: '11',  meta: '4 must-fix · 7 deferred to next release',       tone: 'warn' },
  { label: 'SBOM components',       metric: '142', meta: '11 with open CVEs · SBOM updated 1h ago' },
];

export const SAMD_CLASSES: SamdClass[] = [
  { id: 'A', label: 'Class A', desc: 'No injury or damage to health is possible' },
  { id: 'B', label: 'Class B', desc: 'Non-serious injury is possible' },
  { id: 'C', label: 'Class C', desc: 'Death or serious injury is possible' },
];

export const SAMD_REQS: SamdReq[] = [
  { id: 'SR-0011', label: 'Sensor reading accuracy within ±10 mg/dL of YSI', linkedSds: 'SDS-3.1', tests: ['UT-018', 'IT-007', 'ST-002'], coverage: 'full',    anomalies: 0 },
  { id: 'SR-0012', label: 'Algorithm hysteresis on rapid-drop',               linkedSds: 'SDS-3.2', tests: ['UT-027', 'IT-014'],           coverage: 'partial', anomalies: 2 },
  { id: 'SR-0013', label: 'BLE pairing must use AES-128-GCM',                 linkedSds: 'SDS-7.1', tests: ['IT-029', 'ST-011'],           coverage: 'full',    anomalies: 0 },
  { id: 'SR-0014', label: 'Low-battery alert at 15% remaining capacity',      linkedSds: 'SDS-4.2', tests: ['UT-042'],                      coverage: 'partial', anomalies: 1 },
  { id: 'SR-0015', label: 'Sunlight readability ≥ 400 nit display',           linkedSds: 'SDS-5.3', tests: [],                              coverage: 'none',    anomalies: 0 },
  { id: 'SR-0016', label: 'OTA firmware update integrity verification',       linkedSds: 'SDS-7.4', tests: ['ST-022'],                      coverage: 'partial', anomalies: 1 },
];

export const SAMD_OTS: SamdOts[] = [
  { id: 'ots-001', name: 'Zephyr RTOS',          version: '3.5.0',  license: 'Apache-2.0', state: 'qualified', cves: 0, lastReview: '2026-04-22' },
  { id: 'ots-002', name: 'mbedTLS',              version: '3.5.2',  license: 'Apache-2.0', state: 'qualified', cves: 0, lastReview: '2026-04-22' },
  { id: 'ots-003', name: 'Bluetooth controller', version: '5.3-c1', license: 'commercial', state: 'qualified', cves: 1, lastReview: '2026-03-18' },
  { id: 'ots-004', name: 'lwIP',                 version: '2.1.3',  license: 'BSD-3',      state: 'review',    cves: 2, lastReview: '2026-04-30' },
  { id: 'ots-005', name: 'CMSIS-DSP',            version: '5.9.0',  license: 'Apache-2.0', state: 'qualified', cves: 0, lastReview: '2026-04-22' },
];

export const SAMD_ANOMALIES: SamdAnomaly[] = [
  { id: 'A-2241', kind: 'must-fix', sr: 'SR-0012', title: 'False-low alarm at rapid-drop > 4 mg/dL/min',            found: 'IT-014', age: '6d',  severity: 'high'   },
  { id: 'A-2240', kind: 'must-fix', sr: 'SR-0012', title: 'Hysteresis dwell window does not clamp on noisy input',  found: 'UT-027', age: '8d',  severity: 'high'   },
  { id: 'A-2239', kind: 'must-fix', sr: 'SR-0014', title: 'Low-battery alert fires at 12% not 15% in cold (5°C)',   found: 'UT-042', age: '11d', severity: 'medium' },
  { id: 'A-2238', kind: 'must-fix', sr: 'SR-0016', title: 'OTA signature check accepts 1-bit corruption variant',   found: 'ST-022', age: '4d',  severity: 'high'   },
  { id: 'A-2233', kind: 'deferred', sr: 'SR-0011', title: 'Edge-case rounding at 39.5 mg/dL — display reads 40',    found: 'UT-018', age: '21d', severity: 'low'    },
];

export const SAMD_PCCP: SamdPccp = {
  enabled: true,
  modelType: 'Adaptive threshold + ensemble classifier',
  scope: 'Algorithm update for rapid-drop hysteresis tuning + alarm threshold within ±5% of validated baseline',
  validation: '500-subject hold-out cohort · re-run on every release · gate at sens > 92% AND alarm rate < 1/wk',
  changeFramework: 'Each adaptive update logged + auto-verified against gate · monthly summary to FDA',
  lastDeployed: '2026-04-30',
  nextReview: '2026-07-30',
};

export const SAMD_DOC_FRAMEWORKS: KitDocFramework[] = [
  { id: 'srs',   label: 'SRS',           desc: 'Software requirements (IEC 62304 §5.2)' },
  { id: 'sds',   label: 'SDS',           desc: 'Software design (§5.4 — Class C only)' },
  { id: 'vv',    label: 'V&V',           desc: 'Verification + validation (§5.6, §5.7)' },
  { id: 'cyber', label: 'Cybersecurity', desc: 'SBOM + threat model + FDA 2023' },
  { id: 'pccp',  label: 'PCCP',          desc: 'AI/ML Predetermined Change Control Plan' },
];

export const SAMD_DOCUMENTS: KitDocument[] = [
  { id: 'doc-samd-srs',   framework: 'srs',   type: 'Software Requirements Specification', title: 'BX-204 firmware 4.1 — SRS (Class C)',          ver: 'v1.3', status: 'review',  completion: 88, blocker: false, owner: 'PS', reviewers: ['AK'],       lastEdit: '1d ago', esigRequired: true,  esigState: 'pending',              sections: 48, sectionsComplete: 42 },
  { id: 'doc-samd-sds',   framework: 'sds',   type: 'Software Design Specification',       title: "BX-204 firmware 4.1 — SDS (Class C req'd)",    ver: 'v0.8', status: 'draft',   completion: 64, blocker: true,  owner: 'PS', reviewers: [],            lastEdit: '4h ago', esigRequired: true,  esigState: 'na',      blockerNote: 'SDS-3.2 algorithm-design section pending CAPA-0216 closure', sections: 32, sectionsComplete: 20 },
  { id: 'doc-samd-vv',    framework: 'vv',    type: 'V&V package',                          title: 'BX-204 firmware 4.1 — V&V package',            ver: 'v0.9', status: 'review',  completion: 71, blocker: false, owner: 'PS', reviewers: ['AK'],       lastEdit: '3h ago', esigRequired: true,  esigState: 'pending',              sections: 32, sectionsComplete: 23 },
  { id: 'doc-samd-cyber', framework: 'cyber', type: 'Cybersecurity package',                title: 'BX-204 cybersecurity — threat model + SBOM',   ver: 'v1.6', status: 'review',  completion: 90, blocker: false, owner: 'PS', reviewers: ['AK', 'JC'], lastEdit: '4h ago', esigRequired: true,  esigState: 'pending',              sections: 5,  sectionsComplete: 5  },
  { id: 'doc-samd-pccp',  framework: 'pccp',  type: 'Predetermined Change Control Plan',    title: 'BX-204 PCCP — adaptive threshold algorithm',   ver: 'v0.6', status: 'draft',   completion: 48, blocker: false, owner: 'PS', reviewers: ['AK'],       lastEdit: '6h ago', esigRequired: true,  esigState: 'na',                   sections: 8,  sectionsComplete: 4  },
];
