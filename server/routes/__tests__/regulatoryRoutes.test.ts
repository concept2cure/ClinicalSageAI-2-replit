import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authUser: any = { organizationId: 1 };

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = authUser;
    next();
  },
}));

vi.mock('../../db', () => ({
  db: mockDb,
}));

vi.mock('@shared/schema', () => ({
  regulatoryCalendar: {
    organizationId: 'organizationId',
    eventDate: 'eventDate',
    eventId: 'eventId',
    title: 'title',
    description: 'description',
    eventType: 'eventType',
    status: 'status',
    priority: 'priority',
    endDate: 'endDate',
    submissionId: 'submissionId',
    location: 'location',
    id: 'id',
  },
  regulatorySubmissions: {
    id: 'id',
    submissionId: 'submissionId',
    drugName: 'drugName',
    targetMarket: 'targetMarket',
    status: 'status',
    submissionType: 'submissionType',
    targetSubmissionDate: 'targetSubmissionDate',
    indication: 'indication',
    sponsor: 'sponsor',
    currentGate: 'currentGate',
    progressPercentage: 'progressPercentage',
    organizationId: 'organizationId',
  },
}));

function selectChain(rows: any[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
        limit: async () => rows,
      }),
    }),
  };
}

describe('regulatoryRoutes (db-backed)', () => {
  beforeEach(() => {
    authUser = { organizationId: 1 };
    vi.clearAllMocks();
  });

  it('GET /submissions returns db-backed rows', async () => {
    const dueDate = new Date('2026-04-01T00:00:00.000Z');
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 'SUB-1',
          title: 'Program Alpha',
          agency: 'FDA',
          status: 'planning',
          type: 'IND',
          dueDate,
        },
      ])
    );

    const { default: regulatoryRoutes } = await import('../regulatoryRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/regulatory', regulatoryRoutes);

    const res = await request(app).get('/api/regulatory/submissions?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].id).toBe('SUB-1');
    expect(res.body.data[0].dueDate).toBe('2026-04-01T00:00:00.000Z');
  });

  it('POST /calendar rejects payloads that fail schema validation', async () => {
    const { default: regulatoryRoutes } = await import('../regulatoryRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/regulatory', regulatoryRoutes);

    const res = await request(app).post('/api/regulatory/calendar').send({
      title: '',
      eventType: 'meeting',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Invalid calendar payload');
  });

  it('POST /calendar rejects submission IDs not owned by org', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const { default: regulatoryRoutes } = await import('../regulatoryRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/regulatory', regulatoryRoutes);

    const res = await request(app).post('/api/regulatory/calendar').send({
      title: 'Type B meeting',
      eventType: 'meeting',
      eventDate: '2026-04-01T00:00:00.000Z',
      submissionId: 999,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('submissionId');
  });
});
