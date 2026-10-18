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
import { buildSoaMatrix, type SoaAssessment, type SoaCell, type SoaMatrix } from '../protocol-soa/protocol-soa-logic';

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
  soa?: { assessments: SoaAssessment[]; cells: ExportSoaCell[] };
}
export interface ExportSection { sectionKey: string; title: string; content?: string | null; orderIndex?: number }
export interface ExportObjective { objectiveType: string; objective: string; endpoint?: string | null; timepoint?: string | null }
export interface ExportCriterion { kind: string; criterion: string }
export interface ExportVisit { id?: number; visitName: string; timepoint?: string | null; procedures?: string[] | null; orderIndex?: number }
export interface ExportSoaCell extends SoaCell { notes?: string | null }

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
  soa?: { matrix: SoaMatrix; cells: ExportSoaCell[] };
}

/** Assemble the document parts into an ordered export model. Pure. */
export function assembleProtocolExport(
  doc: ExportDoc,
  sections: ExportSection[],
  objectives: ExportObjective[],
  eligibility: ExportCriterion[],
  visits: ExportVisit[],
): AssembledProtocol {
  if (doc.soa && visits.some(v => !Number.isSafeInteger(v.id) || !v.id || v.id < 1)) throw new Error('A recorded visit identity is required for protocol matrix composition.');
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
    ...(doc.soa ? { soa: { matrix: buildSoaMatrix(doc.soa.assessments, visits.map(v => ({ id: v.id!, visitName: v.visitName, timepoint: v.timepoint, orderIndex: v.orderIndex })), doc.soa.cells), cells: doc.soa.cells } } : {}),
  };
}

/** §11.50(a)(3) in words, as the workspace prints it (client _shared/signatureMeaning.ts).
 *  Anything else is printed as stored rather than mapped to a guess. */
const MEANING_LABEL: Record<string, string> = {
  authorship: 'Authorship', review: 'Review', approval: 'Approval', responsibility: 'Responsibility',
};

/** A recorded meaning identifies the policy question, never its past result. */
function unknownHistoricalPolicyLabel(meaning: string): string {
  if (meaning === 'authorship') return 'Signing-time authorship-check evidence not recorded';
  if (meaning === 'approval' || meaning === 'review' || meaning === 'responsibility') {
    return 'Signing-time independence evidence not recorded';
  }
  return 'Signing-time policy-check evidence not recorded';
}

/** A protocol that has been finalized, and so carries a finalization signature
 *  (the two statuses finalizeProtocolTx refuses to finalize again). */
export const isFinalizedStatus = (status: string | null): boolean => status === 'finalized' || status === 'superseded';

type SignatureRecordFacet = Extract<PdevSignatureFacet, { signature: unknown }>;

/** Negative qualification and retained references remain separate from the manifestation. */
function signatureQualificationLines(f: SignatureRecordFacet): string[] {
  const s = f.signature;
  const lines: string[] = [];
  // A signature-bearing older DTO has the same honest fallback: this reader
  // recognizes no signing-time independence assurance, including metadata that
  // calls itself an approval check. The declared meaning remains historical.
  lines.push(
    `- Current content binding: ${f.state === 'signed' ? 'Matches the signed content' : f.state === 'changed' ? 'Changed after signing' : f.state === 'revoked' ? 'Not verified; signature withdrawn' : 'Not verified'}.`,
    `- ${unknownHistoricalPolicyLabel(s.meaning)}.`,
    '- Independent approval not verified from this signature record.',
  );
  const reference = f.qualification?.signatureReference;
  if (reference?.signatureId != null) lines.push(`- Signature record: ${reference.signatureId}`);
  if (reference?.signatureHash) lines.push(`- Signature hash: ${reference.signatureHash}`);
  return lines;
}

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
  if (f.state === 'changed') lines.push('- HISTORICAL SIGNATURE: current protocol content differs from the signed content; this copy carries no current attestation.');
  if (f.state === 'unverified') lines.push('- HISTORICAL RECORD: the signature binding to current protocol content could not be verified; this copy carries no current attestation.');
  const s = f.signature;
  const at = new Date(s.signedAt);
  if (f.state === 'revoked') lines.push('- REVOKED: this signature has been withdrawn and no longer attests to this protocol.');
  lines.push(
    `- ${f.state === 'changed' || f.state === 'unverified' ? 'Historically recorded signer' : 'Signed by'}: ${s.signerName}`,
    `- Declared meaning: ${s.meaning ? (MEANING_LABEL[s.meaning] ?? s.meaning) : 'Not recorded'}`,
    `- Executed: ${Number.isNaN(at.getTime()) ? 'Not recorded' : at.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'}`,
  );
  if (s.reason) lines.push(`- Reason: ${s.reason}`);
  if (s.recordedOnBehalfOf) lines.push(`- Recorded on behalf of: ${s.recordedOnBehalfOf}`);
  lines.push(...signatureQualificationLines(f));
  return lines;
}

