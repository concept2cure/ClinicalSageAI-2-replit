/**
 * Existing MDX surfaces reached as project workflow features.
 *
 * This is a navigation boundary, not a bundled entitlement. Each feature keeps
 * its existing module id, server verdict, and governed access controls.
 */
export const MDX_PROJECT_FEATURE_SURFACE_IDS = [
  'device-workstream',
  'device-510k',
  'device-pma',
  'device-cer',
  'device-diagnostics',
  // No IVD completeness: it folded into device-diagnostics (D2, fold F2, 2026-10-29).
  'device-clinical-studies',
  'device-software',
  'device-engineering',
  'device-udi',
  'device-postmarket',
  'device-presub',
  // No device vault: it folded into the Vault, a core service of every project
  // (D2, fold F3, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/).
  // No device task workbench: it folded into Tasks, a core service of every
  // project (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/).
  // No organization-wide blocker list: a blocker is its filing's readiness (D2,
  // fold F5 item 2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
  'device-submission',
  'device-analytics',
  // No risk management or design controls: both folded into device-engineering
  // (D2, fold F1c, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/).
  'human-factors',
  'labeling',
] as const;

const MDX_PROJECT_FEATURES: ReadonlySet<string> = new Set(MDX_PROJECT_FEATURE_SURFACE_IDS);

export function isMdxProjectFeature(id: string): boolean {
  return MDX_PROJECT_FEATURES.has(id);
}
