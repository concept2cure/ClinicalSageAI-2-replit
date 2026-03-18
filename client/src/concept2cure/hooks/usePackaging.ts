/**
 * Universal Packaging Hook
 *
 * Provides a single interface for generating documents in any format
 * (PDF, DOCX, XLSX, CSV, HTML, ZIP) from anywhere in the application.
 *
 * Usage:
 *   const { downloadAs, generateMultiple, isPackaging } = usePackaging();
 *   await downloadAs('pdf', 'My Report', reportContent, { watermarkText: 'DRAFT' });
 *   await generateMultiple(['pdf', 'docx'], 'My Report', content);
 *
 * @module concept2cure/hooks/usePackaging
 */

import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PackageFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'html' | 'zip' | 'ectd-zip';

export interface PackageMetadata {
  version?: string;
  author?: string;
  organization?: string;
  projectName?: string;
  submissionType?: string;
  status?: string;
  classification?: string;
  date?: string;
  footerText?: string;
  pageNumbers?: boolean;
  watermarkText?: string;
}

export interface PackageStyle {
  pageSize?: 'letter' | 'a4';
  fontSize?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  lineSpacing?: number;
  includeTableOfContents?: boolean;
  includeCoverPage?: boolean;
}

export interface PackageSection {
  id: string;
  title: string;
  content: string;
  sectionCode?: string;
  order: number;
}

export interface PackageOptions {
  metadata?: PackageMetadata;
  style?: PackageStyle;
  sections?: PackageSection[];
  contentType?: 'markdown' | 'html' | 'json' | 'plaintext';
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePackaging() {
  const [isPackaging, setIsPackaging] = useState(false);
  const [packagingProgress, setPackagingProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  /**
   * Download a document in a single format.
   * Triggers a browser file download.
   */
  const downloadAs = useCallback(
    async (
      format: PackageFormat,
      title: string,
      content: string,
      options?: PackageOptions
    ): Promise<boolean> => {
      setIsPackaging(true);
      setPackagingProgress(20);
      setLastError(null);

      try {
        const response = await apiRequest('POST', `/api/packager/download/${format}`, {
          title,
          content,
          contentType: options?.contentType || 'markdown',
          metadata: options?.metadata,
          style: options?.style,
          sections: options?.sections,
        });

        setPackagingProgress(70);

        const blob = await response.blob();
        const fileName = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
          || `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'ectd-zip' ? 'zip' : format}`;

        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setPackagingProgress(100);
        return true;
      } catch (err: any) {
        setLastError(err.message);
        console.error(`[usePackaging] Download ${format} failed:`, err);
        return false;
      } finally {
        setIsPackaging(false);
        setTimeout(() => setPackagingProgress(0), 1000);
      }
    },
    []
  );

  /**
   * Generate multiple formats and download as a ZIP bundle.
   */
  const generateMultiple = useCallback(
    async (
      formats: PackageFormat[],
      title: string,
      content: string,
      options?: PackageOptions
    ): Promise<boolean> => {
      setIsPackaging(true);
      setPackagingProgress(10);
      setLastError(null);

      try {
        const response = await apiRequest('POST', '/api/packager/multi-download', {
          formats,
          title,
          content,
          contentType: options?.contentType || 'markdown',
          metadata: options?.metadata,
          style: options?.style,
          sections: options?.sections,
        });

        setPackagingProgress(70);

        const blob = await response.blob();
        const fileName = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
          || `${title.replace(/[^a-zA-Z0-9]/g, '_')}_package.zip`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setPackagingProgress(100);
        return true;
      } catch (err: any) {
        setLastError(err.message);
        console.error('[usePackaging] Multi-download failed:', err);
        return false;
      } finally {
        setIsPackaging(false);
        setTimeout(() => setPackagingProgress(0), 1000);
      }
    },
    []
  );

  /**
   * Generate outputs and get base64 data (no file download).
   * Useful for previewing or attaching to other operations.
   */
  const generateBuffers = useCallback(
    async (
      formats: PackageFormat[],
      title: string,
      content: string,
      options?: PackageOptions
    ): Promise<Array<{ format: PackageFormat; data: string; fileName: string; checksum: string }>> => {
      setIsPackaging(true);
      setLastError(null);

      try {
        const response = await apiRequest('POST', '/api/packager/generate', {
          formats,
          title,
          content,
          contentType: options?.contentType || 'markdown',
          metadata: options?.metadata,
          style: options?.style,
          sections: options?.sections,
        });

        const result = await response.json();
        return result.outputs || [];
      } catch (err: any) {
        setLastError(err.message);
        console.error('[usePackaging] Generate buffers failed:', err);
        return [];
      } finally {
        setIsPackaging(false);
      }
    },
    []
  );

  return {
    /** Download a single format as a file */
    downloadAs,
    /** Download multiple formats bundled in a ZIP */
    generateMultiple,
    /** Generate base64 buffers without downloading */
    generateBuffers,
    /** Whether a packaging operation is in progress */
    isPackaging,
    /** Progress 0-100 */
    packagingProgress,
    /** Last error message */
    lastError,
  };
}
