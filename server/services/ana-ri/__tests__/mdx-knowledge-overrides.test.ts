/**
 * Tenant knowledge-pack override tests.
 */

import { describe, it, expect, vi } from 'vitest';

// Stub the db facade so transitive command-executor / ana-ri service
// imports don't hit a real Postgres pool init at load time. Without
// DATABASE_URL these imports throw 'Database connection not available'
// before any test runs.
vi.mock('../../../db', () => ({
  db: {},
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }),
  getDb: () => ({}),
}));

import {
  loadMdxKnowledgeOverrides,
  applySurfaceOverride,
  applyWorkflowOverride,
  applyRegulationOverride,
} from '../mdx-knowledge-overrides';
import { getSurface, getWorkflow, getRegulation } from '../mdx-knowledge-pack';

function poolReturning(rows: any[]) {
  return { query: vi.fn(async () => ({ rows })) };
}

describe('loadMdxKnowledgeOverrides', () => {
  it('returns empty when settings is null', async () => {
    const o = await loadMdxKnowledgeOverrides(
      poolReturning([{ settings: null }]) as any,
      1,
    );
    expect(o).toEqual({});
  });

  it('returns the override block when present', async () => {
    const o = await loadMdxKnowledgeOverrides(
      poolReturning([
        {
          settings: {
            mdxKnowledgeOverrides: {
              surfaces: { 'pre-sub': { whenToUse: 'house wording' } },
              extraNotes: 'Acme Spine RA SOP-7: every Pre-Sub requires VP signoff.',
            },
          },
        },
      ]) as any,
      1,
    );
    expect(o.surfaces?.['pre-sub']?.whenToUse).toBe('house wording');
    expect(o.extraNotes).toContain('SOP-7');
  });

  it('is fail-soft on DB errors', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('db down'); }) };
    expect(await loadMdxKnowledgeOverrides(pool as any, 1)).toEqual({});
  });
});

describe('applySurfaceOverride', () => {
  it('appends to array fields, replaces strings', () => {
    const base = getSurface('pre-sub')!;
    const merged = applySurfaceOverride(base, {
      surfaces: {
        'pre-sub': {
          whenToUse: 'TENANT WORDING',
          affordances: ['Acme house affordance'],
          commonQuestions: ['Acme house question?'],
        },
      },
    });
    expect(merged.whenToUse).toBe('TENANT WORDING');
    // Original base affordances preserved + tenant additions.
    expect(merged.affordances).toEqual(
      expect.arrayContaining([...base.affordances, 'Acme house affordance']),
    );
    expect(merged.commonQuestions).toEqual(
      expect.arrayContaining([...base.commonQuestions, 'Acme house question?']),
    );
  });

  it('returns base unchanged when no override matches the key', () => {
    const base = getSurface('pre-sub')!;
    const merged = applySurfaceOverride(base, { surfaces: { other: {} } });
    expect(merged).toEqual(base);
  });

  it('keeps base purpose when override supplies empty string', () => {
    const base = getSurface('pre-sub')!;
    const merged = applySurfaceOverride(base, {
      surfaces: { 'pre-sub': { purpose: '' } },
    });
    expect(merged.purpose).toBe(base.purpose);
  });
});

describe('applyWorkflowOverride', () => {
  it('appends pitfalls / steps, replaces objective', () => {
    const base = getWorkflow('W3')!;
    const merged = applyWorkflowOverride(base, {
      workflows: {
        W3: {
          objective: 'Tenant-restated objective',
          pitfalls: ['Acme pitfall: legal review required first'],
        },
      },
    });
    expect(merged.objective).toBe('Tenant-restated objective');
    expect(merged.pitfalls).toEqual(
      expect.arrayContaining([...base.pitfalls, 'Acme pitfall: legal review required first']),
    );
  });
});

describe('applyRegulationOverride', () => {
  it('appends to requires array, replaces definition', () => {
    const base = getRegulation('q-sub')!;
    const merged = applyRegulationOverride(base, {
      regulations: {
        'q-sub': {
          requires: ['Acme house procedure: log every Q-Sub in the QMS'],
        },
      },
    });
    expect(merged.requires).toEqual(
      expect.arrayContaining([...base.requires, 'Acme house procedure: log every Q-Sub in the QMS']),
    );
    expect(merged.definition).toBe(base.definition);
  });
});
