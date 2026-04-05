import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LoadingState, EmptyState } from '@/components/ui/statesV2';
import { ProjectTaskBoard } from './ProjectTaskBoard';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { SubmissionBuilder } from '../submission/SubmissionBuilder';
import {
  type AgencyCommunicationEvent,
} from '../../models/agencyPortal';
import { useCommunicationCenterData } from '../../hooks/useCommunicationCenterData';
import { MessageSquare, BellRing, ShieldCheck, Send, Workflow, Clock3, Inbox } from 'lucide-react';

interface Props {
  projectId?: string;
  projectName?: string;
  submissionType?: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA';
  artifacts: Array<{ id: string; title: string; ctdSection?: string; status: string; version: number }>;
}

export function CommunicationCenter({ projectId, projectName, submissionType = 'NDA', artifacts }: Props) {
  const { authorityProfiles, agencyEvents, openAgencyEvents, publishOpsServices, loading, dataUnavailable } =
    useCommunicationCenterData(projectId);

  const openEvents = useMemo(
    () => openAgencyEvents.length,
    [openAgencyEvents]
  );

  const responseDueSoon = useMemo(
    () => agencyEvents.filter(evt => evt.responseRequired && evt.dueDate).length,
    [agencyEvents]
  );

  const visibilityTiers = useMemo(() => {
    const tiers = new Set(agencyEvents.map(evt => evt.auditMetadata.visibilityTier));
    return Array.from(tiers);
  }, [agencyEvents]);

  const visibilityTierLabel = visibilityTiers.length > 0 ? visibilityTiers.join(', ') : 'none';

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">Communication Center</h2>
          <LoadingState
            message="Refreshing scoped operational data"
            testId="communication-center-loading"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Communication Center</h2>
            <p className="text-xs text-stone-500">
              Operational control room for tasks, collaboration, correspondence, final-mile submission, and C2C PublishOps.
            </p>
            {dataUnavailable && (
              <p className="text-[11px] text-amber-700" role="alert">Live communication-center feeds are currently unavailable.</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="border-blue-200 text-blue-700">{openEvents} unresolved agency events</Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700">{responseDueSoon} response items due</Badge>
            <Badge variant="outline" className="border-emerald-200 text-emerald-700">Authority-aware lane active</Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" aria-label="Communication Center sections">
        <TabsList className="flex flex-wrap gap-1.5 bg-transparent p-0">
          <TabsTrigger value="overview" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">Tasks</TabsTrigger>
          <TabsTrigger value="collaboration" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">Collaboration</TabsTrigger>
          <TabsTrigger value="correspondence" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">Correspondence</TabsTrigger>
          <TabsTrigger value="submission_agency_portal" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">Submission & Agency Portal</TabsTrigger>
          <TabsTrigger value="publishops" className="rounded-md border px-2.5 py-1 text-xs data-[state=active]:border-stone-900 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=inactive]:border-stone-200 data-[state=inactive]:bg-white data-[state=inactive]:text-stone-600 data-[state=inactive]:hover:bg-stone-50">C2C PublishOps</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <OverviewCard icon={<Workflow className="h-4 w-4 text-blue-600" />} title="Operational Graph" body="Tasks, threads, and correspondence map into one project timeline with linked artifacts and submissions." />
            <OverviewCard icon={<BellRing className="h-4 w-4 text-amber-600" />} title="Notification Routing" body="Assignments, approvals, validation failures, acknowledgments, and PublishOps changes route to source objects." />
            <OverviewCard icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />} title="Visibility and Audit" body={`Visibility tiers in use: ${visibilityTierLabel}. Collaboration and agency events are auditable.`} />
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-3">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <ProjectTaskBoard projectId={projectId ?? ''} compact={false} />
          </div>
        </TabsContent>

        <TabsContent value="collaboration" className="mt-3">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ThreadLaneCard
                title="Linked thread lanes"
                rows={[
                  'Project threads + section threads + artifact threads',
                  'Submission and correspondence-linked threads',
                  'Approvals requested + changes requested + escalation state',
                  'Task conversion from discussion with audit trail'
                ]}
              />
              <ThreadLaneCard
                title="Audience tiers"
                rows={[
                  'client_internal',
                  'c2c_internal',
                  'shared_client_c2c',
                  'publishops_only',
                  'restricted_legal_sensitive'
                ]}
              />
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <ReviewPulseDashboard projectId={projectId ?? ''} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="correspondence" className="mt-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-stone-900">Agency Communication Events</h3>
            {agencyEvents.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-10 w-10" />}
                title="No correspondence"
                description="No agency communication events have been recorded for this project yet."
                testId="correspondence-empty"
              />
            ) : (
              agencyEvents.map(event => (
                <CorrespondenceRow key={event.id} event={event} />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="submission_agency_portal" className="mt-3">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ThreadLaneCard
                title="Authority profiles"
                rows={authorityProfiles.length > 0
                  ? authorityProfiles.map(
                      profile => `${profile.authority} / ${profile.centerOrDivision} — ${profile.submissionTransport}`
                    )
                  : ['No authority profiles configured']
                }
              />
              <ThreadLaneCard
                title="Response workbench"
                rows={[
                  'Issue extraction + categorization from agency events',
                  'Affected section and artifact mapping',
                  'Task + collaboration thread generation',
                  'Response package assembly + outbound logging'
                ]}
              />
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <SubmissionBuilder
                projectId={projectId ?? ''}
                projectName={projectName}
                submissionType={submissionType}
                artifacts={artifacts}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="publishops" className="mt-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-stone-900">C2C PublishOps</h3>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">Managed service lane</Badge>
            </div>
            <p className="text-xs text-stone-600">
              Entitlement-aware service queue for technical publishing, compile, validation remediation, dispatch, acknowledgment monitoring, and response support.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {(publishOpsServices.length > 0
                ? publishOpsServices.map(service => `${service.status} · ${service.serviceRequestTitle}`)
                : ['No managed service requests yet']).map(state => (
                <div key={state} className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-700">
                  <Clock3 className="mr-1 inline h-3 w-3 text-stone-500" aria-hidden="true" />
                  {state}
                </div>
              ))}
            </div>
            <ThreadLaneCard
              title="Entitlement boundaries"
              rows={[
                'Core self-serve: baseline collaboration + internal tasks',
                'Advanced package/publishing tooling: technical preflight + packaging controls',
                'Managed PublishOps service: operator-executed compile/dispatch/monitoring'
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-semibold text-stone-900">{title}</h3>
      </div>
      <p className="mt-1.5 text-xs text-stone-600">{body}</p>
    </div>
  );
}

function ThreadLaneCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-stone-900">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map(row => (
          <li key={row} className="text-xs text-stone-600">
            <MessageSquare className="mr-1 inline h-3 w-3 text-stone-400" />
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CorrespondenceRow({ event }: { event: AgencyCommunicationEvent }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{event.sourceType}</Badge>
        <span className="text-xs font-medium text-stone-900">{event.communicationType}</span>
        <span className="ml-auto text-[11px] text-stone-500">{new Date(event.receivedDate).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-stone-600">Channel: {event.sourceChannel}</p>
      <p className="mt-0.5 text-xs text-stone-600">
        Linked submission: {event.linkedSubmissionId ?? '—'} · Package: {event.linkedPackageId ?? '—'}
      </p>
      {event.extractedIssues.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-700">
          {event.extractedIssues.map(issue => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CommunicationCenter;
