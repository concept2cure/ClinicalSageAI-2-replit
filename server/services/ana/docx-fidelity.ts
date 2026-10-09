/** The existing DOCX verifier's canonical fidelity implementation.
 * A saved target is read and rechecked, never written. Copying fidelity is not
 * scientific source qualification or a seal authorization. The complete tool
 * result is captured by the existing AnA turn recorder before model budgeting.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'fs';
import path from 'node:path';
import { getPool } from '../../db';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id.js';
import { readProgramAnchorRow } from '../c2c/program-project-anchor.js';
import { projectBelongsToTenant, type MembershipQueryable } from '../cmc/project-membership.js';
import { artifactDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { workspacePathOrRefusal } from './document-workspace.js';
import type { ToolContext } from './AnaToolExecutor.js';

const MAX_DIFF_CELLS = 1_000_000;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const pgInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
const qualification = { sourceVerified: false, sourceQualification: 'unassessed', sealEligible: false } as const;

interface Target {
  organizationId: number;
  projectId: number;
  artifactPk: number;
  artifactId: string;
  versionId: number;
  version: number;
  contentSha256: string;
}
interface SavedText { target: Target; text: string }
interface Selector { artifactId: string; version: number }
interface Divergence {
  method: 'exact_text' | 'line_diff';
  additions: number;
  deletions: number;
  summary?: { added: number; removed: number; modified: number; unchanged: number };
}
interface CheckOptions {
  ctx: ToolContext;
  organizationId: number;
  docxPath: string;
  resolvedPath: string;
  selector?: Selector;
}
interface ReferenceText { saved?: SavedText; expectedText: string; q?: MembershipQueryable }
interface Comparison {
  bytes: Buffer;
  docText: string;
  extractionMethod: string;
  requiredStrings: string[];
  missingRequiredStrings: string[];
  divergence?: Divergence;
}
function refusal(code: string, error: string): string {
  return JSON.stringify({ ok: false, code, error, artifactVerified: false, ...qualification });
}

function validProjectContext(ctx: ToolContext): boolean {
  if (ctx.projectId != null && !pgInteger(ctx.projectId)) return false;
  return pgInteger(ctx.projectId) || looksLikeProgramUuid(ctx.projectRef);
}

/** Reuse the canonical UUID anchor reader; neither a caller project_id nor an
 * unowned/deleted program can select a project. Ambiguous anchors refuse. */
async function ownedProject(q: MembershipQueryable, ctx: ToolContext, organizationId: number): Promise<number | null> {
  let projectId = ctx.projectId;
  if (looksLikeProgramUuid(ctx.projectRef)) {
    const programId = String(ctx.projectRef).trim().toLowerCase();
    if (!await projectBelongsToTenant({ organizationId, projectId: programId }, q)) return null;
    const anchor = await readProgramAnchorRow(q, {
      programId, orgId: organizationId, context: 'verify_docx_against_source', requireUnique: true,
    });
    if (!anchor || (projectId != null && projectId !== anchor.id)) return null;
    projectId = anchor.id;
  } else if (ctx.projectRef != null && parseIntegerProjectId(ctx.projectRef) !== projectId) {
    return null;
  }
  if (!pgInteger(projectId)) return null;
  return await projectBelongsToTenant({ organizationId, projectId: String(projectId) }, q) ? projectId : null;
}

async function loadSavedText(
  q: MembershipQueryable, ctx: ToolContext, organizationId: number, selector: Selector,
): Promise<SavedText | null> {
  const projectId = await ownedProject(q, ctx, organizationId);
  if (projectId === null) return null;
  const { rows } = await q.query(`SELECT a.id AS artifact_pk, a.artifact_id,
    a.content AS head_content, a.content_hash AS head_content_hash,
    v.id AS version_id, v.version, v.content, v.content_hash
    FROM concept2cure_artifacts a JOIN concept2cure_artifact_versions v
      ON v.artifact_id=a.id AND v.organization_id=a.organization_id
    WHERE a.organization_id=$1 AND a.project_id=$2 AND a.artifact_id=$3
      AND v.version=$4 AND a.version=v.version AND ${artifactDataEligibleSql('a')}
    LIMIT 1`, [organizationId, projectId, selector.artifactId, selector.version]);
  const row = rows[0];
  if (!row || typeof row.content !== 'string' || !row.content.trim() || row.head_content !== row.content) return null;
  const contentSha256 = sha256(row.content);
  if (row.content_hash !== contentSha256 || row.head_content_hash !== contentSha256) return null;
  const artifactPk = Number(row.artifact_pk);
  const versionId = Number(row.version_id);
  if (!pgInteger(artifactPk) || !pgInteger(versionId) || Number(row.version) !== selector.version) return null;
  return { text: row.content, target: {
    organizationId, projectId, artifactPk, artifactId: row.artifact_id,
    versionId, version: selector.version, contentSha256,
  } };
}

