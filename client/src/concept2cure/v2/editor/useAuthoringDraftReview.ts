/** Retained review buffers and scoped requests for the one AnA review panel. */
import { useEffect, useRef, useState } from 'react';
import type { FireToast } from '../toast';
import { acceptAuthoringDraft, captureEditorDraftGuard, checkAuthoringDraftSection, createEmptyAiDraftReviewState,
  generateAuthoringDraft, type AcceptedAttribution, type AiDraftReviewSession, type AiDraftReviewState } from './authoringDraftTransport';

interface Options {
  sectionId: string; docId?: string; programId?: string | null; docSealed: boolean; editorDirty: boolean;
  reviewSession?: AiDraftReviewSession;
  onAccepted: (section: Record<string, unknown>, attribution: AcceptedAttribution | null) => void;
  onClose: () => void; fireToast: FireToast;
  describeAcceptFailure: (status: number, code: string | null, message: string | null) => { text: string; clearDraft: boolean };
}
const UNKNOWN_ACCEPT = 'Could not confirm whether this draft was accepted. Check the saved section before any further acceptance. The candidate and your review text are retained; no save will be repeated automatically.';
const DIRTY_ACCEPT = 'Save or discard the editor’s unsaved changes before accepting this draft. Nothing was sent.';

interface ReviewRun { token: object; current: () => boolean; options: Options }
interface ReviewActions {
  read: () => { state: AiDraftReviewState; options: Options };
  candidateCurrent: { current: (() => boolean) | null };
  patch: (state: Partial<AiDraftReviewState>) => void;
  begin: () => ReviewRun | null;
  finish: (token: object) => void;
  setAccepting: (value: boolean) => void;
}
function acceptanceCandidate(owner: ReviewActions): { saved: AiDraftReviewState; draftId: string } | null {
  const { state: saved, options } = owner.read();
  if (!saved.draft?.draftId || saved.acceptUnknown || saved.baseChanged || options.docSealed) return null;
  if (owner.candidateCurrent.current?.() === false) { owner.patch({ refusal: 'This candidate belongs to an earlier document, project or signed-in session. Reopen the saved section and generate a current candidate.' }); return null; }
  if (options.editorDirty) { owner.patch({ refusal: DIRTY_ACCEPT }); return null; }
  if (saved.draft.sectionId !== options.sectionId) {
    owner.patch({ refusal: 'This draft was generated for a different section and was not accepted. Generate a draft for this section.' }); return null;
  }
  return { saved, draftId: saved.draft.draftId };
}
async function acceptReview(owner: ReviewActions) {
  const candidate = acceptanceCandidate(owner); if (!candidate) return;
  const { saved, draftId } = candidate;
  const run = owner.begin(); if (!run) return;
  owner.setAccepting(true); owner.patch({ acceptUnknown: true,
    refusal: 'Acceptance requested. The saved outcome is not confirmed yet. If you leave this review, check the exact saved section before any further acceptance. No save is repeated automatically.' });
  try {
    const result = await acceptAuthoringDraft({ sectionId: run.options.sectionId, docId: run.options.docId,
      draftId, content: saved.body, changeReason: saved.changeReason }, run.current);
    if (!run.current() || result.ok === false && result.stale) return;
    if (result.ok) {
      if (owner.read().options.editorDirty) {
        owner.patch({ acceptUnknown: true, refusal: 'The server confirmed this acceptance, but the editor now has unsaved changes. They were preserved. Check the saved section before continuing.' });
        return;
      }
      run.options.onAccepted(result.section, result.attribution);
      owner.patch({ draft: null, body: '', acceptUnknown: false, checkedContent: undefined });
      run.options.onClose();
      return;
    }
    if (result.unknown) { owner.patch({ acceptUnknown: true, refusal: UNKNOWN_ACCEPT }); return; }
    const refused = run.options.describeAcceptFailure(result.status, result.code, result.message);
    owner.patch({ refusal: refused.text, acceptUnknown: false, baseChanged: result.code === 'SECTION_BASE_CHANGED',
      ...(refused.clearDraft ? { draft: null, body: '' } : {}) });
  } finally { owner.finish(run.token); }
}

