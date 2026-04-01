/**
 * Nano Banana Service — Google Gemini Image Generation
 *
 * Wraps the Gemini API's native image generation capabilities
 * (branded "Nano Banana" / "Nano Banana Pro") for:
 *   - 4K image generation with accurate text rendering
 *   - Presentation-ready visuals (infographics, slides, data viz)
 *   - Image editing via conversational prompts
 *   - Multi-image composition (up to 14 reference photos)
 *
 * Models:
 *   - gemini-2.0-flash-preview-image-generation  (fast, high-volume)
 *   - gemini-2.0-flash-exp                       (Nano Banana Pro — 4K, text-accurate)
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerateContentResult,
  type Part,
} from '@google/generative-ai';
import { generatePptxBuffer } from './pptxGenerator';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_genAI) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_GEMINI_API_KEY is required. Get one free at https://aistudio.google.com/apikey'
      );
    }
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NanoBananaImageRequest {
  prompt: string;
  /** Optional base64-encoded reference image for editing */
  referenceImage?: string;
  /** MIME type of reference image */
  referenceMimeType?: string;
  /** 'fast' uses Flash, 'pro' uses Pro model */
  quality?: 'fast' | 'pro';
  /** Number of images to generate (1-4) */
  count?: number;
  /** Style guidance: 'photorealistic' | 'illustration' | 'infographic' | 'slide' */
  style?: string;
}

export interface NanoBananaImageResult {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  prompt: string;
  model: string;
  generationTimeMs: number;
}

export interface NanoBananaPresentationRequest {
  topic: string;
  /** Number of slides (default 5) */
  slideCount?: number;
  /** Audience: 'fda-advisory', 'board', 'investor', 'training', 'scientific' */
  audience?: string;
  /** Whether to generate cover images for each slide */
  generateImages?: boolean;
}

export interface NanoBananaPresentationResult {
  pptxBuffer: Buffer;
  filename: string;
  slideCount: number;
  coverImage?: { base64: string; mimeType: string };
}

// ─── Safety settings (allow medical/scientific content) ───────────────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── Model selection ──────────────────────────────────────────────────────────

const MODELS = {
  fast: 'gemini-2.0-flash-preview-image-generation',
  pro: 'gemini-2.0-flash-exp',
} as const;

// ─── Core: Generate Image ─────────────────────────────────────────────────────

export async function generateImage(
  req: NanoBananaImageRequest
): Promise<NanoBananaImageResult> {
  const start = Date.now();
  const client = getClient();
  const modelName = req.quality === 'pro' ? MODELS.pro : MODELS.fast;

  const model = client.getGenerativeModel({
    model: modelName,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      responseModalities: ['image', 'text'],
    },
  });

  // Build prompt parts
  const parts: Part[] = [];

  // Style prefix
  const styleHint = req.style
    ? `Style: ${req.style}. `
    : '';

  // If editing an existing image, include it
  if (req.referenceImage) {
    parts.push({
      inlineData: {
        data: req.referenceImage,
        mimeType: req.referenceMimeType || 'image/png',
      },
    });
    parts.push({ text: `${styleHint}${req.prompt}` });
  } else {
    parts.push({
      text: `${styleHint}Generate a high-quality image: ${req.prompt}`,
    });
  }

  const images: Array<{ base64: string; mimeType: string }> = [];
  const count = Math.min(req.count || 1, 4);

  for (let i = 0; i < count; i++) {
    const result: GenerateContentResult = await model.generateContent(parts);
    const response = result.response;

    // Extract image parts from response
    for (const candidate of (response.candidates || []) as any[]) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          images.push({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
          });
        }
      }
    }
  }

  return {
    images,
    prompt: req.prompt,
    model: modelName,
    generationTimeMs: Date.now() - start,
  };
}

// ─── Generate Presentation with Nano Banana visuals ───────────────────────────

