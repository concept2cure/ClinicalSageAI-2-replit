import type { AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { useRef } from 'react';
import { ceremonyOpen } from '../ceremony';
import { captureEditorDraftGuard } from './authoringDraftTransport';
import { assemblyBusy, assemblyDisabledReason, type AssemblyBucket, type AssemblyBuildOptions } from './assemblyBuildState';
import { getSavedAssemblySources } from './savedAssemblySourcesTransport';
import { initialSavedAssemblySources, type SavedAssemblySourcesCache, type SavedAssemblySourcesControls, type SavedAssemblySourcesView } from './savedAssemblySourcesState';

interface Owner {
  options: AssemblyBuildOptions; key: string; revision: number; contextRevision: number; savedReuseRevision: number; alive: boolean;
  bucket: AssemblyBucket; redraw: () => void;
  authCurrent: () => boolean; headers: () => Record<string, string>;
}
type Adopt = (sources: AssemblySourceSelector[] | null) => boolean;
const running = (cache: SavedAssemblySourcesCache): boolean => cache.view.phase === 'checking' || cache.view.phase === 'reusing';
function visible(owner: Owner): SavedAssemblySourcesCache | null {
  const cache = owner.bucket.savedSourcesCache;
  return cache?.current() ? cache : null;
}
function readRefusal(owner: Owner): string | null {
  if (!owner.options.docId || !owner.options.programId) return 'Open a document in its project before checking saved sources.';
  if (!owner.authCurrent()) return 'Your signed-in account or organization changed. Reopen this document before checking saved sources.';
  return !owner.alive || owner.options.isCurrent?.() === false ? 'Finish the project or document change before checking saved sources.' : null;
}
function reuseRefusal(owner: Owner): string | null {
  if (owner.options.savedSourceReuseRefusal) return owner.options.savedSourceReuseRefusal;
  if (owner.bucket.state.sourceSelection) return 'Clear the current selected sources, then check saved sources again before reusing them.';
  if (owner.bucket.state.phase === 'unknown' || owner.bucket.state.slots.some(slot => slot.review.acceptUnknown)) return 'Resolve the uncertain saved outcome before reusing source references.';
  if (assemblyBusy(owner.bucket.state.phase)) return 'Finish the active build or candidate preparation before reusing saved sources.';
  if (ceremonyOpen()) return 'Finish or cancel the open governed form before reusing saved sources.';
  return assemblyDisabledReason(owner.options);
}
function captureOwner(owner: Owner): () => boolean {
  const { bucket, key, contextRevision } = owner; const sourceRevision = bucket.sourceRevision;
  return captureEditorDraftGuard({ docId: owner.options.docId, programId: owner.options.programId,
    isCurrent: () => owner.alive && owner.key === key && owner.contextRevision === contextRevision && owner.bucket === bucket
      && bucket.sourceRevision === sourceRevision && readRefusal(owner) === null });
}
function setView(owner: Owner, cache: SavedAssemblySourcesCache, view: SavedAssemblySourcesView): void {
  cache.view = view;
  if (owner.alive) owner.redraw();
}
function owns(bucket: AssemblyBucket, cache: SavedAssemblySourcesCache, token: object): boolean {
  return bucket.savedSourcesCache === cache && cache.attempt === token;
}
async function check(owner: Owner): Promise<void> {
  const previous = visible(owner);
  if (readRefusal(owner) || previous && running(previous)) return;
  const bucket = owner.bucket; const token = {}; const currentOwner = captureOwner(owner); const headers = owner.headers();
  const cache: SavedAssemblySourcesCache = { view: { phase: 'checking', message: 'Checking the last recorded source-based build references…' }, current: currentOwner, attempt: token };
  bucket.savedSourcesCache = cache; owner.redraw();
  const current = () => currentOwner() && owns(bucket, cache, token);
  try {
    const result = await getSavedAssemblySources(owner.options.docId!, owner.options.programId!, current, headers);
    if (!current()) return;
    setView(owner, cache, result.ok ? { phase: result.data.record ? 'recorded' : 'empty', data: result.data,
      message: result.data.record ? 'Last recorded source-based build references. They are historical references, not the current selection or a complete bibliography.' : 'No source-based build references are recorded for this document.' }
      : { phase: 'failed', message: result.message });
  } finally { if (owns(bucket, cache, token)) cache.attempt = null; }
}
async function useSaved(owner: Owner, adopt: Adopt): Promise<void> {
  const cache = visible(owner); const expected = cache?.view.phase === 'recorded' ? cache.view.data : null;
  if (!cache || !expected?.record || reuseRefusal(owner)) return;
  const bucket = owner.bucket; const token = {}; const revision = owner.revision; const savedReuseRevision = owner.savedReuseRevision; const buildAttempt = bucket.token; const headers = owner.headers();
  cache.attempt = token;
  const current = () => cache.current() && owns(bucket, cache, token) && owner.revision === revision && owner.savedReuseRevision === savedReuseRevision && bucket.token === buildAttempt && reuseRefusal(owner) === null;
  setView(owner, cache, { phase: 'reusing', data: expected, message: 'Checking that the displayed saved references are still the latest exact record before reuse…' });
  try {
    const result = await getSavedAssemblySources(expected.docId, expected.programId, current, headers);
    if (!current()) return;
    if (!result.ok) { setView(owner, cache, { phase: 'failed', message: result.message }); return; }
    if (JSON.stringify(result.data.record) !== JSON.stringify(expected.record)) {
      setView(owner, cache, { phase: 'failed', message: 'The last recorded source references changed. Check saved sources again; no different record was selected automatically.' }); return;
    }
    if (adopt(expected.record.manifest.entries.map(entry => entry.source))) setView(owner, cache, initialSavedAssemblySources());
  } finally {
    if (owns(bucket, cache, token)) {
      cache.attempt = null;
      if (cache.view.phase === 'reusing') setView(owner, cache, { phase: 'failed', message: 'The editing context changed. Saved sources were not selected. Check them again before reuse.' });
    }
  }
}
export function savedAssemblySourcesControls(owner: Owner, adopt: Adopt): SavedAssemblySourcesControls {
  const cache = visible(owner); const busy = cache ? running(cache) : false;
  return { savedSources: cache?.view ?? initialSavedAssemblySources(),
    savedSourcesReadDisabledReason: busy ? 'A saved-source check is already running.' : readRefusal(owner),
    savedSourcesReuseDisabledReason: reuseRefusal(owner) ?? (cache?.view.phase === 'recorded' && cache.view.data?.record ? null : 'Check saved sources before reusing them.'),
    checkSavedSources: () => check(owner), useSavedSources: () => useSaved(owner, adopt) };
}
/** Review opening/closing must invalidate only reference reuse, never a running build. */
export function useSavedSourceReuseRevision(refusal: string | null | undefined): number {
  const value = refusal ?? '';
  const previous = useRef({ value, revision: 0 });
  if (previous.current.value !== value) previous.current = { value, revision: previous.current.revision + 1 };
  return previous.current.revision;
}
