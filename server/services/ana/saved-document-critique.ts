/** Complete saved-record input for the existing deterministic critique_document tool. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { resolveCitation } from '../../../shared/authoring/citations';
import type { RequestSqlClient } from '../../db/requestDb';
import { withTenantConnection, type WithTenantConnectionOptions } from '../../db/withTenantConnection';
import { sectionContentToBlocks, collectCitedSourceIds } from '../../export/authoring-section-content';
import { acceptedSectionText, renderSection } from '../authoring/authoring-read-render';
import { authorizeAuthoringProgram } from '../authoring/authoring-program-access';
import { decideAuthoringPermission, resolveAuthoringDocumentScope } from '../authoring/authoring-permissions';
import { listCitationSources } from '../clinical-regulatory-evidence/citation-source-read';
import type { ToolContext } from './AnaToolExecutor';
import { admitAnaProjectScope } from './project-scope-admission';
import { critiqueDocument, type PrecisionFinding } from './writing-precision-gate';
import type { ReadabilityAudience } from './medical-writing-qc';
import type { ClaimRegister } from './promotional-screening';
import { RESULT_BUDGET } from './agentic-loop';
import { savedTemplateReview, type SavedTemplateReview } from './saved-template-review';
import { assessSavedCsrEvidence, csrEvidenceRuns, importedCsrEvidence, type RetainedRunRead, type SavedCsrEvidenceVerdict } from './csr-saved-evidence';
import type { RetainedCsrTables } from '../csr/cortex-authoring-context';

type Connection = (opts: WithTenantConnectionOptions, fn: (q: RequestSqlClient) => Promise<string>) => Promise<string>;
/** The receipt-verified retained-table reader (csr/saved-clinical-tables readSavedClinicalTables). */
export type RetainedTableReader = (q: RequestSqlClient, scope: { organizationId: number; userId: number; programId: string }, runId: string) => Promise<RetainedCsrTables>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SECTIONS = 512;
const MAX_BYTES = 8 * 1024 * 1024;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const refuse = (error: string) => JSON.stringify({ error, scope: 'saved_document', complete: false });
const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

function stamp(value: unknown): string {
  if (!(typeof value === 'string' || value instanceof Date)) throw new Error('Invalid saved version');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid saved version');
  return date.toISOString();
}

function finding(f: PrecisionFinding) {
  const truncated = f.message.length > 600 || f.evidence.length > 3 || f.evidence.some(e => e.length > 240);
  return { ...f, message: clip(f.message, 600), evidence: f.evidence.slice(0, 3).map(e => clip(e, 240)), ...(truncated ? { truncated: true } : {}) };
}

interface SavedSection {
  sectionId: string; code: string | null; title: string; updatedAt: string;
  sha256: string; content: string; text: string; pendingInsertions: number; pendingDeletions: number;
  citations: Awaited<ReturnType<typeof listCitationSources>>; citationGaps: string[];
}

function sectionRecord(row: Record<string, unknown>) {
  if (typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.title !== 'string' ||
    (row.code !== null && typeof row.code !== 'string') || (row.content !== null && typeof row.content !== 'string')) {
    throw new Error('Malformed saved section');
  }
  return { id: row.id, code: row.code, title: row.title, content: row.content ?? '', updatedAt: stamp(row.updated_at) };
}

