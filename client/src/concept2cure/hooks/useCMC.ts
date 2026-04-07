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
  type StabilityResult,
  type BatchRecord,
  type ICHComplianceResult,
  type ICHGuideline,
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
};

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

  return useMutation<Specification, Error, Partial<Specification>>({
    mutationFn: (data) => cmcService.createSpecification(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.specifications() });
    },
  });
}

export function useUpdateSpecification() {
  const queryClient = useQueryClient();

  return useMutation<
    Specification,
    Error,
    { id: string; data: Partial<Specification> }
  >({
    mutationFn: ({ id, data }) => cmcService.updateSpecification(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: cmcQueryKeys.specificationDetail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.specifications() });
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

  return useMutation<StabilityProtocol, Error, Partial<StabilityProtocol>>({
    mutationFn: (data) => cmcService.createStabilityProtocol(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.stability() });
    },
  });
}

export function useAddStabilityResult() {
  const queryClient = useQueryClient();

  return useMutation<
    StabilityResult,
    Error,
    { batchId: string; result: Partial<StabilityResult> }
  >({
    mutationFn: ({ batchId, result }) => cmcService.addStabilityResult(batchId, result),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cmcQueryKeys.stability() });
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
