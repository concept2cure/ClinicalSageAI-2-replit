/**
 * The questions an agency letter's own text numbers, proposed for a person to
 * record (G3, a step of P-39 step 3; docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md).
 *
 * The letter is the data-room source linked to the communication
 * (`cre_source:<id>` in linked_artifact_ids, checked on write by
 * refuseForeignLetterSources), and its text is the one the data room read
 * (cre_evidence_sources.extracted_text, 20261008c). The split is
 * splitLetterQuestions: no model call, each question verbatim at its offsets.
 *
 * A proposal writes nothing. A person records each one through the existing
 * governed POST .../questions, with a reason; a proposal whose number is
 * already recorded on the letter says so. A source this project cannot read,
 * or whose text was not read, is said to be so, never shown as "no questions".
 *
 * The same read proposes the commitments the letter imposes (P-81 "extract
 * commitments", P-84): splitLetterCommitments, no model call, each verbatim with
 * its kind, basis, schedule and due date. A person records each one, with a
 * reason, through POST .../commitments into the commitments register; one
 * already recorded from this letter under the same number says so.
 *
 * @module server/services/agency-responses/letter-question-proposals
 */
import { splitLetterQuestions } from '../../../shared/agency/letter-questions';
import { splitLetterCommitments, type LetterCommitment } from '../../../shared/agency/letter-commitments';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { resolveIssueParserGovernanceConfig, runGovernedIssueParser } from '../regulatory-correspondence/issue-parser';

interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>> }> }

export interface LetterSourceRead {
  sourceId: number;
  title: string | null;
  /** `read`: its text was read; `no-text`: the data room has not read its text; `not-found`: not a source of this project. */
  state: 'read' | 'no-text' | 'not-found';
}

/**
 * What the deficiency parser (`runGovernedIssueParser`, keyword rules, no model; P-122, 2026-11-10) reads in a
 * question: its topics in words, and the severity, CTD section and discipline it suggests for the record form. A
 * suggestion only: the person checks it against the letter and records with a reason. Its last client caller was
 * removed by e3a2d0475 with the device Correspondence tab; it is reached here, on the inbox's own proposals, so the
 * letter is not copied into the second store /api/regulatory-correspondence keeps.
 */
export interface ProposalClassification {
  topics: Array<{ label: string; severity: 'critical' | 'high' | 'medium' | 'low'; sections: string[] }>;
  suggested: { severity: 'minor' | 'major' | 'critical'; ctdSection: string | null; discipline: string | null };
}

export interface LetterQuestionProposal {
  sourceId: number;
  ref: string;
  text: string;
  start: number;
  end: number;
  /** The question already recorded on this letter under the same number, or null. */
  recordedQuestionId: number | null;
  /** The parser's reading, or null when the parser is switched off in this deployment. */
  classification: ProposalClassification | null;
}

/** A deficiency the parser itemizes in a letter whose text numbers no question: a passage to record by hand. */
export interface LetterDeficiency {
  sourceId: number;
  text: string;
  start: number;
  end: number;
  classification: ProposalClassification;
}

export interface LetterQuestionProposals {
  sources: LetterSourceRead[];
  proposals: LetterQuestionProposal[];
  /** Only for a read letter with no numbered question; empty otherwise. */
  deficiencies: LetterDeficiency[];
}

