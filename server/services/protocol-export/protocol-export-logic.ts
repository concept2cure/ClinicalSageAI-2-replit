/**
 * Protocol Export & ClinicalTrials.gov registration draft — deterministic logic
 * (Capability C2C-20c)
 *
 * Pure, DB-free, LLM-free: assemble a protocol document (sections + objectives +
 * eligibility + schedule of assessments) into an ordered export model, render it to
 * Markdown, and map it to the ClinicalTrials.gov PRS registration data elements
 * (FDAAA 801 / 42 CFR 11) with completeness findings.
 *
 * @module server/services/protocol-export/protocol-export-logic
 */

export const FDAAA_801 = 'FDAAA 801 / 42 CFR Part 11 — ClinicalTrials.gov registration data elements';

export interface ExportDoc {
  title: string;
  protocolNumber?: string | null;
  protocolKind?: string | null;
  designType?: string | null;
  phase?: string | null;
  version?: string | null;
  synopsis?: string | null;
}
export interface ExportSection { sectionKey: string; title: string; content?: string | null; orderIndex?: number }
export interface ExportObjective { objectiveType: string; objective: string; endpoint?: string | null; timepoint?: string | null }
export interface ExportCriterion { kind: string; criterion: string }
export interface ExportVisit { visitName: string; timepoint?: string | null; procedures?: string[] | null }

export interface AssembledProtocol {
  title: string;
  header: { protocolNumber: string | null; kind: string | null; designType: string | null; phase: string | null; version: string | null };
  synopsis: string | null;
  objectives: ExportObjective[];
  eligibility: { inclusion: string[]; exclusion: string[] };
  schedule: ExportVisit[];
  sections: Array<{ sectionKey: string; title: string; content: string | null }>;
}

/** Assemble the document parts into an ordered export model. Pure. */
export function assembleProtocolExport(
  doc: ExportDoc,
  sections: ExportSection[],
  objectives: ExportObjective[],
  eligibility: ExportCriterion[],
  visits: ExportVisit[],
): AssembledProtocol {
  return {
    title: doc.title,
    header: { protocolNumber: doc.protocolNumber ?? null, kind: doc.protocolKind ?? null, designType: doc.designType ?? null, phase: doc.phase ?? null, version: doc.version ?? null },
    synopsis: doc.synopsis ?? null,
    objectives,
    eligibility: {
      inclusion: eligibility.filter((e) => e.kind === 'inclusion').map((e) => e.criterion),
      exclusion: eligibility.filter((e) => e.kind === 'exclusion').map((e) => e.criterion),
    },
    schedule: [...visits],
    sections: [...sections]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((s) => ({ sectionKey: s.sectionKey, title: s.title, content: s.content ?? null })),
  };
}

/** Render an assembled protocol to Markdown. Pure, deterministic. */
export function renderProtocolMarkdown(p: AssembledProtocol): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  const h = p.header;
  const meta = [h.protocolNumber && `Protocol ${h.protocolNumber}`, h.version && `v${h.version}`, h.phase, h.designType].filter(Boolean).join(' · ');
  if (meta) lines.push(`_${meta}_`);
  if (p.synopsis) { lines.push('', '## Synopsis', p.synopsis); }
  if (p.objectives.length) {
    lines.push('', '## Objectives & Endpoints');
    for (const o of p.objectives) lines.push(`- **${o.objectiveType}:** ${o.objective}${o.endpoint ? ` — _Endpoint:_ ${o.endpoint}` : ''}${o.timepoint ? ` (${o.timepoint})` : ''}`);
  }
  if (p.eligibility.inclusion.length || p.eligibility.exclusion.length) {
    lines.push('', '## Eligibility');
    if (p.eligibility.inclusion.length) { lines.push('**Inclusion:**'); p.eligibility.inclusion.forEach((c) => lines.push(`- ${c}`)); }
    if (p.eligibility.exclusion.length) { lines.push('**Exclusion:**'); p.eligibility.exclusion.forEach((c) => lines.push(`- ${c}`)); }
  }
  if (p.schedule.length) {
    lines.push('', '## Schedule of Assessments');
    for (const v of p.schedule) lines.push(`- **${v.visitName}**${v.timepoint ? ` (${v.timepoint})` : ''}${v.procedures && v.procedures.length ? `: ${v.procedures.join(', ')}` : ''}`);
  }
  for (const s of p.sections) { lines.push('', `## ${s.title}`, s.content ?? '_[to be completed]_'); }
  return lines.join('\n');
}

// ─── ClinicalTrials.gov PRS registration draft ───────────────────────────────

export interface CtGovDraft {
  briefTitle: string;
  officialTitle: string;
  studyType: string;
  phase: string | null;
  primaryOutcomes: Array<{ measure: string; timeFrame: string | null }>;
  secondaryOutcomes: Array<{ measure: string; timeFrame: string | null }>;
  eligibilityCriteria: { inclusion: string[]; exclusion: string[] };
  completeness: { ready: boolean; findings: string[]; basis: string };
}

/** Map an assembled protocol to the ClinicalTrials.gov PRS data elements (FDAAA 801). Pure. */
export function buildCtGovRegistrationDraft(p: AssembledProtocol): CtGovDraft {
  const primary = p.objectives.filter((o) => o.objectiveType === 'primary');
  const secondary = p.objectives.filter((o) => o.objectiveType === 'secondary');
  const studyType = (p.header.kind === 'clinical' && p.header.designType === 'observational') ? 'Observational' : p.header.kind === 'clinical' ? 'Interventional' : 'Other';

  const findings: string[] = [];
  if (primary.length === 0) findings.push('No primary outcome measure (a primary outcome is required for registration).');
  if (primary.some((o) => !o.endpoint)) findings.push('A primary objective is missing its endpoint/outcome measure.');
  if (p.eligibility.inclusion.length === 0) findings.push('No inclusion criteria.');
  if (!p.synopsis) findings.push('No synopsis/brief summary.');

  return {
    briefTitle: p.title,
    officialTitle: p.title,
    studyType,
    phase: p.header.phase ?? null,
    primaryOutcomes: primary.map((o) => ({ measure: o.endpoint || o.objective, timeFrame: o.timepoint ?? null })),
    secondaryOutcomes: secondary.map((o) => ({ measure: o.endpoint || o.objective, timeFrame: o.timepoint ?? null })),
    eligibilityCriteria: p.eligibility,
    completeness: { ready: findings.length === 0, findings, basis: FDAAA_801 },
  };
}
