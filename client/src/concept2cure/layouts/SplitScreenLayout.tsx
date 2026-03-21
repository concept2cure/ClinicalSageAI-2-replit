/**
 * Concept2Cure - Split Screen Layout
 * 
 * Claude.ai-style split view with:
 * - Left panel: Chat with Lumen (always visible)
 * - Right panel: Artifact viewer (appears when artifact is active)
 * - Resizable divider
 * 
 * Mobile: Artifact panel becomes a full-screen overlay
 * Desktop: Side-by-side resizable panels
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { ChatPanel } from '../components/chat/ChatPanel';
import { ArtifactPanel } from '../components/artifacts/ArtifactPanel';
import { NextActionsPanel } from '../components/workflow';
import { cn } from '@/lib/utils';
import { GripVertical, ChevronLeft, Users, ClipboardCheck } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SPLIT SCREEN LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export const SplitScreenLayout: React.FC = () => {
  const { state, activeArtifact, setArtifactPanelWidth } = useProject();
  const { artifactPanelVisible, artifactPanelWidth } = state.ui;
  const userProfile = state.userProfile;
  const primaryObjective = userProfile?.objectives?.[0] || 'Submission readiness';
  const userRole = userProfile?.role || 'Regulatory Lead';

  const agentRoster = [
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
  ];

  const nextActions = [
    {
      id: 'action-compile-section',
      name: `Advance ${primaryObjective.toLowerCase()}`,
      description: `Progress ${primaryObjective.toLowerCase()} with evidence alignment.`,
      stepType: 'TASK' as const,
      status: 'READY' as const,
      workflowName: 'Priority Objectives',
      workflowId: 'workflow-reg-prep-01',
      workflowRunId: 'workflow-run-demo',
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
      workflowRunId: 'workflow-run-demo',
      slaDueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      assigneeRole: userRole,
      order: 2,
      priority: 'MEDIUM' as const,
    },
  ];

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const newWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;

      // Clamp between 20% and 80%
      const clampedWidth = Math.max(20, Math.min(80, newWidth));
      setArtifactPanelWidth(clampedWidth);
    },
    [isDragging, setArtifactPanelWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Calculate panel widths
  const chatWidth = artifactPanelVisible ? 100 - artifactPanelWidth : 100;
  const artifactWidth = artifactPanelVisible ? artifactPanelWidth : 0;

  // Check if we're on mobile (can also use useMediaQuery hook)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile: Full-screen artifact overlay
  if (isMobile) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-white">
        {/* Chat Panel - Full width on mobile */}
        <div className={cn(
          'flex-1 flex flex-col h-full overflow-hidden',
          artifactPanelVisible && 'hidden'
        )}>
          <ChatPanel />
        </div>

        {/* Artifact Panel - Full screen overlay on mobile */}
        {artifactPanelVisible && (
          <div className="fixed inset-0 z-30 flex flex-col bg-white animate-in slide-in-from-right duration-200">
            {/* Mobile artifact header */}
            <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-4">
              <button
                onClick={() => setArtifactPanelWidth(0)} // This will hide the panel
                className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to chat
              </button>
            </div>
            {/* Artifact content */}
            <div className="flex-1 overflow-hidden">
              <ArtifactPanel artifact={activeArtifact} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: Side-by-side panels
  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden bg-white">
      {/* Chat Panel (Left) */}
      <div
        className="flex flex-col h-full overflow-hidden transition-all duration-150 flex-1"
        style={artifactPanelVisible ? { width: `${chatWidth}%` } : undefined}
      >
        <ChatPanel />
      </div>

      {/* Resize Handle */}
      {artifactPanelVisible && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'relative flex w-1 cursor-col-resize items-center justify-center',
            'bg-zinc-200 hover:bg-blue-400 transition-colors',
            isDragging && 'bg-blue-500'
          )}
        >
          <div
            className={cn(
              'absolute z-10 flex h-12 w-5 items-center justify-center rounded',
              'bg-zinc-100 border border-zinc-300 shadow-sm',
              'hover:bg-zinc-200 transition-colors',
              isDragging && 'bg-blue-100 border-blue-400'
            )}
          >
            <GripVertical className="h-4 w-4 text-zinc-400" />
          </div>
        </div>
      )}

      {/* Artifact Panel (Right) */}
      {artifactPanelVisible && (
        <div
          className="flex flex-col h-full overflow-hidden border-l border-zinc-200 bg-zinc-50 transition-all duration-150"
          style={{ width: `${artifactWidth}%` }}
        >
          <ArtifactPanel artifact={activeArtifact} />
        </div>
      )}

      {!artifactPanelVisible && (
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
      )}
    </div>
  );
};

export default SplitScreenLayout;
