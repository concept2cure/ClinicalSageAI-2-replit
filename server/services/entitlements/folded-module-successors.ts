/**
 * Grant continuity across folds — decision P-61 item 4 (2026-10-29,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; first numbered P-54).
 *
 * When a screen is folded into another, its catalogue row is deprecated (never
 * deleted: module_subscriptions keeps every grant, CLAUDE.md Rule 1) and the
 * screen's API claims move to the target. Nothing reads the folded module's
 * grant after that, so an organization that held the folded module above its
 * plan would lose the capability it paid for when its screen moved.
 *
 * The decision: a subscription to a folded module entitles its holder to the
 * fold's target. No grant row is written and subscriptions are kept. This file
 * is the one mapping, and `grantsHeldThroughFolds` is its one reader;
 * license-manager.ts `readLicenseInfo` is the one caller, so every answer the
 * entitlement resolver gives (the module gate and /check through
 * canAccessModule, the rail, ⌘K, AnA's targets and the Apps catalog through
 * getModuleCatalog) reads the same carried grant.
 *
 * What carries: a live grant, that is an `enabled = true` module_subscriptions
 * row whose expiry has not passed (the rows readLicenseInfo already reads as
 * `enabledModules`). What does not:
 *   - a lapsed grant, which is no override at all (isGrantExpired);
 *   - a revocation (`enabled = false`) of the folded module, which was a
 *     decision about that screen and grants nothing;
 *   - the folded module's plan inclusion. Every target below is packaged at or
 *     below its folded module's tier, with no industry list, so a plan that
 *     included the folded module includes the target already.
 * Precedence on the target (canAccessModule, getModuleCatalog): the target's own
 * row first, a grant allowing and a revocation refusing; then a carried grant;
 * then the plan. A revocation an administrator wrote on the target therefore
 * stands, and the administrator can switch the target back on, as before.
 *
 * Only catalogue modules are mapped. A folded screen that never had a catalogue
 * row can hold no subscription (module_subscriptions.module_id references
 * available_modules), so there is nothing to carry:
 *   - part11-console → audit-trail (66efa6179): never seeded, and audit-trail is
 *     kept off the catalogue on purpose (21 CFR 11.10(e));
 *   - ana-memory → conversation-thread (78877084f);
 *   - setup → admin-console (beede0408);
 *   - billing → licensing (d140aefa5).
 * They are listed in FOLDED_WITHOUT_CATALOGUE_ROW so the omission is stated,
 * and the pin (folded-module-grant-continuity.test.ts) checks each has no row.
 *
 * Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/.
 *
 * @module server/services/entitlements/folded-module-successors
 */

/** Folded catalogue module → the module its screen was folded into. */
export const FOLDED_MODULE_SUCCESSORS: Readonly<Record<string, string>> = Object.freeze({
  // 2168fd56: the device task workbench folded into Tasks.
  'device-tasks': 'tasks',
  // b9de04c62 (fold F3): the device kit's vault and the Artifacts center folded into the Vault.
  'device-vault': 'vault',
  'artifacts-center': 'vault',
  // 302d632db: the eCTD publishing reference folded into eCTD Compile.
  'ectd-publishing': 'ectd-compile',
  // Fold F1c: the ISO 14971 risk file and the design-control trace folded into
  // Engineering evidence (product 59b1482d2 and 79d00b348; retired with this entry).
  risk: 'device-engineering',
  'design-controls': 'device-engineering',
  // Fold F2: the IVDR readiness board folded into IVDR evidence (product
  // 1a6701ea6; retired with this entry).
  'ivd-completeness': 'device-diagnostics',
});

/** Folded screens with no catalogue row ever, so no subscription to carry. */
export const FOLDED_WITHOUT_CATALOGUE_ROW: readonly string[] = Object.freeze([
  'part11-console',
  'ana-memory',
  'setup',
  'billing',
]);

/**
 * PURE: the modules an organization holds through a fold, each with the folded
 * module whose live grant carries it.
 *
 * `liveGrants` is the organization's live grants (readLicenseInfo's
 * `enabledModules`). A chain of folds is followed to its end, so a module
 * folded into a module that was later folded itself reaches the last target.
 * When two folded modules carry one target, the first in `liveGrants` order is
 * named.
 */
export function grantsHeldThroughFolds(liveGrants: readonly string[]): Readonly<Record<string, string>> {
  const held: Record<string, string> = {};
  for (const source of liveGrants) {
    const seen = new Set<string>([source]);
    let target = FOLDED_MODULE_SUCCESSORS[source];
    while (target !== undefined && !seen.has(target)) {
      seen.add(target);
      if (!(target in held)) held[target] = source;
      target = FOLDED_MODULE_SUCCESSORS[target];
    }
  }
  return held;
}
