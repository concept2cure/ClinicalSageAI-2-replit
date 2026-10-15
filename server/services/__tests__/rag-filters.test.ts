import { describe, it, expect } from 'vitest';
import {
  buildDocFilterClause,
  mergeFilters,
  VAULT_FILTER_COLUMNS,
  RAG_FILTER_COLUMNS,
} from '../rag-filters';

describe('buildDocFilterClause', () => {
  it('returns empty and touches no params when filters is undefined', () => {
    const params: unknown[] = ['a'];
    expect(buildDocFilterClause(undefined, params, RAG_FILTER_COLUMNS)).toBe('');
    expect(params).toEqual(['a']);
  });

  it('appends ILIKE predicates with placeholders sequential after existing params', () => {
    const params: unknown[] = ['vec', 0.5, 10]; // $1..$3 already bound (vector, threshold, limit)
    const clause = buildDocFilterClause({ atomType: 'protocol', source: 'FDA' }, params, RAG_FILTER_COLUMNS);
    expect(clause).toContain('d.document_type ILIKE $4');
    expect(clause).toContain('d.source ILIKE $5');
    expect(params).toEqual(['vec', 0.5, 10, 'protocol', 'FDA']);
  });

  it('respects an existing org-filter placeholder (filters start at $5)', () => {
    const params: unknown[] = ['vec', 0.5, 10, 42]; // $4 = organization_id
    const clause = buildDocFilterClause({ atomType: 'CSR' }, params, RAG_FILTER_COLUMNS);
    expect(clause).toContain('d.document_type ILIKE $5');
    expect(params[4]).toBe('CSR');
  });

  it('expands a date range into >= and <= bounds', () => {
    const params: unknown[] = ['q', 10];
    const start = new Date('2024-01-01');
    const end = new Date('2024-12-31');
    const clause = buildDocFilterClause({ dateRange: { start, end } }, params, RAG_FILTER_COLUMNS);
    expect(clause).toContain('d.document_date >= $3');
    expect(clause).toContain('d.document_date <= $4');
    expect(params).toEqual(['q', 10, start, end]);
  });

  it('skips filters with no backing column on the corpus (vault has no source)', () => {
    const params: unknown[] = [];
    const clause = buildDocFilterClause({ atomType: 'protocol', source: 'FDA' }, params, VAULT_FILTER_COLUMNS);
    expect(clause).toContain('d.document_type ILIKE $1');
    expect(clause).not.toContain('source');
    expect(params).toEqual(['protocol']); // source dropped — no column on vault.documents
  });

  it('never applies domain (no corpus has a column for it)', () => {
    const params: unknown[] = [];
    const clause = buildDocFilterClause({ domain: 'oncology' }, params, RAG_FILTER_COLUMNS);
    expect(clause).toBe('');
    expect(params).toEqual([]);
  });
});

describe('a program scope (PF-10 S7)', () => {
  const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';

  it('the vault corpus filters on the document\'s program, as a bound uuid', () => {
    const params: unknown[] = ['q'];
    const clause = buildDocFilterClause({ programId: PROGRAM }, params, VAULT_FILTER_COLUMNS);
    expect(clause).toContain('AND d.program_id = $2::uuid');
    expect(params).toEqual(['q', PROGRAM]);
  });

  it('a corpus with no program column refuses the scope rather than searching wider', () => {
    expect(() => buildDocFilterClause({ programId: PROGRAM }, [], RAG_FILTER_COLUMNS)).toThrow(/no program column/);
  });

  it('survives the merge with self-query filters, alone or beside them', () => {
    expect(mergeFilters(undefined, { programId: PROGRAM })).toEqual({ programId: PROGRAM });
    expect(mergeFilters({ atomType: 'protocol' }, { programId: PROGRAM })).toEqual({ atomType: 'protocol', programId: PROGRAM });
  });
});

describe('mergeFilters', () => {
  it('returns undefined when neither side contributes anything', () => {
    expect(mergeFilters(undefined, undefined)).toBeUndefined();
    expect(mergeFilters({}, {})).toBeUndefined();
  });

  it('lets explicit filters win field-by-field over extracted ones', () => {
    const merged = mergeFilters({ atomType: 'guidance', source: 'FDA' }, { atomType: 'protocol' });
    expect(merged).toEqual({ atomType: 'protocol', source: 'FDA' });
  });
});
