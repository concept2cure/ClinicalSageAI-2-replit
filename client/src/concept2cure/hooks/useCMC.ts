/**
 * @fileoverview CMC Intelligence React Hooks
 * @module concept2cure/hooks/useCMC
 * @version 1.0.0
 *
 * @description
 * Production-ready React hooks for CMC (Chemistry, Manufacturing, Controls).
 * Integrates specifications, impurities, stability, and ICH compliance.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import cmcService, {
  type Specification,
  type SpecificationType,
  type SpecificationTest,
  type ImpurityProfile,
  type Impurity,
  type StabilityProtocol,
  type StabilityBatch,
  type BatchRecord,
  type ICHComplianceResult,
  type ICHGuideline,
  type CmcPortfolioRow,
  type CmcModule3Readiness,
  type CmcSpecRow,
  type CmcStabilityRow,
  type CmcBatchRow,
  type CmcIchCheckResult,
  type CmcQbdResult,
  type SpecificationInput,
  type SpecificationPatch,
  type StabilityStudyInput,
  type StabilityResultEntry,
  type BatchRecordInput,
  type CmcModule3Section,
} from '../services/cmcService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const cmcQueryKeys = {
  all: ['cmc'] as const,
  specifications: () => [...cmcQueryKeys.all, 'specifications'] as const,
  specificationList: (params: Record<string, unknown>) => [...cmcQueryKeys.specifications(), 'list', params] as const,
  specificationDetail: (id: string) => [...cmcQueryKeys.specifications(), id] as const,
  specificationCompliance: (id: string) => [...cmcQueryKeys.specifications(), id, 'compliance'] as const,
  impurities: () => [...cmcQueryKeys.all, 'impurities'] as const,
  impurityProfile: (productId: string) => [...cmcQueryKeys.impurities(), productId] as const,
  stability: () => [...cmcQueryKeys.all, 'stability'] as const,
  stabilityProtocols: (productId: string) => [...cmcQueryKeys.stability(), 'protocols', productId] as const,
  stabilityProtocol: (id: string) => [...cmcQueryKeys.stability(), 'protocol', id] as const,
  batches: () => [...cmcQueryKeys.all, 'batches'] as const,
  batchList: (params: Record<string, unknown>) => [...cmcQueryKeys.batches(), 'list', params] as const,
  batchDetail: (batchNumber: string) => [...cmcQueryKeys.batches(), batchNumber] as const,
  batchTrends: (params: Record<string, unknown>) => [...cmcQueryKeys.batches(), 'trends', params] as const,
  // Workstream shell (Phase 10)
  portfolioOverview: () => [...cmcQueryKeys.all, 'portfolio', 'overview'] as const,
  module3Readiness: (projectId: string) => [...cmcQueryKeys.all, 'module3', 'readiness', projectId] as const,
  module3Sections: (projectId: string) => [...cmcQueryKeys.all, 'module3', 'sections', projectId] as const,
  projectSpecs: (projectId: string) => [...cmcQueryKeys.specifications(), 'project', projectId] as const,
  projectStability: (projectId: string) => [...cmcQueryKeys.stability(), 'project', projectId] as const,
  projectBatches: (projectId: string) => [...cmcQueryKeys.batches(), 'project', projectId] as const,
  ichCheck: (projectId: string) => [...cmcQueryKeys.all, 'ich-check', projectId] as const,
  qbd: (projectId: string) => [...cmcQueryKeys.all, 'qbd', projectId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSTREAM SHELL HOOKS (Phase 10 CMC · Module 3) — live data only
// ═══════════════════════════════════════════════════════════════════════════════

export function usePortfolioOverview() {
  return useQuery<CmcPortfolioRow[]>({
    queryKey: cmcQueryKeys.portfolioOverview(),
    queryFn: () => cmcService.getPortfolioOverview(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useModule3Readiness(projectId: string | null) {
  return useQuery<CmcModule3Readiness | null>({
    queryKey: cmcQueryKeys.module3Readiness(projectId || ''),
    queryFn: () => (projectId ? cmcService.getModule3Readiness(projectId) : null),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

export function useProjectSpecifications(projectId: string | null) {
  return useQuery<CmcSpecRow[]>({
    queryKey: cmcQueryKeys.projectSpecs(projectId || ''),
    queryFn: () => (projectId ? cmcService.getSpecificationsByProject(projectId) : []),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectStability(projectId: string | null) {
  return useQuery<CmcStabilityRow[]>({
    queryKey: cmcQueryKeys.projectStability(projectId || ''),
    queryFn: () => (projectId ? cmcService.getStabilityByProject(projectId) : []),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectBatchRecords(projectId: string | null) {
  return useQuery<CmcBatchRow[]>({
    queryKey: cmcQueryKeys.projectBatches(projectId || ''),
    queryFn: () => (projectId ? cmcService.getBatchRecordsByProject(projectId) : []),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBatchRelease() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    {
      id: string;
      releaseTesting: unknown;
      releasedBy: string;
      decision: 'approved' | 'rejected' | 'conditional';
      comments?: string;
      reason: string;
      reauth: { password: string; totp?: string };
    }
  >({
    mutationFn: ({ id, releaseTesting, releasedBy, decision, comments, reason, reauth }) =>
      cmcService.releaseBatch(id, { releaseTesting, releasedBy, decision, comments, reason, reauth }),
    onSuccess: () => {
      // Reflect the new disposition: project batch list + any batch caches.
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.batches() });
    },
  });
}

export function useCreateBatchRecord() {
  const queryClient = useQueryClient();
  return useMutation<CmcBatchRow, Error, BatchRecordInput>({
    mutationFn: (data) => cmcService.createBatchRecord(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.batches() });
      if (created?.project_id) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectBatches(created.project_id) });
      }
    },
  });
}

/** Module 3 section map for a project — drives the governed approval action. */
export function useModule3Sections(projectId: string | null) {
  return useQuery<CmcModule3Section[]>({
    queryKey: cmcQueryKeys.module3Sections(projectId || ''),
    queryFn: () => (projectId ? cmcService.getModule3Sections(projectId) : []),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

/**
 * Governed Module 3 section approval. The signed e-signature is captured by
 * EsignModal before this fires; on success we invalidate the section map and
 * the build-state readiness so the approved count reflects immediately.
 */
export function useApproveModule3Section() {
  const queryClient = useQueryClient();
  return useMutation<
    { sectionKey: string; versionNumber: number; approvedVersionId: string },
    Error,
    { projectId: string; sectionKey: string }
  >({
    mutationFn: ({ projectId, sectionKey }) => cmcService.approveModule3Section(projectId, sectionKey),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.module3Sections(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.module3Readiness(variables.projectId) });
    },
  });
}

export function useICHComplianceCheck() {
  return useMutation<CmcIchCheckResult | null, Error, string>({
    mutationFn: (projectId) => cmcService.runICHComplianceCheck(projectId),
  });
}

export function useChangeImpactSimulation() {
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (payload) => cmcService.simulateChangeImpact(payload),
  });
}

