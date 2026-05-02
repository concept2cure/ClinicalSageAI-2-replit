/**
 * useDocumentPreview — fetches the live 510(k) document assembly for a
 * project. The user can call refresh() at any time to re-pull; the
 * underlying endpoint reads cerv2_510k_sections at request time.
 *
 * Used by the DocumentPreview surface and the AnA rail's "Open
 * document preview" affordance.
 */

import * as React from 'react';

export interface DocumentPreviewSection {
  id: number;
  sectionNumber: string;
  sectionTitle: string;
  sectionKey: string;
  category: string;
  status: 'todo' | 'drafting' | 'validated' | 'approved' | string;
  completionPercentage: number;
  contentLength: number;
  content: string;
  isRequired: boolean;
  parentSectionId: number | null;
  level: number;
  displayOrder: number;
  updatedAt: string | null;
}

export interface DocumentPreview {
  projectId: number;
  documentTitle: string;
  projectStatus: string;
  assembledAt: string;
  totalSections: number;
  approvedCount: number;
  draftingCount: number;
  todoCount: number;
  completionPercentage: number;
  sections: DocumentPreviewSection[];
  assembledMarkdown: string;
}

export function useDocumentPreview(projectId: number | string | null) {
  const [preview, setPreview] = React.useState<DocumentPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPreview = React.useCallback(async () => {
    if (projectId === null || projectId === undefined || projectId === '') {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/510k/projects/${encodeURIComponent(String(projectId))}/document-preview`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setPreview((await res.json()) as DocumentPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  return { preview, loading, error, refresh: fetchPreview };
}
