/**
 * @fileoverview Risk Management React Hooks
 * @module concept2cure/hooks/useRisk
 * @version 1.0.0
 *
 * @description
 * React-query hooks for the ISO 14971 risk-management workstream. Mirrors
 * useLabeling / useCMC: structured query keys, query hooks for reads, mutation
 * hooks that invalidate the right keys. Binds to riskService, which calls the
 * live /api/mdx/risk-* routes. No mocks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import riskService, {
  type RiskItem,
  type RiskItemDetail,
  type RiskItemFilter,
  type RiskItemCreate,
  type RiskItemPatch,
  type RiskControl,
  type RiskControlCreate,
  type RiskControlPatch,
  type RiskSummary,
} from '../services/riskService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const riskQueryKeys = {
  all: ['risk'] as const,
  items: () => [...riskQueryKeys.all, 'items'] as const,
  itemList: (filter: RiskItemFilter) => [...riskQueryKeys.items(), 'list', filter] as const,
  item: (id: number) => [...riskQueryKeys.items(), id] as const,
  summary: (programId: string) => [...riskQueryKeys.all, 'summary', programId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** List risk items. The shell threads the canonical project id (from
 *  useProjects) through as the program filter — the same id space CMC /
 *  labeling scope on. */
export function useRiskItems(filter: RiskItemFilter = {}) {
  return useQuery<RiskItem[]>({
    queryKey: riskQueryKeys.itemList(filter),
    queryFn: () => riskService.listItems(filter),
    staleTime: 2 * 60 * 1000,
  });
}

/** Single risk item, with its nested controls. */
export function useRiskItem(id: number | null) {
  return useQuery<RiskItemDetail | null>({
    queryKey: riskQueryKeys.item(id ?? -1),
    queryFn: () => (id ? riskService.getItem(id) : null),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

/** Aggregate risk summary for a program (project) id. */
export function useRiskSummary(programId: string | null) {
  return useQuery<RiskSummary | null>({
    queryKey: riskQueryKeys.summary(programId ?? ''),
    queryFn: () => (programId ? riskService.getSummary(programId) : null),
    enabled: programId != null && programId.length > 0,
    staleTime: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCreateRiskItem() {
  const queryClient = useQueryClient();
  return useMutation<RiskItem, Error, RiskItemCreate>({
    mutationFn: (data) => riskService.createItem(data),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.items() });
      if (item?.program_id) {
        queryClient.invalidateQueries({ queryKey: riskQueryKeys.summary(item.program_id) });
      }
    },
  });
}

export function useUpdateRiskItem() {
  const queryClient = useQueryClient();
  return useMutation<RiskItem, Error, { id: number; patch: RiskItemPatch }>({
    mutationFn: ({ id, patch }) => riskService.updateItem(id, patch),
    onSuccess: (item, { id }) => {
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.items() });
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.item(id) });
      if (item?.program_id) {
        queryClient.invalidateQueries({ queryKey: riskQueryKeys.summary(item.program_id) });
      }
    },
  });
}

export function useAddRiskControl() {
  const queryClient = useQueryClient();
  return useMutation<RiskControl, Error, { itemId: number; data: RiskControlCreate }>({
    mutationFn: ({ itemId, data }) => riskService.addControl(itemId, data),
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.items() });
    },
  });
}

export function useUpdateRiskControl() {
  const queryClient = useQueryClient();
  return useMutation<RiskControl, Error, { controlId: number; itemId: number; patch: RiskControlPatch }>({
    mutationFn: ({ controlId, patch }) => riskService.updateControl(controlId, patch),
    onSuccess: (_data, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: riskQueryKeys.items() });
    },
  });
}
