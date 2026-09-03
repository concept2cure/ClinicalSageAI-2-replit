/**
 * Portfolio of active programs and aggregate health KPIs.
 * Ported verbatim from design-system/ui_kits/mdx/data.jsx.
 *
 * Status vocabulary: idle · active · blocked · complete (shared across the
 * stage strip, phase grid, and program chips). Pathway codes are orthogonal
 * to status — never use 'k510' / 'pma' / 'cer' as a status value.
 */

export type ProgramStatus = 'idle' | 'active' | 'blocked' | 'complete';
export type ProgramPathway = 'k510' | 'pma' | 'cer' | 'ivdr';
export type DueTone = 'ok' | 'warn' | 'err';

export interface Program {
  id: string;
  title: string;
  code: string;
  pathway: ProgramPathway;
  stage: string;
  stageIdx: number;
  readiness: number;
  status: ProgramStatus;
  lead: string;
  owners: string[];
  nextBlocker: string | null;
  dueLabel: string;
  dueTone: DueTone;
  lastActivity: string;
  meta: string;
  /**
   * The server's product_type ('device' | 'ivd' | …). Decides which FDA eSTAR
   * family a filing is produced on — the nIVD or the IVD template — so an IVD
   * program that files a 510(k) is never previewed or filled on the nIVD form.
   * Absent only on the kit's sample rows.
   */
  productType?: string;
}

