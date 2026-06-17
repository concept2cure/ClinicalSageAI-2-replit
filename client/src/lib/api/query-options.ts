/**
 * apiQueryOptions — the one React Query convention every surface installs against.
 *
 * Wraps the project's standard `apiRequest` (auth + org headers + uniform error
 * handling) into a typed `queryOptions` object. This is the template a designer
 * replicates per surface: define a typed `*Options()` (pure, testable, no React)
 * and a thin `use*()` that passes it to `useQuery`. Keeping the options pure is
 * what makes the data layer testable without rendering.
 *
 * Usage:
 *   export const fooOptions = () => apiQueryOptions<Foo>('/api/foo');
 *   export const useFoo = () => useQuery(fooOptions());
 */

import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

/** GET a URL and parse JSON, returning null for 204/empty (typed as T). */
export async function apiGetJson<T>(url: string): Promise<T> {
  const res = await apiRequest('GET', url);
  if (res.status === 204 || res.headers.get('Content-Length') === '0') {
    return null as unknown as T;
  }
  return (await res.json()) as T;
}

export interface ApiQueryOverrides {
  /** Override the default queryKey (defaults to [url]). */
  queryKey?: readonly unknown[];
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

/**
 * Typed `queryOptions` for a GET endpoint, using the standard apiRequest.
 * The queryKey defaults to `[url]` so cache invalidation is predictable.
 */
export function apiQueryOptions<T>(url: string, overrides: ApiQueryOverrides = {}) {
  const { queryKey, ...rest } = overrides;
  return queryOptions<T>({
    queryKey: queryKey ?? [url],
    queryFn: () => apiGetJson<T>(url),
    ...rest,
  });
}
