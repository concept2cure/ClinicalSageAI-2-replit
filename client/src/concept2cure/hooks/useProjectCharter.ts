/**
 * Project Charter Hooks — TanStack Query bindings for /api/charter
 *
 * Provides hooks for:
 *   - Charter CRUD (create, read, update, approve)
 *   - Charter sections (read, update)
 *   - Timeline phases (read, update)
 *   - Commitments (CRUD, sign, complete, waive)
 *   - Regulatory meetings (create, read, complete)
 *   - Project health dashboard
 *   - Charter audit trail
 *
 * @module concept2cure/hooks/useProjectCharter
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type {
  ProjectCharter,
  CharterSection,
  TimelinePhase,
  ProjectCommitment,
  RegulatoryMeeting,
  CharterAuditEvent,
  ProjectHealthSummary,
} from '@/concept2cure/types/charter';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEY FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export const charterKeys = {
  all: ['charter'] as const,
  project: (projectId: number) => [...charterKeys.all, 'project', projectId] as const,
  sections: (charterId: number) => [...charterKeys.all, 'sections', charterId] as const,
  timeline: (charterId: number) => [...charterKeys.all, 'timeline', charterId] as const,
  commitments: (projectId: number) => [...charterKeys.all, 'commitments', projectId] as const,
  commitmentsDue: (projectId: number) => [...charterKeys.all, 'commitments-due', projectId] as const,
  meetings: (charterId: number) => [...charterKeys.all, 'meetings', charterId] as const,
  health: (projectId: number) => [...charterKeys.all, 'health', projectId] as const,
  audit: (charterId: number) => [...charterKeys.all, 'audit', charterId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the project charter for a given project.
 */
export function useProjectCharter(projectId: number | null) {
  return useQuery<ProjectCharter>({
    queryKey: charterKeys.project(projectId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/project/${projectId}`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Fetch all sections for a charter.
 */
export function useCharterSections(charterId: number | null) {
  return useQuery<CharterSection[]>({
    queryKey: charterKeys.sections(charterId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/${charterId}/sections`);
      return res.json();
    },
    enabled: !!charterId,
    staleTime: 60_000,
  });
}

/**
 * Fetch timeline phases for a charter.
 */
