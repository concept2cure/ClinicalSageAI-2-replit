/**
 * ToolsLanding — Secondary productivity workbench.
 *
 * Per the Final Document System Architecture Directive:
 * - Tools must expose: Resume, Recent, Create, Builder, Templates, Dossier, Vault, Review, Submit, HAQ
 * - FullDocumentBuilder is one tool, NOT the destination
 * - Tools should feel like a curated workbench, not a dashboard or app store
 *
 * Mental model: Project Home = conversation. Tools = making / continuing work.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  WorkspaceCanvas,
  PageTitleHeader,
  WorkspaceStatusBadge,
} from '@/components/ui/workspace-primitives';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/design-system/patterns/EmptyState';
import {
  FileText,
  FilePlus,
  Clock,
  Layers,
  LayoutTemplate,
  Map,
  Archive,
  ShieldCheck,
  Send,
  MessageSquareMore,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: 'resume' | 'create' | 'manage' | 'finalize';
}

interface ToolsLandingProps {
  projectName?: string;
  recentArtifacts?: Array<{
    id: string;
    title: string;
    status?: string;
    updatedAt?: string;
  }>;
  onAction: (toolId: string) => void;
  onResumeArtifact?: (artifactId: string) => void;
}

// ─── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: ToolCard[] = [
  { id: 'recent', label: 'Recent Documents', description: 'Resume where you left off', icon: <Clock className="w-4 h-4" />, group: 'resume' },
  { id: 'create', label: 'New Document', description: 'Start a blank or template-based document', icon: <FilePlus className="w-4 h-4" />, group: 'create' },
  { id: 'builder', label: 'Document Builder', description: 'Multi-step guided generation (CSR, CTD, IND)', icon: <Sparkles className="w-4 h-4" />, group: 'create' },
  { id: 'templates', label: 'Templates', description: 'Browse regulatory document templates', icon: <LayoutTemplate className="w-4 h-4" />, group: 'create' },
  { id: 'dossier', label: 'Dossier Map', description: 'CTD section structure and placement', icon: <Map className="w-4 h-4" />, group: 'manage' },
  { id: 'vault', label: 'References', description: 'Upload evidence, search, ask questions', icon: <Archive className="w-4 h-4" />, group: 'manage' },
  { id: 'review', label: 'Review', description: 'Quality, compliance, approval readiness', icon: <ShieldCheck className="w-4 h-4" />, group: 'finalize' },
  { id: 'submit', label: 'Submit', description: 'Submission readiness and export', icon: <Send className="w-4 h-4" />, group: 'finalize' },
  { id: 'haq', label: 'HAQ Response', description: 'Draft responses to Health Authority Questions', icon: <MessageSquareMore className="w-4 h-4" />, group: 'finalize' },
];

const GROUP_LABELS: Record<string, string> = {
  resume: 'Continue',
  create: 'Create',
  manage: 'Manage',
  finalize: 'Finalize',
};

const STATUS_TO_BADGE: Record<string, string> = {
  draft: 'drafting',
  review: 'in-review',
  approved: 'approved',
  locked: 'locked',
};

// ─── Component ──────────────────────────────────────────────────────────────────

export const ToolsLanding: React.FC<ToolsLandingProps> = ({
  projectName,
  recentArtifacts,
  onAction,
  onResumeArtifact,
}) => {
  const groups = ['resume', 'create', 'manage', 'finalize'] as const;

  return (
    <WorkspaceCanvas maxWidth="3xl" testId="tools-landing">
      <PageTitleHeader
        title="Tools"
        description={projectName || undefined}
      />

      {/* ── Resume card: show recent artifacts if available ── */}
      {recentArtifacts && recentArtifacts.length > 0 && (
        <div className="mb-6 mt-4" role="region" aria-label="Recent documents">
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Continue</h2>
          <div className="space-y-1">
            {recentArtifacts.slice(0, 3).map(artifact => (
              <Button
                key={artifact.id}
                variant="ghost"
                size="sm"
                onClick={() => onResumeArtifact?.(artifact.id)}
                aria-label={`Resume ${artifact.title}`}
                className="w-full justify-start text-left h-auto py-2.5 px-3 group"
              >
                <FileText className="w-4 h-4 text-stone-400 flex-shrink-0 mr-3" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-stone-800 block truncate">
                    {artifact.title}
                  </span>
                  {artifact.updatedAt && (
                    <span className="text-[11px] text-stone-400">
                      {new Date(artifact.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {artifact.status && (
                  <WorkspaceStatusBadge status={STATUS_TO_BADGE[artifact.status] || 'not-started'} />
                )}
                <ArrowRight className="w-3.5 h-3.5 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* ── No recent artifacts ── */}
      {(!recentArtifacts || recentArtifacts.length === 0) && (
        <div className="mb-6 mt-4">
          <EmptyState
            title="Ready to start"
            description="Create your first document below, or ask AnA to draft one for you."
          />
        </div>
      )}

      {/* ── Tool groups ── */}
      <nav aria-label="Tools workbench">
        {groups.filter(g => g !== 'resume').map(groupKey => {
          const groupTools = TOOLS.filter(t => t.group === groupKey);
          if (groupTools.length === 0) return null;
          return (
            <div key={groupKey} className="mb-5" role="group" aria-label={GROUP_LABELS[groupKey]}>
              <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                {GROUP_LABELS[groupKey]}
              </h2>
              <div className="space-y-0.5">
                {groupTools.map(tool => (
                  <Button
                    key={tool.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(tool.id)}
                    aria-label={`${tool.label}: ${tool.description}`}
                    data-testid={`tool-${tool.id}`}
                    className="w-full justify-start text-left h-auto py-2.5 px-3 group"
                  >
                    <div className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center flex-shrink-0 mr-3">
                      <span className="text-stone-500">{tool.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-stone-800 block">{tool.label}</span>
                      <span className="text-[11px] text-stone-400 block">{tool.description}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </WorkspaceCanvas>
  );
};

export default ToolsLanding;
