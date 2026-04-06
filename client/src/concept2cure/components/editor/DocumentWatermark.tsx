/**
 * DocumentWatermark — CSS-only watermark overlay for regulatory documents
 *
 * Renders status-based watermarks (DRAFT, UNDER REVIEW, CONFIDENTIAL, CONTROLLED COPY)
 * on the document editor surface. Critical for document control in FDA/EMA submissions.
 *
 * Features:
 * - Non-selectable, non-interactive overlay (pointer-events: none)
 * - Semi-transparent diagonal tiling via pure CSS
 * - Hidden from print output via @media print
 * - Configurable per document status with custom text override
 */

import React, { useMemo, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WatermarkStatus = 'draft' | 'review' | 'confidential' | 'approved' | 'locked' | 'published';

interface WatermarkConfig {
  text: string;
  color: string;
  opacity: number;
  fontSize: string;
  mode: 'diagonal' | 'top-banner';
}

export interface DocumentWatermarkProps {
  status: string;
  customText?: string;
  enabled?: boolean;
  className?: string;
}

export interface WatermarkSettingsProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  customText: string;
  onCustomTextChange: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Status → watermark configuration map
// ---------------------------------------------------------------------------

const WATERMARK_CONFIGS: Record<WatermarkStatus, WatermarkConfig | null> = {
  draft: {
    text: 'DRAFT',
    color: '#6b7280', // stone-500
    opacity: 0.08,
    fontSize: '6rem',
    mode: 'diagonal',
  },
  review: {
    text: 'UNDER REVIEW',
    color: '#d97706', // stone-600
    opacity: 0.08,
    fontSize: '5rem',
    mode: 'diagonal',
  },
  confidential: {
    text: 'CONFIDENTIAL',
    color: '#dc2626', // stone-700
    opacity: 0.12,
    fontSize: '5rem',
    mode: 'diagonal',
  },
  approved: null, // clean document, no watermark
  locked: {
    text: 'CONTROLLED COPY',
    color: '#16a34a', // stone-700
    opacity: 0.35,
    fontSize: '0.875rem',
    mode: 'top-banner',
  },
  published: {
    text: 'CONTROLLED COPY',
    color: '#16a34a',
    opacity: 0.35,
    fontSize: '0.875rem',
    mode: 'top-banner',
  },
};

// ---------------------------------------------------------------------------
// Helper: resolve watermark config for a given status
// ---------------------------------------------------------------------------

export function getWatermarkForStatus(
  status: string,
  customText?: string,
): WatermarkConfig | null {
  const normalised = status.toLowerCase().trim() as WatermarkStatus;
  const config = WATERMARK_CONFIGS[normalised] ?? null;

  if (!config) return null;

  if (customText && customText.trim().length > 0) {
    return { ...config, text: customText.trim() };
  }

  return config;
}

// ---------------------------------------------------------------------------
// Inline style objects (kept outside render for perf)
// ---------------------------------------------------------------------------

const printHideStyle: React.CSSProperties = {
  // We inject a <style> tag for the @media print rule; the inline style
  // is augmented at render time with a data attribute we can target.
};

// ---------------------------------------------------------------------------
// DiagonalWatermark — tiled diagonal text via CSS background SVG
// ---------------------------------------------------------------------------

function DiagonalWatermark({
  config,
  className,
}: {
  config: WatermarkConfig;
  className?: string;
}) {
  /**
   * Build an SVG data-URI that contains the watermark text rotated -35deg.
   * We tile this as a CSS background-image so it repeats seamlessly across
   * the full editor area without any canvas or image assets.
   */
  const backgroundImage = useMemo(() => {
    const svgText = encodeURIComponent(config.text);
    const fontSize = parseInt(config.fontSize) || 96;
    // Tile dimensions — generous to allow space between repeated labels
    const tileW = Math.max(600, config.text.length * fontSize * 0.55);
    const tileH = 400;

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">`,
      `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"`,
      ` font-family="sans-serif" font-weight="700"`,
      ` font-size="${fontSize}" fill="${config.color}"`,
      ` transform="rotate(-35 ${tileW / 2} ${tileH / 2})"`,
      `>${svgText}</text>`,
      `</svg>`,
    ].join('');

    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [config.text, config.color, config.fontSize]);

  return (
    <div
      data-watermark
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: config.opacity,
        backgroundImage,
        backgroundRepeat: 'repeat',
        backgroundSize: 'auto',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// TopBannerWatermark — small text pinned to top of document
// ---------------------------------------------------------------------------

function TopBannerWatermark({
  config,
  className,
}: {
  config: WatermarkConfig;
  className?: string;
}) {
  return (
    <div
      data-watermark
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        pointerEvents: 'none',
        userSelect: 'none',
        textAlign: 'center',
        padding: '4px 0',
        fontSize: config.fontSize,
        fontWeight: 600,
        letterSpacing: '0.15em',
        color: config.color,
        opacity: config.opacity,
        borderBottom: `1px solid ${config.color}33`,
      }}
    >
      {config.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print-hide style injection (renders once)
// ---------------------------------------------------------------------------

const PRINT_STYLE = `@media print { [data-watermark] { display: none !important; } }`;

function PrintHideStyle() {
  return <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />;
}

// ---------------------------------------------------------------------------
// DocumentWatermark — main exported component
// ---------------------------------------------------------------------------

export function DocumentWatermark({
  status,
  customText,
  enabled = true,
  className,
}: DocumentWatermarkProps) {
  const config = useMemo(
    () => getWatermarkForStatus(status, customText),
    [status, customText],
  );

  // Nothing to render if disabled, approved, or unknown status
  if (!enabled || !config) return null;

  return (
    <>
      <PrintHideStyle />
      {config.mode === 'diagonal' ? (
        <DiagonalWatermark config={config} className={className} />
      ) : (
        <TopBannerWatermark config={config} className={className} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// WatermarkSettings — toggle + custom text sub-component
// ---------------------------------------------------------------------------

export function WatermarkSettings({
  enabled,
  onToggle,
  customText,
  onCustomTextChange,
}: WatermarkSettingsProps) {
  const handleToggle = useCallback(() => {
    onToggle(!enabled);
  }, [enabled, onToggle]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCustomTextChange(e.target.value);
    },
    [onCustomTextChange],
  );

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between">
        <label
          htmlFor="watermark-toggle"
          className="text-sm font-medium text-stone-700"
        >
          Document Watermark
        </label>
        <button
          id="watermark-toggle"
          role="switch"
          type="button"
          aria-checked={enabled}
          onClick={handleToggle}
          className={[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 outline-none focus:ring-offset-2',
            enabled ? 'bg-stone-800' : 'bg-stone-300',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-150',
              enabled ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="watermark-custom-text"
            className="text-xs text-stone-500"
          >
            Custom watermark text (leave blank to use status default)
          </label>
          <input
            id="watermark-custom-text"
            type="text"
            value={customText}
            onChange={handleTextChange}
            placeholder="e.g. INTERNAL USE ONLY"
            maxLength={60}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus-visible:ring-2 outline-none focus:ring-stone-400"
          />
        </div>
      )}
    </div>
  );
}
