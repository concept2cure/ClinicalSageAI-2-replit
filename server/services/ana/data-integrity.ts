/**
 * Data-integrity / 21 CFR Part 11 advisor for AnA.
 *
 * Encodes the ALCOA+ data-integrity principles, the core 21 CFR Part 11
 * requirements for electronic records & signatures (and the EU Annex 11
 * counterparts), and a free-text gap check that maps a described control to the
 * principle it satisfies / flags what is missing. Lets AnA QC a GxP system or
 * process description for data-integrity coverage.
 *
 * Deterministic, dependency-free, data-driven. Advisory — formal CSV/Part 11
 * assessment and QA approval are authoritative.
 *
 * @module server/services/ana/data-integrity
 */

export interface AlcoaPrinciple {
  id: string;
  label: string;
  definition: string;
  /** lowercase cues that indicate this principle is addressed */
  cues: string[];
}

export interface Part11Requirement {
  id: string;
  label: string;
  basis: string;
  points: string[];
  aliases?: string[];
}

const ALCOA: AlcoaPrinciple[] = [
  { id: 'attributable', label: 'Attributable', definition: 'Who performed an action and when — traceable to an individual.', cues: ['unique user', 'login', 'user id', 'attributable', 'who performed', 'authentication', 'identity'] },
  { id: 'legible', label: 'Legible', definition: 'Records are readable and permanent throughout the retention period.', cues: ['legible', 'readable', 'human-readable', 'durable', 'permanent'] },
  { id: 'contemporaneous', label: 'Contemporaneous', definition: 'Recorded at the time the activity is performed.', cues: ['timestamp', 'real-time', 'at the time', 'contemporaneous', 'time-stamped', 'date and time'] },
  { id: 'original', label: 'Original', definition: 'The original record (or a certified true copy) is preserved.', cues: ['original record', 'source data', 'certified copy', 'true copy', 'raw data'] },
  { id: 'accurate', label: 'Accurate', definition: 'Free from errors; reflects what actually happened; validated.', cues: ['accurate', 'validated', 'verification', 'reconcil', 'error-free', 'qc check'] },
  // ALCOA "plus":
  { id: 'complete', label: 'Complete', definition: 'All data including repeats, reanalyses, and metadata are retained.', cues: ['complete', 'all data', 'metadata', 'no deletion', 'repeat', 'full record'] },
  { id: 'consistent', label: 'Consistent', definition: 'Data are sequenced/dated consistently across the record.', cues: ['consistent', 'chronolog', 'sequence', 'date order'] },
  { id: 'enduring', label: 'Enduring', definition: 'Recorded on durable, retained media for the required period.', cues: ['retention', 'archive', 'enduring', 'backup', 'preserved for'] },
  { id: 'available', label: 'Available', definition: 'Retrievable for review/audit throughout the lifecycle.', cues: ['available', 'retrievable', 'accessible', 'on request', 'for audit', 'retrieval'] },
];

