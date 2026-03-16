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
  /** Remove a document from the project */
  removeDocument: (documentId: string) => Promise<void>;
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

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');

  return token ? { Authorization: `Bearer ${token}` } : {};
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

  // Calculate context metrics
  const contextTokens =
    knowledge?.documents.reduce((sum, doc) => sum + (doc.tokenCount || 0), 0) || 0;
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
        // Try API first
        const response = await fetch(`/api/concept2cure/projects/${projectId}/knowledge`, {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (payload?.success === false) {
            throw new Error(
              payload?.error?.message || payload?.error || 'Failed to load project knowledge'
            );
          }
          const data = payload?.data ?? payload;
          setKnowledge(data);
        } else if (response.status === 404) {
          // Initialize empty knowledge
          setKnowledge({
            documents: [],
            customInstructions: '',
            context: '',
          });
        } else {
          throw new Error('Failed to load project knowledge');
        }
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
          // Try API upload
          const response = await fetch('/api/concept2cure/documents/upload', {
            method: 'POST',
            headers: getAuthHeaders(),
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
        await fetch(`/api/concept2cure/documents/${documentId}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }).catch(() => {
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
   * Update custom instructions for the project.
   */
  const updateCustomInstructions = useCallback(
    async (instructions: string): Promise<void> => {
      if (!projectId) return;

      try {
        // Try API first
        await fetch(`/api/concept2cure/projects/${projectId}/knowledge`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ customInstructions: instructions }),
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

  return {
    knowledge,
    isLoading,
    error,
    uploadDocument,
    removeDocument,
    updateCustomInstructions,
    contextTokens,
    maxContextTokens,
    contextUsagePercent,
    isUploading,
    uploadProgress,
  };
}

export default useProjectKnowledge;
