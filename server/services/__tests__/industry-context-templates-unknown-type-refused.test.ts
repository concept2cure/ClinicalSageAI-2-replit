/**
 * An unknown company or project type has no template; it is not answered with
 * someone else's.
 *
 * What the code used to do (until 2026-10-15): getCompanyTemplate fell back to the
 * Biotechnology Company template and getProjectTemplate to the IND template, so
 * GET /api/client-intelligence/ana/templates/company/cro answered 200 with the
 * biotech template, as if it were the CRO one.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

vi.mock('../client-intelligence-memory', () => ({
  upsertClientProfile: vi.fn(), getClientProfile: vi.fn(), ingestDocument: vi.fn(), getMemoryEntries: vi.fn(),
  searchMemoryEntriesSemantic: vi.fn(), getIngestedDocuments: vi.fn(), upsertProjectIntelligence: vi.fn(),
  getProjectIntelligence: vi.fn(), ingestProjectDocument: vi.fn(), getProjectMemoryEntries: vi.fn(),
  searchProjectMemoryEntriesSemantic: vi.fn(), getProjectIngestedDocuments: vi.fn(), buildProjectIntelligenceContext: vi.fn(),
  getDocumentChecklist: vi.fn(), archiveMemoryEntry: vi.fn(), verifyMemoryEntry: vi.fn(), buildClientIntelligenceContext: vi.fn(),
  supersedeClientMemoryEntry: vi.fn(), supersedeProjectMemoryEntry: vi.fn(), getSharedMemoryPool: vi.fn(), isOwnProject: vi.fn(),
}));
vi.mock('../memory-context-assembler.js', () => ({ buildMemoryContextForChat: vi.fn() }));

import { getCompanyTemplate, getProjectTemplate, getTemplateForContext, type CompanyType, type ProjectType } from '../industry-context-templates';

describe('template getters', () => {
  it('return null for an unknown type instead of the biotech / IND template', () => {
    expect(getCompanyTemplate('cro' as CompanyType)).toBeNull();
    expect(getProjectTemplate('IDE' as ProjectType)).toBeNull();
    expect(getTemplateForContext('cro' as CompanyType, 'IND', ['FDA'])).toBeNull();
    expect(getTemplateForContext('biotech', 'IDE' as ProjectType, ['FDA'])).toBeNull();
  });

  it('still return the template for a known type', () => {
    expect(getCompanyTemplate('pharma')?.companyType).toBe('pharma');
    expect(getProjectTemplate('510k')?.projectType).toBe('510k');
    expect(getTemplateForContext('pharma', '510k', ['FDA'])?.companySections.length).toBeGreaterThan(0);
  });
});

describe('GET /api/client-intelligence/ana/templates/{company,project}/:type', () => {
  async function app(): Promise<express.Express> {
    const a = express();
    a.use((req: Request, _res: Response, next: NextFunction) => { (req as unknown as { user: unknown }).user = { id: 3, organizationId: 7 }; next(); });
    a.use('/api/client-intelligence', (await import('../../routes/client-intelligence')).default);
    return a;
  }

  it('answers 404 for an unknown company type', async () => {
    const res = await request(await app()).get('/api/client-intelligence/ana/templates/company/cro');
    expect(res.status).toBe(404);
    expect(res.body.template).toBeUndefined();
  });

  it('answers 404 for an unknown project type', async () => {
    const res = await request(await app()).get('/api/client-intelligence/ana/templates/project/IDE');
    expect(res.status).toBe(404);
    expect(res.body.template).toBeUndefined();
  });

  it('answers 200 with the template for a known type', async () => {
    const res = await request(await app()).get('/api/client-intelligence/ana/templates/company/pharma');
    expect(res.status).toBe(200);
    expect(res.body.template.companyType).toBe('pharma');
  });
});
