/**
 * The Nano Banana routes answer with what was produced, through the real
 * service (only the Gemini SDK and the AI gateway are stubbed).
 *
 * Until 2026-10-15:
 *  - POST /generate and /edit answered 200 `{ success: true, images: [] }` when
 *    the model's reply carried no image, and POST /chat answered
 *    "Here's the image I generated" over the same empty list;
 *  - POST /presentation sent X-Slide-Count as the number of slides asked of the
 *    model (6 by default), not the number in the file it delivered.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  aiComplete: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock('../../lib/unified-ai-client', () => ({ aiComplete: h.aiComplete }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.generateContent };
    }
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: { BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH' },
}));
vi.mock('../../middleware/nanoBananaGuard', () => ({
  nanoBananaRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  nanoBananaCache: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUsageStats: () => ({}),
}));

import router from '../nanoBanana';

const THREE_SLIDES = '# CMC overview\n---\n### Drug substance\n- [insert specification]\n---\n### Drug product\n- [insert batch data]';
const textOnlyReply = {
  response: { candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] } }] },
};

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/nano-banana', router);
  return a;
}

const savedKey = process.env.GOOGLE_GEMINI_API_KEY;
afterAll(() => {
  if (savedKey === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
  else process.env.GOOGLE_GEMINI_API_KEY = savedKey;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.GOOGLE_GEMINI_API_KEY = 'test-key';
  h.aiComplete.mockResolvedValue(THREE_SLIDES);
  h.generateContent.mockResolvedValue(textOnlyReply);
});

describe('no image came back', () => {
  it.each([
    ['/generate', { prompt: 'a cell' }],
    ['/edit', { prompt: 'brighter', referenceImage: 'AAAA' }],
    ['/chat', { message: 'generate an image of a cell' }],
  ])('POST %s says so, and does not answer success', async (path, body) => {
    const res = await request(app()).post(`/api/nano-banana${path}`).send(body);

    expect(res.status).toBe(502);
    expect(res.body.success).not.toBe(true);
    expect(res.body.error).toBe('NO_IMAGE_RETURNED');
    expect(JSON.stringify(res.body)).not.toMatch(/Here's the image I generated/);
  });
});

describe('POST /presentation', () => {
  it('X-Slide-Count is the number of slides in the delivered deck, not the number asked for', async () => {
    const res = await request(app()).post('/api/nano-banana/presentation').send({ topic: 'CMC overview' });

    expect(res.status).toBe(200);
    expect(res.headers['x-slide-count']).toBe('3');
  });
});
