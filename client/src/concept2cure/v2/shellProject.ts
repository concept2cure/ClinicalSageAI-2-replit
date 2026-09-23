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

import { useSyncExternalStore } from 'react';

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
      writeGlobal(parsed as ShellProject);
      return parsed as ShellProject;
    }
    return null;
  } catch {
    /* malformed mirror or no storage — start with no selection, never throw */
    return null;
  }
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
