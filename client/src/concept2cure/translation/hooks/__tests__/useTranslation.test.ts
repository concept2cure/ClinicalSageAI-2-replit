/**
 * Tests for the translation pure data layer — query keys + the *Options()
 * builders the surface relies on for predictable, cross-entity cache
 * invalidation. Mirrors client/src/lib/api/__tests__/query-options.test.ts:
 * exercises the pure builders (keys, gating, staleTime) without rendering
 * React or hitting the network.
 */

import { describe, it, expect } from 'vitest';
import {
  translationQueryKeys,
  translationProjectsOptions,
  translationProjectOptions,
  translationGlossaryOptions,
} from '../useTranslation';

describe('translationQueryKeys', () => {
  it('namespaces every key under the translation root', () => {
    expect(translationQueryKeys.all).toEqual(['translation']);
    expect(translationQueryKeys.projects()).toEqual(['translation', 'projects']);
    expect(translationQueryKeys.glossary()).toEqual(['translation', 'glossary']);
  });

  it('nests project + segment keys so a segment mutation can invalidate both', () => {
    expect(translationQueryKeys.project(7)).toEqual(['translation', 'projects', 7]);
    expect(translationQueryKeys.segments(7)).toEqual(['translation', 'projects', 7, 'segments']);
  });

  it('keys distinct projects independently', () => {
    expect(translationQueryKeys.project(1)).not.toEqual(translationQueryKeys.project(2));
  });
});

describe('translationProjectsOptions', () => {
  it('uses the projects key, a queryFn, and a staleTime', () => {
    const opts = translationProjectsOptions();
    expect(opts.queryKey).toEqual(['translation', 'projects']);
    expect(typeof opts.queryFn).toBe('function');
    expect(opts.staleTime).toBeGreaterThan(0);
  });
});

describe('translationProjectOptions', () => {
  it('keys on the project id and is enabled when an id is present', () => {
    const opts = translationProjectOptions(42);
    expect(opts.queryKey).toEqual(['translation', 'projects', 42]);
    expect(opts.enabled).toBe(true);
    expect(typeof opts.queryFn).toBe('function');
  });

  it('is disabled and falls back to a sentinel key when id is null', () => {
    const opts = translationProjectOptions(null);
    expect(opts.enabled).toBe(false);
    expect(opts.queryKey).toEqual(['translation', 'projects', -1]);
  });

  it('resolves to null without a network call when id is null', async () => {
    const opts = translationProjectOptions(null);
    await expect(opts.queryFn()).resolves.toBeNull();
  });
});

describe('translationGlossaryOptions', () => {
  it('uses the glossary key and a long-ish staleTime', () => {
    const opts = translationGlossaryOptions();
    expect(opts.queryKey).toEqual(['translation', 'glossary']);
    expect(typeof opts.queryFn).toBe('function');
    expect(opts.staleTime).toBeGreaterThan(0);
  });
});
