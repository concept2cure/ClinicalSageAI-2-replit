/**
 * @fileoverview Document Actions Hook
 * @module concept2cure/hooks/useDocumentActions
 * @version 1.0.0
 *
 * @description
 * Bridges the chat copilot to the governed document pipeline.
 * Provides actions to persist artifacts, export DOCX, and navigate to editor.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Documents created through this hook are persisted
 *   with SHA-256 integrity hashes and audit trail entries.
 */

import { useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';

interface SaveArtifactParams {
  projectId: string;
  title: string;
  content: string;
  type?: string;
  category?: 'document' | 'interactive' | 'visualization';
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

interface CreateDocumentParams {
  title: string;
  content: string;
  documentType?: string;
}

interface DocumentActionsResult {
  /** Save an artifact to the concept2cureArtifacts table via the backend */
  saveArtifact: (params: SaveArtifactParams) => Promise<unknown>;
  isSaving: boolean;
  saveError: Error | null;

  /** Export content as a DOCX download */
  exportDocx: (title: string, content: string) => Promise<void>;
  isExporting: boolean;
  exportError: Error | null;

  /** Export content as a PDF download */
  exportPdf: (title: string, content: string) => Promise<void>;
  isExportingPdf: boolean;
  exportPdfError: Error | null;

  /** Navigate to the co-author editor for a given document */
  openInEditor: (documentId: string) => void;

  /** Create a document via document-authoring pipeline */
  createDocument: (params: CreateDocumentParams) => Promise<unknown>;
  isCreating: boolean;
  createError: Error | null;
}

export function useDocumentActions(): DocumentActionsResult {
  const [, setLocation] = useLocation();

  // ─── Save Artifact to concept2cureArtifacts table ───────────────────────────

  const saveArtifactMutation = useMutation({
    mutationFn: async (params: SaveArtifactParams) => {
      const response = await fetch(
        `/api/concept2cure/projects/${params.projectId}/artifacts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: params.title,
            content: params.content,
            type: params.type || 'markdown',
            category: params.category || 'document',
            conversationId: params.conversationId,
            metadata: params.metadata,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to save artifact');
      }

      const payload = await response.json();
      return payload?.data ?? payload;
    },
  });

  // ─── Create Document via document-authoring pipeline ────────────────────────

  const createDocumentMutation = useMutation({
    mutationFn: async (params: CreateDocumentParams) => {
      const response = await fetch('/api/document-authoring/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          content: params.content,
          documentType: params.documentType || 'regulatory',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to create document');
      }

      const payload = await response.json();
      return payload?.data ?? payload;
    },
  });

  // ─── Export DOCX ────────────────────────────────────────────────────────────

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);

  const exportDocx = useCallback(async (title: string, content: string) => {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch('/api/concept2cure/artifacts/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to export DOCX');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9_.-]/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Export failed');
      setExportError(error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ─── Export PDF ─────────────────────────────────────────────────────────────

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportPdfError, setExportPdfError] = useState<Error | null>(null);

  const exportPdf = useCallback(async (title: string, content: string) => {
    setIsExportingPdf(true);
    setExportPdfError(null);
    try {
      const response = await fetch('/api/concept2cure/artifacts/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to export PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9_.-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('PDF export failed');
      setExportPdfError(error);
      throw error;
    } finally {
      setIsExportingPdf(false);
    }
  }, []);

  // ─── Open in Editor ─────────────────────────────────────────────────────────

  const openInEditor = useCallback(
    (documentId: string) => {
      setLocation(`/editor/${documentId}`);
    },
    [setLocation]
  );

  return {
    saveArtifact: saveArtifactMutation.mutateAsync,
    isSaving: saveArtifactMutation.isPending,
    saveError: saveArtifactMutation.error,

    exportDocx,
    isExporting,
    exportError,

    exportPdf,
    isExportingPdf,
    exportPdfError,

    openInEditor,

    createDocument: createDocumentMutation.mutateAsync,
    isCreating: createDocumentMutation.isPending,
    createError: createDocumentMutation.error,
  };
}
