/** Resolution split from the shared workbench; no new document or admission path. */
import { isEditorFilingDocumentId, matchEditorTargetSection, type EditorTarget } from '../editorTarget';
import { authoringCurrentReadPath } from './authoringCurrentRead';
import { sourceMetadataUnavailable } from './savedTemplateContext';

interface WorkingCopy { id: string; c2c_document_id?: string | null }
interface Filing { id: string; project_id: string; doc_type: string }
interface Section { id: string; doc_id: string; code: string; title: string }
type Target = Pick<EditorTarget, 'sectionCode' | 'sectionLabel' | 'filingDocumentId'>;
type Read = (path: string) => Promise<{ ok: boolean; status: number; body: unknown }>;
type Resolution = { kind: 'match'; documentId: string; section: Section }
  | { kind: 'document'; documentId: string }
  | { kind: 'retired' }
  | { kind: 'missing' | 'ambiguous' | 'refused' | 'unavailable'; message: string };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const identity = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value === value.trim();

/** Inventory order is not authority; additions/removals/rebindings retire a pending lookup. */
export function filingTargetInventoryKey(docs: readonly WorkingCopy[]): string {
  return JSON.stringify(docs.map(doc => [doc.id, doc.c2c_document_id]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** A current admitted header outranks the list. Missing metadata is never an unbound claim. */
export function workingFilingBinding(input: { activeId: string | null; projectId: string | null; listed: WorkingCopy | null;
  header: Record<string, unknown> | null; headerAnswered: boolean; headerAvailable: boolean }): { known: boolean; documentId: string | null } {
  if (!input.activeId) return { known: true, documentId: null };
  const source = input.headerAnswered ? input.headerAvailable && input.header?.id === input.activeId
    && input.header.client_program_id === input.projectId ? input.header : null
    : input.listed?.id === input.activeId ? input.listed : null;
  const id = source?.c2c_document_id;
  return id === null || identity(id) ? { known: true, documentId: id } : { known: false, documentId: null };
}

function failed(status: number, what: string): Resolution {
  return [401, 403, 404].includes(status)
    ? { kind: 'refused', message: `${what} were refused for current access. Nothing was opened.` }
    : { kind: 'unavailable', message: `${what} could not be read or verified. Nothing was opened.` };
}

function filingsOf(body: unknown, projectId: string, docType: string): Filing[] | null {
  if (record(body)?.success === false) return null;
  const rows = record(body)?.documents;
  if (!Array.isArray(rows)) return null;
  const ids = new Set<string>();
  return rows.every(row => {
    const r = record(row);
    if (!r || !identity(r.id) || r.project_id !== projectId || r.doc_type !== docType || ids.has(r.id)) return false;
    ids.add(r.id); return true;
  }) ? rows as Filing[] : null;
}

function sectionsOf(body: unknown, documentId: string): Section[] | null {
  if (record(body)?.success === false) return null;
  const rows = record(body)?.sections;
  if (!Array.isArray(rows)) return null;
  const ids = new Set<string>();
  return rows.every(row => {
    const r = record(row);
    if (!r || !identity(r.id) || r.doc_id !== documentId || typeof r.code !== 'string' || typeof r.title !== 'string' || ids.has(r.id)) return false;
    ids.add(r.id); return true;
  }) ? rows as Section[] : null;
}

/** Canonical match precedence applies globally, including duplicate numeric aliases and titles. */
function bestMatches(rows: Array<{ documentId: string; section: Section }>, target: Target) {
  const code = target.sectionCode?.trim() ?? '';
  const exact = code ? rows.filter(r => r.section.code.trim().toLowerCase() === code.toLowerCase()) : [];
  if (exact.length) return exact;
  const numeric = code && Number.isFinite(Number(code))
    ? rows.filter(r => r.section.code.trim() && Number(r.section.code.trim()) === Number(code)) : [];
  return numeric.length ? numeric : rows.filter(r => matchEditorTargetSection([r.section], { sectionCode: null, sectionLabel: target.sectionLabel }));
}

async function verifiedHeader(read: Read, doc: WorkingCopy, projectId: string, current: () => boolean): Promise<Resolution | null> {
  if (!current()) return { kind: 'retired' };
  const result = await read(authoringCurrentReadPath(doc.id, projectId));
  if (!current()) return { kind: 'retired' };
  if (!result.ok) return failed(result.status, 'The matching working-document records');
  const header = record(result.body)?.success === false ? null : record(record(result.body)?.document);
  return header?.id === doc.id && header.client_program_id === projectId && header.c2c_document_id === doc.c2c_document_id
    && !sourceMetadataUnavailable(header)
    ? null : failed(0, 'The matching working-document bindings');
}

async function readCandidateSections(candidates: readonly WorkingCopy[], projectId: string, read: Read, current: () => boolean) {
  const rows: Array<{ documentId: string; section: Section }> = [];
  for (const doc of candidates) {
    const refusal = await verifiedHeader(read, doc, projectId, current);
    if (refusal) return { refusal };
    const response = await read(authoringCurrentReadPath(doc.id, projectId, true));
    if (!current()) return { refusal: { kind: 'retired' } as Resolution };
    if (!response.ok) return { refusal: failed(response.status, 'The matching working-document sections') };
    const sections = sectionsOf(response.body, doc.id);
    if (!sections) return { refusal: failed(0, 'The matching working-document sections') };
    rows.push(...sections.map(section => ({ documentId: doc.id, section })));
  }
  return { rows };
}

async function uniqueSection(rows: Array<{ documentId: string; section: Section }>, target: Target, candidates: readonly WorkingCopy[],
  context: { projectId: string; read: Read; current: () => boolean }): Promise<Resolution> {
  const { projectId, read, current } = context;
  const matches = bestMatches(rows, target);
  if (!matches.length) return { kind: 'missing', message: 'The requested section is not in the accessible working copies bound to this filing. Nothing else was selected.' };
  if (matches.length !== 1) return { kind: 'ambiguous', message: 'More than one accessible section matches the requested filing section. Choose the exact working document from the project and retry.' };
  const match = matches[0];
  const refusal = await verifiedHeader(read, candidates.find(doc => doc.id === match.documentId)!, projectId, current);
  return refusal ?? { kind: 'match', ...match };
}

async function resolveBoundTarget(candidates: readonly WorkingCopy[], target: Target,
  context: { projectId: string; read: Read; current: () => boolean }): Promise<Resolution> {
  const { projectId, read, current } = context;
  const wholeFiling = target.filingDocumentId !== undefined && !target.sectionCode?.trim() && !target.sectionLabel?.trim();
  if (wholeFiling) {
    if (candidates.length !== 1) return { kind: 'ambiguous', message: 'More than one accessible working copy is bound to this filing. Choose the exact working document from the project and retry.' };
    const refusal = await verifiedHeader(read, candidates[0], projectId, current);
    return refusal ?? { kind: 'document', documentId: candidates[0].id };
  }
  const sections = await readCandidateSections(candidates, projectId, read, current);
  if (sections.refusal) return sections.refusal;
  return uniqueSection(sections.rows!, target, candidates, context);
}

function boundCandidates(filings: Filing[], docs: readonly WorkingCopy[], filingDocumentId?: string) {
  const selected = filingDocumentId === undefined ? filings : filings.filter(f => f.id === filingDocumentId);
  if (!selected.length) return { refusal: { kind: 'missing', message: 'The exact linked filing is not in this project and document family. No other filing was selected.' } as Resolution };
  if (new Set(docs.map(doc => doc.id)).size !== docs.length || docs.some(doc => !identity(doc.id))) return { refusal: failed(0, 'The accessible working-document list') };
  const ids = new Set(selected.map(f => f.id));
  const candidates = docs.filter(doc => typeof doc.c2c_document_id === 'string' && ids.has(doc.c2c_document_id));
  return candidates.length ? { candidates } : { refusal: { kind: 'missing',
    message: 'No accessible working document is bound to the requested filing. Open its working copy from the project and retry.' } as Resolution };
}

export async function resolveFilingSectionTarget(input: { projectId: string | null; docType: string; target: Target;
  docs: readonly WorkingCopy[]; read: Read; current: () => boolean }): Promise<Resolution> {
  const { projectId, docType, target, docs, read, current } = input;
  if (!current()) return { kind: 'retired' };
  if (target.filingDocumentId !== undefined && !isEditorFilingDocumentId(target.filingDocumentId)) return { kind: 'unavailable', message: 'The exact linked filing identity is invalid. No broader filing lookup was attempted.' };
  if (!projectId) return { kind: 'missing', message: 'Open the target project before opening its filing.' };
  try {
    const result = await read(`/api/c2c/documents?projectId=${encodeURIComponent(projectId)}&docType=${encodeURIComponent(docType)}`);
    if (!current()) return { kind: 'retired' };
    if (!result.ok) return failed(result.status, 'The matching project filings');
    const filings = filingsOf(result.body, projectId, docType);
    if (!filings) return failed(0, 'The matching project filings');
    if (!filings.length) return { kind: 'missing', message: `No ${docType.toUpperCase()} filing is recorded for this project. Nothing was opened.` };
    const selection = boundCandidates(filings, docs, target.filingDocumentId);
    if (selection.refusal) return selection.refusal;
    return await resolveBoundTarget(selection.candidates!, target, { projectId, read, current });
  } catch { return current() ? failed(0, 'The matching filing records') : { kind: 'retired' }; }
}
