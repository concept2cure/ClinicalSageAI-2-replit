/**
 * POST /api/concept2cure/artifacts/export-pptx renders the content it was sent.
 *
 * Until 2026-10-15, `nanoBanana: true` (with Nano Banana configured) replaced
 * the export with generatePresentation({ topic: title }): a deck the model wrote
 * from the title alone. The submitted content was used only to size it, the
 * mandatory EXPORT_REVIEW_NOTICE was dropped, the cover image it generated was
 * never put in the file, and the result was delivered and recorded
 * (EXPORT_GENERATED) as this artifact's export. The flag is now refused; a
 * generated deck is POST /api/nano-banana/presentation.
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import JSZip from 'jszip';

const logAction = vi.hoisted(() => vi.fn());
const nano = vi.hoisted(() => ({
  isConfigured: vi.fn(() => true),
  generatePresentation: vi.fn(),
}));

vi.mock('../../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../../services/nanoBananaService', () => nano);
vi.mock('../../../auth', () => ({ authMiddleware: (_q: Request, _s: Response, n: NextFunction) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: Request, _s: Response, n: NextFunction) => n(),
  requireOrganizationContext: (_q: Request, _s: Response, n: NextFunction) => n(),
}));
vi.mock('../shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../shared');
  return {
    ...actual,
    concept2cureRateLimiter: (_q: Request, _s: Response, n: NextFunction) => n(),
    getOrganizationId: () => 7,
    getUserId: () => 3,
  };
});

import exportsRouter from '../exports';

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function slideText(pptx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(pptx);
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return (await Promise.all(names.map(n => zip.files[n].async('string')))).join('\n');
}

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/concept2cure', exportsRouter);
  return a;
}

const body = { title: 'Safety briefing', content: '### Findings\n- No new signal in the 2026 data cut' };

beforeEach(() => {
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
  nano.isConfigured.mockReturnValue(true);
  nano.generatePresentation.mockReset();
  nano.generatePresentation.mockResolvedValue({
    pptxBuffer: Buffer.from('PK a deck written from the title alone'),
    filename: 'Safety-briefing.pptx',
    slideCount: 6,
  });
});

describe('POST /api/concept2cure/artifacts/export-pptx', () => {
  it('refuses nanoBanana: true before anything is generated, delivered or recorded', async () => {
    const res = await request(app())
      .post('/api/concept2cure/artifacts/export-pptx')
      .send({ ...body, nanoBanana: true });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NANO_BANANA_NOT_AN_EXPORT');
    expect(nano.generatePresentation).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('without the flag, delivers a deck made from the submitted content and records its hash', async () => {
    const res = await request(app())
      .post('/api/concept2cure/artifacts/export-pptx')
      .send(body)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(nano.generatePresentation).not.toHaveBeenCalled();
    const text = await slideText(res.body);
    expect(text).toContain('No new signal in the 2026 data cut');
    // (A deck whose content opens with a "# " title slide loses this notice
    // inside pptxGenerator, whose title layout draws no body text — reported
    // 2026-10-15, outside this change.)
    expect(text).toContain('NOT AGENCY-VALIDATED');
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction.mock.calls[0][0].details.sha256).toBe(sha(res.body));
  });
});
