import type { ReportScope } from '@shared/schema/report-os';
import type { InsightProvider } from './types';

const providers = new Map<string, InsightProvider>();

/**
 * Registers an insight provider. Registering an id that already exists overwrites
 * the previous registration (idempotent).
 */
export function registerProvider(p: InsightProvider): void {
  providers.set(p.id, p);
}

export function getProvider(id: string): InsightProvider | undefined {
  return providers.get(id);
}

/**
 * Lists registered providers. When a scope is given, only providers that declare
 * support for that scope are returned.
 */
export function listProviders(scope?: ReportScope): InsightProvider[] {
  const all = Array.from(providers.values());
  if (scope === undefined) return all;
  return all.filter(p => p.scopes.includes(scope));
}

/** Test helper: clears all registered providers. */
export function clearProviders(): void {
  providers.clear();
}
