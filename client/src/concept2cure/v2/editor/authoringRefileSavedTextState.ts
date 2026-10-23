/** Exact source/receipt protocol for the existing saved-section filing action. */
import { mutateVerbatim, mutationUnconfirmed, type MutateResult } from '../surfaces/SubmissionSeqWorkspaces';
import { filingSectionKey } from '@shared/regulatory/filing-section-key';

export interface RefileSavedSource {
  documentId: string; sectionId: string; programId: string; filingDocumentId: string; updatedAt: string;
  sectionCode: string; sectionTitle: string; documentTitle: string; filingTitle: string;
}
interface FilingReceipt { committed: true; documentId: string; sectionKey: string; partOf?: string }
export interface RefileReceipt { success: true; refiled: true; revision_created: false; source: Record<string, string>; filing: FilingReceipt }
export const RECONCILE = 'The filing result could not be confirmed. Check the filing and its audit history before trying again. Reopening this action does not retry it.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export function validRefileSource(source: RefileSavedSource | null): source is RefileSavedSource {
  return !!source && [source.documentId, source.sectionId, source.programId].every(id => UUID.test(id))
    && text(source.filingDocumentId) && source.filingDocumentId.length <= 512
    && source.filingDocumentId.trim() === source.filingDocumentId && [...source.filingDocumentId].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    && text(source.updatedAt) && Number.isFinite(Date.parse(source.updatedAt));
}
export const sourcePin = (source: RefileSavedSource | null) => source ? JSON.stringify([source.documentId, source.sectionId, source.programId, source.filingDocumentId, source.updatedAt]) : '';
export const operationKey = (scope: string, source: RefileSavedSource) => JSON.stringify([scope, source.documentId, source.sectionId]);
export function refileSavedSource(input: {
  document: { id: string; title: string; c2c_document_id?: string | null } | null;
  metadata: { id?: unknown; c2c_document_id?: unknown; client_program_id?: unknown; status?: unknown } | null | undefined;
  section: { id: string; doc_id: string; code: string; title: string; updated_at: string | null } | null;
  programId: string | null; filingTitle: string;
}): RefileSavedSource | null {
  const { document: doc, metadata, section, programId, filingTitle } = input;
  if (!doc || !metadata || !section || !programId || metadata.id !== doc.id || section.doc_id !== doc.id) return null;
  if (metadata.client_program_id !== programId || metadata.c2c_document_id !== doc.c2c_document_id
    || typeof doc.c2c_document_id !== 'string' || ['FROZEN', 'APPROVED'].includes(String(metadata.status).toUpperCase())) return null;
  const source = { documentId: doc.id, sectionId: section.id, programId, filingDocumentId: doc.c2c_document_id,
    updatedAt: section.updated_at ?? '', sectionCode: section.code, sectionTitle: section.title, documentTitle: doc.title, filingTitle };
  return validRefileSource(source) ? source : null;
}
export function refileControlRefusal(state: { editRefusal: string | null; sealed: boolean; dirty: boolean; busy: boolean }): string | null {
  if (state.editRefusal) return state.editRefusal;
  if (state.sealed) return 'This document is sealed. Its saved text cannot be re-filed from this editing copy.';
  if (state.dirty) return 'Save or discard the unsaved edits before re-filing saved text.';
  return state.busy ? 'Finish the current editor action before re-filing saved text.' : null;
}
function matchingSource(raw: unknown, source: RefileSavedSource): boolean {
  if (!object(raw)) return false;
  const expected = { documentId: source.documentId, sectionId: source.sectionId, programId: source.programId,
    filingDocumentId: source.filingDocumentId, updatedAt: source.updatedAt };
  return Object.keys(raw).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => raw[key] === value);
}
function matchingFiling(raw: unknown, source: RefileSavedSource): boolean {
  if (!object(raw) || Object.keys(raw).some(key => !['committed', 'documentId', 'sectionKey', 'partOf'].includes(key))) return false;
  if (raw.committed !== true || raw.documentId !== source.filingDocumentId || !text(raw.sectionKey)) return false;
  if (raw.partOf === undefined) return raw.sectionKey === source.sectionCode;
  return text(raw.partOf) && raw.partOf === raw.sectionKey
    && filingSectionKey([raw.sectionKey], source.sectionCode) === raw.sectionKey;
}
export function readRefileReceipt(body: unknown, source: RefileSavedSource): RefileReceipt | null {
  if (!object(body) || body.success !== true || body.refiled !== true || body.revision_created !== false) return null;
  if (Object.keys(body).some(key => !['success', 'refiled', 'revision_created', 'source', 'filing'].includes(key))) return null;
  return matchingSource(body.source, source) && matchingFiling(body.filing, source) ? body as unknown as RefileReceipt : null;
}
function contradictoryRefusal(body: unknown, depth = 0): boolean {
  if (depth > 6) return true;
  if (typeof body === 'string') return /OUTCOME_UNKNOWN|unknown|unconfirmed/i.test(body);
  if (Array.isArray(body)) return body.some(value => contradictoryRefusal(value, depth + 1));
  if (!object(body)) return false;
  return Object.entries(body).some(([key, value]) =>
    (['success', 'refiled', 'committed', 'recorded', 'persisted', 'written', 'revision_created'].includes(key) && value === true)
    || contradictoryRefusal(value, depth + 1));
}
function unknownRefileOutcome(reply: MutateResult<unknown>): boolean {
  return !!reply.unconfirmed || mutationUnconfirmed(reply.status, reply.code) || reply.data != null
    || !reply.error || !object(reply.body) || contradictoryRefusal(reply.body);
}
function receiptMessage(source: RefileSavedSource, filing: FilingReceipt): string {
  return `Saved text for ${source.sectionCode} was re-filed${filing.partOf ? ` as part of section ${filing.partOf}` : ''}. No Authoring content revision was created.`;
}

export interface RefileAttempt {
  state: 'confirmed' | 'unknown' | 'refused'; message: string; receipt: RefileReceipt | null;
}
export async function attemptRefileSavedText(source: RefileSavedSource, reason: string): Promise<RefileAttempt> {
  const reply = await mutateVerbatim<unknown>('PATCH', `/api/authoring/sections/${encodeURIComponent(source.sectionId)}`, {
    filingOnly: true, expectedDocumentId: source.documentId, expectedFilingDocumentId: source.filingDocumentId,
    expectedProgramId: source.programId, expectedUpdatedAt: source.updatedAt, changeReason: reason,
  });
  const receipt = reply.status === 200 && !reply.error && !reply.unconfirmed ? readRefileReceipt(reply.data, source) : null;
  if (receipt) return { state: 'confirmed', receipt, message: receiptMessage(source, receipt.filing) };
  if (unknownRefileOutcome(reply)) return { state: 'unknown', receipt: null, message: RECONCILE };
  return { state: 'refused', receipt: null, message: reply.error! };
}
