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

type Connection = (opts: WithTenantConnectionOptions, fn: (q: RequestSqlClient) => Promise<string>) => Promise<string>;
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
  sha256: string; text: string; pendingInsertions: number; pendingDeletions: number;
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
      sha256: digest(content), text: acceptedSectionText(rendered),
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

function report(documentId: string, programId: string, header: Record<string, unknown>, saved: SavedSection[], input: Record<string, unknown>): string {
  const opts = reviewOptions(input);
  const snapshotSha256 = digest(stableStringify({ header, saved, opts }));
  if (input.expected_snapshot !== undefined && input.expected_snapshot !== snapshotSha256) return refuse('Saved document or review options changed. Restart critique_document at offset 0.');
  const result = critiqueDocument(saved.map(s => ({ title: [s.code, s.title].filter(Boolean).join(' '), text: s.text })), opts);
  const coverage = reviewCoverage(saved);
  const items = reviewItems(saved, result);
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (offset >= items.length) return refuse('Review offset is outside this snapshot. Restart at offset 0.');
  const base = { engine: 'deterministic', scope: 'saved_document', complete: true, documentId, programId,
    snapshotSha256, documentScore: result.documentScore, precisionVerdict: result.verdict,
    verdict: result.verdict === 'revise' || coverage.emptySections || coverage.citationGaps || coverage.pendingInsertions || coverage.pendingDeletions ? 'revise' : 'pass',
    register: result.register, structure: result.structure, coverage,
    instruction: 'Score covers writing precision of all accepted saved text. This is not approval or evidence verification. Read every nextOffset with this document_id and expected_snapshot and the same review options. Pending changes require review. Read exact sections before remedies; clipped evidence is marked truncated.' };
  const page: Array<Record<string, unknown>> = [];
  const serialize = () => JSON.stringify({ ...base, pagination: { offset, shown: page.length, total: items.length, nextOffset: offset + page.length < items.length ? offset + page.length : null }, items: page });
  for (let i = offset; i < items.length; i++) {
    page.push(items[i]);
    if (serialize().length > RESULT_BUDGET) { page.pop(); break; }
  }
  return page.length ? serialize() : refuse('This review item exceeds the tool budget. Read individual saved sections; no complete result is returned.');
}

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

export async function critiqueSavedDocument(input: Record<string, unknown>, ctx?: ToolContext, connection: Connection = withTenantConnection): Promise<string> {
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
        const actor = await q.query(`SELECT email FROM users WHERE id=$1 AND status=$2
          AND EXISTS (SELECT 1 FROM organization_users ou WHERE ou.user_id=users.id AND ou.organization_id=$3)`,
          [userId, 'active', tenantId]);
        if (actor.rows.length !== 1 || (actor.rows[0].email !== null && typeof actor.rows[0].email !== 'string')) throw new Error('Actor unavailable');
        const authorized = await authorizeAuthoringProgram(q, { tenantId, actor: { id: String(userId), email: actor.rows[0].email }, programId: project.programId, forWrite: false });
        const doc = await q.query(`SELECT id::text, title, module, product_code, status, updated_at FROM authoring_documents
          WHERE id=$1 AND tenant_id=$2 AND client_program_id=$3`, [input.document_id, tenantId, project.programId]);
        if (doc.rows.length !== 1) throw new Error('Document outside project');
        const scope = await resolveAuthoringDocumentScope(q, tenantId, input.document_id as string);
        if (!(await decideAuthoringPermission({ pool: q, principal: authorized.principal, scope, action: 'view' })).allowed) throw new Error('Document access denied');
        const saved = await sections(q, input.document_id as string, tenantId, userId);
        const output = report(input.document_id as string, project.programId, documentRecord(doc.rows[0]), saved, input);
        await q.query('COMMIT');
        return output;
      } catch (error) {
        await q.query('ROLLBACK');
        throw error;
      }
    });
  } catch {
    return refuse('Complete saved-document review could not be verified: check current project/document access, saved sections and the 512-section / 8 MiB limit. No document verdict was computed.');
  }
}
