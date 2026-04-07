export const BETA_510K_HERO_TABS = [
  'device-intake',
  'predicates',
  'equivalence',
  'compliance',
  'document-editor',
  'document-vault',
  'submission',
];

export const BETA_510K_PRIMARY_NAV_TABS = new Set([
  'device-intake',
  'predicates',
  'equivalence',
  'compliance',
  'document-editor',
  'submission',
]);

export const DEFAULT_BETA_510K_TAB = 'device-intake';

export function isBeta510kTab(tabId) {
  return BETA_510K_HERO_TABS.includes(tabId);
}

export function resolveBetaInitialTab(candidateTab) {
  return isBeta510kTab(candidateTab) ? candidateTab : DEFAULT_BETA_510K_TAB;
}
