/**
 * Concept2Cure - Project Knowledge Hook
 *
 * Manages document uploads, context size calculation, and custom instructions.
 * Claude.ai parity: Project Knowledge panel functionality.
 *
 * @module concept2cure/hooks/useProjectKnowledge
 * @version 1.0.0
 */

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ProjectKnowledge, UploadedDocument } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface UseProjectKnowledgeReturn {
  /** Current knowledge state */
  knowledge: ProjectKnowledge | null;
  /** Whether knowledge is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Upload a document to the project */
  uploadDocument: (file: File) => Promise<UploadedDocument | null>;
  /** Add raw text content as a knowledge item (Claude.ai parity) */
  addTextContent: (title: string, content: string) => Promise<UploadedDocument | null>;
  /** Remove a document from the project */
  removeDocument: (documentId: string) => Promise<void>;
  /** Toggle a document's active state in/out of the AI context window */
  toggleDocumentActive: (documentId: string) => Promise<void>;
  /** Update custom instructions */
  updateCustomInstructions: (instructions: string) => Promise<void>;
  /** Current context token count */
  contextTokens: number;
  /** Maximum context tokens (200K for Claude.ai parity) */
  maxContextTokens: number;
  /** Context usage percentage */
  contextUsagePercent: number;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Upload progress (0-100) */
  uploadProgress: number;
}