export function useCharterTimeline(charterId: number | null) {
  return useQuery<TimelinePhase[]>({
    queryKey: charterKeys.timeline(charterId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/${charterId}/timeline`);
      return res.json();
    },
    enabled: !!charterId,
    staleTime: 60_000,
  });
}

/**
 * Fetch project commitments with optional status/category filters.
 */
export function useProjectCommitments(
  projectId: number | null,
  filters?: { status?: string; category?: string },
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category) params.set('category', filters.category);
  const qs = params.toString();

  return useQuery<ProjectCommitment[]>({
    queryKey: [...charterKeys.commitments(projectId ?? 0), filters] as const,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/project/${projectId}/commitments${qs ? `?${qs}` : ''}`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Fetch commitments due this week for a project.
 */
export function useCommitmentsDueThisWeek(projectId: number | null) {
  return useQuery<ProjectCommitment[]>({
    queryKey: charterKeys.commitmentsDue(projectId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/project/${projectId}/commitments/due-this-week`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Fetch regulatory meetings for a charter.
 */
export function useRegulatoryMeetings(charterId: number | null) {
  return useQuery<RegulatoryMeeting[]>({
    queryKey: charterKeys.meetings(charterId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/${charterId}/meetings`);
      return res.json();
    },
    enabled: !!charterId,
    staleTime: 60_000,
  });
}

/**
 * Fetch project health summary (proactive checks, at-risk, overdue, etc.).
 */
export function useProjectHealth(projectId: number | null) {
  return useQuery<ProjectHealthSummary>({
    queryKey: charterKeys.health(projectId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/project/${projectId}/health`);
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

/**
 * Fetch charter audit trail.
 */
export function useCharterAudit(charterId: number | null) {
  return useQuery<CharterAuditEvent[]>({
    queryKey: charterKeys.audit(charterId ?? 0),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/charter/${charterId}/audit`);
      return res.json();
    },
    enabled: !!charterId,
    staleTime: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new project charter.
 */
export function useCreateCharter(projectId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('POST', `/api/charter/project/${projectId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: charterKeys.project(projectId) });
        qc.invalidateQueries({ queryKey: charterKeys.health(projectId) });
      }
      toast({ title: 'Charter created', description: 'Project charter has been created successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create charter', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Update an existing charter.
 */
export function useUpdateCharter(charterId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('PUT', `/api/charter/${charterId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Charter updated', description: 'Charter has been updated successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update charter', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Approve a charter (transitions to approved status).
 */
export function useApproveCharter(charterId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { comment?: string }) => {
      const res = await apiRequest('PUT', `/api/charter/${charterId}/approve`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Charter approved', description: 'Charter has been approved.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Update a charter section's content.
 */
export function useUpdateSection(sectionId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { content?: string; status?: string }) => {
      const res = await apiRequest('PUT', `/api/charter/sections/${sectionId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Section updated', description: 'Section content saved.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update section', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Update a timeline phase.
 */
export function useUpdatePhase(phaseId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('PUT', `/api/charter/phases/${phaseId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Phase updated', description: 'Timeline phase has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update phase', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Create a new project commitment.
 */
export function useCreateCommitment(projectId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('POST', `/api/charter/project/${projectId}/commitments`, payload);
      return res.json();
    },
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: charterKeys.commitments(projectId) });
        qc.invalidateQueries({ queryKey: charterKeys.commitmentsDue(projectId) });
        qc.invalidateQueries({ queryKey: charterKeys.health(projectId) });
      }
      toast({ title: 'Commitment created', description: 'New commitment has been added.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create commitment', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Update an existing commitment.
 */
export function useUpdateCommitment(commitmentId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('PUT', `/api/charter/commitments/${commitmentId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Commitment updated', description: 'Commitment has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update commitment', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Sign a commitment (21 CFR Part 11 electronic signature).
 */
export function useSignCommitment(commitmentId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      signatureIntent: string;
      signatureMeaning: string;
      password: string;
    }) => {
      const res = await apiRequest('PUT', `/api/charter/commitments/${commitmentId}/sign`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Commitment signed', description: 'Electronic signature recorded.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Signature failed', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Mark a commitment as completed.
 */
export function useCompleteCommitment(commitmentId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      fulfillmentProof?: string;
      fulfillmentArtifactId?: number;
    }) => {
      const res = await apiRequest('PUT', `/api/charter/commitments/${commitmentId}/complete`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Commitment completed', description: 'Commitment has been marked as completed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to complete commitment', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Waive a commitment with justification.
 */
export function useWaiveCommitment(commitmentId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { waiverJustification: string }) => {
      const res = await apiRequest('PUT', `/api/charter/commitments/${commitmentId}/waive`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Commitment waived', description: 'Commitment has been waived with justification.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to waive commitment', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Create a new regulatory meeting.
 */
export function useCreateMeeting(charterId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest('POST', `/api/charter/${charterId}/meetings`, payload);
      return res.json();
    },
    onSuccess: () => {
      if (charterId) {
        qc.invalidateQueries({ queryKey: charterKeys.meetings(charterId) });
      }
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Meeting created', description: 'Regulatory meeting has been scheduled.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create meeting', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Mark a regulatory meeting as completed with outcomes.
 */
export function useCompleteMeeting(meetingId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      meetingMinutes?: string;
      keyDecisions?: string[];
      actionItems?: Array<{ action: string; owner: string; dueDate?: string; status: 'pending' | 'completed' }>;
      fdaFeedback?: string;
      majorConcerns?: string[];
    }) => {
      const res = await apiRequest('PUT', `/api/charter/meetings/${meetingId}/complete`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: charterKeys.all });
      toast({ title: 'Meeting completed', description: 'Meeting outcomes have been recorded.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to complete meeting', description: error.message, variant: 'destructive' });
    },
  });
}
