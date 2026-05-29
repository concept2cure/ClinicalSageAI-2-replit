/**
 * @fileoverview Labeling React Hooks
 * @module concept2cure/hooks/useLabeling
 * @version 1.0.0
 *
 * @description
 * React-query hooks for the labeling workstream. Mirrors useCMC: structured
 * query keys, query hooks for reads, mutation hooks that invalidate. Binds to
 * labelingService, which calls the live /api/mdx/labeling routes. No mocks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import labelingService, {
  type LabelingDoc,
  type LabelingDocDetail,
  type LabelingDocFilter,
  type LabelingDocCreate,
  type LabelingTranslation,
  type LabelingTransCreate,
  type LabelingTransPatch,
  type LabelingSymbol,
  type LabelingSymbolCreate,
  type LabelingCoverage,
} from '../services/labelingService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const labelingQueryKeys = {
  all: ['labeling'] as const,
  documents: () => [...labelingQueryKeys.all, 'documents'] as const,
  documentList: (filter: LabelingDocFilter) => [...labelingQueryKeys.documents(), 'list', filter] as const,
  document: (id: number) => [...labelingQueryKeys.documents(), id] as const,
  translations: (id: number) => [...labelingQueryKeys.document(id), 'translations'] as const,
  symbols: (id: number) => [...labelingQueryKeys.document(id), 'symbols'] as const,
  coverage: (id: number) => [...labelingQueryKeys.document(id), 'coverage'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** List labeling documents. The shell threads the canonical project id (from
 *  useProjects) through as the program filter, the same id space CMC scopes on. */
export function useLabelingDocuments(filter: LabelingDocFilter = {}) {
  return useQuery<LabelingDoc[]>({
    queryKey: labelingQueryKeys.documentList(filter),
    queryFn: () => labelingService.listDocuments(filter),
    staleTime: 2 * 60 * 1000,
  });
}

/** Single labeling document, with nested translations + symbols. */
export function useLabelingDocument(id: number | null) {
  return useQuery<LabelingDocDetail | null>({
    queryKey: labelingQueryKeys.document(id ?? -1),
    queryFn: () => (id ? labelingService.getDocument(id) : null),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

/** Translations for a document. */
export function useLabelingTranslations(id: number | null) {
  return useQuery<LabelingTranslation[]>({
    queryKey: labelingQueryKeys.translations(id ?? -1),
    queryFn: () => (id ? labelingService.listTranslations(id) : []),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

/** ISO 15223-1 symbols on a document. */
export function useLabelingSymbols(id: number | null) {
  return useQuery<LabelingSymbol[]>({
    queryKey: labelingQueryKeys.symbols(id ?? -1),
    queryFn: () => (id ? labelingService.listSymbols(id) : []),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

/** Translation coverage summary for a document. */
export function useLabelingCoverage(id: number | null) {
  return useQuery<LabelingCoverage | null>({
    queryKey: labelingQueryKeys.coverage(id ?? -1),
    queryFn: () => (id ? labelingService.getCoverage(id) : null),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCreateLabelingDocument() {
  const queryClient = useQueryClient();
  return useMutation<LabelingDoc, Error, LabelingDocCreate>({
    mutationFn: (data) => labelingService.createDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.documents() });
    },
  });
}

export function useUpdateLabelingDocument() {
  const queryClient = useQueryClient();
  return useMutation<LabelingDoc, Error, { id: number; patch: Partial<LabelingDocCreate> }>({
    mutationFn: ({ id, patch }) => labelingService.updateDocument(id, patch),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.documents() });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.document(id) });
    },
  });
}

export function useAddTranslation() {
  const queryClient = useQueryClient();
  return useMutation<LabelingTranslation, Error, { id: number; data: LabelingTransCreate }>({
    mutationFn: ({ id, data }) => labelingService.addTranslation(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.translations(id) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.coverage(id) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.document(id) });
    },
  });
}

export function useUpdateTranslation() {
  const queryClient = useQueryClient();
  return useMutation<LabelingTranslation, Error, { transId: number; docId: number; patch: LabelingTransPatch }>({
    mutationFn: ({ transId, patch }) => labelingService.updateTranslation(transId, patch),
    onSuccess: (_data, { docId }) => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.translations(docId) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.coverage(docId) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.document(docId) });
    },
  });
}

export function useAddSymbol() {
  const queryClient = useQueryClient();
  return useMutation<LabelingSymbol, Error, { id: number; data: LabelingSymbolCreate }>({
    mutationFn: ({ id, data }) => labelingService.addSymbol(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.symbols(id) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.document(id) });
    },
  });
}

export function useDeleteSymbol() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { symId: number; docId: number }>({
    mutationFn: ({ symId }) => labelingService.deleteSymbol(symId),
    onSuccess: (_data, { docId }) => {
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.symbols(docId) });
      queryClient.invalidateQueries({ queryKey: labelingQueryKeys.document(docId) });
    },
  });
}
