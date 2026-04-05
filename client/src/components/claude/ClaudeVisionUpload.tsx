/**
 * ClaudeVisionUpload — Image analysis using Claude Vision
 *
 * Upload scanned regulatory documents, lab reports, or device images
 * for Claude to analyze and extract structured information.
 */

import React, { useState, useRef } from 'react';
import { useClaudeAI } from '../../hooks/useClaudeAI';
import { toast } from '@/hooks/use-toast';
import {
  Upload,
  Image as ImageIcon,
  FileText,
  Loader2,
  X,
  Eye,
  Copy,
  Check,
} from 'lucide-react';

interface ClaudeVisionUploadProps {
  /** Default analysis instructions */
  defaultInstructions?: string;
  /** Default regulatory framework */
  defaultFramework?: string;
  /** Callback when analysis completes */
  onAnalysisComplete?: (content: string, metadata: any) => void;
  /** Custom className */
  className?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function ClaudeVisionUpload({
  defaultInstructions = 'Analyze this document and extract all relevant regulatory information, tables, and key data points.',
  defaultFramework,
  onAnalysisComplete,
  className = '',
}: ClaudeVisionUploadProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string>('image/png');
  const [instructions, setInstructions] = useState(defaultInstructions);
  const [framework, setFramework] = useState(defaultFramework || '');
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const claude = useClaudeAI();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: 'Invalid File Type', description: 'Please upload a JPEG, PNG, GIF, or WebP image.', variant: 'destructive' });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: 'File Too Large', description: 'File size must be under 20MB.', variant: 'destructive' });
      return;
    }

    setMediaType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      // Extract base64 data without the data URL prefix
      const base64 = dataUrl.split(',')[1];
      setImageData(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleFileSelect({ target: input } as any);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!imageData || !instructions) return;

    try {
      const analysisResult = await claude.analyzeImage(
        imageData,
        mediaType,
        instructions,
        framework || undefined
      );
      setResult(analysisResult.content);
      onAnalysisComplete?.(analysisResult.content, analysisResult);
    } catch (err) {
      // Error is handled by claude.error
    }
  };

  const handleCopy = async () => {
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageData(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Upload area */}
      {!imagePreview ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-300 rounded-xl p-8 text-center cursor-pointer hover:border-stone-400 hover:bg-stone-100/50 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto text-stone-400 mb-3" />
          <p className="text-sm font-medium text-stone-600">
            Drop an image here or click to upload
          </p>
          <p className="text-xs text-stone-400 mt-1">
            JPEG, PNG, GIF, WebP up to 20MB
          </p>
          <p className="text-xs text-stone-400">
            Scanned documents, lab reports, device images, regulatory forms
          </p>
        </div>
      ) : (
        <div className="relative border rounded-xl overflow-hidden">
          <button
            onClick={clearImage}
            className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 z-10"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={imagePreview}
            alt="Upload preview"
            className="w-full max-h-64 object-contain bg-stone-100"
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Instructions & controls */}
      {imagePreview && (
        <>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-stone-500 block mb-1">
                Analysis Instructions
              </label>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="What should Claude analyze in this image?"
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">
                Framework
              </label>
              <select
                value={framework}
                onChange={e => setFramework(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="">Auto-detect</option>
                <option value="fda_510k">FDA 510(k)</option>
                <option value="fda_pma">FDA PMA</option>
                <option value="eu_mdr">EU MDR</option>
                <option value="ich_clinical">ICH Clinical</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={claude.isLoading || !instructions}
            className="px-4 py-2 bg-stone-600 text-white rounded-lg hover:bg-stone-700 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
          >
            {claude.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> Analyze with Claude Vision
              </>
            )}
          </button>
        </>
      )}

      {/* Error */}
      {claude.error && (
        <div className="px-4 py-3 bg-stone-100 border border-stone-200 rounded-lg text-stone-800 text-sm">
          {claude.error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="border rounded-lg bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-stone-50">
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <FileText className="w-4 h-4" />
              Analysis Result
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="p-4 text-sm whitespace-pre-wrap max-h-[500px] overflow-y-auto prose prose-sm max-w-none">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}

export default ClaudeVisionUpload;
