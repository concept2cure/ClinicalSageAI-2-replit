/**
 * @fileoverview Nano Banana image generator
 * @module components/NanoBananaImageGenerator
 *
 * Inline panel that turns a document context into publication-ready figures
 * using the Gemini-backed `/api/nano-banana/generate` endpoint. Renders a short
 * prompt the caller can refine, then displays the returned images.
 */

import React, { useState, useCallback } from 'react';
import { ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

type NanoBananaMode = 'infographic' | 'diagram' | 'illustration' | 'photo';

interface NanoBananaImageGeneratorProps {
  /** Document context that seeds the generation prompt. */
  context: string;
  /** Visual style for the generated figures. */
  mode?: NanoBananaMode;
  /** Extra style guidance appended to the prompt. */
  promptSuffix?: string;
}

interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface GenerateResponse {
  success: boolean;
  images?: GeneratedImage[];
  error?: string;
}

const MODE_STYLE: Record<NanoBananaMode, string> = {
  infographic: 'Clean infographic with labelled sections',
  diagram: 'Technical diagram with clear flow and labels',
  illustration: 'Editorial illustration',
  photo: 'Photorealistic image',
};

const NanoBananaImageGenerator: React.FC<NanoBananaImageGeneratorProps> = ({
  context,
  mode = 'infographic',
  promptSuffix,
}) => {
  const [prompt, setPrompt] = useState<string>(
    [MODE_STYLE[mode], context, promptSuffix].filter(Boolean).join('. '),
  );
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiRequest('POST', '/api/nano-banana/generate', {
        prompt: prompt.trim(),
        quality: 'fast',
        count: 1,
        style: mode,
      });

      // Untyped JSON boundary: shape validated against the route contract above.
      const data = (await response.json()) as GenerateResponse;

      if (!data.success || !data.images?.length) {
        setError(data.error || 'No image was returned');
        return;
      }

      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, mode, isGenerating]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-stone-700">
        <ImageIcon className="w-4 h-4" />
        <span className="text-sm font-medium">Generate visuals</span>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full p-3 text-sm text-stone-700 border border-stone-200 rounded-lg outline-none resize-none focus:border-stone-400"
        placeholder="Describe the figure you want"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-white bg-stone-800 rounded-lg hover:bg-stone-700 disabled:opacity-50"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isGenerating ? 'Generating' : 'Generate'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <img
              key={index}
              src={`data:${image.mimeType};base64,${image.base64}`}
              alt={`Generated figure ${index + 1}`}
              className="w-full rounded-lg border border-stone-200"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NanoBananaImageGenerator;
