/**
 * @fileoverview Regulatory Intelligence React Hooks
 * @module concept2cure/hooks/useRegulatoryIntelligence
 * @version 1.0.0
 *
 * @description
 * Production-ready React hooks for regulatory intelligence features.
 * Integrates with TanStack Query for caching, optimistic updates, and real-time sync.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import regulatoryIntelligenceService, {
  type RegulatoryAlert,
  type RegulatoryStats,
  type MAUDEEvent,
  type FDARecall,
  type FDAGuidance,
  type CompetitorIntelligence,
  type PDUFADate,
} from '../services/regulatoryIntelligenceService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const regulatoryQueryKeys = {
  all: ['regulatory-intelligence'] as const,
  briefing: (userId: string) => [...regulatoryQueryKeys.all, 'briefing', userId] as const,
  maude: (params: Record<string, unknown>) => [...regulatoryQueryKeys.all, 'maude', params] as const,
  recalls: (params: Record<string, unknown>) => [...regulatoryQueryKeys.all, 'recalls', params] as const,
  guidances: (params: Record<string, unknown>) => [...regulatoryQueryKeys.all, 'guidances', params] as const,
  competitors: (params: Record<string, unknown>) => [...regulatoryQueryKeys.all, 'competitors', params] as const,
  pdufa: (params: Record<string, unknown>) => [...regulatoryQueryKeys.all, 'pdufa', params] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MORNING BRIEFING HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface MorningBriefingData {
  alerts: RegulatoryAlert[];
  stats: RegulatoryStats;
  priorities: Array<{
    id: string;
    title: string;
    project?: string;
    deadline?: string;
    urgency: 'now' | 'today' | 'this_week';
  }>;
}

export function useMorningBriefing(userId: string) {
  return useQuery<MorningBriefingData>({
    queryKey: regulatoryQueryKeys.briefing(userId),
    queryFn: () => regulatoryIntelligenceService.getMorningBriefing(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-TIME ALERTS HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useRealTimeAlerts(userId: string) {
  const queryClient = useQueryClient();
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  useEffect(() => {
    setConnectionStatus('connecting');
    
    const unsubscribe = regulatoryIntelligenceService.subscribeToAlerts(
      userId,
      (alert) => {
        setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50
        
        // Also update the briefing cache
        queryClient.setQueryData<MorningBriefingData>(
          regulatoryQueryKeys.briefing(userId),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              alerts: [alert, ...old.alerts].slice(0, 20),
            };
          }
        );
      }
    );

    setConnectionStatus('connected');

    return () => {
      unsubscribe();
      setConnectionStatus('disconnected');
    };
  }, [userId, queryClient]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    connectionStatus,
    clearAlerts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAUDE SEARCH HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface MAUDESearchParams {
  productCode?: string;
  manufacturer?: string;
  eventType?: 'malfunction' | 'injury' | 'death';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export function useMAUDESearch(params: MAUDESearchParams, enabled = true) {
  return useQuery<MAUDEEvent[]>({
    queryKey: regulatoryQueryKeys.maude(params),
    queryFn: () => regulatoryIntelligenceService.searchMAUDE(params),
    enabled: enabled && Object.values(params).some(v => v !== undefined),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDA RECALLS HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface RecallsParams {
  recallClass?: 'I' | 'II' | 'III';
  status?: 'ongoing' | 'terminated' | 'completed';
  productType?: 'drug' | 'device' | 'food';
  dateFrom?: string;
  limit?: number;
}

export function useRecalls(params: RecallsParams = {}) {
  return useQuery<FDARecall[]>({
    queryKey: regulatoryQueryKeys.recalls(params),
    queryFn: () => regulatoryIntelligenceService.getRecalls(params),
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDA GUIDANCES HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface GuidancesParams {
  centerCode?: string;
  guidanceType?: 'final' | 'draft';
  dateFrom?: string;
  searchTerm?: string;
  limit?: number;
}

export function useGuidances(params: GuidancesParams = {}) {
  return useQuery<FDAGuidance[]>({
    queryKey: regulatoryQueryKeys.guidances(params),
    queryFn: () => regulatoryIntelligenceService.getGuidances(params),
    staleTime: 30 * 60 * 1000, // 30 minutes - guidances don't change often
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPETITOR INTELLIGENCE HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompetitorIntelParams {
  competitors?: string[];
  productCodes?: string[];
  eventTypes?: Array<'approval' | 'rejection' | 'recall' | 'warning_letter' | 'clinical_trial'>;
  dateFrom?: string;
  limit?: number;
}

export function useCompetitorIntelligence(params: CompetitorIntelParams = {}) {
  return useQuery<CompetitorIntelligence[]>({
    queryKey: regulatoryQueryKeys.competitors(params),
    queryFn: () => regulatoryIntelligenceService.getCompetitorIntelligence(params),
    staleTime: 15 * 60 * 1000, // 15 minutes
    enabled: (params.competitors?.length ?? 0) > 0 || (params.productCodes?.length ?? 0) > 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDUFA DATES HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface PDUFAParams {
  dateFrom?: string;
  dateTo?: string;
  status?: 'pending' | 'all';
  therapeuticArea?: string;
  limit?: number;
}

export function usePDUFADates(params: PDUFAParams = {}) {
  return useQuery<PDUFADate[]>({
    queryKey: regulatoryQueryKeys.pdufa(params),
    queryFn: () => regulatoryIntelligenceService.getPDUFADates(params),
    staleTime: 60 * 60 * 1000, // 1 hour - PDUFA dates don't change often
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED INTELLIGENCE DASHBOARD HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useRegulatoryDashboard(userId: string) {
  const briefing = useMorningBriefing(userId);
  const realTimeAlerts = useRealTimeAlerts(userId);
  
  // Get upcoming PDUFA dates (next 90 days)
  const today = new Date();
  const ninetyDaysLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const pdufa = usePDUFADates({
    dateFrom: today.toISOString().split('T')[0],
    dateTo: ninetyDaysLater.toISOString().split('T')[0],
    status: 'pending',
    limit: 10,
  });

  // Get recent recalls
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recalls = useRecalls({
    status: 'ongoing',
    dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
    limit: 10,
  });

  // Get recent guidances
  const guidances = useGuidances({
    dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
    limit: 10,
  });

  const isLoading = briefing.isLoading || pdufa.isLoading || recalls.isLoading || guidances.isLoading;
  const isError = briefing.isError || pdufa.isError || recalls.isError || guidances.isError;

  return {
    briefing: briefing.data,
    realTimeAlerts: realTimeAlerts.alerts,
    connectionStatus: realTimeAlerts.connectionStatus,
    pdufa: pdufa.data || [],
    recalls: recalls.data || [],
    guidances: guidances.data || [],
    isLoading,
    isError,
    refetch: () => {
      briefing.refetch();
      pdufa.refetch();
      recalls.refetch();
      guidances.refetch();
    },
  };
}