const TOPIC: Readonly<Record<string, string>> = {
  administrative_completeness: 'Administrative completeness', ectd_technical_formatting: 'eCTD or technical format',
  filing_acceptance_issue: 'Filing acceptance', cmc_quality_issue: 'CMC and quality', nonclinical_issue: 'Nonclinical',
  clinical_efficacy_issue: 'Clinical efficacy', clinical_safety_issue: 'Clinical safety',
  biostatistics_analysis_issue: 'Biostatistics', comparator_study_design_issue: 'Comparator or study design',
  endpoint_labeling_issue: 'Endpoints or labeling', device_evidence_equivalence_issue: 'Device evidence or equivalence',
  risk_benefit_issue: 'Benefit and risk', missing_information_clarification: 'Missing information or clarification',
  postmarketing_commitment_issue: 'Postmarketing commitment', inspection_compliance_issue: 'Inspection or compliance',
  other_unclassified: 'Not classified',
};
/** The record form's disciplines (AgencyResponses.tsx), by topic. */
const DISCIPLINE: Readonly<Record<string, string>> = {
  cmc_quality_issue: 'CMC', nonclinical_issue: 'Nonclinical', clinical_efficacy_issue: 'Clinical',
  comparator_study_design_issue: 'Clinical', clinical_safety_issue: 'Safety', biostatistics_analysis_issue: 'Biostatistics',
  endpoint_labeling_issue: 'Labeling', filing_acceptance_issue: 'Regulatory', administrative_completeness: 'Regulatory',
  ectd_technical_formatting: 'Regulatory', missing_information_clarification: 'Regulatory',
};
const RANK = { critical: 3, high: 2, medium: 1, low: 0 } as const;
const FORM_SEVERITY = { critical: 'critical', high: 'major', medium: 'minor', low: 'minor' } as const;

/** The parser's vocabulary for a project's filing: a device pathway, or the CTD taxonomy for anything else. */
function parserSubmissionType(programType: string | null): string | null {
  const t = String(programType ?? '').toUpperCase();
  for (const [needle, type] of [['510K', '510k'], ['DE_NOVO', 'de_novo'], ['PMA', 'pma'], ['IDE', 'ide'], ['QSUB', 'q_sub'], ['513G', '513g']] as const) {
    if (t.includes(needle)) return type;
  }
  return programType ? programType.toLowerCase() : null;
}

function classify(text: string, eventId: string, submissionType: string | null): ProposalClassification {
  const { issues } = runGovernedIssueParser(text, eventId, { submissionType });
  const lead = [...issues].sort((a, b) => RANK[b.severity] - RANK[a.severity])[0];
  const matched = lead.category !== 'other_unclassified';
  return {
    topics: issues.map((i) => ({ label: TOPIC[i.category] ?? 'Not classified', severity: i.severity, sections: i.mappedCtdSections })),
    suggested: {
      severity: matched ? FORM_SEVERITY[lead.severity] : 'major',
      ctdSection: matched ? lead.mappedCtdSections.map((c) => normalizeCtdCode(c)).find((c): c is string => !!c) ?? null : null,
      discipline: matched ? DISCIPLINE[lead.category] ?? null : null,
    },
  };
}

const SOURCE_REF = /^cre_source:(\d{1,10})$/;

/** "Q3", "q 3" and "3" are one number. */
export function sameQuestionRef(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(?:question|q)\s*/, '').replace(/\.$/, '');
  return norm(a) === norm(b);
}

interface LetterSourceText { sourceId: number; text: string }

/**
 * The letter's linked data-room sources, each with its read state, and the text
 * of those this project can read. One read for the letter's questions and its
 * commitments alike.
 */
async function readLetterSources(
  client: Queryable,
  scope: { orgId: number; projectId: number; eventId: string },
): Promise<{ sources: LetterSourceRead[]; texts: LetterSourceText[] }> {
  const letter = await client.query(
    `SELECT linked_artifact_ids FROM concept2cure_agency_communications
      WHERE organization_id = $1 AND project_id = $2 AND event_id = $3 LIMIT 1`,
    [scope.orgId, scope.projectId, scope.eventId]);
  const refs: unknown[] = Array.isArray(letter.rows[0]?.linked_artifact_ids) ? letter.rows[0].linked_artifact_ids : [];
  const ids = [...new Set(refs.map((r) => SOURCE_REF.exec(String(r))?.[1]).filter((v): v is string => !!v).map(Number))]
    .filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647);
  if (ids.length === 0) return { sources: [], texts: [] };

  // The project-scope rule the link was checked against on write: this
  // organisation's live source, in the program the project anchors.
  const { rows } = await client.query(
    `SELECT s.id, s.title, s.extracted_text
       FROM cre_evidence_sources s
       JOIN projects p ON p.regulatory_program_id = s.client_program_id AND p.organization_id = s.organization_id
      WHERE s.organization_id = $1 AND p.id = $2 AND s.id = ANY($3::int[]) AND s.deleted_at IS NULL
      ORDER BY s.id`,
    [scope.orgId, scope.projectId, ids]);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const sources: LetterSourceRead[] = [];
  const texts: LetterSourceText[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    const text = typeof row?.extracted_text === 'string' ? row.extracted_text : '';
    sources.push({ sourceId: id, title: row?.title == null ? null : String(row.title), state: !row ? 'not-found' : text.trim() ? 'read' : 'no-text' });
    if (row && text.trim()) texts.push({ sourceId: id, text });
  }
  return { sources, texts };
}

