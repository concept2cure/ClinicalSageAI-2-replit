/**
 * Proof Certificate Page
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { ProofExplorer } from '../components/proof/ProofExplorer';
import { ZenSidebar } from '../components/sidebar/ZenSidebar';
import { NextActionsPanel } from '../components/workflow';
import { useProjects } from '../hooks/useProjects';
import { useCortexThreads } from '../hooks/useCortex';
import { Users, ClipboardCheck } from 'lucide-react';

export const ProofCertificatePage: React.FC = () => {
  const [, params] = useRoute('/concept2cure/proofs/:workflowRunId');
  const workflowRunId = params?.workflowRunId || '';

  const { projects: rawProjects } = useProjects();
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { data: threads } = useCortexThreads(activeProjectId);
  const [userProfile, setUserProfile] = useState<{
    role?: string;
    objectives?: string[];
    criteria?: string[];
  } | null>(null);

  useEffect(() => {
    if (!activeProjectId && rawProjects.length) {
      setActiveProjectId(rawProjects[0].id);
    }
  }, [activeProjectId, rawProjects]);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('concept2cure_user_profile');
      if (savedProfile) {
        setUserProfile(JSON.parse(savedProfile));
      }
    } catch (error) {
      console.warn('Unable to load user profile', error);
    }
  }, []);

  const projects = useMemo(
    () =>
      rawProjects.map((project) => ({
        id: project.id,
        name: project.name,
        type: project.submissionType,
        color: 'blue',
      })),
    [rawProjects]
  );

  const conversations = useMemo(
    () =>
      (threads || []).map((thread) => ({
        id: thread.id,
        title: thread.title || 'Conversation',
        projectId: thread.projectId || activeProjectId || 'unknown',
        timestamp: new Date(thread.updatedAt || Date.now()),
      })),
    [activeProjectId, threads]
  );

  const primaryObjective = userProfile?.objectives?.[0] || 'Submission readiness';
  const userRole = userProfile?.role || 'Regulatory Lead';

  const agentRoster = useMemo(
    () => [
      {
        id: 'agent-compliance',
        name: `${userRole} Agent`,
        status: 'Active',
        focus: primaryObjective,
      },
      {
        id: 'agent-evidence',
        name: 'Evidence Agent',
        status: 'Reviewing',
        focus: userProfile?.criteria?.[0] || 'Clinical evidence map',
      },
      {
        id: 'agent-quality',
        name: 'Quality Agent',
        status: 'Queued',
        focus: userProfile?.criteria?.[1] || 'Section audit checks',
      },
    ],
    [primaryObjective, userProfile, userRole]
  );

  const nextActions = useMemo(
    () => [
      {
        id: 'action-compile-section',
        name: `Advance ${primaryObjective.toLowerCase()}`,
        description: `Progress ${primaryObjective.toLowerCase()} with evidence alignment.`,
        stepType: 'TASK' as const,
        status: 'READY' as const,
        workflowName: 'Priority Objectives',
        workflowId: 'workflow-reg-prep-01',
        workflowRunId,
        slaDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        assigneeRole: userRole,
        order: 1,
        priority: 'HIGH' as const,
      },
      {
        id: 'action-review-claims',
        name: userProfile?.criteria?.[0] || 'Review efficacy claims',
        description: 'Validate claims against source evidence.',
        stepType: 'REVIEW' as const,
        status: 'IN_PROGRESS' as const,
        workflowName: 'Evidence Validation',
        workflowId: 'workflow-evd-02',
        workflowRunId,
        slaDueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
        assigneeRole: userRole,
        order: 2,
        priority: 'MEDIUM' as const,
      },
    ],
    [primaryObjective, userProfile, userRole, workflowRunId]
  );

  if (!workflowRunId) {
    return (
      <div className="min-h-screen bg-[#faf9f5] p-10">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Missing workflow run id.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50">
      <ZenSidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        conversations={conversations}
        projects={projects}
        activeConversationId={activeConversationId}
        activeProjectId={activeProjectId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onSelectProject={(id) => setActiveProjectId(id)}
        onNewChat={() => setActiveConversationId(undefined)}
        onOpenProjects={() => setActiveProjectId(undefined)}
        onOpenSearch={() => undefined}
        onOpenSettings={() => undefined}
        onDeleteConversation={() => undefined}
        onToggleStar={() => undefined}
        onTogglePin={() => undefined}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-semibold text-zinc-900">Proof Certificate</h1>
            <p className="text-sm text-zinc-500">Workflow run: {workflowRunId}</p>
          </div>
        </div>

        <div className="flex-1 flex min-w-0">
          <div className="flex-1 overflow-y-auto p-10">
            <div className="mx-auto max-w-5xl">
              <ProofExplorer workflowRunId={workflowRunId} />
            </div>
          </div>

          <div className="hidden lg:flex w-[360px] flex-col border-l border-zinc-200 bg-white animate-in fade-in slide-in-from-right-4">
            <div className="border-b border-zinc-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Users className="h-4 w-4 text-zinc-500" />
                Agent Workspace
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Active agents and priority actions across projects.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Active Agents
                </div>
                <div className="mt-3 space-y-2">
                  {agentRoster.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                    >
                      <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 truncate">{agent.name}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {agent.status} • {agent.focus}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <NextActionsPanel actions={nextActions} maxItems={2} showEmpty className="shadow-none" />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProofCertificatePage;
