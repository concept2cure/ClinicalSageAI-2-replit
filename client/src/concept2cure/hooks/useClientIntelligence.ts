/**
 * Client Intelligence Memory Hook
 *
 * Manages the client persona/profile, document ingestion, memory entries,
 * and document checklist for the Client Intelligence setup page.
 *
 * @module concept2cure/hooks/useClientIntelligence
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClientProfile {
  id: number;
  organizationId: number;
  clientWorkspaceId?: number;
  companyName: string;
  companySlug?: string;
  industry?: string;
  subIndustry?: string;
  companySize?: string;
  headquarters?: string;
  website?: string;
  yearFounded?: number;
  primarySubmissionTypes?: string[];
  regulatoryMarkets?: string[];
  therapeuticAreas?: string[];
  technologyPlatforms?: string[];
  pipelineAssets?: PipelineAsset[];
  companyPersona?: string;
  regulatoryPhilosophy?: string;
  communicationPreferences?: string;
  keyStakeholders?: Stakeholder[];
  learnedInsights?: Record<string, any>;
  totalDocumentsIngested?: number;
  totalTokensProcessed?: number;
  profileStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PipelineAsset {
  name: string;
  phase: string;
  indication: string;
  mechanism?: string;
  target?: string;
  description?: string;
}

export interface Stakeholder {
  name: string;
  title: string;
  role: string;
  preferences?: string;
}

export interface MemoryEntry {
  id: number;
  profileId: number;
  category: string;
  subcategory?: string;
  title: string;
  content: string;
  sourceDocumentName?: string;
  confidenceScore?: number;
  importanceLevel?: string;
  isVerifiedByUser?: boolean;
  status?: string;
  createdAt?: string;
}

export interface IngestedDocument {
  id: number;
  profileId: number;
  fileName: string;
  fileType: string;
  fileSizeBytes?: number;
  tokenCount?: number;
  pageCount?: number;
  processingStatus: string;
  memoryEntriesGenerated?: number;
  uploadedAt: string;
}

export interface DocumentChecklistCategory {
  category: string;
  items: DocumentChecklistItem[];
}

export interface DocumentChecklistItem {
  label: string;
  description: string;
  fileTypes: string[];
  priority: 'required' | 'recommended' | 'optional';
  uploaded: boolean;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useClientIntelligence() {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // ── Fetch profile ─────────────────────────────────────────────
  const {
    data: profileData,
    isLoading: isProfileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ['client-intelligence', 'profile'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-intelligence/profile');
      const data = await res.json();
      return data.profile as ClientProfile | null;
    },
    staleTime: 30000,
  });

  // ── Save profile mutation ─────────────────────────────────────
  const saveProfileMutation = useMutation({
    mutationFn: async (profileInput: Partial<ClientProfile>) => {
      const res = await apiRequest('POST', '/api/client-intelligence/profile', profileInput);
      const data = await res.json();
      return data.profile as ClientProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-intelligence', 'profile'] });
    },
  });

  // ── Fetch memory entries ──────────────────────────────────────
  const {
    data: memoryData,
    isLoading: isMemoryLoading,
  } = useQuery({
    queryKey: ['client-intelligence', 'memory', profileData?.id],
    queryFn: async () => {
      if (!profileData?.id) return { entries: [], totalCount: 0 };
      const res = await apiRequest('GET', `/api/client-intelligence/memory?profileId=${profileData.id}`);
      const data = await res.json();
      return { entries: data.entries as MemoryEntry[], totalCount: data.totalCount as number };
    },
    enabled: !!profileData?.id,
    staleTime: 15000,
  });

  // ── Fetch ingested documents ──────────────────────────────────
  const {
    data: documentsData,
    isLoading: isDocumentsLoading,
  } = useQuery({
    queryKey: ['client-intelligence', 'documents', profileData?.id],
    queryFn: async () => {
      if (!profileData?.id) return [];
      const res = await apiRequest('GET', `/api/client-intelligence/documents?profileId=${profileData.id}`);
      const data = await res.json();
      return data.documents as IngestedDocument[];
    },
    enabled: !!profileData?.id,
    staleTime: 15000,
  });

  // ── Fetch document checklist ──────────────────────────────────
  const {
    data: checklistData,
  } = useQuery({
    queryKey: ['client-intelligence', 'checklist', profileData?.id],
    queryFn: async () => {
      if (!profileData?.id) return [];
      const res = await apiRequest('GET', `/api/client-intelligence/checklist?profileId=${profileData.id}`);
      const data = await res.json();
      return data.checklist as DocumentChecklistCategory[];
    },
    enabled: !!profileData?.id,
    staleTime: 30000,
  });

  // ── Upload document ───────────────────────────────────────────
  const uploadDocument = useCallback(
    async (file: File): Promise<boolean> => {
      if (!profileData?.id) return false;

      setIsUploading(true);
      setUploadProgress(10);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('profileId', String(profileData.id));

        const organizationId =
          localStorage.getItem('organizationId') ||
          localStorage.getItem('currentOrganizationId') ||
          '1';
        const authToken =
          localStorage.getItem('token') ||
          localStorage.getItem('authToken') ||
          localStorage.getItem('auth_token');

        setUploadProgress(30);

        const response = await fetch('/api/client-intelligence/documents/upload', {
          method: 'POST',
          headers: {
            'x-organization-id': organizationId,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          credentials: 'include',
          body: formData,
        });

        setUploadProgress(70);

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        setUploadProgress(100);

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['client-intelligence'] });

        return data.success;
      } catch (err) {
        console.error('[ClientIntelligence] Upload error:', err);
        return false;
      } finally {
        setIsUploading(false);
        setTimeout(() => setUploadProgress(0), 1000);
      }
    },
    [profileData?.id, queryClient]
  );

  // ── Verify memory entry ───────────────────────────────────────
  const verifyEntry = useMutation({
    mutationFn: async (entryId: number) => {
      await apiRequest('POST', `/api/client-intelligence/memory/${entryId}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-intelligence', 'memory'] });
    },
  });

  // ── Archive memory entry ──────────────────────────────────────
  const archiveEntry = useMutation({
    mutationFn: async (entryId: number) => {
      await apiRequest('DELETE', `/api/client-intelligence/memory/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-intelligence', 'memory'] });
    },
  });

  return {
    // Profile
    profile: profileData || null,
    isProfileLoading,
    profileError: profileError?.message || null,
    saveProfile: saveProfileMutation.mutateAsync,
    isSavingProfile: saveProfileMutation.isPending,

    // Memory
    memoryEntries: memoryData?.entries || [],
    memoryTotalCount: memoryData?.totalCount || 0,
    isMemoryLoading,
    verifyEntry: verifyEntry.mutate,
    archiveEntry: archiveEntry.mutate,

    // Documents
    ingestedDocuments: documentsData || [],
    isDocumentsLoading,
    uploadDocument,
    isUploading,
    uploadProgress,

    // Checklist
    documentChecklist: checklistData || [],
  };
}
