/**
 * AnA can audit a reference list against PubMed and Crossref.
 *
 * verifyCitations — PMID → PubMed, DOI → Crossref, then a title search, with
 * retraction status, honouring the tenant's public-source egress setting — was
 * reachable only through POST /api/citations/verify. AnA had no tool for it,
 * so "do all 40 references in this Module 2.5 resolve?" was answered by a
 * model reading the list. The tool is a thin handler: the verdicts are the
 * engine's, counted, with retractions and discrepancies named.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const { verifyCitations } = vi.hoisted(() => ({ verifyCitations: vi.fn() }));
vi.mock('../../citation-verification-service', () => ({ verifyCitations }));
vi.mock('../../citation-verification-service.js', () => ({ verifyCitations }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolPedigree } from '../tool-pedigree.js';

const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('verify_citations')!(input, { organizationId: 7 } as any));

const result = (status: string, extra: Record<string, unknown> = {}) => ({
  status, exists: status === 'verified' ? true : status === 'not_found' ? false : null,
  confidence: status === 'verified' ? 1 : null, match: null, detail: status, checkedAt: 'now', input: {}, ...extra,
});

beforeEach(() => verifyCitations.mockReset());

describe('verify_citations', () => {
  it('returns the engine\'s verdict for each reference, counted, with retractions named', async () => {
    verifyCitations.mockResolvedValue([
      result('verified'),
      result('verified', { retracted: true }),
      result('not_found'),
      result('unverifiable'),
      result('error'),
    ]);
    const citations = [{ pmid: '1' }, { pmid: '9500320' }, { doi: '10.1/x' }, { raw: 'Smith 2019' }, { title: 'T' }];
    const out = await run({ citations });
    expect(verifyCitations).toHaveBeenCalledWith(citations);
    expect(out.summary).toEqual({ total: 5, verified: 2, retracted: 1, notFound: 1, unverifiable: 1, error: 1 });
    expect(out.results).toHaveLength(5);
    expect(out.message).toMatch(/1 retracted/);
  });

  it('asks for at least one identifying field per reference, and caps the list', async () => {
    expect((await run({})).error).toMatch(/citations/);
    expect((await run({ citations: [{ journal: 'J' }] })).error).toMatch(/raw, title, doi or pmid/);
    expect((await run({ citations: Array.from({ length: 51 }, (_, i) => ({ pmid: String(i + 1) })) })).error).toMatch(/50/);
    expect(verifyCitations).not.toHaveBeenCalled();
  });

  it('is offered, classified, and labelled a live external lookup', () => {
    expect(ALL_ANA_TOOLS.find((t) => t.name === 'verify_citations')).toBeDefined();
    const register = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tool-authorization.register.json'), 'utf8'));
    expect(register.tools.verify_citations.class).toBe('read');
    const inventory = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../ana-launch-scope.inventory.json'), 'utf8'));
    expect(inventory.tools.inScope).toContain('verify_citations');
    expect(getToolPedigree('verify_citations').pedigree).toBe('external_api_live');
  });
});
