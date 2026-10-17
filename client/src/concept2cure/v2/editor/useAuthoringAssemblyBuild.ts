/** One component-owned assembly lane. No structural write is automatically retried. */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import type { AssemblyCommitData, AssemblyPreviewInput } from '@shared/authoring/assembly';
import { useShellProject } from '../shellProject';
import { registerSurfaceLeaveGuard } from '../navParams';
import { taskActorScope, type TaskActorScope } from '../taskTarget';
import { captureEditorDraftGuard, createEmptyAiDraftReviewState, type AiDraftReviewSession } from './authoringDraftTransport';
import { captureAssemblyHeaders, inspectAssemblyDocument, normalizedAssemblyCode, readAssemblyCommit, readAssemblyPlan, requestAssembly } from './assemblyBuildTransport';
import { assemblyBusy, assemblyDisabledReason, initialAssemblyState, type AssemblyBucket, type AssemblyBuildController, type AssemblyBuildOptions, type AssemblyBuildState } from './assemblyBuildState';
import { assemblyDraftReference, runAssemblyDrafts } from './assemblyDraftQueue';
export type { AssemblyBuildController, AssemblyBuildOptions } from './assemblyBuildState';

interface Owner {
  options: AssemblyBuildOptions; key: string; revision: number; contextRevision: number; alive: boolean;
  bucket: AssemblyBucket; redraw: () => void;
  identity: AssemblyOwner; authCurrent: () => boolean; headers: () => Record<string, string>;
  leaveRefusal: () => string | null;
}
interface AssemblyOwner {
  generation: number; retired: boolean; actor: TaskActorScope | null;
  session: ReturnType<typeof authService.captureSessionReadGuard>;
}
const accountChanged = 'Your signed-in account or organization changed. Sign in and reopen this document before building.';
const sameActor = (a: TaskActorScope | null, b: TaskActorScope | null) => a?.userId === b?.userId && a?.organizationId === b?.organizationId;
function useAssemblyOwner() {
  const actor = taskActorScope(authService.getUser());
  const ref = useRef<AssemblyOwner>({ generation: 0, retired: false, actor, session: authService.captureSessionReadGuard() });
  if (ref.current.retired || !ref.current.session.sameRevision() || !sameActor(ref.current.actor, actor)) {
    ref.current = { generation: ref.current.generation + 1, retired: false, actor, session: authService.captureSessionReadGuard() };
  }
  const identity = ref.current;
  const headers = () => {
    try {
      if (ref.current !== identity || identity.retired || !identity.session.sameRevision() || !identity.actor
        || !sameActor(identity.actor, taskActorScope(authService.getUser()))) throw new Error(accountChanged);
      return captureAssemblyHeaders();
    } catch { identity.retired = true; throw new Error(accountChanged); }
  };
  const current = () => { try { headers(); return true; } catch { return false; } };
  return { identity, current, headers };
}
export interface AssemblyOperation {
  owner: Owner; bucket: AssemblyBucket; token: object; options: AssemblyBuildOptions; current: () => boolean;
  headers: Record<string, string>;
  update: (patch: Partial<AssemblyBuildState>) => void;
}
function update(owner: Owner, bucket: AssemblyBucket, patch: Partial<AssemblyBuildState>): void {
  bucket.state = { ...bucket.state, ...patch };
  if (owner.alive && bucket.owner === owner.identity && owner.authCurrent()) owner.redraw();
}
function begin(owner: Owner, phase: AssemblyBuildState['phase'], allowUnknown = false, readOnly = false): AssemblyOperation | null {
  const bucket = owner.bucket;
  const identity = owner.identity;
  const admitted = () => owner.identity === identity && owner.authCurrent()
    && (readOnly ? !!owner.options.docId && !!owner.options.programId : !assemblyDisabledReason(owner.options));
  if (assemblyBusy(bucket.state.phase) || !admitted() || (!allowUnknown && bucket.state.phase === 'unknown')) return null;
  const headers = owner.headers();
  const token = {}; const key = owner.key; const revision = owner.revision;
  bucket.token = token; bucket.stopRequested = false;
  const guard = captureEditorDraftGuard({ docId: owner.options.docId, programId: owner.options.programId,
    isCurrent: () => owner.alive && owner.key === key && owner.revision === revision
      && owner.bucket === bucket && bucket.token === token && admitted() });
  const operation = { owner, bucket, token, options: { ...owner.options }, current: guard, headers,
    update: (patch: Partial<AssemblyBuildState>) => update(owner, bucket, patch) };
  operation.update({ phase });
  return operation;
}
function finish(operation: AssemblyOperation, patch: Partial<AssemblyBuildState>): void {
  if (operation.bucket.token === operation.token) operation.update(patch);
}
function inputFor(operation: AssemblyOperation): AssemblyPreviewInput {
  const state = operation.bucket.state;
  return { programId: operation.options.programId!, templateId: state.templateId,
    selection: state.targetCode ? { target: 'section', code: state.targetCode } : { target: 'document' } };
}
async function preview(owner: Owner, outline = false): Promise<void> {
  if (!owner.bucket.state.templateId) return;
  const operation = begin(owner, outline ? 'outline' : 'previewing');
  if (!operation) return;
  const input = inputFor(operation);
  if (outline) input.selection = { target: 'document' };
  const docId = operation.options.docId!;
  const result = await requestAssembly(`/api/authoring/docs/${encodeURIComponent(docId)}/assembly/preview`, input,
    raw => readAssemblyPlan(raw, docId, input), operation.current, { headers: operation.headers });
  if (!operation.current()) { finish(operation, { phase: 'idle', plan: null, message: 'Context changed. Preview again before building.' }); return; }
  if (!result.ok) { finish(operation, { phase: 'idle', plan: null, message: result.message }); return; }
  finish(operation, outline ? { phase: 'idle', outline: result.data, plan: null, message: 'Choose the whole document or an exact template section, then preview the build.' }
    : { phase: 'previewed', plan: result.data, message: 'Preview only. Existing sections and text will be preserved.' });
}
function queueSlots(data: AssemblyCommitData) {
  return data.plan.rows.filter(row => row.aiDraftable).flatMap(row => {
    const section = data.sections.find(saved => normalizedAssemblyCode(saved.code) === normalizedAssemblyCode(row.code));
    return section && section.content.trim() === '' ? [{ section, status: 'not-started' as const, review: createEmptyAiDraftReviewState(), draftRegion: data.plan.draftRegion,
      referenceContext: assemblyDraftReference(data.plan, row) }] : [];
  });
}
async function build(owner: Owner): Promise<void> {
  const state = owner.bucket.state;
  if (!state.plan || state.reason.trim().length < 8) return;
  const operation = begin(owner, 'building');
  if (!operation) return;
  const input = { ...inputFor(operation), fingerprint: state.plan.fingerprint, reason: state.reason.trim() };
  const docId = operation.options.docId!;
  const result = await requestAssembly(`/api/authoring/docs/${encodeURIComponent(docId)}/assembly/commit`, input,
    raw => readAssemblyCommit(raw, docId, input, input.fingerprint), operation.current, { writing: true, headers: operation.headers });
  if (!result.ok) { finish(operation, { phase: result.unknown ? 'unknown' : 'idle', plan: result.unknown ? state.plan : null, message: result.message }); return; }
  const added = state.withAna ? queueSlots(result.data) : [];
  const slots = [...state.slots, ...added.filter(slot => !state.slots.some(previous => previous.section.id === slot.section.id))];
  finish(operation, { phase: 'built', receipt: result.data, plan: null, slots, message: 'Structure built in this document. Existing sections and content were preserved.' });
  if (!operation.current()) {
    if (slots.length) finish(operation, { phase: 'stopped', message: 'Structure was confirmed saved. Context changed before drafting; no candidate was started. Return to this document and explicitly resume preparation after checking your work.' });
    return;
  }
  try { await operation.options.onStructureBuilt(result.data); }
  catch { finish(operation, { message: 'Structure was confirmed saved. The editor refresh failed; inspect the saved document before continuing.' }); return; }
  if (!operation.current()) return;
  if (state.withAna) await runAssemblyDrafts(operation);
}
async function check(owner: Owner): Promise<void> {
  if (owner.bucket.state.phase !== 'unknown') return;
  const operation = begin(owner, 'checking', true, true);
  if (!operation) return;
  const rows = await inspectAssemblyDocument(operation.options.docId!, operation.options.programId!, operation.current, operation.headers);
  if (!operation.current() || !rows) { finish(operation, { phase: 'unknown', message: 'The exact saved document could not be checked. The build remains held; no structural retry was made.' }); return; }
  let confirmed = false;
  try { confirmed = await operation.options.onRecoveryChecked?.(operation.current, operation.headers) === true; } catch { /* Keep the unresolved write held. */ }
  if (!confirmed || !operation.current()) { finish(operation, { phase: 'unknown', message: 'The saved record could not be applied to this exact editor. The build remains held; check it again before leaving.' }); return; }
  finish(operation, { phase: 'checked', plan: null, message: `Checked this exact document: ${rows.length} saved sections. This read cannot identify the interrupted request or prove which request wrote matching content. Inspect the saved record, then preview a deliberate new build.` });
}
async function retryDrafts(owner: Owner): Promise<void> {
  if (!owner.bucket.state.receipt || !owner.bucket.state.slots.some(slot => ['failed', 'not-started'].includes(slot.status))) return;
  const operation = begin(owner, 'drafting');
  if (!operation) return;
  await runAssemblyDrafts(operation);
}
function chooseTarget(owner: Owner, code: string): void {
  const state = owner.bucket.state;
  if (!owner.authCurrent() || assemblyBusy(state.phase) || state.phase === 'unknown' || (code && !state.outline?.rows.some(row => row.code === code))) return;
  update(owner, owner.bucket, { targetCode: code, plan: null, phase: 'idle', message: 'Selection changed. Preview this build before saving.' });
}
function change(owner: Owner, patch: Partial<AssemblyBuildState>): void {
  if (!owner.authCurrent() || assemblyBusy(owner.bucket.state.phase) || owner.bucket.state.phase === 'unknown') return;
  update(owner, owner.bucket, patch);
}
async function review(owner: Owner, id: string): Promise<void> {
  const bucket = owner.bucket; const slot = bucket.state.slots.find(item => item.section.id === id && item.review.draft);
  if (!slot || !owner.options.docId || !owner.options.programId || !owner.authCurrent()) return;
  const token = {}; const key = owner.key; const revision = owner.contextRevision; const identity = owner.identity;
  const headers = owner.headers();
  bucket.reviewToken = token;
  const current = captureEditorDraftGuard({ docId: owner.options.docId, programId: owner.options.programId,
    isCurrent: () => owner.alive && owner.identity === identity && owner.authCurrent() && owner.key === key && owner.contextRevision === revision && owner.bucket === bucket && bucket.reviewToken === token });
  const rows = await inspectAssemblyDocument(owner.options.docId, owner.options.programId, current, headers);
  if (!current()) return;
  if (!rows?.some(row => row.id === id && row.code === slot.section.code)) {
    update(owner, bucket, { message: 'The exact saved section could not be checked. The retained candidate was not opened or changed.' }); return;
  }
  const owned = captureEditorDraftGuard({ docId: owner.options.docId, programId: owner.options.programId,
    isCurrent: () => owner.alive && owner.identity === identity && owner.authCurrent() && owner.key === key && owner.contextRevision === revision && owner.bucket === bucket });
  update(owner, bucket, { slots: bucket.state.slots.map(item => item.section.id === id ? { ...item, current: owned } : item),
    message: 'The exact saved section was checked. Its retained candidate is ready for review; acceptance separately checks its saved base and your edit authority.' });
  owner.options.onReviewSection(id);
}
function sessions(owner: Owner): Record<string, AiDraftReviewSession> {
  return Object.fromEntries(owner.bucket.state.slots.filter(slot => slot.current).map(slot => {
    const bucket = owner.bucket; const key = owner.key; const candidateCurrent = slot.current;
    return [slot.section.id, { state: slot.review, isCurrent: () => owner.alive && owner.authCurrent() && owner.key === key && owner.bucket === bucket && candidateCurrent?.() === true,
      update: next => {
        if (!owner.alive || !owner.authCurrent() || owner.key !== key || owner.bucket !== bucket || candidateCurrent?.() !== true) return;
        if (next.draft && next.draft.sectionId !== slot.section.id) return;
        update(owner, bucket, { slots: bucket.state.slots.map(item => item.section.id === slot.section.id ? { ...item, review: next } : item) });
      } } satisfies AiDraftReviewSession];
  }));
}
function readTemplates(raw: unknown): Array<{ id: string; name: string }> | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(row => row && (typeof row.id === 'string' || typeof row.id === 'number') && typeof (row.name ?? row.title ?? row.template_name) === 'string')) return null;
  return raw.map(row => ({ id: String(row.id), name: String(row.name ?? row.title ?? row.template_name) }));
}
async function loadTemplates(owner: Owner): Promise<void> {
    if (!owner.options.docId || !owner.options.programId || !owner.authCurrent()) return;
    if (owner.bucket.state.rosterLoading || owner.bucket.state.templates.length) return;
    const key = owner.key; const identity = owner.identity; const headers = owner.headers();
    const bucket = owner.bucket; const current = captureEditorDraftGuard({ programId: owner.options.programId, docId: owner.options.docId,
      isCurrent: () => owner.alive && owner.identity === identity && owner.authCurrent() && owner.key === key && owner.bucket === bucket });
    update(owner, bucket, { rosterLoading: true, rosterError: null });
      try {
        const response = await apiRequest('GET', '/api/authoring/templates', undefined, headers);
        const body = await response.json();
        if (!current()) return;
        const templates = body?.success === true && response.ok ? readTemplates(body.templates) : null;
        update(owner, bucket, templates ? { templates, rosterError: null, globalCatalogUnavailable: body.globalCatalog === 'unavailable' }
          : { rosterError: 'The template roster could not be confirmed. No shortened list was substituted.' });
      } catch { if (current()) update(owner, bucket, { rosterError: 'Templates could not be read. Reopen this document to retry the roster.' }); }
      finally { update(owner, bucket, { rosterLoading: false }); }
}
function controller(owner: Owner): AssemblyBuildController {
  const state = owner.bucket.state;
  return { ...state, busy: assemblyBusy(state.phase), disabledReason: owner.authCurrent() ? assemblyDisabledReason(owner.options) : accountChanged, reviewSessions: sessions(owner),
    leaveRefusal: owner.leaveRefusal,
    chooseTemplate: async id => { if (!owner.authCurrent() || assemblyBusy(owner.bucket.state.phase) || owner.bucket.state.phase === 'unknown') return;
      change(owner, { templateId: id, targetCode: '', outline: null, plan: null, phase: 'idle', message: '' }); if (id) await preview(owner, true); },
    loadTemplates: () => loadTemplates(owner), chooseTarget: code => chooseTarget(owner, code), setReason: reason => change(owner, { reason }), setWithAna: withAna => change(owner, { withAna }),
    setRequirements: requirements => change(owner, { requirements }), preview: () => preview(owner), build: () => build(owner), check: () => check(owner), retryDrafts: () => retryDrafts(owner),
    stop: () => { if (owner.bucket.state.phase === 'drafting') { owner.bucket.stopRequested = true; update(owner, owner.bucket, { message: 'Stopping after the current request. Completed candidates remain available for review.' }); } },
    review: id => { void review(owner, id); },
    markAccepted: id => { if (owner.authCurrent()) update(owner, owner.bucket, { slots: owner.bucket.state.slots.map(slot => slot.section.id === id ? { ...slot, status: 'accepted' } : slot) }); },
  };
}
export function useAuthoringAssemblyBuild(options: AssemblyBuildOptions): AssemblyBuildController {
  useShellProject();
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const buckets = useRef(new Map<string, AssemblyBucket>());
  const auth = useAssemblyOwner();
  const key = `${auth.identity.generation}:${options.programId ?? ''}:${options.docId ?? ''}`;
  const signature = `${key}:${options.editorDirty}:${options.docSealed}:${options.editRefusal ?? ''}`;
  const previous = useRef({ signature, key, revision: 0, contextRevision: 0 });
  const changed = previous.current.signature !== signature;
  if (changed) previous.current = { signature, key, revision: previous.current.revision + 1,
    contextRevision: previous.current.contextRevision + (previous.current.key === key ? 0 : 1) };
  let bucket = buckets.current.get(key);
  if (!bucket) { bucket = { state: initialAssemblyState(), token: null, stopRequested: false, owner: auth.identity }; buckets.current.set(key, bucket); }
  if (changed && !assemblyBusy(bucket.state.phase) && bucket.state.phase !== 'unknown') {
    bucket.state = { ...bucket.state, plan: null, phase: bucket.state.phase === 'previewed' ? 'idle' : bucket.state.phase };
  }
  const owner = useRef<Owner>({ options, key, revision: previous.current.revision, contextRevision: previous.current.contextRevision, alive: true, bucket, redraw,
    identity: auth.identity, authCurrent: auth.current, headers: auth.headers, leaveRefusal: () => null });
  Object.assign(owner.current, { options, key, revision: previous.current.revision, contextRevision: previous.current.contextRevision, bucket,
    identity: auth.identity, authCurrent: auth.current, headers: auth.headers });
  const leaveRefusal = useCallback(() => {
    const current = owner.current;
    if (!current.alive || !current.authCurrent()) return null;
    const held = Array.from(buckets.current.values()).find(entry => entry.owner === current.identity && ['building', 'unknown', 'checking'].includes(entry.state.phase));
    if (!held) return null;
    if (held.state.phase === 'building') return 'Document structure is still being built. Wait for its outcome before leaving; closing the panel does not cancel the request.';
    return held.state.phase === 'checking' ? 'Document structure is still being checked. Wait for the saved record and editor to refresh before leaving.'
      : 'A document structure build is still unconfirmed. Check its exact saved document in its original project before leaving.';
  }, []);
  owner.current.leaveRefusal = leaveRefusal;
  useEffect(() => { const current = owner.current; current.alive = true; return () => { current.alive = false; }; }, []);
  useEffect(() => registerSurfaceLeaveGuard(leaveRefusal), [leaveRefusal]);
  useEffect(() => {
    const stops = (['login', 'logout', 'session_expired', 'user_updated', 'token_refresh'] as const).map(event => authService.on(event, redraw));
    return () => { stops.forEach(stop => stop()); };
  }, []);
  // Ref-backed methods admit synchronously; React state is presentation only.
  const get = useCallback(() => controller(owner.current), []);
  return get();
}
