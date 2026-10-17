/** Runtime receipts for assembly in the existing saved document. */
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import type { AssemblyCommitData, AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export const normalizedAssemblyCode = (code: string): string => code.trim().toUpperCase();
export interface AssemblyFailure { ok: false; unknown: boolean; message: string }
export type AssemblyResult<T> = { ok: true; data: T } | AssemblyFailure;

function sameSelection(value: unknown, expected: AssemblyPreviewInput['selection']): boolean {
  const selection = record(value);
  return selection?.target === expected.target && (expected.target === 'document'
    || (typeof selection.code === 'string' && normalizedAssemblyCode(selection.code) === normalizedAssemblyCode(expected.code)));
}
function validPlanRow(value: unknown): boolean {
  const row = record(value);
  if (!row || !text(row.code) || typeof row.title !== 'string' || typeof row.content !== 'string') return false;
  if (!Number.isInteger(row.ordering) || typeof row.aiDraftable !== 'boolean' || typeof row.aiDraftableReason !== 'string' || !strings(row.gaps)) return false;
  if (row.draftingGuidance !== undefined && typeof row.draftingGuidance !== 'string') return false;
  return row.disposition === 'append' || (row.disposition === 'preserve' && text(row.existingSectionId));
}
function validPlanIdentity(plan: Record<string, unknown>, docId: string, input: AssemblyPreviewInput): boolean {
  return plan.version === 1 && plan.docId === docId && plan.programId === input.programId && plan.templateId === input.templateId
    && sameSelection(plan.selection, input.selection) && text(plan.fingerprint) && text(plan.targetSnapshot) && text(plan.templateSnapshot);
}
function validPlanContents(plan: Record<string, unknown>): boolean {
  return typeof plan.templateName === 'string' && strings(plan.limitations) && strings(plan.gaps)
    && Array.isArray(plan.rows) && plan.rows.length > 0 && plan.rows.every(validPlanRow)
    && (plan.draftRegion === null || ['FDA', 'EMA', 'PMDA', 'Health Canada'].includes(String(plan.draftRegion)));
}
export function readAssemblyPlan(raw: unknown, docId: string, input: AssemblyPreviewInput): AssemblyPlan | null {
  const plan = record(raw);
  if (!plan || !validPlanIdentity(plan, docId, input) || !validPlanContents(plan)) return null;
  const rows = plan.rows as Array<Record<string, unknown>>;
  const codes = rows.map(row => normalizedAssemblyCode(row.code as string));
  if (new Set(codes).size !== codes.length) return null;
  if (input.selection.target === 'section' && (codes.length !== 1 || codes[0] !== normalizedAssemblyCode(input.selection.code))) return null;
  return plan as unknown as AssemblyPlan;
}
export function readAssemblySections(raw: unknown, docId: string): AssemblySection[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = raw.every(value => {
    const row = record(value);
    return row?.doc_id === docId && text(row.id) && text(row.code) && typeof row.title === 'string' && typeof row.content === 'string'
      && Number.isInteger(row.order_index) && (row.updated_at === null || typeof row.updated_at === 'string');
  });
  if (!valid) return null;
  const rows = raw as AssemblySection[];
  return new Set(rows.map(row => row.id)).size === rows.length && new Set(rows.map(row => normalizedAssemblyCode(row.code))).size === rows.length ? rows : null;
}
export function readAssemblyCommit(raw: unknown, docId: string, input: AssemblyPreviewInput, fingerprint: string): AssemblyCommitData | null {
  const data = record(raw);
  if (data?.docId !== docId || data.programId !== input.programId) return null;
  const plan = readAssemblyPlan(data.plan, docId, input);
  const sections = readAssemblySections(data.sections, docId);
  if (!plan || plan.fingerprint !== fingerprint || !sections || sections.length !== plan.rows.length) return null;
  const exact = plan.rows.every(row => sections.some(section => section.code === row.code && section.title === row.title
    && section.content === row.content && section.order_index === row.ordering
    && (row.disposition !== 'preserve' || row.existingSectionId === section.id)));
  return exact ? { docId, programId: input.programId, plan, sections } : null;
}

function assemblyResponse<T>(response: Response, body: Record<string, unknown> | null, decode: (raw: unknown) => T | null, current: boolean, writing: boolean): AssemblyResult<T> {
  if (!response.ok) return { ok: false, unknown: writing && response.status >= 500, message: serverMessage(body) ?? `HTTP ${response.status}` };
  const data = body?.success === true ? decode(body.data) : null;
  if (data && (current || writing)) return { ok: true, data };
  return { ok: false, unknown: writing, message: current ? 'The server did not confirm the exact assembly receipt. Check the saved document before continuing.' : 'The document context changed. Inspect the saved document before continuing.' };
}
function assemblyException(error: unknown, writing: boolean): AssemblyFailure {
  const refused = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
  return { ok: false, unknown: writing && !refused, message: error instanceof Error ? redactInternals(error.message, 'The assembly request failed.') : 'The assembly request failed.' };
}
export async function requestAssembly<T>(path: string, input: unknown, decode: (raw: unknown) => T | null, current: () => boolean, writing = false): Promise<AssemblyResult<T>> {
  if (!current()) return { ok: false, unknown: false, message: 'The document context changed. No later action was started.' };
  try {
    const response = await apiRequest('POST', path, input);
    const body = record(await response.json().catch(() => null));
    return assemblyResponse(response, body, decode, current(), writing);
  } catch (error) { return assemblyException(error, writing); }
}

/** Inventory membership is required because document detail omits project ID. */
export async function inspectAssemblyDocument(docId: string, programId: string, current: () => boolean): Promise<AssemblySection[] | null> {
  const read = async (path: string) => {
    if (!current()) return null;
    const response = await apiRequest('GET', path);
    if (!current()) return null;
    const body = record(await response.json().catch(() => null));
    return current() && response.ok && body?.success === true ? body : null;
  };
  try {
    const inventory = await read(`/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`);
    if (!Array.isArray(inventory?.documents) || !inventory.documents.every(row => record(row)?.program_id === programId)
      || !inventory.documents.some(row => record(row)?.id === docId)) return null;
    const detail = await read(`/api/authoring/docs/${encodeURIComponent(docId)}`);
    if (record(detail?.document)?.id !== docId) return null;
    const body = await read(`/api/authoring/docs/${encodeURIComponent(docId)}/sections`);
    return readAssemblySections(body?.sections, docId);
  } catch { return null; }
}