/** Render an assembled protocol to Markdown. Pure, deterministic. */
export function renderProtocolMarkdown(p: AssembledProtocol, options: { contentOnly?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  const h = p.header;
  const meta = [h.protocolNumber && `Protocol ${h.protocolNumber}`, h.version && `v${h.version}`, h.phase, h.designType].filter(Boolean).join(' · ');
  if (meta) lines.push(`_${meta}_`);
  if (!options.contentOnly) lines.push(...signatureBlockLines(p.status, p.finalization));
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
  if (p.soa) lines.push('', '## Schedule of Activities Matrix', renderProtocolSoaMarkdown(p.soa));
  for (const s of p.sections) { lines.push('', `## ${s.title}`, s.content ?? '_[to be completed]_'); }
  return lines.join('\n');
}

/** The exact retained matrix: a missing cell is not a scheduled assessment. */
export function renderProtocolSoaMarkdown(soa: NonNullable<AssembledProtocol['soa']>): string {
  const { matrix, cells } = soa;
  if (!matrix.columns.length || !matrix.rows.length) return '_The source does not record a complete assessment-by-visit matrix._';
  const escape = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
  const lines = [
    `| Assessment | Category | ${matrix.columns.map(v => escape(`${v.visitName}${v.timepoint ? ` (${v.timepoint})` : ''}`)).join(' | ')} |`,
    `| --- | --- | ${matrix.columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of matrix.rows) {
    const values = row.cells.map(cell => {
      if (!cell.present) return 'Not scheduled';
      const note = cells.find(c => c.assessmentId === row.assessmentId && c.visitId === cell.visitId)?.notes;
      return `${cell.required ? 'Required' : 'Optional'}${note ? `: ${escape(note)}` : ''}`;
    });
    lines.push(`| ${escape(row.name)} | ${escape(row.category)} | ${values.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** Canonical content composition for an unbound working copy. Source signing
 * and status manifestations are deliberately excluded from copied prose. */
export function protocolAuthoringSections(p: AssembledProtocol): Array<{ code: string; title: string; content: string }> {
  const h = p.header;
  const header = [p.title, h.protocolNumber && `Protocol ${h.protocolNumber}`, h.version && `Version ${h.version}`, h.kind && `Kind: ${h.kind}`, h.phase, h.designType].filter(Boolean).join('\n');
  const objectives = p.objectives.map(o => `- **${o.objectiveType}:** ${o.objective}${o.endpoint ? ` — _Endpoint:_ ${o.endpoint}` : ''}${o.timepoint ? ` (${o.timepoint})` : ''}`).join('\n');
  const eligibility = [...p.eligibility.inclusion.map(c => `- Inclusion: ${c}`), ...p.eligibility.exclusion.map(c => `- Exclusion: ${c}`)].join('\n');
  const schedule = p.schedule.map(v => `- **${v.visitName}**${v.timepoint ? ` (${v.timepoint})` : ''}${v.procedures?.length ? `: ${v.procedures.join(', ')}` : ''}`).join('\n');
  return [
    {code:'protocol.header',title:'Protocol identification',content:header},
    {code:'protocol.synopsis',title:'Synopsis',content:p.synopsis ?? ''},
    {code:'protocol.objectives',title:'Objectives and endpoints',content:objectives},
    {code:'protocol.eligibility',title:'Eligibility criteria',content:eligibility},
    {code:'protocol.schedule',title:'Schedule of assessments',content:schedule},
    {code:'protocol.soa',title:'Schedule of activities matrix',content:p.soa ? renderProtocolSoaMarkdown(p.soa) : ''},
    ...p.sections.map(s => ({code:s.sectionKey,title:s.title,content:s.content ?? ''})),
  ];
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
