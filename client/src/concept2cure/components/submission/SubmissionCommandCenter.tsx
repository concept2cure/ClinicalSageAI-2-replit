/**
 * SubmissionCommandCenter — Unified view of submission blockers, milestones,
 * approval bottlenecks, workload distribution, and upcoming deadlines.
 *
 * Consumes hooks from useSubmissionOps.ts that wrap /api/submission-ops endpoints.
 * Follows Claude UI principles: calm, minimal, stone palette, progressive disclosure.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useBlockers,
  useResolveBlocker,
  useMilestones,
  useApprovalBottlenecks,
  useWorkload,
  useDueSoon,
  usePackages,
} from '../../hooks/useSubmissionOps';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Flag,
  Users,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface SubmissionCommandCenterProps {
  projectId: number;
  packageId?: string;
}

// ── Severity badge ──────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-stone-100 text-stone-800 border-stone-200',
  high: 'bg-stone-100 text-stone-700 border-stone-200',
  medium: 'bg-stone-100 text-stone-700 border-stone-200',
  low: 'bg-stone-50 text-stone-600 border-stone-200',
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = (severity || 'medium').toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium capitalize', SEVERITY_STYLES[s] || SEVERITY_STYLES.medium)}
    >
      {s}
    </Badge>
  );
}

// ── Milestone status badge ──────────────────────────────────────────────────

const MILESTONE_STYLES: Record<string, string> = {
  completed: 'bg-stone-100 text-stone-800 border-stone-200',
  in_progress: 'bg-stone-100 text-stone-700 border-stone-200',
  pending: 'bg-stone-50 text-stone-500 border-stone-200',
  overdue: 'bg-stone-100 text-stone-800 border-stone-200',
  blocked: 'bg-stone-100 text-stone-700 border-stone-200',
};

function MilestoneStatusBadge({ status }: { status: string }) {
  const s = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium capitalize', MILESTONE_STYLES[s] || MILESTONE_STYLES.pending)}
    >
      {status?.replace(/_/g, ' ') || 'pending'}
    </Badge>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-stone-200 shadow-none">
      <CardHeader className="py-2.5 px-4 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-stone-500" />
            <CardTitle className="text-[13px] font-medium text-stone-800">{title}</CardTitle>
            {count !== undefined && (
              <span className="text-[10px] text-stone-400 font-normal">({count})</span>
            )}
          </div>
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
          )}
        </div>
      </CardHeader>
      {open && <CardContent className="px-4 pt-0 pb-3">{children}</CardContent>}
    </Card>
  );
}

// ── Blockers section ────────────────────────────────────────────────────────

function BlockersSection({ projectId }: { projectId: number }) {
  const blockers = useBlockers({ projectId });
  const resolve = useResolveBlocker();
  const { toast } = useToast();

  const handleResolve = useCallback(
    (blockerId: string) => {
      resolve.mutate(
        { blockerId, status: 'resolved' },
        {
          onSuccess: () => toast({ title: 'Blocker resolved', variant: 'default' }),
          onError: (err: Error) =>
            toast({ title: 'Failed to resolve blocker', description: err.message, variant: 'destructive' }),
        }
      );
    },
    [resolve, toast]
  );

  return (
    <DataStateWrapper
      data={blockers.data}
      isLoading={blockers.isLoading}
      error={blockers.error}
      emptyMessage="No active blockers"
    >
      {(items: any[]) => {
        const active = items.filter((b: any) => b.status !== 'resolved');
        if (active.length === 0) {
          return (
            <div className="flex items-center gap-2 py-2 text-[12px] text-stone-400">
              <CheckCircle className="w-3.5 h-3.5 text-stone-900" />
              No active blockers
            </div>
          );
        }
        return (
          <div className="space-y-2">
            {active.map((blocker: any) => (
              <div
                key={blocker.id}
                className="flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2.5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-medium text-stone-700 truncate">
                      {blocker.title || blocker.description || 'Untitled blocker'}
                    </span>
                    <SeverityBadge severity={blocker.severity || blocker.priority} />
                  </div>
                  {blocker.description && blocker.title && (
                    <p className="text-[11px] text-stone-500 line-clamp-2">{blocker.description}</p>
                  )}
                  {blocker.assignee && (
                    <span className="text-[10px] text-stone-400 mt-0.5 block">
                      Assigned: {blocker.assignee}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-stone-500 hover:text-stone-800 hover:bg-stone-100 shrink-0"
                  disabled={resolve.isPending}
                  onClick={() => handleResolve(blocker.id)}
                >
                  {resolve.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Resolve'
                  )}
                </Button>
              </div>
            ))}
          </div>
        );
      }}
    </DataStateWrapper>
  );
}

// ── Milestones section ──────────────────────────────────────────────────────

function MilestonesSection({ packageId }: { packageId?: string }) {
  const milestones = useMilestones(packageId);

  if (!packageId) {
    return (
      <div className="text-[12px] text-stone-400 py-2">
        Select a submission package to view milestones.
      </div>
    );
  }

  return (
    <DataStateWrapper
      data={milestones.data}
      isLoading={milestones.isLoading}
      error={milestones.error}
      emptyMessage="No milestones defined"
    >
      {(items: any[]) => (
        <div className="space-y-1">
          {items.map((ms: any, i: number) => (
            <div
              key={ms.id || i}
              className="flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2"
            >
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    ms.status === 'completed'
                      ? 'bg-stone-900'
                      : ms.status === 'overdue'
                        ? 'bg-stone-900'
                        : ms.status === 'in_progress'
                          ? 'bg-stone-900'
                          : 'bg-stone-300'
                  )}
                />
                {i < items.length - 1 && <div className="w-px h-4 bg-stone-200 mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-stone-700 truncate">
                    {ms.title || ms.name || `Milestone ${i + 1}`}
                  </span>
                  <MilestoneStatusBadge status={ms.status} />
                </div>
                {ms.dueDate && (
                  <span className="text-[10px] text-stone-400">
                    Due: {new Date(ms.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DataStateWrapper>
  );
}

// ── Approval bottlenecks section ────────────────────────────────────────────

function ApprovalBottlenecksSection({ projectId }: { projectId: number }) {
  const bottlenecks = useApprovalBottlenecks(projectId);

  return (
    <DataStateWrapper
      data={bottlenecks.data}
      isLoading={bottlenecks.isLoading}
      error={bottlenecks.error}
      emptyMessage="No pending approvals"
    >
      {(items: any[]) => {
        if (items.length === 0) {
          return (
            <div className="flex items-center gap-2 py-2 text-[12px] text-stone-400">
              <CheckCircle className="w-3.5 h-3.5 text-stone-900" />
              No pending approvals
            </div>
          );
        }
        return (
          <div className="space-y-1.5">
            {items.map((item: any, i: number) => (
              <div
                key={item.id || i}
                className="flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2"
              >
                <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium text-stone-700 truncate block">
                    {item.title || item.artifactTitle || item.documentTitle || 'Pending approval'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.approver && (
                      <span className="text-[10px] text-stone-400">Approver: {item.approver}</span>
                    )}
                    {item.waitingDays != null && (
                      <span className="text-[10px] text-stone-600">
                        {item.waitingDays}d waiting
                      </span>
                    )}
                  </div>
                </div>
                {item.priority && <SeverityBadge severity={item.priority} />}
              </div>
            ))}
          </div>
        );
      }}
    </DataStateWrapper>
  );
}

// ── Workload section ────────────────────────────────────────────────────────

function WorkloadSection({ projectId }: { projectId: number }) {
  const workload = useWorkload(projectId);

  return (
    <DataStateWrapper
      data={workload.data}
      isLoading={workload.isLoading}
      error={workload.error}
      emptyMessage="No workload data available"
    >
      {(items: any[]) => {
        if (items.length === 0) {
          return <div className="text-[12px] text-stone-400 py-2">No workload data.</div>;
        }
        return (
          <div className="space-y-1.5">
            {items.map((member: any, i: number) => {
              const load = member.taskCount || member.count || 0;
              const maxLoad = Math.max(...items.map((m: any) => m.taskCount || m.count || 1));
              const pct = maxLoad > 0 ? Math.round((load / maxLoad) * 100) : 0;
              return (
                <div key={member.userId || member.name || i} className="flex items-center gap-3 px-1">
                  <span className="text-[11px] text-stone-600 w-24 truncate shrink-0">
                    {member.name || member.userName || `User ${i + 1}`}
                  </span>
                  <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-200',
                        pct > 80 ? 'bg-stone-900' : 'bg-stone-400'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 w-8 text-right shrink-0">
                    {load}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }}
    </DataStateWrapper>
  );
}

// ── Due soon section ────────────────────────────────────────────────────────

function DueSoonSection({ projectId }: { projectId: number }) {
  const dueSoon = useDueSoon(projectId);

  return (
    <DataStateWrapper
      data={dueSoon.data}
      isLoading={dueSoon.isLoading}
      error={dueSoon.error}
      emptyMessage="No upcoming deadlines"
    >
      {(data: any) => {
        const items = Array.isArray(data) ? data : data?.items || data?.deadlines || [];
        if (items.length === 0) {
          return (
            <div className="flex items-center gap-2 py-2 text-[12px] text-stone-400">
              <CheckCircle className="w-3.5 h-3.5 text-stone-900" />
              No upcoming deadlines
            </div>
          );
        }
        return (
          <div className="space-y-1.5">
            {items.map((item: any, i: number) => {
              const dueDate = item.dueDate || item.deadline;
              const isUrgent =
                dueDate && new Date(dueDate).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
              return (
                <div
                  key={item.id || i}
                  className="flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2"
                >
                  <CalendarDays
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      isUrgent ? 'text-stone-900' : 'text-stone-400'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-medium text-stone-700 truncate block">
                      {item.title || item.name || 'Deadline'}
                    </span>
                    {dueDate && (
                      <span
                        className={cn(
                          'text-[10px]',
                          isUrgent ? 'text-stone-700 font-medium' : 'text-stone-400'
                        )}
                      >
                        {new Date(dueDate).toLocaleDateString()}
                        {isUrgent && ' — urgent'}
                      </span>
                    )}
                  </div>
                  {item.type && (
                    <Badge variant="outline" className="text-[10px] text-stone-500 border-stone-200">
                      {item.type}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        );
      }}
    </DataStateWrapper>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export const SubmissionCommandCenter: React.FC<SubmissionCommandCenterProps> = ({
  projectId,
  packageId: externalPackageId,
}) => {
  // If no packageId provided, attempt to fetch the first package for this project
  const packages = usePackages(externalPackageId ? undefined : projectId);
  const resolvedPackageId =
    externalPackageId || (packages.data && packages.data.length > 0 ? String(packages.data[0].id) : undefined);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Flag className="w-4 h-4 text-stone-500" />
        <h2 className="text-[13px] font-medium text-stone-800">Submission Command Center</h2>
      </div>

      <Section title="Active Blockers" icon={AlertTriangle} defaultOpen>
        <BlockersSection projectId={projectId} />
      </Section>

      <Section title="Milestones" icon={Flag} defaultOpen>
        <MilestonesSection packageId={resolvedPackageId} />
      </Section>

      <Section title="Approval Queue" icon={Clock}>
        <ApprovalBottlenecksSection projectId={projectId} />
      </Section>

      <Section title="Team Workload" icon={Users} defaultOpen={false}>
        <WorkloadSection projectId={projectId} />
      </Section>

      <Section title="Upcoming Deadlines" icon={CalendarDays}>
        <DueSoonSection projectId={projectId} />
      </Section>
    </div>
  );
};

export default SubmissionCommandCenter;
