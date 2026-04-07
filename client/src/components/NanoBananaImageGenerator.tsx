/**
 * NanoBananaImageGenerator — Reusable AI image generation component
 *
 * Drop this into any page to give users on-demand image/infographic generation.
 * Supports: image gen, image editing, and presentation export.
 *
 * Usage:
 *   <NanoBananaImageGenerator context="CER safety analysis" />
 *   <NanoBananaImageGenerator context="CMC process flow" mode="infographic" />
 *   <NanoBananaImageGenerator context="IND submission timeline" mode="presentation" />
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Image as ImageIcon,
  Loader2,
  Download,
  Wand2,
  FileDown,
  RefreshCw,
  Maximize2,
  X,
  Presentation,
} from 'lucide-react';

interface NanoBananaImageGeneratorProps {
  /** Context hint to pre-fill the prompt (e.g. "CMC manufacturing process") */
  context?: string;
  /** Default generation mode */
  mode?: 'image' | 'infographic' | 'presentation';
  /** If true, auto-generate on mount */
  autoGenerate?: boolean;
  /** Custom prompt suffix appended to user prompt */
  promptSuffix?: string;
  /** Callback when image is generated (for inserting into documents) */
  onImageGenerated?: (image: { base64: string; mimeType: string }) => void;
  /** Callback when PPTX is generated */
  onPptxGenerated?: (pptx: { base64: string; filename: string }) => void;
  /** Compact mode for inline use */
  compact?: boolean;
  /** CSS class override */
  className?: string;
}

type GenerationStyle = 'photorealistic' | 'illustration' | 'infographic' | 'slide';

const STYLE_OPTIONS: { value: GenerationStyle; label: string; desc: string }[] = [
  { value: 'infographic', label: 'Infographic', desc: 'Data visualization, charts, diagrams' },
  { value: 'illustration', label: 'Illustration', desc: 'Scientific illustrations, diagrams' },
  { value: 'photorealistic', label: 'Photorealistic', desc: 'Lab photos, clinical imagery' },
  { value: 'slide', label: 'Slide Visual', desc: 'Clean visuals for presentations' },
];

const NanoBananaImageGenerator: React.FC<NanoBananaImageGeneratorProps> = ({
  context = '',
  mode: defaultMode = 'image',
  autoGenerate = false,
  promptSuffix = '',
  onImageGenerated,
  onPptxGenerated,
  compact = false,
  className,
}) => {
  const [prompt, setPrompt] = useState(context);
  const [style, setStyle] = useState<GenerationStyle>('infographic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<
    Array<{ base64: string; mimeType: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<number | null>(null);
  const [activeMode, setActiveMode] = useState(defaultMode);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      if (activeMode === 'presentation') {
        const res = await fetch('/api/nano-banana/presentation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: prompt + (promptSuffix ? ` ${promptSuffix}` : ''),
            slideCount: 6,
            audience: 'scientific',
            generateImages: true,
          }),
        });

        if (!res.ok) throw new Error('Presentation generation failed');

        // Response is a binary PPTX
        const blob = await res.blob();
        const filename =
          res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
          'presentation.pptx';

        // Auto-download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        // Callback
        if (onPptxGenerated) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            onPptxGenerated({ base64, filename });
          };
          reader.readAsDataURL(blob);
        }
      } else {
        const res = await fetch('/api/nano-banana/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt + (promptSuffix ? ` ${promptSuffix}` : ''),
            quality: 'fast',
            style,
            count: 1,
          }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Generation failed');

        setGeneratedImages(data.images || []);

        // Callback for first image
        if (onImageGenerated && data.images?.length > 0) {
          onImageGenerated(data.images[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate. Check your GOOGLE_GEMINI_API_KEY.');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, style, activeMode, promptSuffix, onImageGenerated, onPptxGenerated]);

  // Auto-generate on mount if requested
  React.useEffect(() => {
    if (autoGenerate && prompt.trim()) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadImage = (img: { base64: string; mimeType: string }, idx: number) => {
    const ext = img.mimeType.split('/')[1] || 'png';
    const link = document.createElement('a');
    link.href = `data:${img.mimeType};base64,${img.base64}`;
    link.download = `nano-banana-${Date.now()}-${idx}.${ext}`;
    link.click();
  };

  // ── Compact inline variant ──
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-60"
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wand2 className="w-3.5 h-3.5" />
          )}
          Generate Visual
        </button>
        {generatedImages.length > 0 && (
          <img
            src={`data:${generatedImages[0].mimeType};base64,${generatedImages[0].base64}`}
            alt="Generated"
            className="w-10 h-10 rounded border border-stone-200 object-cover cursor-pointer"
            onClick={() => setExpandedImage(0)}
          />
        )}
      </div>
    );
  }

  // ── Full variant ──
  return (
    <div className={cn('rounded-xl border border-stone-200 bg-white overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">AnA Visual</h3>
            <p className="text-[11px] text-stone-500">Powered by Google Gemini</p>
          </div>
        </div>
        {/* Mode tabs */}
        <div className="flex gap-1 bg-white rounded-lg border border-stone-200 p-0.5">
          {(['image', 'infographic', 'presentation'] as const).map(m => (
            <button
              key={m}
              onClick={() => setActiveMode(m)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                activeMode === m
                  ? 'bg-amber-100 text-amber-700'
                  : 'text-stone-500 hover:text-stone-700'
              )}
            >
              {m === 'image' ? 'Image' : m === 'infographic' ? 'Infographic' : 'Deck'}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt input */}
      <div className="p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={
            activeMode === 'presentation'
              ? 'Describe your presentation topic...'
              : 'Describe the image you want to generate...'
          }
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none resize-none bg-stone-50"
        />

        {/* Style selector (for image/infographic only) */}
        {activeMode !== 'presentation' && (
          <div className="flex flex-wrap gap-1.5">
            {STYLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStyle(opt.value)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors',
                  style === opt.value
                    ? 'bg-amber-100 border-amber-300 text-amber-700'
                    : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                )}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeMode === 'presentation' ? 'Building deck...' : 'Generating...'}
            </>
          ) : (
            <>
              {activeMode === 'presentation' ? (
                <Presentation className="w-4 h-4" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {activeMode === 'presentation' ? 'Generate Presentation' : 'Generate Image'}
            </>
          )}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* Generated images gallery */}
      {generatedImages.length > 0 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-3">
            {generatedImages.map((img, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-stone-200">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={`Generated ${idx + 1}`}
                  className="w-full rounded-lg"
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setExpandedImage(idx)}
                    className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
                    title="Expand"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => downloadImage(img, idx)}
                    className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onImageGenerated && (
                    <button
                      onClick={() => onImageGenerated(img)}
                      className="p-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      title="Insert into document"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPrompt(prompt);
                      handleGenerate();
                    }}
                    className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
                    title="Regenerate"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen overlay */}
      {expandedImage !== null && generatedImages[expandedImage] && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8"
          onClick={() => setExpandedImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setExpandedImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={`data:${generatedImages[expandedImage].mimeType};base64,${generatedImages[expandedImage].base64}`}
            alt="Full size"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default NanoBananaImageGenerator;
