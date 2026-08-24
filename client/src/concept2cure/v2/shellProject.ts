/**
 * The one shell-project channel — `window.C2C_PROJECT`, made reload-proof.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * The open program travels between surfaces as a window global (the DB-backed
 * channel ZenRouter.tsx documents: it carries the real `regulatory_programs`
 * UUID and is read by 14+ files). It was set in exactly four places and never
 * persisted, so a reload — or a deep link straight to /concept2cure/cmc,
 * /vault, /ectd-compile — landed with no program: every project-scoped surface
 * fell to its "Open a program" empty state until the user detoured through
 * Projects again.
 *
 * ── What this module does ────────────────────────────────────────────────────
 * One writer (`publishShellProject`) that sets the global AND mirrors it to
 * sessionStorage; one restorer (`restoreShellProject`) the shell calls at boot
 * that rehydrates the global from the mirror when — and only when — the global
 * is absent. Readers are untouched: they keep reading `window.C2C_PROJECT`.
 *
 * sessionStorage, not localStorage, deliberately: the selection is a
 * per-tab working context, not a durable preference. A different tab may hold
 * a different program open, and a browser restart starting clean is correct.
 *
 * HONESTY: restore rehydrates the id only — it does not assert the program
 * still exists. Every project-scoped surface already validates by fetching
 * (a deleted program renders as the fetch's honest error/empty state, exactly
 * as it would have mid-session).
 */

export interface ShellProject {
  id: string | number;
  title?: string;
  product?: string;
  code?: string;
  ws?: string;
  status?: string;
}

const KEY = 'c2c.shell-project';

<<<<<<< HEAD
type ShellWindow = Window & { C2C_PROJECT?: ShellProject };
=======
/* The global is already declared app-wide as `Record<string, string>`
   (ProjectHome.tsx's declare-global block, which every existing reader types
   against). Re-declaring it here as ShellProject intersects the two and makes
   the property unassignable from either side — so this module casts at its own
   boundary instead: writers hand in a ShellProject, readers get one back, and
   the historical loose global type stays what the 14+ readers compiled
   against. */
const readGlobal = (): ShellProject | undefined =>
  window.C2C_PROJECT as unknown as ShellProject | undefined;
const writeGlobal = (p: ShellProject): void => {
  window.C2C_PROJECT = p as unknown as typeof window.C2C_PROJECT;
};
>>>>>>> origin/concept2cure-v2

/** Set the open program: the live global plus its per-tab mirror. */
export function publishShellProject(project: ShellProject): void {
  try {
<<<<<<< HEAD
    (window as unknown as ShellWindow).C2C_PROJECT = project;
=======
    writeGlobal(project);
>>>>>>> origin/concept2cure-v2
  } catch {
    /* no window (SSR/test teardown) — nothing to publish to */
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(project));
  } catch {
    /* storage unavailable (private mode quota, disabled) — the live global
       still works for this page's lifetime; only reload-survival is lost */
  }
}

/**
 * Rehydrate the global from the per-tab mirror. A live selection always wins —
 * restore never overwrites what a surface already published this page-load.
 * Returns whatever selection is now active, or null.
 */
export function restoreShellProject(): ShellProject | null {
  try {
<<<<<<< HEAD
    const w = window as unknown as ShellWindow;
    const live = w.C2C_PROJECT;
=======
    const live = readGlobal();
>>>>>>> origin/concept2cure-v2
    if (live && live.id != null && String(live.id).trim() !== '') return live;

    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as ShellProject).id != null &&
      String((parsed as ShellProject).id).trim() !== ''
    ) {
<<<<<<< HEAD
      w.C2C_PROJECT = parsed as ShellProject;
=======
      writeGlobal(parsed as ShellProject);
>>>>>>> origin/concept2cure-v2
      return parsed as ShellProject;
    }
    return null;
  } catch {
    /* malformed mirror or no storage — start with no selection, never throw */
    return null;
  }
}