export function useQbdAnalysis(projectId: string | null) {
  return useQuery<CmcQbdResult | null>({
    queryKey: cmcQueryKeys.qbd(projectId || ''),
    queryFn: () => (projectId ? cmcService.analyzeQbd(projectId) : null),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useGenerateBlueprint() {
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (payload) => cmcService.generateBlueprint(payload),
  });
}

export function useGlobalCompliance() {
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (payload) => cmcService.checkGlobalCompliance(payload),
  });
}

export function useCmcCopilot() {
  return useMutation<{ response?: string; [key: string]: unknown }, Error, { query: string; context?: Record<string, unknown> }>({
    mutationFn: ({ query, context }) => cmcService.cmcCopilotChat(query, context),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIFICATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useSpecifications(params: {
  productId: string;
  type?: SpecificationType;
  status?: Specification['status'];
}) {
  return useQuery<Specification[]>({
    queryKey: cmcQueryKeys.specificationList(params),
    queryFn: () => cmcService.listSpecifications(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useSpecification(id: string | null) {
  return useQuery<Specification | null>({
    queryKey: cmcQueryKeys.specificationDetail(id || ''),
    queryFn: () => id ? cmcService.getSpecification(id) : null,
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateSpecification() {
  const queryClient = useQueryClient();

  return useMutation<CmcSpecRow, Error, SpecificationInput>({
    mutationFn: (data) => cmcService.createSpecification(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.specifications() });
      if (created?.project_id) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectSpecs(created.project_id) });
      }
    },
  });
}

export function useUpdateSpecification() {
  const queryClient = useQueryClient();

  return useMutation<
    CmcSpecRow,
    Error,
    { id: string; data: SpecificationPatch; projectId?: string }
  >({
    mutationFn: ({ id, data }) => cmcService.updateSpecification(id, data),
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({
        queryKey: cmcQueryKeys.specificationDetail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.specifications() });
      const projectId = variables.projectId ?? updated?.project_id ?? undefined;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectSpecs(projectId) });
      }
    },
  });
}

export function useApproveSpecification() {
  const queryClient = useQueryClient();

  return useMutation<
    CmcSpecRow,
    Error,
    { id: string; reason: string; reauth: { password: string; totp?: string }; projectId?: string }
  >({
    mutationFn: ({ id, reason, reauth }) =>
      cmcService.approveSpecification(id, { reason, reauth }),
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({
        queryKey: cmcQueryKeys.specificationDetail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.specifications() });
      const projectId = variables.projectId ?? updated?.project_id ?? undefined;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectSpecs(projectId) });
      }
    },
  });
}

