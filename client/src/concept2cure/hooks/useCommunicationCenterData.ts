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

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [authorityRes, eventsRes, servicesRes] = await Promise.all([
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/authority-profiles`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/agency-communications`),
        apiRequest('GET', `/api/concept2cure/projects/${projectId}/publishops/services`),
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

  return {
    loading,
    authorityProfiles,
    agencyEvents,
    openAgencyEvents,
    publishOpsServices,
    refetch: fetchAll,
  };
}
