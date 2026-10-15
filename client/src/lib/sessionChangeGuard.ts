/** Open editors reserve the tenant change before its server request can spend the old session. */
interface EditorGuard {
  hasUnsavedWork: () => boolean;
  hold: (held: boolean) => void;
}
const editors = new Set<EditorGuard>();
let reservation: object | null = null;

export const isSessionChangeHeld = (): boolean => reservation !== null;
export function hasUnsavedSessionWork(): boolean {
  try { return [...editors].some(editor => editor.hasUnsavedWork()); }
  catch { return true; }
}
export function registerSessionChangeGuard(guard: EditorGuard): () => void {
  editors.add(guard);
  guard.hold(isSessionChangeHeld());
  return () => { editors.delete(guard); };
}
/** Auth clears the mutation credentials before releasing a failed switch or sign-out hold. */
export function releaseSessionChange(): void {
  reservation = null;
  for (const editor of editors) editor.hold(false);
}
/** Null means work or another switch holds the reservation; no session request is safe yet. */
export function reserveSessionChange(): (() => void) | null {
  if (reservation || hasUnsavedSessionWork()) return null;
  const own = {};
  reservation = own;
  const release = () => {
    if (reservation !== own) return;
    releaseSessionChange();
  };
  try {
    for (const editor of editors) editor.hold(true);
    return release;
  } catch {
    // An editor that could not be held prevents dispatch. Restore the others.
    reservation = null;
    for (const editor of editors) { try { editor.hold(false); } catch { /* already unavailable */ } }
    return null;
  }
}
