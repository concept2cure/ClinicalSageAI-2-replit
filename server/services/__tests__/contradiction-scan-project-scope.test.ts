/**
 * A contradiction scan reads the project it names, or refuses (VSR-001 F-25).
 *
 * The engine scans the integer project spine (`projects.id`); a program's id
 * is a uuid. `scanProject` never checked that the project it was given is one
 * the organisation holds:
 *   - a project the organisation does not hold has no assumption or decision
 *     rows, so the scan answered `{ findings: [], total: 0 }`, a clean result
 *     for a project nothing was read from. OQ-SRDY-06 passed on exactly that:
 *     it scanned project 1 in an organisation with no project 1;
 *   - a program's uuid arrives as NaN, which the registry searches treat as
 *     "no project filter" (`if (input.projectId)`), so the scan read every
 *     assumption and decision in the organisation and reported them as this
 *     project's.
 * Authoring's module and section preflights read the same scan, and a clean
 * scan reads as "no blocking contradictions".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  projectRows: [] as Array<{ id: number }>,
  projectQueries: 0,
  searches: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (/FROM projects/i.test(sql)) {
        h.projectQueries += 1;
        return { rows: h.projectRows };
      }
      return { rows: [] };
    }),
  },
}));
vi.mock('../assumption-registry-service', () => ({
  assumptionRegistryService: {
    search: vi.fn(async (input: Record<string, unknown>) => {
      h.searches.push(input);
      return [];
    }),
  },
}));
vi.mock('../decision-record-service', () => ({
  decisionRecordService: {
    search: vi.fn(async (input: Record<string, unknown>) => {
      h.searches.push(input);
      return [];
    }),
  },
}));

import { contradictionEngineService, ContradictionScanScopeError } from '../contradiction-engine-service';

beforeEach(() => {
  h.projectRows = [];
  h.projectQueries = 0;
  h.searches = [];
});

describe('a project the organisation does not hold', () => {
  it('is refused, not scanned clean', async () => {
    const outcome = await contradictionEngineService.scanProject(1, 1).then(
      (r) => r,
      (e: unknown) => e,
    );

    expect(outcome).toBeInstanceOf(ContradictionScanScopeError);
    expect(outcome).toMatchObject({ status: 404 });
    expect(h.searches).toHaveLength(0);
  });
});

describe('a program id, which is not a project id', () => {
  it('is refused before anything is read, not scanned across the organisation', async () => {
    const outcome = await contradictionEngineService.scanProject(1, Number('1d3cc4a5-5ffa-4ff1-ae79-6e3a4222b6dc')).then(
      (r) => r,
      (e: unknown) => e,
    );

    expect(outcome).toBeInstanceOf(ContradictionScanScopeError);
    expect(outcome).toMatchObject({ status: 400 });
    expect(h.searches).toHaveLength(0);
    expect(h.projectQueries).toBe(0);
  });
});

describe('a project the organisation holds', () => {
  it('is scanned, and every read is filtered to it', async () => {
    h.projectRows = [{ id: 7 }];

    const result = await contradictionEngineService.scanProject(1, 7);

    expect(result.summary.total).toBe(0);
    expect(h.searches.length).toBeGreaterThan(0);
    expect(h.searches.every((s) => s.projectId === 7 && s.organizationId === 1)).toBe(true);
  });
});