function sameSavedText(before: SavedText, after: SavedText | null): boolean {
  return after !== null && before.text === after.text &&
    Object.entries(before.target).every(([key, value]) => after.target[key as keyof Target] === value);
}

async function compareText(expectedText: string, docText: string): Promise<Divergence | null> {
  // Exact bytes need no LCS or heading-map interpretation. For unequal text,
  // bound matrix cells, including its boundary row/column, before allocating.
  if (expectedText === docText) return { method: 'exact_text', additions: 0, deletions: 0 };
  const expectedLines = expectedText.split('\n').length + 1;
  const documentLines = docText.split('\n').length + 1;
  if (expectedLines * documentLines > MAX_DIFF_CELLS) return null;
  const { diffDocumentStructure } = await import('../document-analysis');
  const diff = diffDocumentStructure(expectedText, docText);
  return { method: 'line_diff', additions: diff.flat.additions, deletions: diff.flat.deletions, summary: diff.summary };
}

function findingMessage(ok: boolean, basis: string, missing: number, divergence?: Divergence): string {
  if (!divergence) {
    return `${ok ? 'Verified' : 'NOT verified'} — ${missing ? `${missing} required string(s) missing` : 'all required strings are present'}. ` +
      'No source text was supplied; the document was NOT compared against a source. Source qualification is unassessed.';
  }
  return `${ok ? 'Text fidelity passed' : 'Text fidelity failed'} against ${basis}: ` +
    `${divergence.additions} added / ${divergence.deletions} dropped line(s); ${missing} required string(s) missing. ` +
    'Source qualification is unassessed; this result does not authorize sealing.';
}

function requiredStringsOf(input: Record<string, unknown>): string[] {
  return Array.isArray(input.required_strings)
    ? input.required_strings.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
}
function hasCallerReference(input: Record<string, unknown>): boolean {
  return (typeof input.expected_text === 'string' && Boolean(input.expected_text)) || requiredStringsOf(input).length > 0;
}

async function referenceText(input: Record<string, unknown>, options: CheckOptions): Promise<ReferenceText | string> {
  const { selector, ctx, organizationId } = options;
  const q = selector ? getPool() : undefined;
  const saved = selector && q ? await loadSavedText(q, ctx, organizationId, selector) : undefined;
  if (selector && !saved) return refusal('VERIFICATION_TARGET_UNAVAILABLE', 'The selected owned current artifact/version is unavailable for fidelity comparison.');
  if (saved && input.expected_text !== undefined && input.expected_text !== saved.text) {
    return refusal('VERIFICATION_TEXT_CONFLICT', 'expected_text does not match the selected saved artifact version.');
  }
  const expectedText = saved?.text ?? (typeof input.expected_text === 'string' ? input.expected_text : '');
  return { saved: saved ?? undefined, expectedText, q };
}

async function extractComparison(input: Record<string, unknown>, resolvedPath: string, expectedText: string): Promise<Comparison | string> {
  const requiredStrings = requiredStringsOf(input);
  const bytes = await fs.readFile(resolvedPath);
  const { extractDocumentText } = await import('../ocr/index.js');
  const extracted = await extractDocumentText(bytes,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path.basename(resolvedPath));
  if (typeof extracted.text !== 'string') return refusal('VERIFICATION_UNAVAILABLE', 'DOCX text extraction did not return usable text.');
  const docText = extracted.text;
  const missingRequiredStrings = requiredStrings.filter(s => !docText.includes(s));
  const divergence = expectedText ? await compareText(expectedText, docText) : undefined;
  if (divergence === null) return refusal('VERIFICATION_DIFF_LIMIT', 'Text differs and exceeds the bounded line-diff comparison limit. Fidelity was not established.');
  return { bytes, docText, extractionMethod: extracted.method, requiredStrings, missingRequiredStrings, divergence };
}

