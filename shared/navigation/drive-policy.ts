/**
 * Live Drive policy — the modes and per-turn budgets BOTH halves enforce.
 *
 * The server (services/ana-ri/live-drive) decides whether a turn drives and
 * emits capped `drive_navigation` / `drive_action` events; the client
 * (v2/liveDrive) re-validates each event and enforces the same caps as a belt.
 * When these constants lived on one side and were mirrored by hand on the
 * other, the mirror was the defect waiting to happen — so the table lives
 * here, in shared, imported by both. Pure data; no runtime deps.
 *
 * ── The two modes ────────────────────────────────────────────────────────────
 * assist — the shipped Live Drive: AnA moves and operates screens while
 *          answering a work request. Deliberate pace; the applied-navigation
 *          budget equals the chip budget (driving must never move a person
 *          more times than offering would have offered — the original
 *          invariant), and the action budget matches it.
 * demo   — a guided demonstration the subscriber explicitly started (product
 *          training or a sales walkthrough). Same consent machinery, same
 *          take-over, same governed-action gates — but the budgets fit a full
 *          multi-stop tour, because a twelve-stop demonstration inside a
 *          three-move budget is not a demonstration.
 */

export type DriveMode = 'assist' | 'demo';

export interface DriveBudget {
  /** Applied `drive_navigation` events per turn. */
  navigations: number;
  /** Applied `drive_action` events per turn. */
  actions: number;
}

/**
 * Per-mode budgets. `assist.navigations` MUST equal the chip budget
 * (MAX_NAVIGATION_ACTIONS in services/ana-ri/navigation-actions) — the
 * live-drive server test pins that equality.
 */
export const DRIVE_BUDGETS: Readonly<Record<DriveMode, DriveBudget>> = {
  assist: { navigations: 3, actions: 3 },
  demo: { navigations: 12, actions: 16 },
};

/**
 * Tool-round ceiling a demo turn needs: one narrated stop per round means a
 * full tour must be allowed roughly as many rounds as its script has stops
 * (adjacent navigate+act pairs often batch into one round), plus headroom to
 * answer a question mid-demo. The stream route raises the loop's
 * effort-resolved ceiling to at least this in demo mode (never lowers it).
 */
export const DEMO_MAX_ROUNDS = 20;

/** Parse a requested drive mode; anything unknown is the conservative assist. */
export function resolveDriveMode(raw: unknown): DriveMode {
  return raw === 'demo' ? 'demo' : 'assist';
}

/** The budget for a mode (assist for anything unknown — fail conservative). */
export function driveBudgetFor(mode: DriveMode | string | null | undefined): DriveBudget {
  return DRIVE_BUDGETS[(mode as DriveMode)] ?? DRIVE_BUDGETS.assist;
}
