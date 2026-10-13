import { apiRequest } from '@/lib/queryClient';
import { isProgramId } from './draftToDocument';
import type { AskOrigin } from './askAnaToDraft';
import type { EditorBridge } from './DocumentWorkbench';

export interface VerifiedOriginDocument {
  docId: string;
  programId: string;
  sectionId?: string;
  title: string;
}
export type OriginDocumentRead =
  | { state: 'none' | 'loading' }
  | { state: 'ready'; document: VerifiedOriginDocument }
  | { state: 'error'; message: string };

const UNVERIFIED = 'The saved document could not be verified in the open project. Try again, return to Authoring, or remove the source context to ask a different question.';

/** A collapsed canvas names the actual section it read, before its bridge mounts. */
export function originForSavedSection(document: { id: string; title: string }, section: {
  id: string; code: string; title: string; updated_at?: string | null;
}, programId: string | null): AskOrigin {
  return {
    surfaceId: 'document-authoring', label: 'Authoring',
    moduleContext: { documentId: document.id, documentTitle: document.title, sectionId: section.id, sectionCode: section.code, sectionTitle: section.title, sectionUpdatedAt: section.updated_at, savedRecordOnly: true },
    ...(programId ? {
      authoringDocument: { docId: document.id, programId, sectionId: section.id },
      authoringContext: { projectId: programId, workflowStage: 'section-workspace', artifactId: document.id, sectionId: section.id, sectionCode: section.code, sectionTitle: section.title, sectionUpdatedAt: section.updated_at ?? undefined },
    } : {}),
  };
}

/** Unverified editor identity never reaches the turn's authoring channel. */
export function originTurnContext(origin: AskOrigin | null, read: OriginDocumentRead, projectId: string | number | null, bridge?: EditorBridge | null, bridgeOpen = true) {
  if (!origin) return null;
  if (origin.authoringDocument && (read.state !== 'ready' || read.document.programId !== projectId)) return null;
  if (origin.authoringDocument && bridge && bridgeNamesOrigin(origin, bridge, bridgeOpen) && !editorScopeRefusal(bridge, projectId)) {
    return { screenName: origin.surfaceId, authoringContext: bridge.authoringContext, moduleContext: bridge.moduleContext };
  }
  const context = origin.authoringContext;
  const verifiedAuthoring = context?.projectId === projectId && (!context.artifactId || read.state === 'ready');
  return {
    moduleContext: origin.moduleContext ?? null, screenName: origin.surfaceId,
    ...(verifiedAuthoring ? { authoringContext: context } : {}),
  };
}

/** A hidden buffer can refresh its attached saved version, never its target. */
function bridgeNamesOrigin(origin: AskOrigin, bridge: EditorBridge, open: boolean): boolean {
  return open || (origin.authoringDocument?.docId === bridge.docId && origin.authoringDocument.sectionId === bridge.sectionId);
}

/** A retained canvas buffer does not grant access to the newly open project. */
export function editorScopeRefusal(bridge: EditorBridge, projectId: string | number | null): string | null {
  const context = bridge.authoringContext;
  if (!isProgramId(projectId) || context?.projectId !== projectId) {
    return 'Open this document’s project before asking AnA about it or applying changes.';
  }
  if (!isProgramId(bridge.docId) || !isProgramId(bridge.sectionId) || context.artifactId !== bridge.docId || context.sectionId !== bridge.sectionId) {
    return 'The saved document and section could not be verified. Reopen the document before applying changes.';
  }
  return null;
}

/** Identity only. Labels and document content remain authoritative API reads. */
function originMatchesProject(origin: AskOrigin, projectId: string | number | null): boolean {
  const target = origin.authoringDocument;
  if (!target || !isProgramId(target.docId) || !isProgramId(target.programId)) return false;
  if (target.programId !== projectId || (target.sectionId && !isProgramId(target.sectionId))) return false;
  const context = origin.authoringContext;
  return !context || (context.projectId === projectId && context.artifactId === target.docId &&
    (!context.sectionId || context.sectionId === target.sectionId));
}

function originForEditorBridge(bridge?: EditorBridge | null): AskOrigin {
  const context = bridge?.authoringContext;
  return {
    surfaceId: 'document-authoring', label: 'Authoring',
    authoringContext: context, moduleContext: bridge?.moduleContext,
    ...(bridge && context?.projectId ? { authoringDocument: {
      docId: bridge.docId, programId: context.projectId,
      ...(bridge.sectionId ? { sectionId: bridge.sectionId } : {}),
    } } : {}),
  };
}

/** A mounted editor has already read this saved record; do not infer it from prose. */
export function snapshotEditorOrigin(projectId: string | number | null, source?: AskOrigin, bridge?: EditorBridge | null) {
  const origin = source ?? originForEditorBridge(bridge);
  if (!origin.authoringDocument) return { origin, read: { state: 'none' } as OriginDocumentRead };
  if (!originMatchesProject(origin, projectId)) return { origin, read: { state: 'error', message: UNVERIFIED } as OriginDocumentRead };
  const title = origin.moduleContext?.documentTitle;
  return { origin, read: { state: 'ready', document: {
    ...origin.authoringDocument, title: typeof title === 'string' ? title : '',
  } } as OriginDocumentRead };
}

/** Use the existing project-scoped inventory without the AnA-only list filter. */
export async function readOriginDocument(origin: AskOrigin, projectId: string | number | null): Promise<OriginDocumentRead> {
  if (!originMatchesProject(origin, projectId)) return { state: 'error', message: UNVERIFIED };
  const target = origin.authoringDocument!;
  try {
    const response = await apiRequest('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(target.programId)}`);
    const body = await response.json() as { documents?: Array<{ id?: unknown; title?: unknown }> };
    const document = response.ok && Array.isArray(body.documents) ? body.documents.find(row => row.id === target.docId) : null;
    // A missing row is not proof of absence: a future paged inventory or an
    // unread portion must not become an invented wrong-project verdict.
    if (!document || typeof document.title !== 'string') return { state: 'error', message: UNVERIFIED };
    return { state: 'ready', document: { ...target, title: document.title } };
  } catch {
    return { state: 'error', message: UNVERIFIED };
  }
}
