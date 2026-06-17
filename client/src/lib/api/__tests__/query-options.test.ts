/**
 * Tests for the apiQueryOptions factory and the global-RI catalog options.
 *
 * These cover the *pure* data layer (query keys, options shape, url builders) —
 * the part design relies on for predictable caching — without rendering React
 * or hitting the network.
 */

import { describe, it, expect } from 'vitest';
import { apiQueryOptions } from '../query-options';
import {
  GLOBAL_RI_CATALOG_URL,
  globalRiGroupUrl,
  globalRiCatalogOptions,
  globalRiGroupCatalogOptions,
} from '@/hooks/useGlobalRiCatalog';

describe('apiQueryOptions', () => {
  it('defaults the queryKey to [url] and provides a queryFn', () => {
    const opts = apiQueryOptions<{ ok: boolean }>('/api/foo');
    expect(opts.queryKey).toEqual(['/api/foo']);
    expect(typeof opts.queryFn).toBe('function');
  });

  it('honors overrides (queryKey, enabled, staleTime)', () => {
    const opts = apiQueryOptions('/api/foo', {
      queryKey: ['/api/foo', 'v2'],
      enabled: false,
      staleTime: 1234,
    });
    expect(opts.queryKey).toEqual(['/api/foo', 'v2']);
    expect(opts.enabled).toBe(false);
    expect(opts.staleTime).toBe(1234);
  });
});

describe('global-RI catalog options', () => {
  it('targets the real catalog endpoint with a long staleTime', () => {
    const opts = globalRiCatalogOptions();
    expect(opts.queryKey).toEqual([GLOBAL_RI_CATALOG_URL]);
    expect(GLOBAL_RI_CATALOG_URL).toBe('/api/global-ri/catalog');
    expect(opts.staleTime).toBeGreaterThan(0);
  });

  it('builds a url-encoded, gated group query', () => {
    expect(globalRiGroupUrl('quality_cmc')).toBe('/api/global-ri/catalog/quality_cmc');
    const opts = globalRiGroupCatalogOptions('quality_cmc');
    expect(opts.queryKey).toEqual(['/api/global-ri/catalog/quality_cmc']);
    expect(opts.enabled).toBe(true);

    // An empty group disables the query (no wasted request).
    expect(globalRiGroupCatalogOptions('').enabled).toBe(false);
  });
});
