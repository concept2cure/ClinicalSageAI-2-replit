/**
 * Nano Banana reports what it made, not what it was asked for.
 *
 * Until 2026-10-15:
 *  - generatePresentation returned `slideCount: req.slideCount || 5` — the
 *    number of slides ASKED of the model — as the deck's slide count. The
 *    /presentation route sent it as X-Slide-Count and the chat answered
 *    "I've created a 6-slide presentation" whatever the file held.
 *  - generateImage returned `images: []` without error when the model's reply
 *    carried no image, and chatWithNanoBanana answered "Here's the image I
 *    generated" over it.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

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

import { chatWithNanoBanana, generateImage, generatePresentation } from '../nanoBananaService';

/** Three slides, where six were asked for. */
const THREE_SLIDES = [
  '# CMC overview',
  '---',
  '### Drug substance',
  '- [insert specification]',
  '---',
  '### Drug product',
  '- [insert batch data]',
].join('\n');

const textOnlyReply = {
  response: { candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] } }] },
};
const imageReply = {
  response: { candidates: [{ content: { parts: [{ inlineData: { data: 'iVBORw0KGgo=', mimeType: 'image/png' } }] } }] },
};

async function slidesIn(pptx: Buffer): Promise<number> {
  const zip = await JSZip.loadAsync(pptx);
  return Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
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
});

describe('generatePresentation counts the slides it built', () => {
  it('reports the slides in the file, not the number asked of the model', async () => {
    const result = await generatePresentation({ topic: 'CMC overview', slideCount: 6, generateImages: false });

    expect(await slidesIn(result.pptxBuffer)).toBe(3);
    expect(result.slideCount).toBe(3);
  });

  it("the chat's sentence carries the counted number", async () => {
    h.generateContent.mockResolvedValue(textOnlyReply);
    const result = await chatWithNanoBanana('create a presentation about CMC overview');

    expect(result.text).toContain('3-slide presentation');
    expect(result.text).not.toContain('6-slide');
  });
});

describe('a reply with no image is an error, not an empty success', () => {
  it('generateImage refuses an answer that carries no image', async () => {
    h.generateContent.mockResolvedValue(textOnlyReply);

    await expect(generateImage({ prompt: 'a cell' })).rejects.toMatchObject({ code: 'NO_IMAGE_RETURNED' });
  });

  it('the chat does not say "Here\'s the image I generated" over no image', async () => {
    h.generateContent.mockResolvedValue(textOnlyReply);

    await expect(chatWithNanoBanana('generate an image of a cell')).rejects.toMatchObject({
      code: 'NO_IMAGE_RETURNED',
    });
  });

  it('an image that came back is still returned', async () => {
    h.generateContent.mockResolvedValue(imageReply);

    const result = await generateImage({ prompt: 'a cell' });
    expect(result.images).toEqual([{ base64: 'iVBORw0KGgo=', mimeType: 'image/png' }]);
  });

  it('a cover image that did not come back leaves the deck without one, and the chat does not claim it', async () => {
    h.generateContent.mockResolvedValue(textOnlyReply);
    const result = await chatWithNanoBanana('create a presentation about CMC overview');

    expect(result.images).toEqual([]);
    expect(result.text).not.toMatch(/cover image/i);
  });
});
