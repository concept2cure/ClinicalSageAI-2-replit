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
  'ivd-completeness',
  'device-clinical-studies',
  'device-software',
  'device-engineering',
  'device-udi',
  'device-postmarket',
  'device-presub',
  'device-vault',
  // No device task workbench: it folded into Tasks, a core service of every
  // project (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/).
  'device-validation',
  'device-submission',
  'device-analytics',
  'design-controls',
  'human-factors',
  'risk',
  'labeling',
] as const;

const MDX_PROJECT_FEATURES: ReadonlySet<string> = new Set(MDX_PROJECT_FEATURE_SURFACE_IDS);

export function isMdxProjectFeature(id: string): boolean {
  return MDX_PROJECT_FEATURES.has(id);
}
