/**
 * Translation routes HTTP contract (/api/translation) — supertest over the
 * mounted router with faked auth and MOCKED side-effect edges:
 *   - DrizzleTranslationRepository → in-memory tenant-scoped store
 *   - AI gateway (getGateway) → stubbed route()
 * The pure platform pieces (hybrid-workflow state machine, status maps,
 * glossary compiler, translation memory, LLM provider, orchestrator) run REAL,
 * so approve rejections are the genuine guard errors ('method_not_approvable',
 * 'back_translation_required', ...), not test doubles.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted in-memory repository + gateway stubs ────────────────────────────

const { repoState, mockRepo, gatewayMocks } = vi.hoisted(() => {
  interface Row {
    [key: string]: any;
  }
  const repoState = {
    projects: [] as Row[],
    segments: [] as Row[],
    glossary: [] as Row[],
    tm: [] as Row[],
    seq: 0,
    // When set, the matching list call throws this error (e.g. 42P01).
    listProjectsError: null as Error | null,
    listGlossaryError: null as Error | null,
    reset() {
      this.projects = [];
      this.segments = [];
      this.glossary = [];
      this.tm = [];
      this.seq = 0;
      this.listProjectsError = null;
      this.listGlossaryError = null;
    },
  };

  const stamp = () => ({ createdAt: new Date(), updatedAt: new Date(), deletedAt: null });

  const mockRepo = {
    createProject: vi.fn(async (organizationId: number, input: Row) => {
      const row = { id: ++repoState.seq, organizationId, status: 'draft', ...input, ...stamp() };
      repoState.projects.push(row);
      return row;
    }),
    getProject: vi.fn(async (organizationId: number, projectId: number) => {
      return (
        repoState.projects.find(
          (p) => p.organizationId === organizationId && p.id === projectId && !p.deletedAt,
        ) ?? null
      );
    }),
    listProjects: vi.fn(async (organizationId: number) => {
      if (repoState.listProjectsError) throw repoState.listProjectsError;
      return repoState.projects.filter((p) => p.organizationId === organizationId && !p.deletedAt);
    }),
    addSegment: vi.fn(async (organizationId: number, input: Row) => {
      const row = { id: ++repoState.seq, organizationId, ...input, ...stamp() };
      repoState.segments.push(row);
      return row;
    }),
    updateSegment: vi.fn(async (organizationId: number, segmentId: number, patch: Row) => {
      const row = repoState.segments.find(
        (s) => s.organizationId === organizationId && s.id === segmentId && !s.deletedAt,
      );
      if (!row) return null;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) row[key] = value;
      }
      row.updatedAt = new Date();
      return { ...row };
    }),
    getSegment: vi.fn(async (organizationId: number, segmentId: number) => {
      return (
        repoState.segments.find(
          (s) => s.organizationId === organizationId && s.id === segmentId && !s.deletedAt,
        ) ?? null
      );
    }),
    getSegments: vi.fn(async (organizationId: number, projectId: number) => {
      return repoState.segments
        .filter((s) => s.organizationId === organizationId && s.projectId === projectId && !s.deletedAt)
        .sort((a, b) => String(a.segmentKey).localeCompare(String(b.segmentKey)));
    }),
    upsertGlossaryTerm: vi.fn(async (organizationId: number, input: Row) => {
      const existing = repoState.glossary.find(
        (g) =>
          g.organizationId === organizationId &&
          g.sourceTerm === input.sourceTerm &&
          (input.targetLanguage ? g.targetLanguage === input.targetLanguage : g.targetLanguage == null) &&
          !g.deletedAt,
      );
      if (existing) {
        Object.assign(existing, input, { updatedAt: new Date() });
        return { ...existing };
      }
      const row = { id: ++repoState.seq, organizationId, ...input, ...stamp() };
      repoState.glossary.push(row);
      return row;
    }),
    listGlossary: vi.fn(async (organizationId: number) => {
      if (repoState.listGlossaryError) throw repoState.listGlossaryError;
      return repoState.glossary.filter((g) => g.organizationId === organizationId && !g.deletedAt);
    }),
    tmLookup: vi.fn(async () => []),
    tmStore: vi.fn(async (organizationId: number, input: Row) => {
      const row = { id: ++repoState.seq, organizationId, ...input, ...stamp() };
      repoState.tm.push(row);
      return row;
    }),
  };

  const gatewayMocks = {
    route: vi.fn(),
    getGateway: vi.fn(() => ({ route: gatewayMocks.route })),
  };

  return { repoState, mockRepo, gatewayMocks };
});

vi.mock('../../services/translation/repository', () => ({
  createDrizzleTranslationRepository: () => mockRepo,
}));

vi.mock('../../services/ai-gateway/gateway.js', () => ({
  getGateway: gatewayMocks.getGateway,
}));

import translationRouter from '../translation.routes';

// ─── Test app (faked auth: authMiddleware runs only in the real bootstrap) ───

let currentUser: any;
let app: express.Express;

function gatewayReply(content: string, overrides: Record<string, unknown> = {}) {
  return {
    content,
    provider: 'anthropic',
    model: 'claude-test',
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    latencyMs: 3,
    requestId: 'req-1',
    cached: false,
    deterministic: false,
    ...overrides,
  };
}

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/translation', translationRouter);
});

beforeEach(() => {
  repoState.reset();
  currentUser = { id: 9, organizationId: 1 };
  gatewayMocks.route.mockResolvedValue(gatewayReply('Übersetzter Text'));
});

// Convenience: create a project through the API (2 pending segments).
async function createProject(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/translation/projects')
    .send({
      name: 'PI German',
      sourceLang: 'en',
      targetLang: 'de',
      sourceDocumentId: 12,
      sourceSectionCode: '1.14.1',
      segments: [
        { ordinal: 0, sourceText: 'Adverse events were reported.' },
        { ordinal: 1, sourceText: 'Store below 25 degrees.' },
      ],
      ...overrides,
    });
  expect(res.status).toBe(200);
  return res.body.data;
}

async function draftAll(projectId: number) {
  const res = await request(app)
    .post(`/api/translation/projects/${projectId}/segments/draft`)
    .send({ projectId });
  expect(res.status).toBe(200);
  return res.body.data;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('tenancy guard', () => {
  it('403 without an organization on every surface root', async () => {
    currentUser = null;
    for (const [method, url] of [
      ['get', '/api/translation/projects'],
      ['get', '/api/translation/glossary'],
      ['post', '/api/translation/projects'],
      ['post', '/api/translation/glossary'],
    ] as const) {
      const res = await (request(app) as any)[method](url).send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Organization context required');
    }
  });
});

describe('projects', () => {
  it('POST /projects creates the project and seeds pending segments', async () => {
    const project = await createProject();
    expect(project).toMatchObject({
      id: expect.any(Number),
      organizationId: 1,
      name: 'PI German',
      sourceDocumentId: 12,
      sourceSectionCode: '1.14.1',
      sourceLang: 'en',
      targetLang: 'de',
      status: 'pending',
      createdBy: 9,
    });
    expect(project.segmentCounts).toMatchObject({ pending: 2, approved: 0 });
    // Persisted rows are tenant-stamped and pending in the DB vocabulary.
    expect(repoState.segments).toHaveLength(2);
    expect(repoState.segments[0]).toMatchObject({ organizationId: 1, status: 'pending' });
  });

  it('POST /projects → 422 validation_failed on a bad body', async () => {
    const res = await request(app)
      .post('/api/translation/projects')
      .send({ name: 'X', sourceLang: 'en', targetLang: 'xx', segments: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('GET /projects lists DTO-shaped rows with server-computed segmentCounts', async () => {
    await createProject();
    const res = await request(app).get('/api/translation/projects');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ count: 1 });
    const [row] = res.body.data;
    // The Projects surface renders: name, sourceLang→targetLang, status chip,
    // and progress from segmentCounts.
    expect(row).toMatchObject({
      name: 'PI German',
      sourceLang: 'en',
      targetLang: 'de',
      status: 'pending',
    });
    expect(row.segmentCounts.pending).toBe(2);
  });

  it('GET /projects/:id returns the detail (project + ordered segment DTOs)', async () => {
    const project = await createProject();
    const res = await request(app).get(`/api/translation/projects/${project.id}`);
    expect(res.status).toBe(200);
    const detail = res.body.data;
    expect(detail.id).toBe(project.id);
    expect(detail.segments).toHaveLength(2);
    const [first, second] = detail.segments;
    expect(first).toMatchObject({
      projectId: project.id,
      organizationId: 1,
      ordinal: 0,
      sourceText: 'Adverse events were reported.',
      targetText: '',
      sourceLang: 'en',
      targetLang: 'de',
      method: null, // nothing produced yet
      status: 'pending',
    });
    expect(second.ordinal).toBe(1);
    // Part-11 provenance shell is present from the start.
    expect(first.provenance).toMatchObject({
      sourceHash: expect.any(String),
      engine: null,
      postEditedBy: null,
      reviewedBy: null,
      approvedBy: null,
      backTranslation: null,
    });
  });

  it('GET /projects/:id → 404 for a project outside the tenant', async () => {
    const project = await createProject();
    currentUser = { id: 5, organizationId: 2 };
    const res = await request(app).get(`/api/translation/projects/${project.id}`);
    expect(res.status).toBe(404);
  });

  it('GET lists fail closed to the empty envelope when the store is missing (42P01)', async () => {
    repoState.listProjectsError = Object.assign(new Error('relation "translation_projects" does not exist'), {
      code: '42P01',
    });
    repoState.listGlossaryError = Object.assign(new Error('relation "glossary_terms" does not exist'), {
      code: '42P01',
    });
    for (const url of ['/api/translation/projects', '/api/translation/glossary']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], meta: { count: 0, pendingStore: true } });
    }
  });
});

describe('machine draft', () => {
  it('drafts pending segments to mt_draft/machine via the (stubbed) gateway', async () => {
    const project = await createProject();
    const data = await draftAll(project.id);

    expect(data.projectId).toBe(project.id);
    expect(data.engine).toBe('anthropic:claude-test');
    expect(data.deterministic).toBe(false);
    expect(data.segments).toHaveLength(2);
    expect(data.segments[0]).toMatchObject({
      status: 'mt_draft',
      method: 'machine',
      targetText: 'Übersetzter Text',
    });
    expect(data.segments[0].provenance.engine).toBe('anthropic:claude-test');
    // Persisted with the storage vocabulary.
    expect(repoState.segments[0]).toMatchObject({ status: 'machine_translated', method: 'machine' });
  });

  it('503 draft_provider_unavailable when the gateway cannot be constructed', async () => {
    const project = await createProject();
    gatewayMocks.getGateway.mockImplementationOnce(() => {
      throw new Error('no API key configured');
    });
    const res = await request(app)
      .post(`/api/translation/projects/${project.id}/segments/draft`)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('draft_provider_unavailable');
    // Nothing was drafted — segments stay pending.
    expect(repoState.segments.every((s) => s.status === 'pending')).toBe(true);
  });

  it('503 draft_provider_unavailable when every gateway call fails (no fabrication)', async () => {
    const project = await createProject();
    gatewayMocks.route.mockRejectedValue(new Error('gateway down'));
    const res = await request(app)
      .post(`/api/translation/projects/${project.id}/segments/draft`)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('draft_provider_unavailable');
    expect(repoState.segments.every((s) => s.status === 'pending')).toBe(true);
  });

  it('reports non-draftable requested segments in meta.failures', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    // Segment already drafted — a re-draft request is refused, not silently redone.
    const res = await request(app)
      .post(`/api/translation/projects/${project.id}/segments/draft`)
      .send({ segmentIds: [segmentId] });
    expect(res.status).toBe(200);
    expect(res.body.data.segments).toHaveLength(0);
    expect(res.body.meta.failures).toHaveLength(1);
    expect(res.body.meta.failures[0].segmentId).toBe(segmentId);
  });
});

describe('post-edit', () => {
  it('turns a machine draft into mt_postedited/in_progress with post-editor provenance', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;

    const res = await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ segmentId, targetText: 'Unerwünschte Ereignisse wurden berichtet.', method: 'mt_postedited' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'in_progress',
      method: 'mt_postedited',
      targetText: 'Unerwünschte Ereignisse wurden berichtet.',
    });
    expect(res.body.data.provenance.postEditedBy).toBe(9);
    expect(repoState.segments.find((s) => s.id === segmentId)).toMatchObject({
      status: 'post_edited',
      postEditor: 9,
    });
  });

  it('readyForReview advances into the back-translation verification queue', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    const res = await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Neuer Zieltext.', method: 'mt_postedited', readyForReview: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('back_translation');
  });

  it('404 for a segment outside the tenant', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    currentUser = { id: 5, organizationId: 2 };
    const res = await request(app)
      .post(`/api/translation/segments/${drafted.segments[0].id}/post-edit`)
      .send({ targetText: 'X', method: 'human' });
    expect(res.status).toBe(404);
  });
});

describe('back-translation', () => {
  it('records passing evidence and moves the segment to review', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Unerwünschte Ereignisse wurden berichtet.', method: 'mt_postedited' });

    // Round-trip returns the exact source → similarity 1.0 → verified.
    gatewayMocks.route.mockResolvedValue(gatewayReply('Adverse events were reported.'));
    const res = await request(app)
      .post(`/api/translation/segments/${segmentId}/back-translation`)
      .send({ segmentId });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({
      targetLang: 'de',
      backText: 'Adverse events were reported.',
      engine: 'anthropic:claude-test',
      verified: true,
    });
    expect(res.body.data.result.similarity).toBeGreaterThanOrEqual(0.85);
    expect(res.body.data.segment.status).toBe('review');
    expect(res.body.data.segment.provenance.backTranslation.verified).toBe(true);
  });

  it('failing evidence is recorded but never verifies (segment stays in back_translation)', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Zieltext.', method: 'mt_postedited' });

    gatewayMocks.route.mockResolvedValue(gatewayReply('Something entirely unrelated to the source.'));
    const res = await request(app)
      .post(`/api/translation/segments/${segmentId}/back-translation`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.result.verified).toBe(false);
    expect(res.body.data.segment.status).toBe('back_translation');
  });

  it('409 illegal_transition when run on a raw machine draft (post-edit first)', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const res = await request(app)
      .post(`/api/translation/segments/${drafted.segments[0].id}/back-translation`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('illegal_transition');
  });
});

describe('approve (real hybrid-workflow guards)', () => {
  it("rejects a raw machine draft with 'method_not_approvable'", async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const res = await request(app)
      .post(`/api/translation/segments/${drafted.segments[0].id}/approve`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('method_not_approvable');
    expect(res.body.error.message).toMatch(/not approvable/i);
  });

  it("rejects a post-edited segment without evidence with 'back_translation_required'", async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Unerwünschte Ereignisse wurden berichtet.', method: 'mt_postedited' });

    const res = await request(app).post(`/api/translation/segments/${segmentId}/approve`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('back_translation_required');
  });

  it("rejects when the reviewer is the post-editor ('reviewer_conflict')", async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Unerwünschte Ereignisse wurden berichtet.', method: 'mt_postedited' });
    gatewayMocks.route.mockResolvedValue(gatewayReply('Adverse events were reported.'));
    await request(app).post(`/api/translation/segments/${segmentId}/back-translation`).send({});

    // Same user (9) post-edited — separation of duties blocks their sign-off.
    const res = await request(app).post(`/api/translation/segments/${segmentId}/approve`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('reviewer_conflict');
  });

  it('approves post-edit + verified evidence + distinct reviewer (and accrues TM)', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    const segmentId = drafted.segments[0].id;
    await request(app)
      .post(`/api/translation/segments/${segmentId}/post-edit`)
      .send({ targetText: 'Unerwünschte Ereignisse wurden berichtet.', method: 'mt_postedited' });
    gatewayMocks.route.mockResolvedValue(gatewayReply('Adverse events were reported.'));
    await request(app).post(`/api/translation/segments/${segmentId}/back-translation`).send({});

    currentUser = { id: 10, organizationId: 1 }; // distinct reviewer of record
    const res = await request(app)
      .post(`/api/translation/segments/${segmentId}/approve`)
      .send({ reviewNote: 'Terminology verified against the DNT registry.' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'approved', method: 'mt_postedited' });
    expect(res.body.data.provenance).toMatchObject({
      postEditedBy: 9,
      reviewedBy: 10,
      approvedBy: 10,
    });
    expect(res.body.data.provenance.backTranslation.verified).toBe(true);

    // Storage row satisfies the machine-needs-postedit CHECK inputs.
    expect(repoState.segments.find((s) => s.id === segmentId)).toMatchObject({
      status: 'approved',
      postEditor: 9,
      reviewer: 10,
      approvedBy: 10,
      backTranslationVerified: true,
    });
    // Approved pair accrued into the tenant TM for future draft reuse.
    expect(repoState.tm).toHaveLength(1);
    expect(repoState.tm[0]).toMatchObject({
      organizationId: 1,
      sourceLanguage: 'en',
      targetLanguage: 'de',
      approvedForReuse: true,
      originSegmentId: segmentId,
    });

    // The project detail now rolls up as approved once every segment is terminal.
    // (Post-edit as user 9 again — the reviewer of record must stay distinct.)
    const secondId = drafted.segments[1].id;
    currentUser = { id: 9, organizationId: 1 };
    await request(app)
      .post(`/api/translation/segments/${secondId}/post-edit`)
      .send({ targetText: 'Unter 25 Grad lagern.', method: 'mt_postedited' });
    gatewayMocks.route.mockResolvedValue(gatewayReply('Store below 25 degrees.'));
    await request(app).post(`/api/translation/segments/${secondId}/back-translation`).send({});
    currentUser = { id: 10, organizationId: 1 };
    const secondApprove = await request(app)
      .post(`/api/translation/segments/${secondId}/approve`)
      .send({});
    expect(secondApprove.status).toBe(200);
    const detail = await request(app).get(`/api/translation/projects/${project.id}`);
    expect(detail.body.data.status).toBe('approved');
    expect(detail.body.data.segmentCounts.approved).toBe(2);
  });

  it('404 for a segment outside the tenant', async () => {
    const project = await createProject();
    const drafted = await draftAll(project.id);
    currentUser = { id: 10, organizationId: 2 };
    const res = await request(app)
      .post(`/api/translation/segments/${drafted.segments[0].id}/approve`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('glossary', () => {
  it('upserts a DNT term (targetTerm dropped) and lists it back', async () => {
    const res = await request(app)
      .post('/api/translation/glossary')
      .send({ sourceTerm: 'FDA', doNotTranslate: true, category: 'agency_name', targetTerm: 'ignored' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: expect.any(Number),
      organizationId: 1,
      sourceTerm: 'FDA',
      targetTerm: null,
      doNotTranslate: true,
      category: 'agency_name',
      targetLang: null,
    });

    const list = await request(app).get('/api/translation/glossary');
    expect(list.status).toBe(200);
    expect(list.body.meta.count).toBe(1);
    expect(list.body.data[0]).toMatchObject({ sourceTerm: 'FDA', doNotTranslate: true });
  });

  it('upsert on the same (sourceTerm, targetLang) key updates instead of duplicating', async () => {
    await request(app)
      .post('/api/translation/glossary')
      .send({
        sourceTerm: 'adverse event',
        doNotTranslate: false,
        category: 'preferred_term',
        targetTerm: 'unerwünschtes Ereignis',
        targetLang: 'de',
      });
    const res = await request(app)
      .post('/api/translation/glossary')
      .send({
        sourceTerm: 'adverse event',
        doNotTranslate: false,
        category: 'preferred_term',
        targetTerm: 'Nebenwirkung',
        targetLang: 'de',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.targetTerm).toBe('Nebenwirkung');
    expect(repoState.glossary).toHaveLength(1);
  });

  it('422 validation_failed for an unknown category', async () => {
    const res = await request(app)
      .post('/api/translation/glossary')
      .send({ sourceTerm: 'X', doNotTranslate: true, category: 'nope' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
  });
});
