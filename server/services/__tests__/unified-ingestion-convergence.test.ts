import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerDocument: vi.fn(),
  updateDocument: vi.fn(),
  rawQuery: vi.fn(),
}));

vi.mock('../../utils/database.js', () => ({ pool: { query: mocks.rawQuery } }));
vi.mock('../../db.ts', () => ({ db: {} }));
vi.mock('../ModuleIntegrationService.ts', () => ({
  ModuleIntegrationService: class {
    registerDocument = mocks.registerDocument;
    updateDocument = mocks.updateDocument;
  },
}));
vi.mock('../CSRIntelligenceLibrary.js', () => ({ csrIntelligenceLibrary: {} }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: {} }));

import { UnifiedDocumentIngestion } from '../unifiedDocumentIngestion.js';

const input = (options: Record<string, unknown> = {}) => ({
  file: {
    originalname: 'clinical-overview.pdf',
    size: 128,
    mimetype: 'application/pdf',
    buffer: Buffer.from('pdf'),
  },
  extractedContent: { text: 'Clinical overview', hash: 'sha256', tables: [] },
  processedText: { chunks: [] },
  aiAnalysis: { classification: 'overview' },
  moduleSpecificData: { ctdModule: 'Module 2' },
  options: { tenantId: 7, projectId: 91, userId: 42, module: 'ectd', ...options },
  processingId: 'ingest-1',
  processingTime: 15,
  documentType: { type: 'clinical_overview' },
  structure: { headings: [] },
});

describe('unified ingestion convergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registerDocument.mockResolvedValue({
      id: 100,
      title: 'clinical-overview.pdf',
      version: { id: 501, version: 1 },
      moduleDocument: { id: 601 },
    });
    mocks.updateDocument.mockResolvedValue({ id: 100, version: { id: 502, version: 2 } });
  });

  it('enrolls a new upload through the existing ModuleIntegrationService', async () => {
    const service = new UnifiedDocumentIngestion() as any;
    service.storeDocumentChunks = vi.fn();
    service.storeDocumentTables = vi.fn();

    const result = await service.storeUnifiedDocument(input());

    expect(result.id).toBe(100);
    expect(mocks.registerDocument).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 7,
      moduleType: 'ectd',
      originalId: 'ingest-1',
      createdBy: '42',
      metadata: expect.objectContaining({ projectId: '91', processingId: 'ingest-1' }),
    }));
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped workflow version instead of a second document', async () => {
    const service = new UnifiedDocumentIngestion() as any;
    service.storeDocumentChunks = vi.fn();
    service.storeDocumentTables = vi.fn();

    await service.storeUnifiedDocument(input({ previousVersionId: 100 }));

    expect(mocks.registerDocument).not.toHaveBeenCalled();
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ updatedBy: '42' }),
      7
    );
  });

  it.each([
    ['tenantId', { tenantId: undefined }],
    ['projectId', { projectId: undefined }],
    ['userId', { userId: undefined }],
    ['module', { module: 'general' }],
  ])('fails closed for invalid %s scope', async (_name, override) => {
    const service = new UnifiedDocumentIngestion() as any;
    await expect(service.storeUnifiedDocument(input(override))).rejects.toThrow(/required|module/);
    expect(mocks.registerDocument).not.toHaveBeenCalled();
  });
});
