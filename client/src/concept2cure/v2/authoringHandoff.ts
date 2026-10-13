/**
 * authoringHandoff — the one path from a specialist surface into the governed
 * authoring store.
 *
 * Three surfaces end with "Open in document editor": Biostatistics (a
 * statistical document), ReportEngine (a protocol analysis) and CmcModule (a
 * change-impact assessment). Each has to create a document, write its text as a
 * section, and only then navigate — because navigating first would take the
 * user to an editor that does not have their work.
 *
 * All three carried their own ~45-line copy of that sequence, identical down to
 * the `openingRef` double-click guard, the 401 branch, and the "Staying here so
 * you don't lose it" wording of the half-failed case. They differed in four
 * values (title, module, code, content) and one noun.
 *
 * That is a bad thing to have three of. The half-failure case in particular —
 * document created, section write failed — is the one that decides whether a
 * user loses work, and three copies of it is three chances for one to drift
 * into navigating away anyway. This module is the single copy; hosts supply the
 * four values and render the returned message.
 *
 * @module client/src/concept2cure/v2/authoringHandoff
 */

import { apiRequest } from '@/lib/queryClient';
import { unboundNotice } from './governanceNotice';
import { shellProgramId } from './shellProject';

export interface AuthoringHandoff {
  title: string;
  /**
   * CTD module the document files under. REQUIRED, and deliberately not
   * defaulted here: the server falls back to 'M3' when it is omitted, which is
   * right for quality documentation and wrong for everything else. Making each
   * caller state it keeps that decision at the surface that knows the answer.
   */
  module: string;
  /**
   * Section code. Deliberately NOT a CTD number: the editor binds outline nodes
   * to sections by exact code match (`findSectionForNode` in `useFilingOutline`),
   * so a numeric code would assert a filing position these surfaces cannot know.
   */
  code: string;
  content: string;
  /**
   * What the user would call the thing on screen — "the document", "the
   * analysis", "the assessment". It appears in the failure messages, which
   * promise that it is still here.
   */
  subject: string;
}

export type AuthoringHandoffResult =
  /** Document and section both written. Safe to navigate. */
  | { ok: true; docId: string; message: string }
  /**
   * Nothing was written, or the document exists but its text does not. Either
   * way the caller must STAY PUT: navigating now would leave the user looking
   * at an editor that does not contain what they just made.
   */
  | { ok: false; message: string };

/**
 * Create a governed document and write `content` into it as one section.
 *
 * Never throws: every failure comes back as `{ ok: false, message }` with text
 * fit to show the user, so a caller cannot accidentally navigate on a rejected
 * promise.
 */
export async function saveToAuthoring(h: AuthoringHandoff): Promise<AuthoringHandoffResult> {
  // A document belongs to a project (PF-07; founder decision 2026-09-26), and
  // is created in the open one — the same project the editor lists. With none
  // open it is not created: it used to be made org-wide, where no project ever
  // listed it. Refused here, before any request, so the work stays put.
  const programId = shellProgramId();
  if (!programId) {
    return {
      ok: false,
      message: `Not opened — open a project first: a document belongs to a project. Nothing was saved; ${h.subject} is still here.`,
    };
  }
  try {
    const dRes = await apiRequest('POST', '/api/authoring/docs', {
      title: h.title,
      module: h.module,
      client_program_id: programId,
    });
    const dJson = (await dRes.json().catch(() => null)) as
      | { document?: { id?: unknown }; governance?: unknown; error?: string }
      | null;
    if (!dRes.ok || !dJson?.document?.id) {
      return {
        ok: false,
        message:
          dRes.status === 401
            ? `Not opened — your session isn’t authenticated. Nothing was saved; ${h.subject} is still here.`
            : `Couldn’t create the document — ${dJson?.error ?? 'HTTP ' + dRes.status}. Nothing was saved; ${h.subject} is still here.`,
      };
    }

    const docId = String(dJson.document.id);
    const sRes = await apiRequest('POST', '/api/authoring/sections', {
      doc_id: docId,
      code: h.code,
      title: h.title,
      content: h.content,
    });
    const sJson = (await sRes.json().catch(() => null)) as
      | { section?: { id?: unknown }; error?: string }
      | null;
    if (!sRes.ok || !sJson?.section?.id) {
      // The document exists but is empty. Reporting ok:false is what keeps the
      // caller from navigating to it.
      return {
        ok: false,
        message: `The document was created but its text didn’t save — ${sJson?.error ?? 'HTTP ' + sRes.status}. Staying here so you don’t lose it.`,
      };
    }

    return {
      ok: true,
      docId,
      // Shown only when the host has no navigator wired: say where the work
      // went rather than appearing to do nothing.
      //
      // Plus, when the server declined to bind the new document to the open
      // project's governed filing, the reason it gave. The document is real and
      // the text is saved either way — but "saved" and "saved into the filing
      // you think you are writing" are different facts, and on a regulated
      // surface conflating them is the drift this binding exists to prevent.
      message:
        `Saved to the authoring store as “${h.title}” — open Document authoring to edit it.` +
        unboundNotice(dJson.governance),
    };
  } catch (e) {
    return {
      ok: false,
      message: `Couldn’t open in the editor — ${e instanceof Error ? e.message : String(e)}. Nothing was saved.`,
    };
  }
}

