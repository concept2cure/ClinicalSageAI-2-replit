import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_AGENCY_EVENTS,
  DEFAULT_AUTHORITY_PROFILES,
  type AgencyCommunicationEvent,
} from '../models/agencyPortal';

type PublishOpsServiceState =
  | 'requested'
  | 'entitlement_review'
  | 'accepted'
  | 'awaiting_materials'
  | 'in_technical_publishing_review'
  | 'in_compile'
  | 'in_validation_remediation'
  | 'ready_for_dispatch'
  | 'dispatched_or_handed_off'
  | 'monitoring_acknowledgments'
  | 'response_support_active'
  | 'completed'
  | 'closed';

type SubmissionCenterState =
  | 'draft'
  | 'preparing'
  | 'ready_for_publish'
  | 'published'
  | 'submitted_to_gateway'
  | 'acknowledged_by_gateway'
  | 'accepted_by_authority'
  | 'rejected_or_remediation';

export interface SubmissionCenterItem {
  id: string;
  title: string;
  authority: string;
  submissionType: string;
  sequenceNumber?: string;
  status: SubmissionCenterState;
  dispatchReady: boolean;
  ectdPath?: string;
  updatedAt: string;
}

export interface PublishOpsServiceItem {
  id: string;
  status: PublishOpsServiceState;
  serviceRequestTitle: string;
  entitlementLevel: string;
  requestedByRole: string;
  requestedBy: string;
  operatorAssignee?: string;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityProfileItem {
  id: string;
  authority: string;
  centerOrDivision: string;
  submissionTransport: string;
}

export function useCommunicationCenterData(projectId?: string) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [authorityProfiles, setAuthorityProfiles] = useState<AuthorityProfileItem[]>(
    DEFAULT_AUTHORITY_PROFILES.map(p => ({
      id: p.id,
      authority: p.authority,
      centerOrDivision: p.centerOrDivision,
      submissionTransport: p.submissionTransport,
    }))
  );
  const [agencyEvents, setAgencyEvents] = useState<AgencyCommunicationEvent[]>(DEFAULT_AGENCY_EVENTS);
  const [publishOpsServices, setPublishOpsServices] = useState<PublishOpsServiceItem[]>([]);
  const [submissionCenterItems, setSubmissionCenterItems] = useState<SubmissionCenterItem[]>([]);
  const [authorityTemplates, setAuthorityTemplates] = useState<AuthorityProfileItem[]>([]);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [authorityRes, templatesRes, eventsRes, servicesRes, submissionCenterRes] = await Promise.all([
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/authority-profiles`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/authority-profiles/templates`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/agency-communications`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/publishops/services`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/submission-center/items`),
      ]);

      if (authorityRes.ok) {
        const payload = await authorityRes.json();
        const rows = payload.data || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setAuthorityProfiles(
            rows.map((r: any) => ({
              id: r.id,
              authority: r.authority,
              centerOrDivision: r.centerOrDivision,
              submissionTransport: r.submissionTransport,
            }))
          );
        }
      }
      if (templatesRes.ok) {
        const payload = await templatesRes.json();
        const rows = payload.data || [];
        if (Array.isArray(rows)) {
          setAuthorityTemplates(
            rows.map((r: any) => ({
              id: r.id,
              authority: r.authority,
              centerOrDivision: r.centerOrDivision,
              submissionTransport: r.submissionTransport,
            }))
          );
        }
      }

      if (eventsRes.ok) {
        const payload = await eventsRes.json();
        const rows = payload.data || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setAgencyEvents(rows);
        }
      }

      if (servicesRes.ok) {
        const payload = await servicesRes.json();
        const rows = payload.data || [];
        if (Array.isArray(rows)) setPublishOpsServices(rows);
      }

      if (submissionCenterRes.ok) {
        const payload = await submissionCenterRes.json();
        const rows = payload.data || [];
        if (Array.isArray(rows)) setSubmissionCenterItems(rows);
      }
    } catch {
      toast({
        title: 'Communication Center data unavailable',
        description: 'Using local scaffold data while backend data is unavailable.',
        variant: 'default',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAgencyEvents = useMemo(
    () => agencyEvents.filter(event => event.closureStatus !== 'closed'),
    [agencyEvents]
  );

  const createManualAgencyEvent = useCallback(async () => {
    if (!projectId) return false;
    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/projects/${projectId}/agency-communications`,
        {
          sourceType: 'manual_logged_event',
          communicationType: 'manual_intake',
          sourceChannel: 'Communication Center',
          linkedSectionCodes: [],
          linkedArtifactIds: [],
          urgency: 'medium',
          responseRequired: false,
          extractedIssues: [],
          humanReviewStatus: 'pending_review',
          closureStatus: 'open',
          visibilityTier: 'shared_client_c2c',
        }
      );
      if (!res.ok) throw new Error('Request failed');
      await fetchAll();
      toast({ title: 'Agency communication logged' });
      return true;
    } catch {
      toast({
        title: 'Could not log agency event',
        description: 'Check migration status and scoped permissions.',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAll, projectId, toast]);

  const createPublishOpsRequest = useCallback(async () => {
    if (!projectId) return false;
    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/projects/${projectId}/publishops/services`,
        {
          serviceRequestTitle: 'Managed technical publishing support',
          entitlementLevel: 'managed_publishops_service',
          requestedByRole: 'client_project_owner',
          status: 'requested',
        }
      );
      if (!res.ok) throw new Error('Request failed');
      await fetchAll();
      toast({ title: 'PublishOps request submitted' });
      return true;
    } catch {
      toast({
        title: 'Could not submit PublishOps request',
        description: 'Check migration status and scoped permissions.',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAll, projectId, toast]);

  const createSubmissionCenterItem = useCallback(async () => {
    if (!projectId) return false;
    try {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/submission-center/items`, {
        title: 'FDA eCTD sequence package',
        authority: 'FDA',
        submissionType: 'NDA',
        sequenceNumber: `${Date.now()}`.slice(-4),
        status: 'draft',
        dispatchReady: false,
      });
      if (!res.ok) throw new Error('Request failed');
      await fetchAll();
      toast({ title: 'Submission center item created' });
      return true;
    } catch {
      toast({
        title: 'Could not create submission center item',
        description: 'Check migration status and scoped permissions.',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAll, projectId, toast]);

  const transitionSubmissionCenterItem = useCallback(async (item: SubmissionCenterItem, status: SubmissionCenterState) => {
    if (!projectId) return false;
    try {
      const res = await apiRequest(
        'PATCH',
        `/api/concept2cure/projects/${projectId}/submission-center/items/${item.id}/status`,
        {
          status,
          dispatchReady: status !== 'draft' && status !== 'preparing' ? true : item.dispatchReady,
          sequenceNumber: item.sequenceNumber,
          ectdPath: item.ectdPath,
        }
      );
      if (!res.ok) throw new Error('Request failed');
      await fetchAll();
      toast({ title: `Submission item moved to ${status}` });
      return true;
    } catch {
      toast({
        title: `Could not move item to ${status}`,
        description: 'Ensure lifecycle order and eCTD metadata requirements are met.',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAll, projectId, toast]);

  return {
    loading,
    authorityProfiles,
    authorityTemplates,
    agencyEvents,
    openAgencyEvents,
    publishOpsServices,
    submissionCenterItems,
    refetch: fetchAll,
    createManualAgencyEvent,
    createPublishOpsRequest,
    createSubmissionCenterItem,
    transitionSubmissionCenterItem,
  };
}
