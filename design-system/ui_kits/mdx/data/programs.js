(() => {
/**
 * Portfolio — ported from data/programs.ts. Same 14 programs, same shape.
 * Used by the harness so the rail/tabbar/topbar pickers have something live.
 */

const MDX_PROGRAMS = [
  { id: 'bx204', title: 'BX-204 Continuous Glucose Monitor', code: 'Class II · 510(k)', pathway: 'k510', stage: 'Substantial Equivalence',  stageIdx: 4, readiness: 72, status: 'active',  lead: 'Jordan Chen',     owners: ['JC','RA','SM'],      nextBlocker: 'Predicate K221847 performance data mismatch',         dueLabel: 'FDA filing · 41 days',      dueTone: 'warn', lastActivity: '2h ago',  meta: '7 predicates screened · 3 candidate · 1 selected' },
  { id: 'dx102', title: 'DX-102 IVD Cartridge',              code: 'Class II · De Novo', pathway: 'k510', stage: 'Performance Testing',      stageIdx: 3, readiness: 48, status: 'blocked', lead: 'Priya Shah',      owners: ['PS','LT'],           nextBlocker: 'Analytical sensitivity validation incomplete',        dueLabel: 'Pre-sub · 18 days',         dueTone: 'err',  lastActivity: '5h ago',  meta: '14 analytes · ISO 17511 traceability · 3 reader sites' },
  { id: 'cv330', title: 'CV-330 Implantable Monitor',        code: 'Class III · PMA',    pathway: 'pma',  stage: 'Pivotal Trial Enrollment', stageIdx: 5, readiness: 61, status: 'active',  lead: 'Marcus Webb',     owners: ['MW','JC','AK','RN'], nextBlocker: 'DSMB charter pending CRO sign-off',                   dueLabel: 'PMA filing · Q3 2026',      dueTone: 'ok',   lastActivity: '1d ago',  meta: '412 of 680 enrolled · 14 sites · 3 countries' },
  { id: 'iv415', title: 'IV-415 Companion Diagnostic',       code: 'Class III · PMA',    pathway: 'cer',  stage: 'Clinical Evaluation Report',stageIdx: 2, readiness: 34, status: 'blocked', lead: 'Ana Müller',      owners: ['AM','JC'],           nextBlocker: 'FAERS signal adjudication — 3 events under review',   dueLabel: 'EU MDR · notified body Q1', dueTone: 'warn', lastActivity: '3h ago',  meta: 'EU MDR Article 61 · 1,842 literature hits · 47 FAERS signals' },
  { id: 'or801', title: 'OR-801 Orthopedic Screw System',    code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Assemble eSTAR',           stageIdx: 5, readiness: 84, status: 'active',  lead: 'Sofia Marchetti', owners: ['SM','LT','JC'],      nextBlocker: 'Biocompatibility report pending supplier signature',  dueLabel: 'FDA filing · 22 days',      dueTone: 'warn', lastActivity: '30m ago', meta: '4 predicates · eSTAR 18/20 complete' },
  { id: 'nm512', title: 'NM-512 Neuromodulation Lead',       code: 'Class III · PMA',    pathway: 'pma',  stage: 'Manufacturing validation', stageIdx: 3, readiness: 55, status: 'active',  lead: 'Ravi Nair',       owners: ['RN','AK','MW'],      nextBlocker: 'QS audit finding 21 CFR 820.50 — supplier controls',  dueLabel: 'PMA filing · Q2 2027',      dueTone: 'ok',   lastActivity: '2d ago',  meta: 'QS Regulation · 3 facilities · 1 open finding' },
  { id: 'pm660', title: 'PM-660 Patient Monitor — software', code: 'Class II · SaMD',    pathway: 'k510', stage: 'Performance Testing',      stageIdx: 3, readiness: 67, status: 'active',  lead: 'Ana Müller',      owners: ['AM','RN'],           nextBlocker: 'Cybersecurity SBOM not final',                        dueLabel: 'FDA filing · 68 days',      dueTone: 'warn', lastActivity: '1h ago',  meta: 'IEC 62304 Class C · 11 CVEs under review' },
  { id: 'cv117', title: 'CV-117 ECG Patch',                  code: 'Class II · 510(k)',  pathway: 'k510', stage: 'Cleared',                  stageIdx: 7, readiness: 100,status: 'complete',lead: 'Marcus Webb',     owners: ['MW','AK'],           nextBlocker: null,                                                   dueLabel: 'Cleared · Feb 2026',        dueTone: 'ok',   lastActivity: '2w ago',  meta: 'K254481 · 87-day review cycle' },
];


// Window globals (kit harness only — codebase uses ESM imports)
window.MDX_PROGRAMS = MDX_PROGRAMS;

})();
