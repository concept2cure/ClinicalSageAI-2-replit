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

interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>> }> }

export interface LetterSourceRead {
  sourceId: number;
  title: string | null;
  /** `read`: its text was read; `no-text`: the data room has not read its text; `not-found`: not a source of this project. */
  state: 'read' | 'no-text' | 'not-found';
}

export interface LetterQuestionProposal {
  sourceId: number;
  ref: string;
  text: string;
  start: number;
  end: number;
  /** The question already recorded on this letter under the same number, or null. */
  recordedQuestionId: number | null;
}

export interface LetterQuestionProposals {
  sources: LetterSourceRead[];
  proposals: LetterQuestionProposal[];
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
  for (const { sourceId, text } of texts) {
    for (const q of splitLetterQuestions(text)) {
      const match = recorded.find((r) => sameQuestionRef(r.questionRef, q.ref));
      proposals.push({ sourceId, ...q, recordedQuestionId: match ? match.id : null });
    }
  }
  return { sources, proposals };
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
