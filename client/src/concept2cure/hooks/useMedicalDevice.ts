/**
 * @fileoverview Medical Device React Hooks
 * @module concept2cure/hooks/useMedicalDevice
 * @version 1.0.0
 *
 * @description
 * Production-ready React hooks for medical device regulatory features.
 * Supports 510(k), PMA, De Novo, CER, and MAUDE integration.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useState, useEffect } from 'react';
import medicalDeviceService, {
  type DeviceProfile,
  type PredicateDevice,
  type PredicateSearchParams,
  type PredicateComparison,
  type Submission510k,
  type SubmissionStatus,
  type EstarSection,
  type MAUDEReport,
  type HazardAnalysis,
  type ClinicalEvaluationReport,
} from '../services/medicalDeviceService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const deviceQueryKeys = {
  all: ['medical-device'] as const,
  predicates: () => [...deviceQueryKeys.all, 'predicates'] as const,
  predicateSearch: (params: PredicateSearchParams) => [...deviceQueryKeys.predicates(), 'search', params] as const,
  predicateDetails: (kNumber: string) => [...deviceQueryKeys.predicates(), kNumber] as const,
  predicateRecommend: (deviceId: string) => [...deviceQueryKeys.predicates(), 'recommend', deviceId] as const,
  submissions: () => [...deviceQueryKeys.all, 'submissions'] as const,
  submissionList: (params: Record<string, unknown>) => [...deviceQueryKeys.submissions(), 'list', params] as const,
  submissionDetail: (id: string) => [...deviceQueryKeys.submissions(), id] as const,
  estar: (submissionId: string) => [...deviceQueryKeys.submissions(), submissionId, 'estar'] as const,
  maude: () => [...deviceQueryKeys.all, 'maude'] as const,
  maudeSearch: (params: Record<string, unknown>) => [...deviceQueryKeys.maude(), 'search', params] as const,
  hazard: (productCode: string) => [...deviceQueryKeys.maude(), 'hazard', productCode] as const,
  cer: (id: string) => [...deviceQueryKeys.all, 'cer', id] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICATE SEARCH HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function usePredicateSearch(params: PredicateSearchParams, enabled = true) {
  return useQuery<PredicateDevice[]>({
    queryKey: deviceQueryKeys.predicateSearch(params),
    queryFn: () => medicalDeviceService.searchPredicates(params),
    enabled: enabled && Object.values(params).some(v => v !== undefined),
    staleTime: 30 * 60 * 1000, // 30 minutes - FDA database doesn't change often
  });
}

export function usePredicateDetails(kNumber: string | null) {
  return useQuery<PredicateDevice | null>({
    queryKey: deviceQueryKeys.predicateDetails(kNumber || ''),
    queryFn: () => kNumber ? medicalDeviceService.getPredicateDetails(kNumber) : null,
    enabled: !!kNumber,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useRecommendedPredicates(deviceProfile: DeviceProfile | null) {
  return useQuery<PredicateDevice[]>({
    queryKey: deviceQueryKeys.predicateRecommend(deviceProfile?.id || ''),
    queryFn: () => deviceProfile ? medicalDeviceService.getRecommendedPredicates(deviceProfile) : [],
    enabled: !!deviceProfile,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICATE COMPARISON HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function usePredicateComparison() {
  const queryClient = useQueryClient();

  return useMutation<
    PredicateComparison,
    Error,
    { subjectDevice: DeviceProfile; predicateDevice: PredicateDevice }
  >({
    mutationFn: ({ subjectDevice, predicateDevice }) =>
      medicalDeviceService.analyzePredicateEquivalence(subjectDevice, predicateDevice),
    onSuccess: () => {
      // Invalidate relevant caches if needed
    },
  });
}

// Stateful hook for managing predicate selection and comparison workflow
export function usePredicateWorkflow(deviceProfile: DeviceProfile | null) {
  const [selectedPredicates, setSelectedPredicates] = useState<PredicateDevice[]>([]);
  const [primaryPredicate, setPrimaryPredicate] = useState<PredicateDevice | null>(null);
  const [comparisons, setComparisons] = useState<Map<string, PredicateComparison>>(new Map());

  const recommendedQuery = useRecommendedPredicates(deviceProfile);
  const compareMutation = usePredicateComparison();

  const addPredicate = useCallback((predicate: PredicateDevice) => {
    setSelectedPredicates(prev => {
      if (prev.some(p => p.kNumber === predicate.kNumber)) return prev;
      return [...prev, predicate];
    });
  }, []);

  const removePredicate = useCallback((kNumber: string) => {
    setSelectedPredicates(prev => prev.filter(p => p.kNumber !== kNumber));
    setComparisons(prev => {
      const next = new Map(prev);
      next.delete(kNumber);
      return next;
    });
    if (primaryPredicate?.kNumber === kNumber) {
      setPrimaryPredicate(null);
    }
  }, [primaryPredicate]);

  const setPrimary = useCallback((predicate: PredicateDevice) => {
    setPrimaryPredicate(predicate);
    if (!selectedPredicates.some(p => p.kNumber === predicate.kNumber)) {
      addPredicate(predicate);
    }
  }, [selectedPredicates, addPredicate]);

  const compareWithSubject = useCallback(async (predicate: PredicateDevice) => {
    if (!deviceProfile) return null;
    
    const result = await compareMutation.mutateAsync({
      subjectDevice: deviceProfile,
      predicateDevice: predicate,
    });

    setComparisons(prev => {
      const next = new Map(prev);
      next.set(predicate.kNumber, result);
      return next;
    });

    return result;
  }, [deviceProfile, compareMutation]);

  return {
    selectedPredicates,
    primaryPredicate,
    comparisons,
    recommendedPredicates: recommendedQuery.data || [],
    isLoadingRecommendations: recommendedQuery.isLoading,
    isComparing: compareMutation.isPending,
    addPredicate,
    removePredicate,
    setPrimary,
    compareWithSubject,
    clearSelection: () => {
      setSelectedPredicates([]);
      setPrimaryPredicate(null);
      setComparisons(new Map());
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 510(k) SUBMISSION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useSubmissions(params: {
  status?: SubmissionStatus;
  limit?: number;
  offset?: number;
} = {}) {
  return useQuery({
    queryKey: deviceQueryKeys.submissionList(params),
    queryFn: () => medicalDeviceService.listSubmissions(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useSubmission(id: string | null) {
  return useQuery<Submission510k | null>({
    queryKey: deviceQueryKeys.submissionDetail(id || ''),
    queryFn: () => id ? medicalDeviceService.getSubmission(id) : null,
    enabled: !!id,
    staleTime: 2 * 60 * 1000, // 2 minutes - submissions may be actively edited
  });
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();

  return useMutation<Submission510k, Error, Partial<Submission510k>>({
    mutationFn: (data) => medicalDeviceService.createSubmission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceQueryKeys.submissions() });
    },
  });
}

export function useUpdateSubmission() {
  const queryClient = useQueryClient();

  return useMutation<
    Submission510k,
    Error,
    { id: string; data: Partial<Submission510k> }
  >({
    mutationFn: ({ id, data }) => medicalDeviceService.updateSubmission(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: deviceQueryKeys.submissionDetail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: deviceQueryKeys.submissions() });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// eSTAR HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useEstarSections(submissionId: string | null) {
  return useQuery<Record<string, EstarSection>>({
    queryKey: deviceQueryKeys.estar(submissionId || ''),
    queryFn: () => submissionId ? medicalDeviceService.getEstarSections(submissionId) : {},
    enabled: !!submissionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpdateEstarSection() {
  const queryClient = useQueryClient();

  return useMutation<
    EstarSection,
    Error,
    { submissionId: string; sectionId: string; data: Partial<EstarSection> }
  >({
    mutationFn: ({ submissionId, sectionId, data }) =>
      medicalDeviceService.updateEstarSection(submissionId, sectionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: deviceQueryKeys.estar(variables.submissionId),
      });
    },
  });
}

export function useGenerateEstarContent() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { submissionId: string; sectionId: string; context?: Record<string, unknown> }
  >({
    mutationFn: ({ submissionId, sectionId, context }) =>
      medicalDeviceService.generateEstarContent(submissionId, sectionId, context),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: deviceQueryKeys.estar(variables.submissionId),
      });
    },
  });
}

export function useValidateEstar(submissionId: string | null) {
  return useQuery({
    queryKey: [...deviceQueryKeys.estar(submissionId || ''), 'validate'],
    queryFn: () => submissionId ? medicalDeviceService.validateEstar(submissionId) : null,
    enabled: !!submissionId,
    staleTime: 1 * 60 * 1000, // 1 minute - validation should be fresh
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAUDE & SAFETY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useMAUDESearch(params: {
  productCode?: string;
  brandName?: string;
  manufacturer?: string;
  eventType?: 'malfunction' | 'injury' | 'death';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  return useQuery<MAUDEReport[]>({
    queryKey: deviceQueryKeys.maudeSearch(params),
    queryFn: () => medicalDeviceService.searchMAUDE(params),
    enabled: Object.values(params).some(v => v !== undefined),
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

export function useHazardAnalysis(productCode: string | null) {
  return useQuery<HazardAnalysis | null>({
    queryKey: deviceQueryKeys.hazard(productCode || ''),
    queryFn: () => productCode ? medicalDeviceService.getHazardAnalysis(productCode) : null,
    enabled: !!productCode,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useMAUDEAlerts(productCodes: string[]) {
  const [alerts, setAlerts] = useState<MAUDEReport[]>([]);

  useEffect(() => {
    if (productCodes.length === 0) return;

    const unsubscribe = medicalDeviceService.subscribeToMAUDEAlerts(
      productCodes,
      (report) => {
        setAlerts(prev => [report, ...prev].slice(0, 100));
      }
    );

    return () => unsubscribe();
  }, [productCodes.join(',')]);

  return {
    alerts,
    clearAlerts: () => setAlerts([]),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CER HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCER(id: string | null) {
  return useQuery<ClinicalEvaluationReport | null>({
    queryKey: deviceQueryKeys.cer(id || ''),
    queryFn: () => id ? medicalDeviceService.getCER(id) : null,
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateCER() {
  const queryClient = useQueryClient();

  return useMutation<ClinicalEvaluationReport, Error, string>({
    mutationFn: (deviceId) => medicalDeviceService.createCER(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceQueryKeys.all });
    },
  });
}

export function useUpdateCERSection() {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    Error,
    { cerId: string; sectionName: string; content: string }
  >({
    mutationFn: ({ cerId, sectionName, content }) =>
      medicalDeviceService.updateCERSection(cerId, sectionName, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: deviceQueryKeys.cer(variables.cerId),
      });
    },
  });
}

export function useGenerateCERContent() {
  return useMutation<
    string,
    Error,
    { cerId: string; sectionName: string; context?: Record<string, unknown> }
  >({
    mutationFn: ({ cerId, sectionName, context }) =>
      medicalDeviceService.generateCERContent(cerId, sectionName, context),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED DEVICE DASHBOARD HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useDeviceDashboard(productCodes: string[]) {
  // Active submissions
  const submissions = useSubmissions({ limit: 10 });

  // MAUDE hazard analysis for first product code
  const hazard = useHazardAnalysis(productCodes[0] || null);

  // Real-time MAUDE alerts
  const maudeAlerts = useMAUDEAlerts(productCodes);

  const isLoading = submissions.isLoading || hazard.isLoading;
  const isError = submissions.isError || hazard.isError;

  return {
    submissions: submissions.data?.submissions || [],
    totalSubmissions: submissions.data?.total || 0,
    hazardAnalysis: hazard.data,
    maudeAlerts: maudeAlerts.alerts,
    isLoading,
    isError,
    refetch: () => {
      submissions.refetch();
      hazard.refetch();
    },
  };
}