const PART11: Part11Requirement[] = [
  {
    id: 'audit_trail',
    label: 'Secure, computer-generated audit trails',
    basis: '21 CFR 11.10(e); EU Annex 11 §9',
    points: [
      'Automatically record who, what, when (and old/new value) for create/modify/delete of records.',
      'Audit trail is secure, time-stamped, and CANNOT be edited or disabled by users.',
      'Audit trails are available for review (audit-trail review is itself a documented process).',
    ],
    aliases: ['audit trail', 'audit', 'change history'],
  },
  {
    id: 'access_control',
    label: 'Access control & authority checks',
    basis: '21 CFR 11.10(d),(g); Annex 11 §12',
    points: [
      'Limit system access to authorized individuals; unique user IDs (no shared accounts).',
      'Role-based authority checks so only permitted users perform a given operation.',
      'Password/credential controls and automatic logoff.',
    ],
    aliases: ['access control', 'authority check', 'rbac', 'permissions'],
  },
  {
    id: 'esignature',
    label: 'Electronic signatures',
    basis: '21 CFR 11.50, 11.70, 11.100–11.300',
    points: [
      'Signed records show the printed name, date/time, and meaning of the signature (e.g., review, approval).',
      'E-signatures are linked to their records so they cannot be excised/copied/transferred.',
      'Each e-signature is unique to one individual and not reused/reassigned.',
    ],
    aliases: ['electronic signature', 'e-signature', 'esign', 'sign-off'],
  },
  {
    id: 'validation',
    label: 'Computerized-system validation (CSV)',
    basis: '21 CFR 11.10(a); GAMP 5; Annex 11 §4',
    points: [
      'Validate the system to ensure accuracy, reliability, consistent intended performance.',
      'Risk-based lifecycle (URS → functional/design → IQ/OQ/PQ → change control).',
      'Ability to discern invalid/altered records.',
    ],
    aliases: ['validation', 'csv', 'gamp', 'iq oq pq'],
  },
  {
    id: 'copies_retention',
    label: 'Accurate copies & record retention',
    basis: '21 CFR 11.10(b),(c)',
    points: [
      'Generate accurate and complete copies in human-readable and electronic form for inspection.',
      'Protect records to enable accurate/ready retrieval throughout the retention period.',
    ],
    aliases: ['copies', 'retention', 'archival', 'data retention'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findRequirement(key?: string): Part11Requirement | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    PART11.find(r => r.id === k) ||
    PART11.find(r => r.aliases?.some(a => a.toLowerCase() === k)) ||
    PART11.find(r => r.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(r.id))
  );
}

export interface DataIntegrityGapResult {
  addressed: { id: string; label: string }[];
  gaps: { id: string; label: string; definition: string }[];
  coverageScore: number; // % of ALCOA+ principles addressed
  brief: string;
}

/** Check a free-text system/process description against the ALCOA+ principles. */
export function checkDataIntegrity(description: string): DataIntegrityGapResult {
  const lc = (description || '').toLowerCase();
  const addressed: { id: string; label: string }[] = [];
  const gaps: { id: string; label: string; definition: string }[] = [];
  for (const p of ALCOA) {
    if (p.cues.some(c => lc.includes(c))) addressed.push({ id: p.id, label: p.label });
    else gaps.push({ id: p.id, label: p.label, definition: p.definition });
  }
  const coverageScore = Math.round((addressed.length / ALCOA.length) * 100);

  const parts: string[] = [];
  parts.push(`# Data-integrity (ALCOA+) check — ${coverageScore}% of principles addressed`);
  parts.push('\n_Cue-based and advisory; formal CSV/Part 11 assessment and QA approval are authoritative._');
  parts.push(bullets('Principles NOT evidenced (address or confirm)', gaps.map(g => `${g.label} — ${g.definition}`)));
  parts.push(bullets('Principles evidenced', addressed.map(a => a.label)));
  return { addressed, gaps, coverageScore, brief: parts.filter(Boolean).join('\n') };
}

export interface DataIntegrityQuery {
  requirement?: string;
  description?: string; // for a gap check
}

export interface DataIntegrityResult {
  resolved: { requirement: string | null };
  requirement: Part11Requirement | null;
  gapCheck: DataIntegrityGapResult | null;
  brief: string;
}

export function listDataIntegrity() {
  return {
    alcoa: ALCOA.map(a => ({ id: a.id, label: a.label })),
    part11: PART11.map(r => ({ id: r.id, label: r.label, basis: r.basis })),
  };
}

export function adviseDataIntegrity(q: DataIntegrityQuery): DataIntegrityResult {
  const requirement = findRequirement(q.requirement) ?? null;
  const gapCheck = q.description ? checkDataIntegrity(q.description) : null;
  const parts: string[] = [];

  if (requirement) {
    parts.push(`# 21 CFR Part 11: ${requirement.label}`);
    parts.push(`\n**Basis.** ${requirement.basis}`);
    parts.push(bullets('Requirements', requirement.points));
  } else if (!gapCheck) {
    parts.push('# Data integrity — ALCOA+ & 21 CFR Part 11');
    parts.push(bullets('ALCOA+ principles', ALCOA.map(a => `${a.label}: ${a.definition}`)));
    parts.push('\n## Part 11 control areas');
    for (const r of PART11) parts.push(`- **${r.label}** _(${r.basis})_`);
  }

  if (gapCheck) parts.push('\n' + gapCheck.brief);

  parts.push(
    '\n## Note\nAdvisory only — formal computerized-system validation (CSV/GAMP 5) and QA approval are ' +
      'authoritative. Governed mutations should carry a reason-for-change and an immutable audit trail.'
  );

  return { resolved: { requirement: requirement?.id ?? null }, requirement, gapCheck, brief: parts.filter(Boolean).join('\n') };
}
