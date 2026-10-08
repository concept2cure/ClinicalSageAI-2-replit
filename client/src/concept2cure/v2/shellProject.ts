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
 * ── The URL names the open program too (QA 2026-10-08, j1) ───────────────────
 * The mirror is per tab, so a copied link, a bookmark or a new tab opened
 * Project home on "No project selected": nothing in the URL said which program
 * it was. The shell now keeps `?program=<regulatory_programs UUID>` on its URL
 * while a program is open (`useShellProjectInUrl`, called once by V2App), and
 * `restoreShellProject` reads it first: a link is an explicit statement of
 * which program, so it wins over this tab's mirror. Only a program UUID is
 * ever read from or written to the URL — a legacy numeric id stays in the
 * mirror, and anything else in the param is ignored.
 *
 * HONESTY: restore rehydrates the id only — it does not assert the program
 * still exists. Every project-scoped surface already validates by fetching
 * (a deleted program renders as the fetch's honest error/empty state, exactly
 * as it would have mid-session).
 */

import { useEffect, useSyncExternalStore } from 'react';

export interface ShellProject {
  id: string | number;
  title?: string;
  product?: string;
  code?: string;
  ws?: string;
  status?: string;
  /** regulatory_programs.product_type (drug / biologic / device / ivd / cdx /
   *  samd / combination), published by Project home once the program's read
   *  model has loaded. The shell's segment label follows it — see
   *  segmentForShellProject. */
  productType?: string;
}

const KEY = 'c2c.shell-project';

const PROGRAM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The search param that names the open program on the shell's URL. */
export const PROGRAM_URL_PARAM = 'program';

/* Subscribers to the channel, so a React reader (the shell's top bar) can
   re-render when a surface publishes — the window global itself is not
   reactive. Listeners are module-level and never persisted. */
const listeners = new Set<() => void>();
const notify = (): void => {
  for (const l of listeners) {
    try { l(); } catch { /* one listener's failure must not silence the rest */ }
  }
};

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

/** Set the open program: the live global plus its per-tab mirror. */
export function publishShellProject(project: ShellProject): void {
  try {
    writeGlobal(project);
  } catch {
    /* no window (SSR/test teardown) — nothing to publish to */
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(project));
  } catch {
    /* storage unavailable (private mode quota, disabled) — the live global
       still works for this page's lifetime; only reload-survival is lost */
  }
  notify();
}

/**
 * Publish a partial update onto the open program (e.g. its product type once
 * the read model answers) without disturbing the identifiers a surface set
 * when it opened it. A no-op when no program is open, or when nothing changes —
 * so a surface may call it on every render of its data without a publish loop.
 */
export function updateShellProject(patch: Partial<Omit<ShellProject, 'id'>>): void {
  const live = readShellProject();
  if (!live) return;
  const changed = (Object.keys(patch) as Array<keyof typeof patch>).some((k) => patch[k] !== live[k]);
  if (!changed) return;
  publishShellProject({ ...live, ...patch });
}

/**
 * Rehydrate the global from the per-tab mirror. A live selection always wins —
 * restore never overwrites what a surface already published this page-load.
 * Returns whatever selection is now active, or null.
 */
export function restoreShellProject(): ShellProject | null {
  try {
    const live = readGlobal();
    if (live && live.id != null && String(live.id).trim() !== '') return live;

    const mirror = readMirror();
    /* The URL first: a link names its program explicitly, and is the only
       channel a new tab, a bookmark or a pasted link has. What the mirror knows
       about that same program (title, code) is kept; a mirror naming another
       program contributes nothing to it. */
    const linked = programIdFromUrl();
    if (linked) {
      const same = mirror != null && String(mirror.id).trim().toLowerCase() === linked;
      const project: ShellProject = same ? mirror : { id: linked };
      publishShellProject(project);
      return project;
    }
    if (!mirror) return null;
    writeGlobal(mirror);
    return mirror;
  } catch {
    /* malformed mirror or no storage — start with no selection, never throw */
    return null;
  }
}

/** This tab's mirror, or null when absent, malformed or id-less. */
function readMirror(): ShellProject | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as ShellProject).id != null &&
      String((parsed as ShellProject).id).trim() !== ''
      ? (parsed as ShellProject)
      : null;
  } catch {
    return null;
  }
}

