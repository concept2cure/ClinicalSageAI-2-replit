import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ProjectTaskBoard } from './ProjectTaskBoard';
import { ReviewPulseDashboard } from './ReviewPulseDashboard';
import { SubmissionBuilder } from '../submission/SubmissionBuilder';
import {
  type AgencyCommunicationEvent,
} from '../../models/agencyPortal';
import { useCommunicationCenterData } from '../../hooks/useCommunicationCenterData';
import { MessageSquare, BellRing, ShieldCheck, Send, Workflow, Clock3 } from 'lucide-react';

interface Props {
  projectId?: string;
  projectName?: string;
  submissionType?: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA';
  artifacts: Array<{ id: string; title: string; ctdSection?: string; status: string; version: number }>;
}

type CenterTab =
  | 'overview'
  | 'tasks'
  | 'collaboration'
  | 'correspondence'
  | 'submission_agency_portal'
  | 'publishops';

export function CommunicationCenter({ projectId, projectName, submissionType = 'NDA', artifacts }: Props) {
  const [activeTab, setActiveTab] = useState<CenterTab>('overview');
  const { authorityProfiles, agencyEvents, openAgencyEvents, publishOpsServices, loading } =
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Communication Center</h2>
            <p className="text-xs text-stone-500">
              Operational control room for tasks, collaboration, correspondence, final-mile submission, and C2C PublishOps.
            </p>
            {loading && <p className="text-[11px] text-stone-400">Refreshing scoped operational data…</p>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="border-blue-200 text-blue-700">{openEvents} unresolved agency events</Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700">{responseDueSoon} response items due</Badge>
            <Badge variant="outline" className="border-emerald-200 text-emerald-700">Authority-aware lane active</Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ['overview', 'Overview'],
              ['tasks', 'Tasks'],
              ['collaboration', 'Collaboration'],
              ['correspondence', 'Correspondence'],
              ['submission_agency_portal', 'Submission & Agency Portal'],
              ['publishops', 'C2C PublishOps'],
            ] as Array<[CenterTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                activeTab === id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <OverviewCard icon={<Workflow className="h-4 w-4 text-blue-600" />} title="Operational Graph" body="Tasks, threads, and correspondence map into one project timeline with linked artifacts and submissions." />
          <OverviewCard icon={<BellRing className="h-4 w-4 text-amber-600" />} title="Notification Routing" body="Assignments, approvals, validation failures, acknowledgments, and PublishOps changes route to source objects." />
          <OverviewCard icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />} title="Visibility and Audit" body={`Visibility tiers in use: ${visibilityTiers.join(', ')}. Collaboration and agency events are auditable.`} />
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <ProjectTaskBoard projectId={projectId ?? ''} compact={false} />
        </div>
      )}

      {activeTab === 'collaboration' && (
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
      )}

      {activeTab === 'correspondence' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-stone-900">Agency Communication Events</h3>
          {agencyEvents.map(event => (
            <CorrespondenceRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {activeTab === 'submission_agency_portal' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ThreadLaneCard
              title="Authority profiles"
              rows={authorityProfiles.map(
                profile => `${profile.authority} / ${profile.centerOrDivision} — ${profile.submissionTransport}`
              )}
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
      )}

      {activeTab === 'publishops' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-stone-900">C2C PublishOps</h3>
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200" variant="outline">Managed service lane</Badge>
          </div>
          <p className="text-xs text-stone-600">
            Entitlement-aware service queue for technical publishing, compile, validation remediation, dispatch, acknowledgment monitoring, and response support.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(publishOpsServices.length > 0
              ? publishOpsServices.map(service => `${service.status} · ${service.serviceRequestTitle}`)
              : ['No managed service requests yet']).map(state => (
              <div key={state} className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-700">
                <Clock3 className="mr-1 inline h-3 w-3 text-stone-500" />
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
      )}
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