interface DocumentProcessingResult {
  document: UploadedDocument;
  extractedText: string;
  tokenCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CONTEXT_TOKENS = 200000; // Claude.ai 200K context window
const TOKENS_PER_CHAR_ESTIMATE = 0.25; // Rough estimate for token calculation
const MAX_FILE_SIZE_MB = 50;
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Build auth headers for FormData uploads (apiRequest cannot handle FormData). */
function getUploadAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  const orgId =
    localStorage.getItem('trialsage_org_id') ||
    sessionStorage.getItem('trialsage_org_id') ||
    'default';
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-organization-id': orgId,
  };
}
/**
 * Estimate token count from text length.
 * More accurate estimation would use tiktoken or similar.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE);
}

/**
 * Get file extension from MIME type.
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/csv': 'csv',
  };
  return mimeMap[mimeType] || 'unknown';
}

/**
 * Format file size for display.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useProjectKnowledge(projectId: string | null): UseProjectKnowledgeReturn {
  const queryClient = useQueryClient();
  const [knowledge, setKnowledge] = useState<ProjectKnowledge | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Calculate context metrics (only count active documents toward context usage)
  const contextTokens =
    knowledge?.documents
      .filter(doc => doc.isActive !== false)
      .reduce((sum, doc) => sum + (doc.tokenCount || 0), 0) || 0;
  const maxContextTokens = MAX_CONTEXT_TOKENS;
  const contextUsagePercent = Math.round((contextTokens / maxContextTokens) * 100);

  // Load knowledge when project changes
  useEffect(() => {
    if (!projectId) {
      setKnowledge(null);
      return;
    }

    const loadKnowledge = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try API first (apiRequest throws on non-OK responses)
        const response = await apiRequest(
          'GET',
          `/api/concept2cure/projects/${projectId}/knowledge`
        );

        const payload = await response.json().catch(() => ({}));
        if (payload?.success === false) {
          throw new Error(
            payload?.error?.message || payload?.error || 'Failed to load project knowledge'
          );
        }
        const data = payload?.data ?? payload;
        setKnowledge(data);
      } catch (err) {
        // Fallback to localStorage
        const stored = localStorage.getItem(`concept2cure_knowledge_${projectId}`);
        if (stored) {
          try {
            setKnowledge(JSON.parse(stored));
          } catch {
            setKnowledge({
              documents: [],
              customInstructions: '',
              context: '',
            });
          }
        } else {
          setKnowledge({
            documents: [],
            customInstructions: '',
            context: '',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadKnowledge();
  }, [projectId]);

  // Save knowledge to localStorage as backup
  useEffect(() => {
    if (projectId && knowledge) {
      localStorage.setItem(`concept2cure_knowledge_${projectId}`, JSON.stringify(knowledge));
    }
  }, [projectId, knowledge]);

  /**
   * Upload a document to the project knowledge.
   */
  const uploadDocument = useCallback(
    async (file: File): Promise<UploadedDocument | null> => {
      if (!projectId) {
        setError('No project selected');
        return null;
      }

      // Validate file type
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        setError(`Unsupported file type: ${file.type}. Allowed: PDF, DOCX, TXT, MD, XLSX, CSV`);
        return null;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`);
        return null;
      }

      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // Create FormData for upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);

        // Simulate progress (real implementation would use XMLHttpRequest)
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 10, 90));
        }, 200);

        let processedDocument: UploadedDocument;

        try {
          // Try API upload (FormData — cannot use apiRequest which JSON-stringifies body)
          const response = await fetch('/api/concept2cure/documents/upload', {
            method: 'POST',
            headers: getUploadAuthHeaders(),
            credentials: 'include',
            body: formData,
          });

          clearInterval(progressInterval);

          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            const result: DocumentProcessingResult = payload?.data ?? payload;
            processedDocument = result.document;
          } else {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error?.message || payload?.error || 'API upload failed');
          }
        } catch {
          // Fallback: Create document locally with basic processing
          clearInterval(progressInterval);

          // Read file as text if possible
          let extractedText = '';
          let pageCount: number | undefined;

          if (
            file.type === 'text/plain' ||
            file.type === 'text/markdown' ||
            file.type === 'text/csv'
          ) {
            extractedText = await file.text();
          } else if (file.type === 'application/pdf') {
            // For PDFs, we'd need a parser. Estimate based on size.
            extractedText = `[PDF content - ${formatFileSize(file.size)}]`;
            pageCount = Math.ceil(file.size / 3000); // Rough estimate
          } else {
            extractedText = `[Document content - ${formatFileSize(file.size)}]`;
          }

          const tokenCount = estimateTokens(extractedText);

          // Check if adding this would exceed context limit
          if (contextTokens + tokenCount > maxContextTokens) {
            setError(
              `Adding this document would exceed the ${maxContextTokens.toLocaleString()} token limit`
            );
            setIsUploading(false);
            return null;
          }

          processedDocument = {
            id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type: getExtensionFromMime(file.type),
            size: file.size,
            uploadedAt: new Date().toISOString(),
            tokenCount,
            pageCount,
            status: 'processed',
          };
        }

        setUploadProgress(100);

        // Add to knowledge
        setKnowledge(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: [...prev.documents, processedDocument],
          };
        });

        // Refresh workspace counts + project artifacts panel
        queryClient.invalidateQueries({ queryKey: ['workspace-summary'] });
        queryClient.invalidateQueries({ queryKey: ['project-artifacts'] });

        return processedDocument;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        return null;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [projectId, contextTokens, maxContextTokens]
  );

  /**
   * Remove a document from the project knowledge.
   */
  const removeDocument = useCallback(
    async (documentId: string): Promise<void> => {
      if (!projectId) return;

      try {
        // Try API first
        await apiRequest('DELETE', `/api/concept2cure/documents/${documentId}`).catch(() => {
          // Ignore API errors, proceed with local removal
        });

        // Remove locally
        setKnowledge(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: prev.documents.filter(doc => doc.id !== documentId),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove document');
      }
    },
    [projectId]
  );

  /**
   * Toggle a document's active state in/out of the AI context window (E7).
   */
  const toggleDocumentActive = useCallback(
    async (documentId: string): Promise<void> => {
      if (!projectId) return;

      // Find current state
      const doc = knowledge?.documents.find(d => d.id === documentId);
      if (!doc) return;

      const newIsActive = doc.isActive === false ? true : false;

      try {
        // Persist via API (non-blocking on failure — update locally regardless)
        await apiRequest('PATCH', `/api/concept2cure/documents/${documentId}/activation`, {
          isActive: newIsActive,
        }).catch(() => {
          // Ignore API errors, proceed with local update
        });

        // Update local state
        setKnowledge(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: prev.documents.map(d =>
              d.id === documentId ? { ...d, isActive: newIsActive } : d
            ),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle document activation');
      }
    },
    [projectId, knowledge]
  );

  /**
   * Update custom instructions for the project.
   */
  const updateCustomInstructions = useCallback(
    async (instructions: string): Promise<void> => {
      if (!projectId) return;

      try {
        // Try API first
        await apiRequest('PATCH', `/api/concept2cure/projects/${projectId}/knowledge`, {
          customInstructions: instructions,
        }).catch(() => {
          // Ignore API errors, proceed with local update
        });

        // Update locally
        setKnowledge(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            customInstructions: instructions,
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update instructions');
      }
    },
    [projectId]
  );

  /**
   * Add raw text content as a knowledge item (Claude.ai "Add content" parity).
   */
  const addTextContent = useCallback(
    async (title: string, content: string): Promise<UploadedDocument | null> => {
      if (!projectId) {
        setError('No project selected');
        return null;
      }
      if (!content.trim()) {
        setError('Content cannot be empty');
        return null;
      }

      const tokenCount = estimateTokens(content);
      if (contextTokens + tokenCount > maxContextTokens) {
        setError(
          `Adding this content would exceed the ${maxContextTokens.toLocaleString()} token limit`
        );
        return null;
      }

      setError(null);

      try {
        // Try API — create as a text document
        await apiRequest('POST', '/api/concept2cure/documents/upload', {
          projectId,
          title,
          content,
          type: 'text',
        }).catch(() => {}); // Non-blocking

        const doc: UploadedDocument = {
          id: `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: title || 'Text content',
          type: 'txt',
          size: new Blob([content]).size,
          uploadedAt: new Date().toISOString(),
          tokenCount,
          status: 'processed',
        };

        setKnowledge(prev => {
          if (!prev) return prev;
          return { ...prev, documents: [...prev.documents, doc] };
        });

        queryClient.invalidateQueries({ queryKey: ['workspace-summary'] });
        return doc;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add text content');
        return null;
      }
    },
    [projectId, contextTokens, maxContextTokens, queryClient]
  );

  return {
    knowledge,
    isLoading,
    error,
    uploadDocument,
    addTextContent,
    removeDocument,
    toggleDocumentActive,
    updateCustomInstructions,
    contextTokens,
    maxContextTokens,
    contextUsagePercent,
    isUploading,
    uploadProgress,
  };
}

export default useProjectKnowledge;
