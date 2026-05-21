import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
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
  const [authorityProfiles, setAuthorityProfiles] = useState<AuthorityProfileItem[]>([]);
  const [agencyEvents, setAgencyEvents] = useState<AgencyCommunicationEvent[]>([]);
  const [publishOpsServices, setPublishOpsServices] = useState<PublishOpsServiceItem[]>([]);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [dataUnavailableReason, setDataUnavailableReason] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setDataUnavailable(false);
    setDataUnavailableReason(null);
    try {
      const parseRows = async (url: string) => {
        try {
          const res = await apiRequest('GET', url);
          if (res.status === 401) {
            return { rows: [], error: 'unauthorized' as const };
          }
          const payload = await res.json().catch(() => ({}));
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          return { rows, error: null as null };
        } catch (error: any) {
          return { rows: [], error: error?.message || 'request_failed' };
        }
      };

      const [authorityPayload, eventsPayload, servicesPayload] = await Promise.all([
        parseRows(`/api/concept2cure/projects/${projectId}/authority-profiles`),
        parseRows(`/api/concept2cure/projects/${projectId}/agency-communications`),
        parseRows(`/api/concept2cure/projects/${projectId}/publishops/services`),
      ]);

      setAuthorityProfiles(
        authorityPayload.rows.map((r: any) => ({
          id: r.id,
          authority: r.authority,
          centerOrDivision: r.centerOrDivision,
          submissionTransport: r.submissionTransport,
        }))
      );
      setAgencyEvents(eventsPayload.rows as AgencyCommunicationEvent[]);
      setPublishOpsServices(servicesPayload.rows as PublishOpsServiceItem[]);

      const firstError = authorityPayload.error || eventsPayload.error || servicesPayload.error;
      if (firstError) {
        setDataUnavailable(true);
        setDataUnavailableReason(firstError);
        toast({
          title: 'Communication Center data unavailable',
          description: 'Live backend data could not be loaded. Showing current persisted records only.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setDataUnavailable(true);
      setDataUnavailableReason(error?.message || 'request_failed');
      setAuthorityProfiles([]);
      setAgencyEvents([]);
      setPublishOpsServices([]);
      toast({
        title: 'Communication Center data unavailable',
        description: 'Live backend data could not be loaded. Showing current persisted records only.',
        variant: 'destructive',
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
    dataUnavailable,
    dataUnavailableReason,
    refetch: fetchAll,
  };
}