async function sections(q: RequestSqlClient, documentId: string, tenantId: number, userId: number): Promise<SavedSection[]> {
  const size = await q.query(`SELECT COUNT(*)::int AS section_count,
    COALESCE(SUM(OCTET_LENGTH(COALESCE(content, ''))), 0)::bigint AS content_bytes
    FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2`, [documentId, tenantId]);
  const count = Number(size.rows[0]?.section_count);
  const bytes = Number(size.rows[0]?.content_bytes);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SECTIONS || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_BYTES) {
    throw new Error('Saved document is empty or exceeds the complete-review limit');
  }
  const result = await q.query(`SELECT id::text, code, title, content, updated_at
    FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2
    ORDER BY order_index, created_at, id`, [documentId, tenantId]);
  if (result.rows.length !== count) throw new Error('Incomplete saved document');
  const out: SavedSection[] = [];
  for (const row of result.rows) {
    const record = sectionRecord(row);
    const { content } = record;
    const rendered = renderSection(content);
    const ids = collectCitedSourceIds(sectionContentToBlocks(content));
    const citations = await listCitationSources(tenantId, ids, { documentId, sectionId: record.id, userId }, q);
    const lookup = new Map(citations.map(c => [c.id, c]));
    out.push({ sectionId: record.id, code: record.code, title: record.title, updatedAt: record.updatedAt,
      sha256: digest(content), content, text: acceptedSectionText(rendered),
      pendingInsertions: rendered.spans.filter(s => s.kind === 'insertion').length,
      pendingDeletions: rendered.spans.filter(s => s.kind === 'deletion').length,
      citations, citationGaps: ids.filter(id => !resolveCitation(id, key => lookup.get(key)).found) });
  }
  return out;
}

function reviewOptions(input: Record<string, unknown>) {
  return {
    audience: typeof input.audience === 'string' && ['patient', 'clinician', 'regulator', 'general'].includes(input.audience) ? input.audience as ReadabilityAudience : undefined,
    register: input.register === 'submission' || input.register === 'promotional' ? input.register as ClaimRegister : undefined,
    documentType: typeof input.documentType === 'string' ? input.documentType : undefined,
  };
}

function reviewCoverage(saved: SavedSection[]) {
  return { sectionCount: saved.length, textChars: saved.reduce((n, s) => n + s.text.length, 0),
    pendingInsertions: saved.reduce((n, s) => n + s.pendingInsertions, 0), pendingDeletions: saved.reduce((n, s) => n + s.pendingDeletions, 0),
    emptySections: saved.filter(s => !s.text.trim()).length, citationGaps: saved.reduce((n, s) => n + s.citationGaps.length, 0) };
}

function reviewItems(saved: SavedSection[], result: ReturnType<typeof critiqueDocument>) {
  const items: Array<Record<string, unknown>> = result.crossSectionFindings.map(f => ({ kind: 'cross-section-finding', finding: finding(f) }));
  saved.forEach((s, i) => {
    const section = result.sections[i];
    items.push({ kind: 'section', sectionId: s.sectionId, code: s.code === null ? null : clip(s.code, 120), title: clip(s.title, 120),
      ...(s.title.length > 120 || (s.code?.length ?? 0) > 120 ? { labelTruncated: true } : {}),
      updatedAt: s.updatedAt, sha256: s.sha256, textChars: s.text.length, pendingInsertions: s.pendingInsertions, pendingDeletions: s.pendingDeletions,
      score: section.score, verdict: section.verdict, findingCount: section.findingCount });
    for (const f of section.report.findings) items.push({ kind: 'section-finding', sectionId: s.sectionId, finding: finding(f) });
    if (!s.text.trim()) items.push({ kind: 'record-finding', sectionId: s.sectionId, severity: 'high', message: 'This saved section has no accepted text.' });
    if (s.citationGaps.length) items.push({ kind: 'record-finding', sectionId: s.sectionId, severity: 'high', message: 'Stored citations are unavailable, withdrawn or not registered to this section.', sourceCount: s.citationGaps.length });
  });
  return items;
}

/** A saved CSR cannot evade scientific evidence checks by asking the critique
 * tool to treat it as a different document type. Saved identity wins. */