export async function readLetterQuestionProposals(
  client: Queryable,
  scope: { orgId: number; projectId: number; eventId: string },
  recorded: ReadonlyArray<{ id: number; questionRef: string }>,
): Promise<LetterQuestionProposals> {
  const { sources, texts } = await readLetterSources(client, scope);
  const proposals: LetterQuestionProposal[] = [];
  const deficiencies: LetterDeficiency[] = [];
  const parsing = texts.length > 0 && resolveIssueParserGovernanceConfig(process.env).available;
  const submissionType = parsing ? await projectSubmissionType(client, scope) : null;
  for (const { sourceId, text } of texts) {
    const questions = splitLetterQuestions(text);
    for (const q of questions) {
      const match = recorded.find((r) => sameQuestionRef(r.questionRef, q.ref));
      proposals.push({ sourceId, ...q, recordedQuestionId: match ? match.id : null,
        classification: parsing ? classify(q.text, scope.eventId, submissionType) : null });
    }
    if (parsing && questions.length === 0) {
      for (const issue of runGovernedIssueParser(text, scope.eventId, { submissionType }).issues) {
        const span = issue.structuredExtraction?.evidenceSpan;
        if (!span || issue.category === 'other_unclassified') continue;
        deficiencies.push({ sourceId, text: span.text, start: span.start, end: span.end, classification: classify(span.text, scope.eventId, submissionType) });
      }
    }
  }
  return { sources, proposals, deficiencies };
}

/** The project's filing type, which decides the parser's vocabulary (a device letter's topics are not CTD's). */
async function projectSubmissionType(client: Queryable, scope: { orgId: number; projectId: number }): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT rp.program_type FROM projects p
       JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
      WHERE p.organization_id = $1 AND p.id = $2 LIMIT 1`, [scope.orgId, scope.projectId]);
  return parserSubmissionType(typeof rows[0]?.program_type === 'string' ? rows[0].program_type : null);
}

export interface LetterCommitmentProposal extends LetterCommitment {
  sourceId: number;
  /** The basis to record it under, carrying the agency's number (commitmentBasisOf). */
  recordBasis: string;
  /** The commitment already recorded from this letter under the same number, or null. */
  recordedCommitmentId: number | null;
}

export interface LetterCommitmentProposals {
  sources: LetterSourceRead[];
  proposals: LetterCommitmentProposal[];
}

/**
 * The basis a recorded commitment carries: the section's legal basis and the
 * agency's number, so the register says where it came from and a proposal can
 * tell it is recorded ("FDCA 505(o)(3) · 4321-1").
 */
export function commitmentBasisOf(c: Pick<LetterCommitment, 'basis' | 'ref'>): string {
  return `${c.basis} · ${c.ref}`;
}

/** The commitments the letter's text imposes, proposed for a person to record. */
export async function readLetterCommitmentProposals(
  client: Queryable,
  scope: { orgId: number; projectId: number; eventId: string },
): Promise<LetterCommitmentProposals> {
  const { sources, texts } = await readLetterSources(client, scope);
  const recorded = texts.length === 0 ? [] : (await client.query(
    `SELECT id, regulatory_basis FROM regulatory_commitments
      WHERE organization_id = $1 AND project_id = $2 AND source_communication_event_id = $3`,
    [scope.orgId, scope.projectId, scope.eventId])).rows;
  const proposals: LetterCommitmentProposal[] = [];
  for (const { sourceId, text } of texts) {
    for (const c of splitLetterCommitments(text)) {
      const match = recorded.find((r) => String(r.regulatory_basis ?? '').endsWith(` · ${c.ref}`));
      proposals.push({ sourceId, ...c, recordBasis: commitmentBasisOf(c), recordedCommitmentId: match ? Number(match.id) : null });
    }
  }
  return { sources, proposals };
}
