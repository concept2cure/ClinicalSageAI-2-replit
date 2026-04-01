import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  selectQueue,
  insertQueue,
  updateQueue,
} = vi.hoisted(() => ({
  selectQueue: [] as any[],
  insertQueue: [] as any[],
  updateQueue: [] as any[],
}));

function nextSelectResult() {
  return Promise.resolve(selectQueue.shift() ?? []);
}

function nextInsertResult() {
  return Promise.resolve(insertQueue.shift() ?? []);
}

function nextUpdateResult() {
  return Promise.resolve(updateQueue.shift() ?? []);
}

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => nextSelectResult()),
          })),
          limit: vi.fn(() => nextSelectResult()),
          groupBy: vi.fn(() => nextSelectResult()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => nextInsertResult()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => nextUpdateResult()),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('@shared/schema', () => ({
  evidenceSources: {
    id: 'id',
    organizationId: 'organization_id',
    programId: 'program_id',
    title: 'title',
    sourceType: 'source_type',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    fileUrl: 'file_url',
    contentText: 'content_text',
    metadata: 'metadata',
    pageCount: 'page_count',
  },
  evidenceClaims: {
    id: 'id',
    sourceId: 'source_id',
    organizationId: 'organization_id',
    isCurrent: 'is_current',
  },
  evidenceClaimLinks: {
    id: 'id',
    claimId: 'claim_id',
    organizationId: 'organization_id',
    createdAt: 'created_at',
    deletedAt: 'deleted_at',
    deletedBy: 'deleted_by',
    documentId: 'document_id',
    sectionId: 'section_id',
    linkType: 'link_type',
    strength: 'strength',
  },
}));

describe('evidence routes (db-backed)', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertQueue.length = 0;
    updateQueue.length = 0;
  });

  it('GET /search returns DB-backed items and facets', async () => {
    selectQueue.push(
      [
        {
          id: 11,
          title: 'Evidence A',
          sourceType: 'literature',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      [{ value: 'literature', count: 1 }]
    );

    const mod = await import('../../routes/evidence');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantContext = { tenantId: 42 };
      next();
    });
    app.use('/api/evidence', mod.default);

    const res = await request(app).get('/api/evidence/search').query({ q: 'Evidence' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.facets.type).toEqual([{ value: 'literature', count: 1 }]);
  });

  it('POST /links auto-creates a claim when no claim exists for source', async () => {
    selectQueue.push(
      [{ id: 55, programId: 777, title: 'Source Title', contentText: 'Claim text' }],
      []
    );
    insertQueue.push([{ id: 901 }], [{ id: 902, documentId: 321, sectionId: 'sec-1', linkType: 'supports', strength: '0.66', createdAt: new Date('2026-02-01T00:00:00Z') }]);

    const mod = await import('../../routes/evidence');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantContext = { tenantId: 42 };
      (req as any).user = { id: 7, name: 'Tester' };
      next();
    });
    app.use('/api/evidence', mod.default);

    const res = await request(app).post('/api/evidence/links').send({
      evidenceId: 55,
      targetType: 'section',
      targetId: '321',
      targetPath: 'sec-1',
      linkType: 'supports',
      strength: 'moderate',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('902');
    expect(res.body.data.evidenceId).toBe('55');
  });
});
