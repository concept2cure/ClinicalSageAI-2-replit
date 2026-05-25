/**
 * @fileoverview Document Intelligence React Hooks
 * @module concept2cure/hooks/useDocumentIntelligence
 * @version 1.0.0
 *
 * @description
 * Production-ready React hooks for eCTD document authoring and management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useRef, useEffect } from 'react';
import documentIntelligenceService, {
  type Document,
  type DocumentVersion,
  type DocumentDiff,
  type SmartTag,
  type Citation,
  type CrossReference,
  type RedlineAlert,
  type DocumentValidation,
  type ApprovalWorkflow,
  type CTDModule,
  type DocumentStatus,
  type GenerationRequest,
  type GenerationResult,
} from '../services/documentIntelligenceService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const documentQueryKeys = {
  all: ['documents'] as const,
  list: (params: Record<string, unknown>) => [...documentQueryKeys.all, 'list', params] as const,
  detail: (id: string) => [...documentQueryKeys.all, id] as const,
  versions: (id: string) => [...documentQueryKeys.all, id, 'versions'] as const,
  diff: (id: string, from: string, to: string) => [...documentQueryKeys.all, id, 'diff', from, to] as const,
  validation: (id: string) => [...documentQueryKeys.all, id, 'validation'] as const,
  workflow: (id: string) => [...documentQueryKeys.all, id, 'workflow'] as const,
  redlineAlerts: (id: string) => [...documentQueryKeys.all, id, 'redline-alerts'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT CRUD HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useDocuments(params: {
  projectId: string;
  ctdModule?: CTDModule;
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: documentQueryKeys.list(params),
    queryFn: () => documentIntelligenceService.listDocuments(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useDocument(id: string | null) {
  return useQuery<Document | null>({
    queryKey: documentQueryKeys.detail(id || ''),
    queryFn: () => id ? documentIntelligenceService.getDocument(id) : null,
    enabled: !!id,
    staleTime: 1 * 60 * 1000, // 1 minute - documents may be actively edited
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: documentIntelligenceService.createDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation<
    Document,
    Error,
    { id: string; data: { content?: string; title?: string; changeDescription?: string } }
  >({
    mutationFn: ({ id, data }) => documentIntelligenceService.updateDocument(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.versions(variables.id),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT LOCKING HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useLockDocument() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, string>({
    mutationFn: (id) => documentIntelligenceService.lockDocument(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(id),
      });
    },
  });
}

export function useUnlockDocument() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, string>({
    mutationFn: (id) => documentIntelligenceService.unlockDocument(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(id),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART TAGS & CITATIONS HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useExtractSmartTags() {
  return useMutation<SmartTag[], Error, string>({
    mutationFn: (content) => documentIntelligenceService.extractSmartTags(content),
  });
}

export function useLinkSmartTag() {
  const queryClient = useQueryClient();

  return useMutation<
    SmartTag,
    Error,
    { tagId: string; entityType: string; entityId: string; documentId?: string }
  >({
    mutationFn: ({ tagId, entityType, entityId }) =>
      documentIntelligenceService.linkSmartTag(tagId, entityType, entityId),
    onSuccess: (_, variables) => {
      if (variables.documentId) {
        queryClient.invalidateQueries({
          queryKey: documentQueryKeys.detail(variables.documentId),
        });
      }
    },
  });
}

export function useExtractCitations() {
  return useMutation<Citation[], Error, string>({
    mutationFn: (content) => documentIntelligenceService.extractCitations(content),
  });
}

export function useValidateCitations() {
  return useMutation<Citation[], Error, Citation[]>({
    mutationFn: (citations) => documentIntelligenceService.validateCitations(citations),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION & DIFF HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useDocumentVersions(documentId: string | null) {
  return useQuery<DocumentVersion[]>({
    queryKey: documentQueryKeys.versions(documentId || ''),
    queryFn: () => documentId ? documentIntelligenceService.getVersions(documentId) : [],
    enabled: !!documentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useDocumentDiff(
  documentId: string | null,
  fromVersion: string | null,
  toVersion: string | null
) {
  return useQuery<DocumentDiff | null>({
    queryKey: documentQueryKeys.diff(documentId || '', fromVersion || '', toVersion || ''),
    queryFn: () =>
      documentId && fromVersion && toVersion
        ? documentIntelligenceService.getDiff(documentId, fromVersion, toVersion)
        : null,
    enabled: !!documentId && !!fromVersion && !!toVersion,
  });
}

export function useRedlineAlerts(documentId: string | null) {
  return useQuery<RedlineAlert[]>({
    queryKey: documentQueryKeys.redlineAlerts(documentId || ''),
    queryFn: () => documentId ? documentIntelligenceService.getRedlineAlerts(documentId) : [],
    enabled: !!documentId,
    staleTime: 1 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useDocumentValidation(documentId: string | null) {
  return useQuery<DocumentValidation | null>({
    queryKey: documentQueryKeys.validation(documentId || ''),
    queryFn: () => documentId ? documentIntelligenceService.validateDocument(documentId) : null,
    enabled: !!documentId,
    staleTime: 1 * 60 * 1000,
  });
}

export function useValidateHyperlinks(documentId: string | null) {
  return useQuery<CrossReference[]>({
    queryKey: [...documentQueryKeys.validation(documentId || ''), 'hyperlinks'],
    queryFn: () => documentId ? documentIntelligenceService.validateHyperlinks(documentId) : [],
    enabled: !!documentId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAutoFix() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { documentId: string; issueCode: string }>({
    mutationFn: ({ documentId, issueCode }) =>
      documentIntelligenceService.autoFix(documentId, issueCode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(variables.documentId),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.validation(variables.documentId),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI GENERATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useGenerateContent() {
  return useMutation<GenerationResult, Error, GenerationRequest>({
    mutationFn: (request) => documentIntelligenceService.generateContent(request),
  });
}

export function useGetSuggestions(documentId: string | null) {
  return useQuery<string[]>({
    queryKey: [...documentQueryKeys.detail(documentId || ''), 'suggestions'],
    queryFn: () => documentId ? documentIntelligenceService.getSuggestions(documentId) : [],
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRewriteContent() {
  return useMutation<string, Error, { content: string; instructions: string }>({
    mutationFn: ({ content, instructions }) =>
      documentIntelligenceService.rewriteContent(content, instructions),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL WORKFLOW HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useApprovalWorkflow(documentId: string | null) {
  return useQuery<ApprovalWorkflow | null>({
    queryKey: documentQueryKeys.workflow(documentId || ''),
    queryFn: () => documentId ? documentIntelligenceService.getApprovalWorkflow(documentId) : null,
    enabled: !!documentId,
    staleTime: 1 * 60 * 1000,
  });
}

export function useStartApprovalWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<
    ApprovalWorkflow,
    Error,
    {
      documentId: string;
      steps: Array<{ role: string; userId?: string; dueDate?: string }>;
    }
  >({
    mutationFn: ({ documentId, steps }) =>
      documentIntelligenceService.startApprovalWorkflow(documentId, steps),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.workflow(variables.documentId),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(variables.documentId),
      });
    },
  });
}

export function useSubmitApproval() {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    Error,
    {
      documentId: string;
      decision: {
        status: 'APPROVED' | 'REJECTED' | 'RETURNED';
        comments?: string;
        signature?: string;
        signatureReason?: string;
      };
    }
  >({
    mutationFn: ({ documentId, decision }) =>
      documentIntelligenceService.submitApproval(documentId, decision),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.workflow(variables.documentId),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(variables.documentId),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT EDITOR HOOK - COMBINED STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseDocumentEditorOptions {
  documentId: string | null;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

export function useDocumentEditor(options: UseDocumentEditorOptions) {
  const { documentId, autoSave = true, autoSaveInterval = 30000 } = options;
  
  const queryClient = useQueryClient();
  const [localContent, setLocalContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const lastSavedRef = useRef<string>('');
  
  // Fetch document
  const documentQuery = useDocument(documentId);
  const versionsQuery = useDocumentVersions(documentId);
  const validationQuery = useDocumentValidation(documentId);
  const workflowQuery = useApprovalWorkflow(documentId);
  const redlineAlertsQuery = useRedlineAlerts(documentId);
  
  // Mutations
  const updateMutation = useUpdateDocument();
  const lockMutation = useLockDocument();
  const unlockMutation = useUnlockDocument();
  const generateMutation = useGenerateContent();
  const extractTagsMutation = useExtractSmartTags();
  
  // Sync local content with fetched document
  useEffect(() => {
    if (documentQuery.data?.content) {
      setLocalContent(documentQuery.data.content);
      lastSavedRef.current = documentQuery.data.content;
      setIsDirty(false);
    }
  }, [documentQuery.data?.content]);
  
  // Auto-save
  useEffect(() => {
    if (!autoSave || !documentId || !isDirty) return;
    
    const timer = setInterval(() => {
      if (localContent !== lastSavedRef.current) {
        updateMutation.mutate(
          {
            id: documentId,
            data: {
              content: localContent,
              changeDescription: 'Auto-save',
            },
          },
          {
            onSuccess: () => {
              lastSavedRef.current = localContent;
              setIsDirty(false);
            },
          }
        );
      }
    }, autoSaveInterval);
    
    return () => clearInterval(timer);
  }, [autoSave, documentId, isDirty, localContent, autoSaveInterval, updateMutation]);
  
  // Handle content change
  const handleContentChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    setIsDirty(newContent !== lastSavedRef.current);
  }, []);
  
  // Manual save
  const save = useCallback(async (changeDescription?: string) => {
    if (!documentId) return;
    
    await updateMutation.mutateAsync({
      id: documentId,
      data: {
        content: localContent,
        changeDescription: changeDescription || 'Manual save',
      },
    });
    
    lastSavedRef.current = localContent;
    setIsDirty(false);
  }, [documentId, localContent, updateMutation]);
  
  // Lock/unlock
  const acquireLock = useCallback(async () => {
    if (!documentId) return false;
    const success = await lockMutation.mutateAsync(documentId);
    setIsLocked(success);
    return success;
  }, [documentId, lockMutation]);
  
  const releaseLock = useCallback(async () => {
    if (!documentId) return false;
    const success = await unlockMutation.mutateAsync(documentId);
    setIsLocked(!success);
    return success;
  }, [documentId, unlockMutation]);
  
  // AI generation
  const generateContent = useCallback(async (instructions?: string) => {
    if (!documentQuery.data) return null;
    
    const result = await generateMutation.mutateAsync({
      documentId: documentId ?? undefined,
      ctdSection: documentQuery.data.ctdSection,
      context: {
        projectId: '', // TODO: get from context
        submissionType: '',
        existingContent: localContent,
      },
      instructions,
    });
    
    return result;
  }, [documentId, documentQuery.data, localContent, generateMutation]);
  
  // Smart tag extraction
  const extractSmartTags = useCallback(async () => {
    const tags = await extractTagsMutation.mutateAsync(localContent);
    return tags;
  }, [localContent, extractTagsMutation]);
  
  return {
    // Document data
    document: documentQuery.data,
    versions: versionsQuery.data || [],
    validation: validationQuery.data,
    workflow: workflowQuery.data,
    redlineAlerts: redlineAlertsQuery.data || [],
    
    // Editor state
    content: localContent,
    isDirty,
    isLocked,
    
    // Loading states
    isLoading: documentQuery.isLoading,
    isSaving: updateMutation.isPending,
    isGenerating: generateMutation.isPending,
    
    // Actions
    setContent: handleContentChange,
    save,
    acquireLock,
    releaseLock,
    generateContent,
    extractSmartTags,
    
    // Refresh
    refetch: () => {
      documentQuery.refetch();
      versionsQuery.refetch();
      validationQuery.refetch();
    },
  };
}
