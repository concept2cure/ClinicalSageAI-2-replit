/**
 * POST /api/onboarding/ingest — read-only onboarding proposal ingest (P2).
 *
 * Locks: tenant context required, unsupported/empty files rejected honestly,
 * verified proposals returned, and — the property that matters — the uploaded
 * document is never persisted. Ingest stores only the server's own record of
 * what it proposed, so the governed commit can re-read its own extraction
 * rather than trust the client's copy.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const extractTextMock = vi.fn();
const extractProposalsMock = vi.fn();

// The real limiter (12/min) would reject later cases in this file — the suite
// makes more requests from one IP than a human would. Its presence on the route
// is the security property; its counting is not what these tests exercise.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Auth stand-in: `TestToken <orgId>` sets the org context the route requires.
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('TestToken ')) return res.status(401).json({ error: 'unauthorized' });
    // `TestToken <orgId> [role]`
    const [org, role] = h.slice('TestToken '.length).trim().split(/\s+/);
    req.user = { id: 7, organizationId: org === 'none' ? null : Number(org), role: role || 'member' };
    next();
  },
}));
vi.mock('../../services/projects/extract-text', () => ({
  extractUploadedText: (...a: unknown[]) => extractTextMock(...a),
}));
vi.mock('../../services/onboarding/proposal-extraction', () => ({
  extractOnboardingProposals: (...a: unknown[]) => extractProposalsMock(...a),
}));


// The proposal store is mocked with a faithful in-memory stand-in: its trust
// boundary (forged ids, cross-org runs, expiry) is proven in
// services/onboarding/__tests__/proposal-store.test.ts against the real query
// shape. These tests prove the ROUTE consults it correctly.
const runs = new Map<string, any[]>();
vi.mock('../../services/onboarding/proposal-store', () => ({
  saveRun: async (_req: unknown, _owner: unknown, result: any) => {
    const id = `run-${runs.size + 1}`;
    runs.set(id, result.groups.flatMap((g: any) => g.fields));
    return id;
  },
  resolveApprovals: async (_req: unknown, _owner: unknown, runId: string, approvals: any[]) => {
    const stored = runs.get(runId);
    if (!stored) return { ok: false, error: 'That review session has expired.', approvals: [], unknownIds: [] };
    const out: any[] = [];
    const unknownIds: string[] = [];
    for (const a of approvals) {
      const p = stored.find((f: any) => f.id === a.id);
      if (!p) { unknownIds.push(a.id); continue; }
      const edited = typeof a.value === 'string' ? a.value.trim() : '';
      const original = (p.extractedValue ?? '').trim();
      const value = edited || original;
      if (!value) continue;
      out.push({ proposal: p, value, humanEdited: edited.length > 0 && edited !== original });
    }
    return { ok: true, approvals: out, unknownIds };
  },
  markRunCommitted: async () => {},
}));

// Governed-commit collaborators.
const auditMock = vi.fn();
const updateSetMock = vi.fn();
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => auditMock(...a) },
}));
vi.mock('../../db/requestDb', () => ({
  requestDb: () => ({
    select: () => ({ from: () => ({ where: () => [{ name: 'Old Co', clientType: 'biotech', industryMode: 'onc' }] }) }),
    update: () => ({
      set: (vals: unknown) => {
        updateSetMock(vals);
        return { where: () => ({ returning: () => [{ name: 'Meridian Therapeutics', clientType: 'biotech', industryMode: 'onc' }] }) };
      },
    }),
  }),
}));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../onboarding-proposals')).default;
  app = express();
  app.use(express.json()); // mirrors the global /api json parser
  app.use('/api/onboarding', router);
});

beforeEach(() => {
  extractTextMock.mockReset();
  extractProposalsMock.mockReset();
  extractTextMock.mockResolvedValue('Meridian Therapeutics, Inc. is a biotech company.');
  extractProposalsMock.mockResolvedValue({
    groups: [
      {
        entity: 'org_profile',
        label: 'Organization profile',
        fields: [
          {
            id: 'p0-org_profile.name',
            entity: 'org_profile',
            targetField: 'org_profile.name',
            label: 'Organization name',
            value: 'Meridian Therapeutics',
            extractedValue: 'Meridian Therapeutics',
            provenance: { file: 'profile.pdf', page: 1, snippet: 'Meridian Therapeutics, Inc.' },
            confidence: 0.9,
            status: 'proposed',
          },
        ],
      },
    ],
    sources: [{ file: 'profile.pdf', bytes: 48 }],
    warnings: [],
  });
});

const pdf = (name = 'profile.pdf') =>
  request(app)
    .post('/api/onboarding/ingest')
    .set('Authorization', 'TestToken 2')
    .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: name, contentType: 'application/pdf' });

describe('POST /api/onboarding/ingest', () => {
  it('401s without authentication', async () => {
    const res = await request(app).post('/api/onboarding/ingest');
    expect(res.status).toBe(401);
  });

  it('400s without an organization context', async () => {
    const res = await request(app)
      .post('/api/onboarding/ingest')
      .set('Authorization', 'TestToken none')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('400s when no document is attached', async () => {
    const res = await request(app).post('/api/onboarding/ingest').set('Authorization', 'TestToken 2');
    expect(res.status).toBe(400);
    expect(extractProposalsMock).not.toHaveBeenCalled();
  });

  it('415s an unreadable file type instead of pretending to read it', async () => {
    const res = await request(app)
      .post('/api/onboarding/ingest')
      .set('Authorization', 'TestToken 2')
      .attach('file', Buffer.from('PK'), { filename: 'book.xlsx', contentType: 'application/vnd.ms-excel' });
    expect(res.status).toBe(415);
    expect(extractProposalsMock).not.toHaveBeenCalled();
  });

  it('returns verified proposals with their provenance', async () => {
    const res = await pdf();
    expect(res.status).toBe(200);
    const field = res.body.data.groups[0].fields[0];
    expect(field.value).toBe('Meridian Therapeutics');
    expect(field.provenance.file).toBe('profile.pdf');
    // The extractor received the real extracted text, not the raw buffer.
    expect(extractProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'profile.pdf', text: expect.stringContaining('Meridian') }),
    );
  });

  it('passes through an honest empty result rather than inventing content', async () => {
    extractTextMock.mockResolvedValue('');
    extractProposalsMock.mockResolvedValue({
      groups: [],
      sources: [{ file: 'scan.pdf', bytes: 0 }],
      warnings: ['No readable text was extracted from scan.pdf, so nothing could be proposed.'],
    });
    const res = await pdf('scan.pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(0);
    expect(res.body.data.warnings[0]).toMatch(/no readable text/i);
  });

  it('degrades honestly when extraction throws', async () => {
    extractProposalsMock.mockRejectedValue(new Error('boom'));
    const res = await pdf();
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // The internal error message is not leaked to the client.
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
  });
});

describe('POST /api/onboarding/commit — governed, server-authoritative', () => {
  /** Run an ingest as an admin and return its server-issued runId. */
  const ingestAsAdmin = async () => {
    const res = await request(app)
      .post('/api/onboarding/ingest')
      .set('Authorization', 'TestToken 2 admin')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'profile.pdf', contentType: 'application/pdf' });
    return res.body.data.runId as string;
  };
  const commit = (body: unknown, auth = 'TestToken 2 admin') =>
    request(app).post('/api/onboarding/commit').set('Authorization', auth).send(body as object);

  beforeEach(() => {
    auditMock.mockReset();
    updateSetMock.mockReset();
  });

  it('403s a non-admin member (fail-closed authorization)', async () => {
    const runId = await ingestAsAdmin();
    const res = await commit({ runId, approvals: [{ id: 'p0-org_profile.name' }], reason: 'reviewed against the uploaded profile' }, 'TestToken 2');
    expect(res.status).toBe(403);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('400s without a reason — it is never synthesized', async () => {
    const runId = await ingestAsAdmin();
    const res = await commit({ runId, approvals: [{ id: 'p0-org_profile.name' }], reason: '  ' });
    expect(res.status).toBe(400);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('410s an expired or unknown review session rather than trusting the body', async () => {
    const res = await commit({ runId: 'made-up-run', approvals: [{ id: 'x' }], reason: 'reviewed against the uploaded profile' });
    expect(res.status).toBe(410);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('applies an approved field and audits it as AnA-on-behalf-of with server provenance', async () => {
    const runId = await ingestAsAdmin();
    const res = await commit({
      runId,
      approvals: [{ id: 'p0-org_profile.name' }],
      reason: 'Confirmed against the uploaded profile.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toEqual(['organizations.profile']);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meridian Therapeutics' }));

    const entry = auditMock.mock.calls[0][0];
    expect(entry.details.actorKind).toBe('ana_on_behalf_of_user');
    expect(entry.details.reason).toBe('Confirmed against the uploaded profile.');
    expect(entry.details.before).toBeDefined();
    // Provenance recorded comes from the SERVER's proposal, not the request body.
    expect(entry.details.fields[0].provenance.file).toBe('profile.pdf');
    expect(entry.details.fields[0].humanEdited).toBe(false);
  });

  it('cannot be tricked into writing a value the server never proposed', async () => {
    const runId = await ingestAsAdmin();
    const res = await commit({
      runId,
      // Forged id + attacker-supplied provenance-looking fields are ignored.
      approvals: [{ id: 'forged', value: 'Attacker Corp' }],
      reason: 'attempted injection scenario',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toEqual([]);
    expect(res.body.data.unknownIds).toEqual(['forged']);
    expect(updateSetMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('is registered as a Part 11 governed command at the reason-only tier', async () => {
    const gov = await import('../../services/ana-ri/part11-governance');
    expect(gov.requiresPart11Signoff('onboarding.apply_proposals')).toBe(true);
    // Deliberately NOT e-sign tier — first-run setup should not demand re-auth.
    expect(gov.requiresEsignature('onboarding.apply_proposals')).toBe(false);
  });

  it('enforces the governed minimum reason length, not a token one', async () => {
    const runId = await ingestAsAdmin();
    const res = await commit({ runId, approvals: [{ id: 'p0-org_profile.name' }], reason: 'ok' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 10/);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('records the governed command name in the audit entry', async () => {
    const runId = await ingestAsAdmin();
    await commit({ runId, approvals: [{ id: 'p0-org_profile.name' }], reason: 'reviewed against the uploaded profile' });
    expect(auditMock.mock.calls[0][0].details.part11Command).toBe('onboarding.apply_proposals');
  });

  it('rejects a human edit that the canonical governed PATCH would reject', async () => {
    const runId = await ingestAsAdmin();
    // A one-character name violates the 2–120 rule enforced by
    // PATCH /organizations/:id/profile; this path must not be a way around it.
    const res = await commit({ runId, approvals: [{ id: 'p0-org_profile.name', value: 'X' }], reason: 'reviewed against the uploaded profile' });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toEqual([]);
    expect(res.body.data.applied[0]).toMatchObject({ ok: false });
    expect(res.body.data.applied[0].error).toMatch(/2–120|2-120/);
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it('reports a field with no governed write path instead of writing it elsewhere', async () => {
    extractProposalsMock.mockResolvedValue({
      groups: [
        {
          entity: 'program',
          label: 'First program',
          fields: [
            {
              id: 'p0-program.code', entity: 'program', targetField: 'program.code', label: 'Program code',
              value: 'MER-204', extractedValue: 'MER-204',
              provenance: { file: 'profile.pdf', page: 1 }, confidence: 0.9, status: 'proposed',
            },
          ],
        },
      ],
      sources: [{ file: 'profile.pdf' }],
      warnings: [],
    });
    const runId = await ingestAsAdmin();
    const res = await commit({ runId, approvals: [{ id: 'p0-program.code' }], reason: 'reviewed against the uploaded profile' });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toEqual([]);
    expect(res.body.data.applied[0]).toMatchObject({ targetField: 'program.code', ok: false });
    expect(updateSetMock).not.toHaveBeenCalled();
  });
});
