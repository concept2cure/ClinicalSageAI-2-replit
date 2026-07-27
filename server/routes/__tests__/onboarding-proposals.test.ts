/**
 * POST /api/onboarding/ingest — read-only onboarding proposal ingest (P2).
 *
 * Locks: tenant context required, unsupported/empty files rejected honestly,
 * verified proposals returned, and — the property that matters — the route
 * NEVER persists the uploaded document or writes anything.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const extractTextMock = vi.fn();
const extractProposalsMock = vi.fn();

// Auth stand-in: `TestToken <orgId>` sets the org context the route requires.
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('TestToken ')) return res.status(401).json({ error: 'unauthorized' });
    const org = h.slice('TestToken '.length).trim();
    req.user = { id: 7, organizationId: org === 'none' ? null : Number(org) };
    next();
  },
}));
vi.mock('../../services/projects/extract-text', () => ({
  extractUploadedText: (...a: unknown[]) => extractTextMock(...a),
}));
vi.mock('../../services/onboarding/proposal-extraction', () => ({
  extractOnboardingProposals: (...a: unknown[]) => extractProposalsMock(...a),
}));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../onboarding-proposals')).default;
  app = express();
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
