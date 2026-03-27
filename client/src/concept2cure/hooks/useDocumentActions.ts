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
import { apiRequest } from '@/lib/queryClient';

interface SaveArtifactParams {
  projectId: string;
  title: string;
  content: string;
  type?: string;
  category?: 'document' | 'interactive' | 'visualization';
  conversationId?: string;
  metadata?: Record<string, unknown>;
  ctdSection?: string;
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

  /** Save artifact and also register in vault for governed storage */
  saveAndRegisterInVault: (params: SaveArtifactParams) => Promise<unknown>;

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
      const response = await apiRequest(
        'POST',
        `/api/concept2cure/projects/${params.projectId}/artifacts`,
        {
          title: params.title,
          content: params.content,
          type: params.type || 'markdown',
          category: params.category || 'document',
          conversationId: params.conversationId,
          metadata: params.metadata,
          ctdSection: params.ctdSection,
        }
      );

      const payload = await response.json();
      return payload?.data ?? payload;
    },
  });

  // ─── Create Document via document-authoring pipeline ────────────────────────

  const createDocumentMutation = useMutation({
    mutationFn: async (params: CreateDocumentParams) => {
      const response = await apiRequest('POST', '/api/document-authoring/documents', {
        title: params.title,
        content: params.content,
        documentType: params.documentType || 'regulatory',
      });

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
      const response = await apiRequest('POST', '/api/concept2cure/artifacts/export-docx', {
        title,
        content,
      });

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
      const response = await apiRequest('POST', '/api/concept2cure/artifacts/export-pdf', {
        title,
        content,
      });

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

  // ─── Save and Register in Vault ────────────────────────────────────────────

  /** Save artifact and also register in vault for governed document management */
  const saveAndRegisterInVault = useCallback(
    async (params: SaveArtifactParams) => {
      // First save as concept2cure artifact
      const artifact = await saveArtifactMutation.mutateAsync(params);

      // Then register in vault for governed document management
      try {
        await apiRequest('POST', '/api/concept2cure/vault/register-artifact', {
          artifactId:
            (artifact as { id?: string; artifactId?: string })?.id ||
            (artifact as { id?: string; artifactId?: string })?.artifactId,
          projectId: params.projectId,
          title: params.title,
          ctdSection: params.ctdSection,
          documentType: params.category || 'document',
        });
      } catch (err) {
        // Vault registration is best-effort; artifact was already saved successfully
      }

      return artifact;
    },
    [saveArtifactMutation]
  );

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

    saveAndRegisterInVault,

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
