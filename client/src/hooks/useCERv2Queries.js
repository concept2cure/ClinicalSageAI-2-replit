/**
 * React Query hooks for CERv2 Workbench
 * 
 * This layer provides:
 * - Automatic caching with intelligent invalidation
 * - Loading/error states
 * - Optimistic updates
 * - Request deduplication
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evidenceApi, claimsApi, standardsApi, outcomesApi, auditApi, exportsApi, workbenchApi } from '../lib/cerv2WorkbenchContract';

/**
 * Query keys factory
 * Centralized to ensure consistent invalidation
 */
export const queryKeys = {
  evidence: (programId, filters = {}) => ['evidence', programId, filters],
  evidenceLinks: (programId, entityType, entityId) => ['evidenceLinks', programId, entityType, entityId],
  claims: (programId) => ['claims', programId],
  standards: (programId) => ['standards', programId],
  outcomes: (programId) => ['outcomes', programId],
  audit: (programId, filters = {}) => ['audit', programId, filters],
  exports: (programId) => ['exports', programId],
  exportPreflight: (programId) => ['exportPreflight', programId],
  workbenchSummary: (programId) => ['workbenchSummary', programId],
};

/**
 * Evidence hooks
 */
export function useEvidence(programId, filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.evidence(programId, filters),
    queryFn: ({ signal }) => evidenceApi.list(programId, filters, signal),
    ...options,
  });
}

export function useEvidenceUpload(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (file) => evidenceApi.upload(programId, file),
    onSuccess: () => {
      // Invalidate evidence list to show new upload
      queryClient.invalidateQueries({ queryKey: queryKeys.evidence(programId) });
      // Invalidate audit to show upload event
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
    },
  });
}

export function useEvidenceDelete(programId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (evidenceId) => evidenceApi.remove(programId, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evidence(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workbenchSummary(programId) });
    },
  });
}

export function useBulkLinkEvidence(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => evidenceApi.bulkLink(programId, data),
    onSuccess: (_, variables) => {
      // Invalidate affected entity list (claim/standard/outcome)
      const { entityType } = variables;
      if (entityType === 'CLAIM') {
        queryClient.invalidateQueries({ queryKey: queryKeys.claims(programId) });
      } else if (entityType === 'STANDARD') {
        queryClient.invalidateQueries({ queryKey: queryKeys.standards(programId) });
      } else if (entityType === 'OUTCOME') {
        queryClient.invalidateQueries({ queryKey: queryKeys.outcomes(programId) });
      }
      
      // Invalidate audit to show bulk link event
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
      
      // Invalidate export preflight (coverage changed)
      queryClient.invalidateQueries({ queryKey: queryKeys.exportPreflight(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workbenchSummary(programId) });
    },
  });
}

export function useBulkUnlinkEvidence(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => evidenceApi.bulkUnlink(programId, data),
    onSuccess: (_, variables) => {
      // Invalidate affected entity list
      const { entityType } = variables;
      if (entityType === 'CLAIM') {
        queryClient.invalidateQueries({ queryKey: queryKeys.claims(programId) });
      } else if (entityType === 'STANDARD') {
        queryClient.invalidateQueries({ queryKey: queryKeys.standards(programId) });
      } else if (entityType === 'OUTCOME') {
        queryClient.invalidateQueries({ queryKey: queryKeys.outcomes(programId) });
      }
      
      // Invalidate audit to show bulk unlink event
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
      
      // Invalidate export preflight (coverage changed)
      queryClient.invalidateQueries({ queryKey: queryKeys.exportPreflight(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workbenchSummary(programId) });
    },
  });
}

/**
 * Claims hooks
 */
export function useClaims(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.claims(programId),
    queryFn: ({ signal }) => claimsApi.list(programId, {}, signal),
    ...options,
  });
}

export function useCreateClaim(programId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => claimsApi.create(programId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claims(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workbenchSummary(programId) });
    },
  });
}

export function useUpdateClaimStatus(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ claimId, status, notes }) => 
      claimsApi.updateStatus(programId, claimId, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claims(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
    },
  });
}

/**
 * Standards hooks
 */
export function useStandards(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.standards(programId),
    queryFn: ({ signal }) => standardsApi.list(programId, {}, signal),
    ...options,
  });
}

export function useUpdateStandardStatus(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ standardId, status, notes }) => 
      standardsApi.updateStatus(programId, standardId, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.standards(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
    },
  });
}

/**
 * Outcomes hooks
 */
export function useOutcomes(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.outcomes(programId),
    queryFn: ({ signal }) => outcomesApi.list(programId, {}, signal),
    ...options,
  });
}

export function useUpdateOutcomeStatus(programId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ outcomeId, status, notes }) => 
      outcomesApi.updateStatus(programId, outcomeId, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outcomes(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
    },
  });
}

/**
 * Audit hooks
 */
export function useAudit(programId, filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.audit(programId, filters),
    queryFn: ({ signal }) => auditApi.list(programId, filters, signal),
    ...options,
  });
}

/**
 * Workbench summary
 */
export function useWorkbenchSummary(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.workbenchSummary(programId),
    queryFn: ({ signal }) => workbenchApi.summary(programId, signal),
    ...options,
  });
}

/**
 * Exports hooks
 */
export function useExports(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.exports(programId),
    queryFn: ({ signal }) => exportsApi.list(programId, {}, signal),
    ...options,
  });
}

export function useExportPreflight(programId, options = {}) {
  return useQuery({
    queryKey: queryKeys.exportPreflight(programId),
    queryFn: ({ signal }) => exportsApi.preflight(programId, signal),
    ...options,
  });
}

export function useGenerateExport(programId, exportType) {
  const queryClient = useQueryClient();
  
  const mutationFn = () => {
    switch (exportType) {
      case 'claims-matrix':
        return exportsApi.generateClaimsMatrix(programId);
      case 'standards-coverage':
        return exportsApi.generateStandardsCoverage(programId);
      case 'outcomes-substantiation':
        return exportsApi.generateOutcomesSubstantiation(programId);
      case 'defense-pack':
        return exportsApi.generateDefensePack(programId);
      default:
        throw new Error(`Unknown export type: ${exportType}`);
    }
  };
  
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Invalidate exports list to show new export
      queryClient.invalidateQueries({ queryKey: queryKeys.exports(programId) });
      // Invalidate audit to show export event
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(programId) });
    },
  });
}