function savedIsCsr(header: Record<string, unknown>): boolean {
  // Review of slice 5 (2026-10-30): the CSR import saves the copy under the
  // study's title with module null, so its provenance is the saved identity too.
  const provenance = header.provenance as { importSource?: { kind?: unknown } } | null | undefined;
  if (provenance && typeof provenance === 'object' && provenance.importSource?.kind === 'csr') return true;
  return [header.module, header.product_code, header.title]
    .filter((value): value is string => typeof value === 'string')
    .some(value => /(?:^|[^a-z0-9])(?:csr|clinical study report)(?:$|[^a-z0-9])/i.test(value));
}

/** CSR slice 5: the evidence summary on every page; its detail is paginated as items. */
function csrSummary(csr: SavedCsrEvidenceVerdict) {
  return { status: csr.status, basis: csr.basis, checkedSections: csr.checkedSections, checkedClaims: csr.checkedClaims,
    issueCount: csr.issues.length, unclaimedFigureCount: csr.unclaimedFigures.length,
    blockingUnclaimedFigureCount: csr.unclaimedFigures.filter(f => f.blocking).length, runs: csr.runs };
}

function csrItems(csr: SavedCsrEvidenceVerdict | null): Array<Record<string, unknown>> {
  if (!csr) return [];
  const bySection = new Map<string, { blocking: boolean; figures: string[] }>();
  for (const f of csr.unclaimedFigures) {
    const at = bySection.get(f.section) ?? { blocking: f.blocking, figures: [] };
    at.figures.push(f.figure);
    bySection.set(f.section, at);
  }
  return [
    ...csr.issues.map(issue => ({ kind: 'csr-evidence-issue', ...issue })),
    ...[...bySection].map(([section, at]) => ({ kind: 'csr-unclaimed-figures', section, blocking: at.blocking,
      count: at.figures.length, figures: at.figures.slice(0, 40).map(f => clip(f, 40)), ...(at.figures.length > 40 ? { truncated: true } : {}) })),
  ];
}

const INSTRUCTION = 'Score covers writing precision of all accepted saved text. For a CSR, csrEvidence re-reads the retained run behind each imported section\'s claim receipts: blocked names the exact cell, section and figure that failed (a changed section, a claim that no longer matches its cell, a figure stated with no claim, the same figure stated differently in two sections); not_assessed means the document carries no claim receipts. reconciled_pending_human_review is transcription agreement only, never scientific approval. This is not approval or evidence verification. Read every nextOffset with this document_id and expected_snapshot and the same review options, including every template reference part. Template guidance is reference material, not authored evidence or checklist completion. Preparation worksheets do not replace original forms, datasets, certificates or signed records; respect recorded source limits. Pending changes require review. Read exact sections before remedies; clipped evidence is marked truncated.';

function documentVerdict(result: ReturnType<typeof critiqueDocument>, coverage: ReturnType<typeof reviewCoverage>, csr: SavedCsrEvidenceVerdict | null): 'pass' | 'revise' {
  if (csr && csr.status !== 'reconciled_pending_human_review') return 'revise';
  return result.verdict === 'revise' || coverage.emptySections || coverage.citationGaps || coverage.pendingInsertions || coverage.pendingDeletions ? 'revise' : 'pass';
}

