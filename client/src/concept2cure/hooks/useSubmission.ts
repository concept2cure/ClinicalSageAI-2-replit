/**
 * @fileoverview Submission Gateway React Hooks
 * @module concept2cure/hooks/useSubmission
 * @version 1.0.0
 *
 * @description
 * React-query hooks for the submission gateway workstream. Mirrors useTasking /
 * useRisk: structured query keys, query hooks for reads, mutation hooks that
 * invalidate the right keys. Binds to submissionService, which calls the live
 * /api/mdx/gateways/* routes. No mocks.
 *
 * This is the transmittal / acknowledgement / pre-flight-findings layer — the
 * "press send to the agency" step — distinct from the package + section +
 * readiness management that the 'submissions' layoutMode already owns via
 * /api/submission-ops/* (useSubmissionOps).
 *
 * Scoping: every gateway route resolves the org id server-side from the
 * authenticated session. No client org param is sent. An optional program UUID
 * narrows the transmittals list to one program; the default is org-wide, which
 * is the correct default for an agency-gateway dashboard.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import submissionService, {
  type Gateway,
  type Transmittal,
  type TransmittalFilter,
  type TransmitInput,
  type GatewayStatusResult,
  type ValidationFinding,
} from '../services/submissionService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const submissionQueryKeys = {
  all: ['submission-gateway'] as const,
  gateways: (environment: string) => [...submissionQueryKeys.all, 'gateways', environment] as const,
  transmittals: () => [...submissionQueryKeys.all, 'transmittals'] as const,
  transmittalList: (filter: TransmittalFilter) =>
    [...submissionQueryKeys.transmittals(), 'list', filter] as const,
  transmittal: (id: number) => [...submissionQueryKeys.transmittals(), id] as const,
  status: (id: number) => [...submissionQueryKeys.transmittal(id), 'status'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** List every gateway with its per-org configuration status. */
export function useGateways(environment: 'staging' | 'production' = 'production') {
  return useQuery<Gateway[]>({
    queryKey: submissionQueryKeys.gateways(environment),
    queryFn: () => submissionService.listGateways(environment),
    staleTime: 60 * 1000,
  });
}

/** List transmittals, most-recent first. Optional program / region / status
 *  filters. Org-scoped server-side. */
export function useTransmittals(filter: TransmittalFilter = {}) {
  return useQuery<Transmittal[]>({
    queryKey: submissionQueryKeys.transmittalList(filter),
    queryFn: () => submissionService.listTransmittals(filter),
    staleTime: 30 * 1000,
  });
}

/** Single transmittal with its validation findings. */
export function useTransmittal(id: number | null) {
  return useQuery<Transmittal | null>({
    queryKey: submissionQueryKeys.transmittal(id ?? -1),
    queryFn: () => (id != null ? submissionService.getTransmittal(id) : null),
    enabled: id != null,
    staleTime: 30 * 1000,
  });
}

/** Poll the live gateway status for a transmittal. Disabled until requested. */
export function useTransmittalStatus(id: number | null, enabled = false) {
  return useQuery<GatewayStatusResult | null>({
    queryKey: submissionQueryKeys.status(id ?? -1),
    queryFn: () => (id != null ? submissionService.getStatus(id) : null),
    enabled: id != null && enabled,
    staleTime: 10 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Transmit a package through a region's gateway. */
export function useTransmit() {
  const queryClient = useQueryClient();
  return useMutation<Transmittal, Error, TransmitInput>({
    mutationFn: (input) => submissionService.transmit(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: submissionQueryKeys.transmittals() });
    },
  });
}

/** Resolve a pre-flight / post-receipt validation finding. */
export function useResolveFinding() {
  const queryClient = useQueryClient();
  return useMutation<ValidationFinding, Error, { findingId: number; transmittalId: number; resolutionNote?: string }>({
    mutationFn: ({ findingId, resolutionNote }) =>
      submissionService.resolveFinding(findingId, resolutionNote),
    onSuccess: (_finding, { transmittalId }) => {
      queryClient.invalidateQueries({ queryKey: submissionQueryKeys.transmittal(transmittalId) });
      queryClient.invalidateQueries({ queryKey: submissionQueryKeys.transmittals() });
    },
  });
}
