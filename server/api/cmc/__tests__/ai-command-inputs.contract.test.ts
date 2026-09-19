/**
 * A CMC regulatory document must be generated from the caller's inputs, or not
 * at all.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * POST /api/cmc/workflows/ai-command generates a CMC document with the AI
 * gateway, stores it in `cmc_ai_command_results`, and returns a download link.
 * Three things went wrong on the way in.
 *
 * 1. THE CALLER'S INPUTS WERE SILENTLY DISCARDED. The schema declared
 *    `structuredInputs: z.object({})`. zod strips unknown keys unless a shape
 *    is declared or `.passthrough()` is set, so
 *    `{manufacturingRoute: 'Route B…', batchSize: 250}` parsed to `{}` —
 *    verified by executing the real schema.
 *
 * 2. THE HONEST BRANCH WAS UNREACHABLE. The prompt builder read
 *    `structuredInputs ? …entries… : '(no additional structured inputs
 *    provided)'`. `{}` is truthy, so the sentinel never fired and
 *    `Object.entries({}).join('\n')` made `inputSummary` the EMPTY STRING. The
 *    model was handed "Structured Inputs:" followed by nothing.
 *
 * 3. `requiredInputs` WAS DECLARED AND NEVER READ. Every command carries one —
 *    'Check nitrosamine risk assessment' declares
 *    ['drugName','manufacturingRoute'] — and no code path consulted it. So that
 *    command produced a nitrosamine risk assessment from a drug name alone, and
 *    the result was persisted and offered for download.
 *
 * The system prompt made it worse: "Be specific and technically accurate" with
 * no permission to be uncertain leaves a model nothing to do but supply
 * plausible specifics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const route = vi.fn();
const query = vi.fn();

// Specifiers must match the route's imports exactly:
//   import { db, getPool } from '../../db';
//   import { getGateway } from '../../services/ai-gateway/index.js';
vi.mock('../../../services/ai-gateway/index.js', () => ({
  getGateway: () => ({ route: (...a: unknown[]) => route(...a) }),
}));
vi.mock('../../../db', () => ({
  db: {},
  getPool: () => ({ query: (...a: unknown[]) => query(...a) }),
}));

let router: express.Router;
beforeEach(async () => {
  vi.resetModules();
  route.mockReset();
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
  route.mockResolvedValue({ content: '# CMC Document\n\nContent.' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  router = (await import('../workflowRoutes')).default as express.Router;
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    // getOrganizationId reads req.tenantId / req.tenantContext, not req.user.
    (req as unknown as { tenantId: number }).tenantId = 9901;
    next();
  });
  a.use('/api/cmc/workflows', router);
  return a;
}

const NITROSAMINE = 'Check nitrosamine risk assessment';

describe('the caller\'s structured inputs reach the model', () => {
  it('passes them into the prompt instead of stripping them', async () => {
    const res = await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({
        command: NITROSAMINE,
        drugName: 'Acme-1',
        structuredInputs: { manufacturingRoute: 'Route B, nitrite reagent in step 3' },
      });

    expect(res.status).toBe(200);
    expect(route).toHaveBeenCalledTimes(1);

    const userPrompt = route.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'user',
    ).content;

    // The old schema made this impossible: the value never survived parsing.
    expect(userPrompt).toContain('Route B, nitrite reagent in step 3');
    expect(userPrompt).toContain('manufacturingRoute');
  });

  it('instructs the model to mark gaps rather than fill them', async () => {
    await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({
        command: NITROSAMINE,
        drugName: 'Acme-1',
        structuredInputs: { manufacturingRoute: 'Route B' },
      });

    const systemPrompt = route.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'system',
    ).content;

    expect(systemPrompt).toMatch(/Not supplied/);
    expect(systemPrompt).toMatch(/Do NOT invent values/);
    expect(systemPrompt).toMatch(/representative figure as this product's/);
  });
});

describe('a command with unmet required inputs generates nothing', () => {
  it('refuses a nitrosamine risk assessment without the manufacturing route', async () => {
    const res = await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({ command: NITROSAMINE, drugName: 'Acme-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_INPUTS');
    expect(res.body.error.missingInputs).toEqual(['manufacturingRoute']);

    // Nothing generated, nothing stored — the two that matter.
    expect(route).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('treats a blank string as not supplied', async () => {
    const res = await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({
        command: NITROSAMINE,
        drugName: 'Acme-1',
        structuredInputs: { manufacturingRoute: '   ' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.missingInputs).toEqual(['manufacturingRoute']);
    expect(route).not.toHaveBeenCalled();
  });

  it('proceeds once every declared input is present', async () => {
    // The fix removes generation-from-nothing, not the capability.
    const res = await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({
        command: NITROSAMINE,
        drugName: 'Acme-1',
        structuredInputs: { manufacturingRoute: 'Route B' },
      });

    expect(res.status).toBe(200);
    expect(route).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('the download link points at the route that exists', () => {
  it('is mounted-path correct, not /api/cmc/download', async () => {
    const res = await request(app())
      .post('/api/cmc/workflows/ai-command')
      .send({
        command: NITROSAMINE,
        drugName: 'Acme-1',
        structuredInputs: { manufacturingRoute: 'Route B' },
      });

    // The only /download/:id handler is on this router, mounted at
    // /api/cmc/workflows. The advertised /api/cmc/download/:id 404s.
    expect(res.body.data.downloadUrl).toMatch(/^\/api\/cmc\/workflows\/download\//);
  });
});