export function useICHCompliance(specificationId: string | null) {
  return useQuery<ICHComplianceResult | null>({
    queryKey: cmcQueryKeys.specificationCompliance(specificationId || ''),
    queryFn: () => specificationId ? cmcService.checkICHCompliance(specificationId) : null,
    enabled: !!specificationId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useGenerateTestJustification() {
  return useMutation<string, Error, { specificationId: string; testId: string }>({
    mutationFn: ({ specificationId, testId }) =>
      cmcService.generateTestJustification(specificationId, testId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPURITY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useImpurityProfile(productId: string | null) {
  return useQuery<ImpurityProfile | null>({
    queryKey: cmcQueryKeys.impurityProfile(productId || ''),
    queryFn: () => productId ? cmcService.getImpurityProfile(productId) : null,
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAddImpurity() {
  const queryClient = useQueryClient();

  return useMutation<Impurity, Error, { profileId: string; impurity: Partial<Impurity> }>({
    mutationFn: ({ profileId, impurity }) => cmcService.addImpurity(profileId, impurity),
    onSuccess: (_, variables) => {
      // Extract productId from profileId or invalidate all
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.impurities() });
    },
  });
}

export function useUpdateImpurity() {
  const queryClient = useQueryClient();

  return useMutation<
    Impurity,
    Error,
    { profileId: string; impurityId: string; data: Partial<Impurity> }
  >({
    mutationFn: ({ profileId, impurityId, data }) =>
      cmcService.updateImpurity(profileId, impurityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.impurities() });
    },
  });
}

export function useCalculateThresholds() {
  return useMutation<
    { identification: number; qualification: number; unit: string },
    Error,
    { maxDailyDose: number; doseUnit: string; type: 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT' }
  >({
    mutationFn: (params) => cmcService.calculateThresholds(params),
  });
}

export function useGenerateImpurityJustification() {
  return useMutation<string, Error, { profileId: string; impurityId: string }>({
    mutationFn: ({ profileId, impurityId }) =>
      cmcService.generateImpurityJustification(profileId, impurityId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STABILITY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useStabilityProtocols(productId: string | null) {
  return useQuery<StabilityProtocol[]>({
    queryKey: cmcQueryKeys.stabilityProtocols(productId || ''),
    queryFn: () => productId ? cmcService.listStabilityProtocols(productId) : [],
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStabilityProtocol(id: string | null) {
  return useQuery<StabilityProtocol | null>({
    queryKey: cmcQueryKeys.stabilityProtocol(id || ''),
    queryFn: () => id ? cmcService.getStabilityProtocol(id) : null,
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateStabilityProtocol() {
  const queryClient = useQueryClient();

  return useMutation<CmcStabilityRow, Error, StabilityStudyInput>({
    mutationFn: (data) => cmcService.createStabilityProtocol(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.stability() });
      if (created?.project_id) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectStability(created.project_id) });
      }
    },
  });
}

export function useAddStabilityResult() {
  const queryClient = useQueryClient();

  return useMutation<
    CmcStabilityRow,
    Error,
    { studyId: string; nextResults: StabilityResultEntry[]; projectId?: string }
  >({
    mutationFn: ({ studyId, nextResults }) => cmcService.addStabilityResult(studyId, nextResults),
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.stability() });
      const projectId = variables.projectId ?? updated?.project_id ?? undefined;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectStability(projectId) });
      }
    },
  });
}

export function useProjectShelfLife(protocolId: string | null) {
  return useQuery({
    queryKey: [...cmcQueryKeys.stabilityProtocol(protocolId || ''), 'projection'],
    queryFn: () => protocolId ? cmcService.projectShelfLife(protocolId) : null,
    enabled: !!protocolId,
    staleTime: 30 * 60 * 1000, // 30 minutes - projections are expensive
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH RECORD HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useBatchRecords(params: {
  productId: string;
  status?: BatchRecord['status'];
  limit?: number;
}) {
  return useQuery<BatchRecord[]>({
    queryKey: cmcQueryKeys.batchList(params),
    queryFn: () => cmcService.listBatchRecords(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBatchRecord(batchNumber: string | null) {
  return useQuery<BatchRecord | null>({
    queryKey: cmcQueryKeys.batchDetail(batchNumber || ''),
    queryFn: () => batchNumber ? cmcService.getBatchRecord(batchNumber) : null,
    enabled: !!batchNumber,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBatchTrends(params: {
  productId: string;
  testName: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: cmcQueryKeys.batchTrends(params),
    queryFn: () => cmcService.getBatchTrends(params),
    staleTime: 10 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CMC WIZARD HOOK - COMBINED STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface CMCWizardState {
  step: 'specification' | 'impurities' | 'stability' | 'batch' | 'review';
  productId: string | null;
  specificationId: string | null;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  ichIssues: Array<{
    guideline: ICHGuideline;
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
    message: string;
  }>;
}

export function useCMCWizard(productId: string) {
  const [state, setState] = useState<CMCWizardState>({
    step: 'specification',
    productId,
    specificationId: null,
    validationStatus: 'idle',
    ichIssues: [],
  });

  // Fetch all CMC data
  const specifications = useSpecifications({ productId });
  const impurityProfile = useImpurityProfile(productId);
  const stabilityProtocols = useStabilityProtocols(productId);
  const batches = useBatchRecords({ productId, limit: 10 });

  // Current specification compliance
  const compliance = useICHCompliance(state.specificationId);

  // Actions
  const setStep = useCallback((step: CMCWizardState['step']) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const selectSpecification = useCallback((id: string) => {
    setState(prev => ({ ...prev, specificationId: id }));
  }, []);

  const validateAll = useCallback(async () => {
    setState(prev => ({ ...prev, validationStatus: 'validating' }));
    
    // Run compliance check
    if (state.specificationId) {
      const result = await cmcService.checkICHCompliance(state.specificationId);
      
      const issues = result.guidelines
        .filter(g => g.status === 'NON_COMPLIANT' || g.status === 'REVIEW_REQUIRED')
        .flatMap(g => g.issues.map(i => ({
          guideline: i.guideline,
          severity: i.severity,
          message: i.description,
        })));
      
      setState(prev => ({
        ...prev,
        validationStatus: issues.some(i => i.severity === 'CRITICAL') ? 'invalid' : 'valid',
        ichIssues: issues,
      }));
    }
  }, [state.specificationId]);

  const getProgress = useCallback(() => {
    const steps = ['specification', 'impurities', 'stability', 'batch', 'review'] as const;
    const currentIndex = steps.indexOf(state.step);
    return {
      current: currentIndex + 1,
      total: steps.length,
      percentage: ((currentIndex + 1) / steps.length) * 100,
    };
  }, [state.step]);

  // Calculate overall readiness
  const isReady = useCallback(() => {
    const hasSpec = (specifications.data?.length ?? 0) > 0;
    const hasImpurities = impurityProfile.data?.summary.totalIdentified !== undefined;
    const hasStability = (stabilityProtocols.data?.length ?? 0) > 0;
    const hasBatches = (batches.data?.length ?? 0) > 0;
    const noBlockers = !state.ichIssues.some(i => i.severity === 'CRITICAL');
    
    return hasSpec && hasImpurities && hasStability && hasBatches && noBlockers;
  }, [specifications.data, impurityProfile.data, stabilityProtocols.data, batches.data, state.ichIssues]);

  return {
    // State
    state,
    
    // Data
    specifications: specifications.data || [],
    impurityProfile: impurityProfile.data,
    stabilityProtocols: stabilityProtocols.data || [],
    batches: batches.data || [],
    compliance: compliance.data,
    
    // Loading
    isLoading: specifications.isLoading || impurityProfile.isLoading || 
               stabilityProtocols.isLoading || batches.isLoading,
    
    // Actions
    setStep,
    selectSpecification,
    validateAll,
    getProgress,
    isReady,
    
    // ICH Issues
    ichIssues: state.ichIssues,
    hasBlockers: state.ichIssues.some(i => i.severity === 'CRITICAL'),
    
    // Refetch
    refetch: () => {
      specifications.refetch();
      impurityProfile.refetch();
      stabilityProtocols.refetch();
      batches.refetch();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICH GUARDRAIL HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface ICHGuardrailCheck {
  guideline: ICHGuideline;
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_CHECKED';
  message?: string;
}

export function useICHGuardrails(specificationId: string | null, impurityProfileId: string | null) {
  const specCompliance = useICHCompliance(specificationId);
  
  const guardrails: ICHGuardrailCheck[] = [
    // Q1 - Stability
    { guideline: 'Q1A', title: 'Stability Testing', status: 'NOT_CHECKED' },
    { guideline: 'Q1B', title: 'Photostability', status: 'NOT_CHECKED' },
    { guideline: 'Q1E', title: 'Evaluation of Stability Data', status: 'NOT_CHECKED' },
    // Q2 - Analytical Validation
    { guideline: 'Q2', title: 'Analytical Validation', status: 'NOT_CHECKED' },
    // Q3 - Impurities
    { guideline: 'Q3A', title: 'Impurities in Drug Substances', status: 'NOT_CHECKED' },
    { guideline: 'Q3B', title: 'Impurities in Drug Products', status: 'NOT_CHECKED' },
    { guideline: 'Q3C', title: 'Residual Solvents', status: 'NOT_CHECKED' },
    { guideline: 'Q3D', title: 'Elemental Impurities', status: 'NOT_CHECKED' },
    // Q6 - Specifications
    { guideline: 'Q6A', title: 'Specifications: Test Procedures', status: 'NOT_CHECKED' },
    { guideline: 'Q6B', title: 'Specifications: Biotech', status: 'NOT_CHECKED' },
  ];

  // Map compliance results to guardrails
  if (specCompliance.data) {
    specCompliance.data.guidelines.forEach(g => {
      const guardrail = guardrails.find(gr => gr.guideline === g.guideline);
      if (guardrail) {
        switch (g.status) {
          case 'COMPLIANT':
            guardrail.status = 'PASS';
            break;
          case 'NON_COMPLIANT':
            guardrail.status = 'FAIL';
            guardrail.message = g.issues[0]?.description;
            break;
          case 'REVIEW_REQUIRED':
            guardrail.status = 'WARN';
            guardrail.message = g.issues[0]?.description;
            break;
          case 'NOT_APPLICABLE':
            guardrail.status = 'NOT_CHECKED';
            break;
        }
      }
    });
  }

  return {
    guardrails,
    isLoading: specCompliance.isLoading,
    overallStatus: guardrails.some(g => g.status === 'FAIL') 
      ? 'FAIL' 
      : guardrails.some(g => g.status === 'WARN')
        ? 'WARN'
        : 'PASS',
  };
}