export async function generatePresentation(
  req: NanoBananaPresentationRequest
): Promise<NanoBananaPresentationResult> {
  const client = getClient();
  const slideCount = req.slideCount || 5;
  const audience = req.audience || 'scientific';

  // Step 1: Use Gemini to generate slide content as markdown
  const textModel = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    safetySettings: SAFETY_SETTINGS,
  });

  const contentPrompt = `You are a presentation expert for the life sciences / pharma / regulatory industry.
Create a ${slideCount}-slide presentation about: "${req.topic}"
Target audience: ${audience}

Format each slide using this markdown convention:
- Use # for the title slide
- Use ## for section divider slides
- Use ### for content slide titles
- Use - for bullet points
- Use > for subtitles
- Separate slides with ---

Keep text concise and presentation-ready. Use industry-appropriate terminology.
Include data points, percentages, and specific metrics where relevant.`;

  const contentResult = await textModel.generateContent(contentPrompt);
  const markdownContent = contentResult.response.text();

  // Step 2: Generate a cover image if requested
  let coverImage: { base64: string; mimeType: string } | undefined;
  if (req.generateImages) {
    try {
      const imageResult = await generateImage({
        prompt: `Professional presentation cover slide for "${req.topic}" in ${audience} context. Clean, modern design with abstract scientific/medical imagery. No text overlay needed.`,
        quality: 'fast',
        style: 'infographic',
      });
      if (imageResult.images.length > 0) {
        coverImage = imageResult.images[0];
      }
    } catch (err) {
      console.warn('[nano-banana] Cover image generation failed, proceeding without:', err);
    }
  }

  // Step 3: Build PPTX using existing generator
  const pptxBuffer = await generatePptxBuffer(req.topic, markdownContent);

  // Sanitize filename
  const safeName = req.topic
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  return {
    pptxBuffer,
    filename: `${safeName}.pptx`,
    slideCount,
    coverImage,
  };
}

// ─── Chat-style image generation (conversational) ─────────────────────────────

export async function chatWithNanoBanana(
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<{
  text: string;
  images: Array<{ base64: string; mimeType: string }>;
  pptxBuffer?: Buffer;
  pptxFilename?: string;
}> {
  const client = getClient();

  // Detect intent
  const lowerMsg = message.toLowerCase();
  const wantsImage =
    lowerMsg.includes('image') ||
    lowerMsg.includes('generate') ||
    lowerMsg.includes('picture') ||
    lowerMsg.includes('visual') ||
    lowerMsg.includes('illustration') ||
    lowerMsg.includes('infographic') ||
    lowerMsg.includes('diagram') ||
    lowerMsg.includes('draw') ||
    lowerMsg.includes('create a') ||
    lowerMsg.includes('design');

  const wantsPresentation =
    lowerMsg.includes('presentation') ||
    lowerMsg.includes('pptx') ||
    lowerMsg.includes('powerpoint') ||
    lowerMsg.includes('slide') ||
    lowerMsg.includes('deck');

  const images: Array<{ base64: string; mimeType: string }> = [];
  let pptxBuffer: Buffer | undefined;
  let pptxFilename: string | undefined;
  let text = '';

  if (wantsPresentation) {
    // Generate a full presentation
    const result = await generatePresentation({
      topic: message.replace(/^(create|make|generate|build)\s+(a\s+)?(presentation|deck|pptx|slides?)\s*(about|on|for)?\s*/i, ''),
      slideCount: 6,
      audience: 'scientific',
      generateImages: true,
    });
    pptxBuffer = result.pptxBuffer;
    pptxFilename = result.filename;
    if (result.coverImage) images.push(result.coverImage);
    text = `I've created a ${result.slideCount}-slide presentation: **${result.filename}**. The download should start automatically. ${result.coverImage ? 'I also generated a cover image preview.' : ''}`;
  } else if (wantsImage) {
    // Generate an image
    const result = await generateImage({
      prompt: message,
      quality: 'fast',
      style: 'infographic',
    });
    images.push(...result.images);
    text = `Here's the image I generated (${result.model}, ${result.generationTimeMs}ms). Let me know if you'd like me to adjust anything.`;
  } else {
    // Text-only response using Gemini
    const textModel = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      safetySettings: SAFETY_SETTINGS,
    });

    const history = conversationHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const chat = textModel.startChat({ history });
    const result = await chat.sendMessage(message);
    text = result.response.text();
  }

  return { text, images, pptxBuffer, pptxFilename };
}

// ─── Health check ─────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!process.env.GOOGLE_GEMINI_API_KEY;
}