/** The program a URL names (`?program=`), lower-cased, or null. A program UUID only. */
export function programIdFromUrl(search: string = window.location.search): string | null {
  try {
    const v = (new URLSearchParams(search).get(PROGRAM_URL_PARAM) ?? '').trim();
    return PROGRAM_UUID.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Make the current URL name the open program: set `?program=` to its UUID, or
 * drop the param when no program (or a non-program id) is open. Path, other
 * params and hash are kept, and the history entry is replaced, not added — the
 * URL is being corrected, not navigated. A no-op when it is already right.
 */
export function syncShellProjectToUrl(): void {
  try {
    const want = shellProgramId();
    const url = new URL(window.location.href);
    const have = url.searchParams.get(PROGRAM_URL_PARAM);
    if (want ? have === want : have === null) return;
    if (want) url.searchParams.set(PROGRAM_URL_PARAM, want);
    else url.searchParams.delete(PROGRAM_URL_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* no window/history (SSR, test teardown) — nothing to correct */
  }
}

/**
 * The shell's half of the URL channel. Re-applied whenever the path changes
 * (a navigation writes a bare surface URL) and whenever a surface opens a
 * different program (which may happen without any navigation).
 */
export function useShellProjectInUrl(pathname: string): void {
  const program = shellProgramId(useShellProject());
  useEffect(() => {
    syncShellProjectToUrl();
  }, [pathname, program]);
}

/**
 * The UI segment a program belongs to, from what the channel knows about it:
 * its product type first (the regulatory fact), the portfolio workstream it was
 * opened from second (MDX / Biotech / Pharma / CRO — coarser, but available the
 * moment a card is clicked), nothing otherwise. Pure. An unknown product type
 * is not guessed. Segment ids are the SEGMENTS of registryModel.ts.
 */
const PRODUCT_TYPE_SEGMENT: Record<string, string> = {
  drug: 'biopharma',
  biologic: 'biopharma',
  device: 'medtech',
  samd: 'medtech',
  combination: 'medtech',
  ivd: 'diagnostics',
  cdx: 'diagnostics',
};
const WORKSTREAM_SEGMENT: Record<string, string> = {
  mdx: 'medtech',
  biotech: 'biopharma',
  pharma: 'biopharma',
  cro: 'cro',
};
export function segmentForShellProject(project: ShellProject | null | undefined): string | null {
  if (!project) return null;
  const byProduct = PRODUCT_TYPE_SEGMENT[String(project.productType ?? '').trim().toLowerCase()];
  if (byProduct) return byProduct;
  const byWorkstream = WORKSTREAM_SEGMENT[String(project.ws ?? '').trim().toLowerCase()];
  return byWorkstream ?? null;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
/* Snapshot identity: publishShellProject writes a new object each time, so the
   global's reference is the version stamp useSyncExternalStore needs. */
const getSnapshot = (): ShellProject | null => readShellProject();
const getServerSnapshot = (): ShellProject | null => null;

/** The open program, re-rendering the caller when a surface publishes. */
export function useShellProject(): ShellProject | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The open program, or null. The READ half of this channel.
 *
 * `restoreShellProject` rehydrates at boot; this is what a surface calls on
 * every render to ask "which program is the user looking at". It was being
 * hand-rolled per surface (IndLifecycle had its own `readShellProject`), which
 * is how six surfaces ended up not asking at all and hardcoding a program name
 * into their AnA prompts instead.
 */
export function readShellProject(): ShellProject | null {
  try {
    const p = readGlobal();
    return p && p.id != null && String(p.id).trim() !== '' ? p : null;
  } catch {
    return null;
  }
}

/**
 * The open project's `regulatory_programs` id, or null when no project is open
 * or the open one is not a project (a legacy numeric workspace id).
 *
 * A governed record is created in this project and nowhere else (PF-07,
 * founder decision 2026-09-26: every governed record belongs to a project), so
 * every create path asks here — and with null, does not create.
 */
export function shellProgramId(project: ShellProject | null = readShellProject()): string | null {
  const id = project?.id;
  return typeof id === 'string' && PROGRAM_UUID.test(id) ? id : null;
}

/**
 * How to NAME the open program to the assistant, or null when none is open.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Six surfaces sent AnA a prompt with a program name spliced into it as a
 * string literal — `'Scan regulatory changes affecting the BX-204 portfolio'`,
 * `'Build a US + EU market-access plan for the BX-204 CGM'`, `'Refine the
 * ${q.id} response … for BX-204'`. BX-204 is a demo fixture. Every real
 * customer pressing those buttons asked the assistant about a product they do
 * not own, and got an answer about it.
 *
 * A prompt cannot fall back to a placeholder here: an answer about the wrong
 * program is worse than an answer that had to ask which one. Callers therefore
 * get null and phrase the request without a program, or disable the control.
 *
 * Prefers the human-facing identifiers in the order a person would say them,
 * and never returns the bare UUID — "affecting the 0f3c…-a1 portfolio" is not
 * a question anyone asked.
 */
export function shellProgramName(): string | null {
  const p = readShellProject();
  if (!p) return null;
  for (const v of [p.product, p.code, p.title]) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}