export const MDX_PROGRAMS: Program[] = [
  { id: 'bx204', title: 'BX-204 Continuous Glucose Monitor', code: 'Class II · 510(k)', pathway: 'k510', stage: 'Substantial Equivalence',  stageIdx: 4, readiness: 72, status: 'active',  lead: 'Jordan Chen',     owners: ['JC','RA','SM'],      nextBlocker: 'Predicate K221847 performance data mismatch',         dueLabel: 'FDA filing · 41 days',      dueTone: 'warn', lastActivity: '2h ago',  meta: '7 predicates screened · 3 candidate · 1 selected', productType: 'device' },
  { id: 'dx102', title: 'DX-102 IVD Cartridge',              code: 'Class II · De Novo', pathway: 'k510', stage: 'Performance Testing',      stageIdx: 3, readiness: 48, status: 'blocked', lead: 'Priya Shah',      owners: ['PS','LT'],           nextBlocker: 'Analytical sensitivity validation incomplete',        dueLabel: 'Pre-sub · 18 days',         dueTone: 'err',  lastActivity: '5h ago',  meta: '14 analytes · ISO 17511 traceability · 3 reader sites', productType: 'ivd' },
  { id: 'cv330', title: 'CV-330 Implantable Monitor',        code: 'Class III · PMA',    pathway: 'pma',  stage: 'Pivotal Trial Enrollment', stageIdx: 5, readiness: 61, status: 'active',  lead: 'Marcus Webb',     owners: ['MW','JC','AK','RN'], nextBlocker: 'DSMB charter pending CRO sign-off',                   dueLabel: 'PMA filing · Q3 2026',      dueTone: 'ok',   lastActivity: '1d ago',  meta: '412 of 680 enrolled · 14 sites · 3 countries', productType: 'device' },
  { id: 'iv415', title: 'IV-415 Companion Diagnostic',       code: 'Class III · PMA',    pathway: 'cer',  stage: 'Clinical Evaluation Report',stageIdx: 2, readiness: 34, status: 'blocked', lead: 'Ana Müller',      owners: ['AM','JC'],           nextBlocker: 'FAERS signal adjudication — 3 events under review',   dueLabel: 'EU MDR · notified body Q1', dueTone: 'warn', lastActivity: '3h ago',  meta: 'EU MDR Article 61 · 1,842 literature hits · 47 FAERS signals', productType: 'ivd' },
  { id: 'or801', title: 'OR-801 Orthopedic Screw System',    code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Assemble eSTAR',           stageIdx: 5, readiness: 84, status: 'active',  lead: 'Sofia Marchetti', owners: ['SM','LT','JC'],      nextBlocker: 'Biocompatibility report pending supplier signature',  dueLabel: 'FDA filing · 22 days',      dueTone: 'warn', lastActivity: '30m ago', meta: '4 predicates · eSTAR 18/20 complete', productType: 'device' },
  { id: 'nm512', title: 'NM-512 Neuromodulation Lead',       code: 'Class III · PMA',    pathway: 'pma',  stage: 'Manufacturing validation', stageIdx: 3, readiness: 55, status: 'active',  lead: 'Ravi Nair',       owners: ['RN','AK','MW'],      nextBlocker: 'QS audit finding 21 CFR 820.50 — supplier controls',  dueLabel: 'PMA filing · Q2 2027',      dueTone: 'ok',   lastActivity: '2d ago',  meta: 'QS Regulation · 3 facilities · 1 open finding', productType: 'device' },
  { id: 'rx340', title: 'RX-340 Surgical Stapler',           code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Predicate search',         stageIdx: 2, readiness: 28, status: 'active',  lead: 'Linh Tran',       owners: ['LT','PS'],           nextBlocker: 'Identify viable K-numbers with comparable firing force', dueLabel: 'FDA filing · Q4 2026',     dueTone: 'ok',   lastActivity: '4h ago',  meta: '18 candidates · 2 strong matches so far', productType: 'device' },
  { id: 'dx221', title: 'DX-221 Point-of-care Hematology',   code: 'Class II · De Novo', pathway: 'k510', stage: 'Classify',                 stageIdx: 1, readiness: 12, status: 'idle',    lead: 'Priya Shah',      owners: ['PS'],                nextBlocker: 'Intended-use statement pending clinical review',      dueLabel: 'Pre-sub · Q1 2026',         dueTone: 'ok',   lastActivity: '6d ago',  meta: 'Product code confirmed · De Novo pathway selected', productType: 'ivd' },
  { id: 'pm660', title: 'PM-660 Patient Monitor — software', code: 'Class II · SaMD',    pathway: 'k510', stage: 'Performance Testing',      stageIdx: 3, readiness: 67, status: 'active',  lead: 'Ana Müller',      owners: ['AM','RN'],           nextBlocker: 'Cybersecurity SBOM not final',                        dueLabel: 'FDA filing · 68 days',      dueTone: 'warn', lastActivity: '1h ago',  meta: 'IEC 62304 Class C · 11 CVEs under review', productType: 'device' },
  { id: 'cv410', title: 'CV-410 Catheter — Lead extension',  code: 'Class III · PMA-S',  pathway: 'pma',  stage: 'Labeling',                 stageIdx: 5, readiness: 78, status: 'active',  lead: 'Marcus Webb',     owners: ['MW','SM'],           nextBlocker: 'MRI-conditional statement language with notified body', dueLabel: 'PMA-S · 95 days',         dueTone: 'warn', lastActivity: '8h ago',  meta: 'Supplement to CV-330 · labeling v2.4', productType: 'device' },
  { id: 'iv208', title: 'IV-208 Tumor Marker Assay',         code: 'Class III · PMA',    pathway: 'cer',  stage: 'Clinical data summary',    stageIdx: 3, readiness: 51, status: 'active',  lead: 'Jordan Chen',     owners: ['JC','AM','RA'],      nextBlocker: 'Real-world evidence from 2 EU registries pending',    dueLabel: 'EU MDR · Q2 2026',          dueTone: 'ok',   lastActivity: '5h ago',  meta: 'Article 61 · 2,104 literature hits', productType: 'ivd' },
  { id: 'or902', title: 'OR-902 Spinal Implant',             code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Submit',                   stageIdx: 6, readiness: 98, status: 'active',  lead: 'Sofia Marchetti', owners: ['SM','LT'],           nextBlocker: 'Final cover-letter sign-off',                         dueLabel: 'FDA filing · 4 days',       dueTone: 'warn', lastActivity: '22m ago', meta: 'eSTAR validated · all 20 sections pass', productType: 'device' },
  { id: 'nm240', title: 'NM-240 DBS Programmer',             code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Intake',                   stageIdx: 0, readiness: 4,  status: 'idle',    lead: 'Ravi Nair',       owners: ['RN'],                nextBlocker: 'Device specification pending engineering sign-off',   dueLabel: 'Pre-sub · Q2 2026',         dueTone: 'ok',   lastActivity: '1w ago',  meta: 'Kick-off pending', productType: 'device' },
  { id: 'cv117', title: 'CV-117 ECG Patch',                  code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Cleared',                  stageIdx: 7, readiness: 100,status: 'complete',lead: 'Marcus Webb',     owners: ['MW','AK'],           nextBlocker: null,                                                   dueLabel: 'Cleared · Feb 2026',        dueTone: 'ok',   lastActivity: '2w ago',  meta: 'K254481 · 87-day review cycle', productType: 'device' },
];

export interface HealthKpi {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: DueTone };
  meta: string;
  tone?: DueTone;
}

export const MDX_HEALTH: HealthKpi[] = [
  { label: 'Active programs',   metric: '14', meta: '9 510(k) · 4 PMA · 1 cleared' },
  { label: 'Average readiness', metric: '56', unit: '%', bar: { pct: 56, tone: 'warn' }, meta: 'Down 3 pts vs last week' },
  { label: 'FDA review cycle',  metric: '87', unit: 'd', meta: 'Current cohort · median' },
  { label: 'Blockers open',     metric: '4',  meta: '2 DX-102 · 1 IV-415 · 1 NM-512', tone: 'err' },
];