function comparisonReport(options: CheckOptions, reference: ReferenceText, comparison: Comparison): string {
  const { saved, expectedText } = reference;
  const { bytes, docText, requiredStrings, missingRequiredStrings, divergence, extractionMethod } = comparison;
  const ok = missingRequiredStrings.length === 0 && (!divergence || (divergence.additions === 0 && divergence.deletions === 0));
  const scope = saved ? 'persisted_artifact_fidelity' : expectedText ? 'caller_text_fidelity' : 'required_strings_only';
  const comparisonBasis = saved ? 'persisted_artifact' : expectedText ? 'caller_supplied_text' : 'required_strings';
  return JSON.stringify({
    ok, scope, comparisonBasis, artifactVerified: Boolean(saved && ok), ...qualification,
    target: saved?.target, docxPath: options.docxPath, docxSha256: sha256(bytes), docxSizeBytes: bytes.length,
    extractionMethod, docCharCount: docText.length, extractedTextSha256: sha256(docText),
    comparisonTextSha256: expectedText ? sha256(expectedText) : undefined,
    requiredStringsChecked: requiredStrings.length, missingRequiredStrings,
    sourceDiffPerformed: Boolean(expectedText), divergence,
    message: findingMessage(ok, comparisonBasis, missingRequiredStrings.length, divergence),
    instruction: divergence
      ? 'Report text fidelity only. Source qualification is unassessed. Do not claim regulatory readiness or sealing approval.'
      : 'Only the required strings were checked. Do not claim there is no content divergence or that the document matches a source. Source qualification is unassessed.',
  });
}

async function checkDocument(input: Record<string, unknown>, options: CheckOptions): Promise<string> {
  const reference = await referenceText(input, options);
  if (typeof reference === 'string') return reference;
  const comparison = await extractComparison(input, options.resolvedPath, reference.expectedText);
  if (typeof comparison === 'string') return comparison;
  // No DB locks are held through extraction. Re-read identity, exact bytes,
  // hashes, current head, project membership, and disposition eligibility.
  const { saved, q } = reference;
  const { selector, ctx, organizationId } = options;
  if (saved && selector && q && !sameSavedText(saved, await loadSavedText(q, ctx, organizationId, selector))) {
    return refusal('VERIFICATION_TARGET_CHANGED', 'The saved target changed or became unavailable during verification.');
  }
  return comparisonReport(options, reference, comparison);
}

export async function verifyDocxFidelity(input: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const docxPath = typeof input.input_docx_path === 'string' ? input.input_docx_path : '';
  if (!docxPath) return refusal('INVALID_VERIFICATION_INPUT', 'verify_docx_against_source requires input_docx_path (string).');
  if (!ctx || !pgInteger(ctx.organizationId)) {
    return refusal('INVALID_VERIFICATION_TARGET', 'verify_docx_against_source requires tenant context (organizationId, positive integer).');
  }
  const organizationId = ctx.organizationId;
  // Preserve tenant-workspace confinement before any database access or file read.
  const docx = workspacePathOrRefusal(docxPath, 'input_docx_path', organizationId);
  if (!docx.ok) return docx.refusal;
  const selected = input.artifact_id !== undefined || input.version_number !== undefined;
  let selector: Selector | undefined;
  if (selected) {
    if (typeof input.artifact_id !== 'string' || !input.artifact_id.trim() ||
        !pgInteger(input.version_number) || !validProjectContext(ctx)) {
      return refusal('INVALID_VERIFICATION_TARGET', 'artifact_id and version_number require a complete valid target and server project context.');
    }
    selector = { artifactId: input.artifact_id, version: input.version_number };
  } else if (!hasCallerReference(input)) {
    return refusal('INVALID_VERIFICATION_INPUT', 'verify_docx_against_source requires a saved target, expected_text and/or a non-empty required_strings array.');
  }
  try {
    return await checkDocument(input, { ctx, organizationId, docxPath, resolvedPath: docx.path, selector });
  } catch {
    return refusal('VERIFICATION_UNAVAILABLE', 'DOCX fidelity verification could not complete. Check the readable Word document and availability of the saved target store.');
  }
}
