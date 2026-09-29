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

import type { PdevSignatureFacet } from '../protocol-development/protocol-signature-manifestation';

export const FDAAA_801 = 'FDAAA 801 / 42 CFR Part 11 — ClinicalTrials.gov registration data elements';

export interface ExportDoc {
  title: string;
  protocolNumber?: string | null;
  protocolKind?: string | null;
  designType?: string | null;
  phase?: string | null;
  version?: string | null;
  synopsis?: string | null;
  /** protocol_documents.status. */
  status?: string | null;
  /** The finalization signature as the signature row records it. Absent means not read. */
  finalization?: PdevSignatureFacet;
}
export interface ExportSection { sectionKey: string; title: string; content?: string | null; orderIndex?: number }
export interface ExportObjective { objectiveType: string; objective: string; endpoint?: string | null; timepoint?: string | null }
export interface ExportCriterion { kind: string; criterion: string }
export interface ExportVisit { visitName: string; timepoint?: string | null; procedures?: string[] | null }

export interface AssembledProtocol {
  title: string;
  header: { protocolNumber: string | null; kind: string | null; designType: string | null; phase: string | null; version: string | null };
  status: string | null;
  finalization: PdevSignatureFacet;
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
    status: doc.status ?? null,
    finalization: doc.finalization ?? { state: 'unavailable' },
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

/** §11.50(a)(3) in words, as the workspace prints it (client _shared/signatureMeaning.ts).
 *  Anything else is printed as stored rather than mapped to a guess. */
const MEANING_LABEL: Record<string, string> = {
  authorship: 'Authorship', review: 'Review', approval: 'Approval', responsibility: 'Responsibility',
};

/** A protocol that has been finalized, and so carries a finalization signature
 *  (the two statuses finalizeProtocolTx refuses to finalize again). */
export const isFinalizedStatus = (status: string | null): boolean => status === 'finalized' || status === 'superseded';

/**
 * The status line and the finalization signature block (periodic review
 * 2026-09-28, editor family, P11-C-2): the export printed a finalized protocol
 * exactly like a draft, and MD, DOCX and PDF are all rendered from this
 * Markdown. §11.50(b): printed name, date and time, meaning, on every
 * human-readable form. Modelled on authoring-export's signatureManifestLines.
 */
function signatureBlockLines(status: string | null, f: PdevSignatureFacet): string[] {
  const statusWords = status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Not recorded';
  const lines = ['', `**Status:** ${statusWords}`, '', '## Electronic signature'];
  if (!isFinalizedStatus(status)) {
    return [...lines, '- Not finalized: no electronic signature has been applied to this version.'];
  }
  if (f.state === 'unavailable') return [...lines, '- The signature record could not be read, so this copy does not carry the signature.'];
  if (f.state === 'none') return [...lines, '- No electronic signature is on record for this finalization.'];
  const s = f.signature;
  const at = new Date(s.signedAt);
  if (f.state === 'revoked') lines.push('- REVOKED: this signature has been withdrawn and no longer attests to this protocol.');
  lines.push(
    `- Signed by: ${s.signerName}`,
    `- Meaning: ${s.meaning ? (MEANING_LABEL[s.meaning] ?? s.meaning) : 'Not recorded'}`,
    `- Executed: ${Number.isNaN(at.getTime()) ? 'Not recorded' : at.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'}`,
  );
  if (s.reason) lines.push(`- Reason: ${s.reason}`);
  if (s.recordedOnBehalfOf) lines.push(`- Recorded on behalf of: ${s.recordedOnBehalfOf}`);
  return lines;
}

/** Render an assembled protocol to Markdown. Pure, deterministic. */
export function renderProtocolMarkdown(p: AssembledProtocol): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  const h = p.header;
  const meta = [h.protocolNumber && `Protocol ${h.protocolNumber}`, h.version && `v${h.version}`, h.phase, h.designType].filter(Boolean).join(' · ');
  if (meta) lines.push(`_${meta}_`);
  lines.push(...signatureBlockLines(p.status, p.finalization));
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