function report(documentId: string, programId: string, saved: SavedSection[], input: Record<string, unknown>,
  context: { header: Record<string, unknown>; template: SavedTemplateReview; csr: SavedCsrEvidenceVerdict | null }): string {
  const { header, template, csr } = context;
  const opts = reviewOptions(input);
  if (savedIsCsr(header)) opts.documentType = 'csr';
  const snapshotSha256 = digest(stableStringify({ header, saved, opts, template: { source: template.source, references: template.references }, csr }));
  if (input.expected_snapshot !== undefined && input.expected_snapshot !== snapshotSha256) return refuse('Saved document or review options changed. Restart critique_document at offset 0.');
  const result = critiqueDocument(saved.map(s => ({ title: [s.code, s.title].filter(Boolean).join(' '), text: s.text })),
    { ...opts, ...(csr?.claims.length ? { csrClaims: csr.claims, csrEvidence: csr.facts } : {}) });
  const coverage = reviewCoverage(saved);
  const items = [...template.items, ...csrItems(csr), ...reviewItems(saved, result)];
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (offset >= items.length) return refuse('Review offset is outside this snapshot. Restart at offset 0.');
  const csrEvidence = csr ? csrSummary(csr) : result.csrEvidence;
  const base = { engine: 'deterministic', scope: 'saved_document', complete: true, documentId, programId,
    snapshotSha256, documentScore: result.documentScore, precisionVerdict: result.verdict,
    verdict: documentVerdict(result, coverage, csr),
    register: result.register, structure: result.structure, coverage, template: template.template,
    ...(csrEvidence ? { csrEvidence } : {}),
    instruction: INSTRUCTION };
  const page: Array<Record<string, unknown>> = [];
  const serialize = () => JSON.stringify({ ...base, pagination: { offset, shown: page.length, total: items.length, nextOffset: offset + page.length < items.length ? offset + page.length : null }, items: page });
  for (let i = offset; i < items.length; i++) {
    page.push(items[i]);
    if (serialize().length > RESULT_BUDGET) { page.pop(); break; }
  }
  return page.length ? serialize() : refuse('This review item exceeds the tool budget. Read individual saved sections; no complete result is returned.');
}

/** CSR slice 5: read each retained run behind the document's claim receipts, inside
 * this snapshot. A read that fails is recorded, never treated as agreement; the
 * savepoint keeps a failed read from aborting the review transaction. */
async function savedCsrEvidence(q: RequestSqlClient, header: Record<string, unknown>, saved: SavedSection[],
  actor: { organizationId: number; userId: number }, read: RetainedTableReader): Promise<SavedCsrEvidenceVerdict | null> {
  if (!savedIsCsr(header)) return null;
  const receipts = importedCsrEvidence(header.provenance);
  const reads = new Map<string, RetainedRunRead>();
  for (const run of csrEvidenceRuns(receipts)) {
    const key = `${run.programId.toLowerCase()}:${run.runId.toLowerCase()}`;
    await q.query('SAVEPOINT csr_evidence_read');
    try {
      reads.set(key, { ok: true, tables: await read(q, { ...actor, programId: run.programId }, run.runId) });
      await q.query('RELEASE SAVEPOINT csr_evidence_read');
    } catch (error) {
      await q.query('ROLLBACK TO SAVEPOINT csr_evidence_read');
      const code = (error as { code?: unknown })?.code;
      reads.set(key, { ok: false, code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'CSR_EVIDENCE_SOURCE_UNAVAILABLE' });
    }
  }
  return assessSavedCsrEvidence(saved, receipts, reads);
}

const defaultRetainedReader: RetainedTableReader = async (q, scope, runId) =>
  (await import('../csr/saved-clinical-tables')).readSavedClinicalTables(q, scope, runId);

/** Dedicated tenant connection and one consistent, read-only-in-behavior snapshot; no writes or model call. */
function invalidSnapshot(input: Record<string, unknown>): boolean {
  return input.expected_snapshot !== undefined && (typeof input.expected_snapshot !== 'string' || !/^[0-9a-f]{64}$/.test(input.expected_snapshot));
}

function inputError(input: Record<string, unknown>): string | null {
  if (typeof input.document_id !== 'string' || !UUID.test(input.document_id) || input.sections !== undefined) return 'Provide document_id alone for saved-document review.';
  if (input.offset !== undefined && (typeof input.offset !== 'number' || !Number.isSafeInteger(input.offset) || input.offset < 0)) return 'offset must be a nonnegative integer.';
  if (Number(input.offset ?? 0) > 0 && input.expected_snapshot === undefined) return 'Continuations require the returned expected_snapshot digest.';
  if (invalidSnapshot(input)) return 'Provide the returned expected_snapshot digest.';
  if (input.documentType !== undefined && (typeof input.documentType !== 'string' || input.documentType.length > 120)) return 'Provide a documentType of at most 120 characters.';
  return null;
}

