import type { OnboardingDiscovery } from '@shared/types/onboarding-discovery';

const SECTIONS = ['company', 'user', 'project', 'setup'] as const;
const fieldsOf = (section: object): Record<string, unknown> => section as Record<string, unknown>;

/** Track the fields the person actually changed while a saved record is loading. */
export function changedDiscoveryFields(before: OnboardingDiscovery, after: OnboardingDiscovery): string[] {
  return SECTIONS.flatMap((section) => Object.keys(after[section])
    .filter((field) => JSON.stringify(fieldsOf(before[section])[field]) !== JSON.stringify(fieldsOf(after[section])[field]))
    .map((field) => `${section}.${field}`));
}

/** A late read fills untouched fields without replacing a person's work. */
export function hydrateDiscoveryDraft(current: OnboardingDiscovery, saved: OnboardingDiscovery, edited: ReadonlySet<string>): OnboardingDiscovery {
  const next = { ...current, company: { ...current.company }, user: { ...current.user }, project: { ...current.project }, setup: { ...current.setup } };
  for (const section of SECTIONS) {
    const untouched = Object.entries(saved[section]).filter(([field]) => !edited.has(`${section}.${field}`));
    Object.assign(next[section], Object.fromEntries(untouched));
  }
  if (next.project.productType !== 'device') next.project.predicateDevice = '';
  if (next.project.productType !== 'ivd') next.project.assayContext = '';
  return next;
}