export type { WorkflowImportSource } from '@shared/authoring/source-import';
import type { AuthoringSourceImportData, AuthoringSourceImportPreviewData, WorkflowImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';
import { redactInternals, serverMessage } from '@/lib/queryClient';

export function isWorkflowSource(source: unknown): source is WorkflowImportSource {
  if (!source || typeof source !== 'object') return false;
  const kind = (source as { kind?: unknown }).kind;
  return kind === 'protocol' || kind === 'csr';
}

/** Stable selection identity; ordering does not change a CSR selection. */
export function workflowSourceKey(source: WorkflowImportSource): string {
  if (source.kind === 'protocol') return `protocol:${source.documentId}`;
  if (source.sectionNumbers !== undefined && (!Array.isArray(source.sectionNumbers) || !source.sectionNumbers.every(s => typeof s === 'string'))) return 'invalid-selection';
  return `csr:${source.jobId}:${[...new Set(source.sectionNumbers?.map(s => s.trim()) ?? [])].sort().join(',')}`;
}
const importHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(s => typeof s === 'string');
function validSectionOrigin(section: WorkflowImportOrigin['sectionOrigins'][number]): boolean {
  return !!section && typeof section.code === 'string' && importHash(section.contentSha256)
    && typeof section.sourceRowId === 'string' && ['machine', 'template', 'unknown'].includes(section.originalAuthorship)
    && ['unrecorded', 'recorded-name-only'].includes(section.modelEvidence) && (section.model === null || typeof section.model === 'string');
}
function validWorkflowMetadata(origin: WorkflowImportOrigin): boolean {
  return (origin.version === null || typeof origin.version === 'string')
    && !!origin.sourceScope && ['organization', 'program', 'project'].includes(origin.sourceScope.level)
    && !!origin.association && ['recorded', 'explicit'].includes(origin.association.mode)
    && (origin.association.reason === null || typeof origin.association.reason === 'string');
}
function matchingWorkflowTarget(origin: WorkflowImportOrigin, programId: string, source: WorkflowImportSource): boolean {
  return origin.kind === source.kind && origin.programId === programId && importHash(origin.fingerprint);
}
export function workflowOriginMatches(origin: WorkflowImportOrigin | undefined, programId: string, source: WorkflowImportSource | undefined): boolean {
  if (!origin || !isWorkflowSource(source) || !matchingWorkflowTarget(origin, programId, source)) return false;
  const id = source.kind === 'protocol' ? source.documentId : source.jobId;
  if (String(origin.id) !== String(id) || !isWorkflowSource(origin.selection) || origin.selection.kind !== source.kind) return false;
  if (workflowSourceKey(origin.selection) !== workflowSourceKey(source)) return false;
  return typeof origin.title === 'string' && Array.isArray(origin.sectionOrigins) && origin.sectionOrigins.length > 0
    && origin.sectionOrigins.every(validSectionOrigin) && stringList(origin.gaps) && validWorkflowMetadata(origin);
}
function validPreviewSections(sections: AuthoringSourceImportPreviewData['sections']): boolean {
  return Array.isArray(sections) && sections.length > 0 && sections.every(s => !!s && typeof s.code === 'string'
    && !!s.code.trim() && typeof s.title === 'string' && importHash(s.contentSha256));
}
function matchingPreviewScope(data: AuthoringSourceImportPreviewData, programId: string): boolean {
  return data.fingerprint === data.origin.fingerprint && data.target?.programId === programId
    && data.association?.targetProgramId === programId && typeof data.association.required === 'boolean';
}
export function readWorkflowPreview(body: unknown, programId: string, source: WorkflowImportSource): AuthoringSourceImportPreviewData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportPreviewData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !data || data.preview !== true || !workflowOriginMatches(data.origin, programId, source)) return null;
  if (!matchingPreviewScope(data, programId) || !validPreviewSections(data.sections) || !stringList(data.gaps) || !stringList(data.warnings)) return null;
  return data;
}
function validSavedCopy(data: AuthoringSourceImportData | undefined, programId: string): data is AuthoringSourceImportData {
  if (!data || typeof data.doc?.id !== 'string' || !data.doc.id.trim() || typeof data.doc.title !== 'string') return false;
  if (data.doc.client_program_id !== undefined && data.doc.client_program_id !== programId) return false;
  return typeof data.reused === 'boolean' && stringList(data.warnings) && Array.isArray(data.sections) && data.sections.length > 0;
}
function savedSectionsMatch(data: AuthoringSourceImportData, preview: AuthoringSourceImportPreviewData): boolean {
  const codes = new Set(preview.sections.map(s => s.code));
  const savedCodes = new Set(data.sections.map(s => s?.code));
  return savedCodes.size === codes.size && data.sections.every(s => !!s && typeof s.id === 'string' && typeof s.code === 'string' && codes.has(s.code));
}
export function readWorkflowImportResult(body: unknown, programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData): AuthoringSourceImportData | null {
  const envelope = body as { success?: boolean; data?: AuthoringSourceImportData } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !validSavedCopy(data, programId) || !isWorkflowSource(data.origin)) return null;
  if (!workflowOriginMatches(data.origin as WorkflowImportOrigin, programId, source)) return null;
  if ((data.origin as WorkflowImportOrigin).fingerprint !== preview.fingerprint || !savedSectionsMatch(data, preview)) return null;
  return data;
}

type IntakeReply<T> = { ok: true; data: T } | { ok: false; message: string };
async function requestWorkflowIntake<T>(payload: Record<string, unknown>, read: (body: unknown) => T | null): Promise<IntakeReply<T>> {
  try {
    const res = await apiRequest('POST', '/api/authoring/import/source', payload);
    const body = await res.json().catch(() => null);
    const data = res.ok ? read(body) : null;
    return data ? { ok: true, data } : { ok: false, message: serverMessage(body) ?? 'The server did not confirm this source and target. Reload the preview before retrying.' };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The source intake could not be reached. Nothing was opened.') };
  }
}
export function previewWorkflowImport(programId: string, source: WorkflowImportSource) {
  return requestWorkflowIntake({ programId, source, previewOnly: true }, body => readWorkflowPreview(body, programId, source));
}
export function createWorkflowImport(programId: string, source: WorkflowImportSource, preview: AuthoringSourceImportPreviewData, reason: string, associationReason?: string) {
  return requestWorkflowIntake({ programId, source, expectedFingerprint: preview.fingerprint, reason,
    ...(associationReason ? { associationReason } : {}) }, body => readWorkflowImportResult(body, programId, source, preview));
}
