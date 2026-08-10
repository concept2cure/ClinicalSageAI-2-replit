/**
 * What each GCC module actually is — the single declaration `/api/gcc/health`
 * and every module's own `/status` both read from.
 *
 * ── The defect this replaces ──────────────────────────────────────────────────
 * `/api/gcc/health` returned a hardcoded literal:
 *
 *     services: { ectd: 'operational', signing: 'operational',
 *                 siteIntel: 'operational', labeling: 'operational',
 *                 drafting: 'operational' }
 *
 * Three of those five were four-line files whose entire body was
 * `router.get('/status', (req, res) => res.json({ status: 'operational' }))` —
 * byte-identical to each other, with no implementation behind any of them. So
 * the platform health endpoint asserted that E-Signature Workflows, Site
 * Intelligence and the Label Impact Simulator were operational, and each
 * module's own status endpoint confirmed it, and none of it was checked against
 * anything. A monitor polling either one would have been told everything was
 * fine forever, including while it was fine because nothing was there.
 *
 * The fix is not to reword the strings. It is to have ONE declaration of what
 * exists, and derive both answers from it — because two hand-maintained copies
 * of "what is running" is precisely how the first one went stale.
 *
 * ── Keeping this honest ───────────────────────────────────────────────────────
 * `state` describes the code that is mounted, not the roadmap:
 *
 *   available       — real handlers backed by real storage.
 *   prototype       — responds, but from a constant. Do not build against it.
 *   not_implemented — nothing behind the mount. Returns 501, never 200.
 *
 * Raising a module's state is a claim about code. Make it in the same commit as
 * the code, or it is the same lie in a new shape.
 */

export type GccModuleState = 'available' | 'prototype' | 'not_implemented';

export interface GccModule {
  /** Key as it appears in the /api/gcc/health services map. */
  readonly key: string;
  /** What the module is for, in the customer's terms. */
  readonly summary: string;
  readonly state: GccModuleState;
  /**
   * Where the capability actually lives today, when it lives somewhere else.
   * Present so a 501 can point the caller at the thing that does work instead
   * of just refusing.
   */
  readonly servedInsteadBy?: string;
}

export const GCC_MODULES: readonly GccModule[] = [
  {
    key: 'ectd',
    summary: 'eCTD module structure and seeder.',
    state: 'prototype',
    servedInsteadBy:
      'The governed eCTD tree is built from the rule packs in c2c_rule_packs; ' +
      'see /api/c2c/projects and the authoring surfaces.',
  },
  {
    key: 'signing',
    summary: 'E-signature workflows (21 CFR Part 11).',
    state: 'not_implemented',
    servedInsteadBy: 'The implemented e-signature endpoints are under /api/esignature.',
  },
  {
    key: 'site-intel',
    summary: 'Site intelligence and investigator scorecards.',
    state: 'not_implemented',
  },
  {
    key: 'labeling',
    summary: 'Label impact simulator.',
    state: 'not_implemented',
  },
  {
    key: 'drafting',
    summary: 'Defensible drafting (chain of verification).',
    state: 'available',
  },
];

export function gccModule(key: string): GccModule {
  const found = GCC_MODULES.find(m => m.key === key);
  if (!found) {
    // A mount with no declaration is the exact drift this module exists to
    // prevent, so it fails at import time rather than silently reporting well.
    throw new Error(
      `GCC module '${key}' is mounted but not declared in GCC_MODULES. ` +
        `Add it to server/api/gcc/modules.ts with an honest state.`,
    );
  }
  return found;
}