function documentRecord(row: Record<string, unknown>): Record<string, unknown> {
  if (typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.title !== 'string' || typeof row.status !== 'string') throw new Error('Malformed saved document');
  return { ...row, updated_at: stamp(row.updated_at) };
}

function currentContext(ctx?: ToolContext): ctx is ToolContext & { organizationId: number; userId: number } {
  return typeof ctx?.organizationId === 'number' && Number.isSafeInteger(ctx.organizationId) && ctx.organizationId > 0 &&
    typeof ctx.userId === 'number' && Number.isSafeInteger(ctx.userId) && ctx.userId > 0 && !!(ctx.projectRef || ctx.projectId);
}

export async function critiqueSavedDocument(input: Record<string, unknown>, ctx?: ToolContext, connection: Connection = withTenantConnection,
  readRetained: RetainedTableReader = defaultRetainedReader): Promise<string> {
  const invalid = inputError(input);
  if (invalid) return refuse(invalid);
  if (!currentContext(ctx)) return refuse('Open an authorized project before reviewing a saved document.');
  const tenantId = ctx?.organizationId;
  const userId = ctx?.userId;
  try {
    return await connection({ tenantId, orgUuid: ctx.organizationUuid, source: 'job', caller: 'ana-saved-document-critique' }, async q => {
      await q.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try {
        const project = await admitAnaProjectScope(q, { organizationId: tenantId, userId, projectRef: ctx.projectRef, projectId: ctx.projectId });
        if (!project.programId) throw new Error('No authoring program');
        // Email-only document grants use the active caller's recorded identity,
        // bound to canonical membership in this snapshot's organization.
        const actor = await q.query(`SELECT email FROM users WHERE id=$1 AND status=$2
          AND EXISTS (SELECT 1 FROM organization_users ou WHERE ou.user_id=users.id AND ou.organization_id=$3)`,
          [userId, 'active', tenantId]);
        if (actor.rows.length !== 1 || (actor.rows[0].email !== null && typeof actor.rows[0].email !== 'string')) throw new Error('Actor unavailable');
        const authorized = await authorizeAuthoringProgram(q, { tenantId, actor: { id: String(userId), email: actor.rows[0].email }, programId: project.programId, forWrite: false });
        const doc = await q.query(`SELECT d.id::text, d.title, d.module, d.product_code, d.status, d.updated_at,
          to_jsonb(d)->>'template_id' AS template_id, to_jsonb(d)->'provenance' AS provenance FROM authoring_documents d
          WHERE d.id=$1 AND d.tenant_id=$2 AND d.client_program_id=$3`, [input.document_id, tenantId, project.programId]);
        if (doc.rows.length !== 1) throw new Error('Document outside project');
        const scope = await resolveAuthoringDocumentScope(q, tenantId, input.document_id as string);
        if (!(await decideAuthoringPermission({ pool: q, principal: authorized.principal, scope, action: 'view' })).allowed) throw new Error('Document access denied');
        const saved = await sections(q, input.document_id as string, tenantId, userId);
        const header = documentRecord(doc.rows[0]);
        const template = await savedTemplateReview(q, { tenantId, documentId: input.document_id as string, programId: project.programId }, header, saved);
        const csr = await savedCsrEvidence(q, header, saved, { organizationId: tenantId, userId }, readRetained);
        const output = report(input.document_id as string, project.programId, saved, input, { header, template, csr });
        await q.query('COMMIT');
        return output;
      } catch (error) {
        await q.query('ROLLBACK');
        throw error;
      }
    });
  } catch {
    return refuse('Complete saved-document review could not be verified: check current project/document access, saved sections, template identity/guidance and the 512-section / 8 MiB content / 8 MiB reference / 20,000-reference-item limits. No document verdict is returned.');
  }
}
