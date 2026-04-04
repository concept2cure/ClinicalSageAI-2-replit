/**
 * Service Registry
 *
 * Simple boot-time service registry that eliminates dynamic import() hacks.
 * Services register themselves at startup. Consumers look them up by key.
 *
 * This replaces the pattern of:
 *   const mod = await import('./some-service.js');
 *   if (mod?.someFunction) mod.someFunction(...);
 *
 * With:
 *   const fn = serviceRegistry.get<SomeType>('some-service.someFunction');
 *   if (fn) fn(...);
 */

type ServiceEntry = unknown;

const registry = new Map<string, ServiceEntry>();

/**
 * Register a service or function at boot time.
 */
export function registerService(key: string, service: ServiceEntry): void {
  registry.set(key, service);
}

/**
 * Look up a registered service or function.
 * Returns undefined if not registered.
 */
export function getService<T>(key: string): T | undefined {
  return registry.get(key) as T | undefined;
}

/**
 * Check if a service is registered.
 */
export function hasService(key: string): boolean {
  return registry.has(key);
}

/**
 * Get all registered service keys (for diagnostics).
 */
export function getRegisteredServiceKeys(): string[] {
  return [...registry.keys()];
}