export function useAuthoringDraftReview(options: Options) {
  const [local, setLocal] = useState(createEmptyAiDraftReviewState);
  const [generating, setGenerating] = useState(false);
  const [generatingSince, setGeneratingSince] = useState<number | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [checking, setChecking] = useState(false);
  const state = options.reviewSession?.state ?? local;
  const latest = useRef({ options, state });
  latest.current = { options, state };
  const key = `${options.programId ?? ''}:${options.docId ?? ''}:${options.sectionId}`;
  const scope = useRef({ key });
  if (scope.current.key !== key) scope.current = { key };
  const alive = useRef(true);
  const attempt = useRef<object | null>(null);
  const candidateCurrent = useRef<(() => boolean) | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; attempt.current = null; }; }, []);
  useEffect(() => {
    attempt.current = null;
    candidateCurrent.current = null;
    setGenerating(false); setAccepting(false); setChecking(false);
    if (!latest.current.options.reviewSession) setLocal(createEmptyAiDraftReviewState());
  }, [key]);

  const patch = (next: Partial<AiDraftReviewState>) => {
    const value = { ...latest.current.state, ...next };
    latest.current.state = value;
    const session = latest.current.options.reviewSession;
    if (session) session.update(value); else setLocal(value);
  };
  const begin = () => {
    const currentOptions = latest.current.options;
    if (attempt.current || currentOptions.reviewSession?.isCurrent() === false) return null;
    const token = {}; const target = scope.current;
    attempt.current = token;
    const current = captureEditorDraftGuard({ programId: currentOptions.programId, docId: currentOptions.docId,
      sectionId: currentOptions.sectionId, isCurrent: () => alive.current && scope.current === target && attempt.current === token
        && latest.current.options.reviewSession?.isCurrent() !== false });
    if (!current()) { attempt.current = null; return null; }
    return { token, current, options: currentOptions };
  };
  const finish = (token: object) => {
    if (!alive.current || attempt.current !== token) return;
    attempt.current = null;
    setGenerating(false); setAccepting(false); setChecking(false);
  };
  const generate = async (request: { tone: string; region: string; context: string; requirements: string }) => {
    if (latest.current.options.docSealed || latest.current.state.acceptUnknown) return;
    const run = begin(); if (!run) return;
    setGenerating(true); setGeneratingSince(Date.now()); patch({ refusal: null });
    try {
      const result = await generateAuthoringDraft({ sectionId: run.options.sectionId, ...request }, run.current);
      if (!run.current() || result.ok === false && result.stale) return;
      if (result.ok) {
        const target = scope.current;
        candidateCurrent.current = captureEditorDraftGuard({ programId: run.options.programId,
          isCurrent: () => alive.current && scope.current === target });
        patch({ draft: result.draft, body: result.draft.generated, acceptUnknown: false, baseChanged: false, checkedContent: undefined }); return;
      }
      if (result.code === 'GATEWAY_UNAVAILABLE') {
        patch({ refusal: 'No AI provider is configured for this deployment, so this section cannot be drafted. This is a server setting, not your connection. Nothing was changed.' });
        return;
      }
      run.options.fireToast(`Couldn’t draft this section — ${result.message}. Nothing was changed.`, 'error');
    } finally { finish(run.token); }
  };
  const accept = () => acceptReview({ read: () => latest.current, candidateCurrent, patch, begin, finish, setAccepting });
  const checkSaved = async () => {
    if (!latest.current.state.acceptUnknown || !latest.current.options.docId) return;
    const run = begin(); if (!run) return;
    setChecking(true);
    try {
      const checkedContent = await checkAuthoringDraftSection({ docId: run.options.docId!, sectionId: run.options.sectionId,
        programId: run.options.programId }, run.current);
      if (!run.current()) return;
      patch({ checkedContent: checkedContent ?? undefined, refusal: checkedContent !== null
        ? 'The exact saved section was read. This check does not identify which request wrote its text. Inspect the saved section and discard this uncertain candidate when reconciled; acceptance remains held.'
        : 'Could not verify the exact saved section. Acceptance remains unresolved and no further save was requested.' });
    } finally { finish(run.token); }
  };
  return { state, generating, generatingSince, accepting, checking,
    generate, accept, checkSaved, patch };
}
