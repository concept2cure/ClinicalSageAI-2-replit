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
import { WorkspaceCanvas } from '@/components/ui/workspace-primitives';
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
  /** Recent artifacts for the resume card — pass top 3 sorted by updatedAt */
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
  // Resume / Continue
  { id: 'recent', label: 'Recent Documents', description: 'Resume where you left off', icon: <Clock className="w-4 h-4" />, group: 'resume' },
  // Create
  { id: 'create', label: 'New Document', description: 'Start a blank or template-based document', icon: <FilePlus className="w-4 h-4" />, group: 'create' },
  { id: 'builder', label: 'Document Builder', description: 'Multi-step guided generation (CSR, CTD, IND)', icon: <Sparkles className="w-4 h-4" />, group: 'create' },
  { id: 'templates', label: 'Templates', description: 'Browse regulatory document templates', icon: <LayoutTemplate className="w-4 h-4" />, group: 'create' },
  // Manage
  { id: 'dossier', label: 'Dossier Map', description: 'CTD section structure and placement', icon: <Map className="w-4 h-4" />, group: 'manage' },
  { id: 'vault', label: 'Vault / Data Room', description: 'Upload evidence, search, ask questions', icon: <Archive className="w-4 h-4" />, group: 'manage' },
  // Finalize
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

// ─── Component ──────────────────────────────────────────────────────────────────

export const ToolsLanding: React.FC<ToolsLandingProps> = ({
  projectName,
  recentArtifacts,
  onAction,
  onResumeArtifact,
}) => {
  const groups = ['resume', 'create', 'manage', 'finalize'] as const;

  return (
    <WorkspaceCanvas maxWidth="2xl" testId="tools-landing">
      <div className="py-6">
        <h1 className="text-lg font-semibold text-zinc-900">Tools</h1>
        {projectName && (
          <p className="text-sm text-zinc-400 mt-0.5">{projectName}</p>
        )}
      </div>

      {/* ── Resume card: show recent artifacts if available ── */}
      {recentArtifacts && recentArtifacts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Continue</h2>
          <div className="space-y-1">
            {recentArtifacts.slice(0, 3).map(artifact => (
              <button
                key={artifact.id}
                onClick={() => onResumeArtifact?.(artifact.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-zinc-50 transition-colors group"
              >
                <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-800 block truncate">
                    {artifact.title}
                  </span>
                  {artifact.updatedAt && (
                    <span className="text-[11px] text-zinc-400">
                      {new Date(artifact.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {artifact.status && (
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded',
                      artifact.status === 'draft' && 'bg-zinc-100 text-zinc-600',
                      artifact.status === 'review' && 'bg-amber-50 text-amber-700',
                      artifact.status === 'approved' && 'bg-emerald-50 text-emerald-700',
                      artifact.status === 'locked' && 'bg-blue-50 text-blue-700'
                    )}
                  >
                    {artifact.status}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tool groups ── */}
      {groups.filter(g => g !== 'resume').map(groupKey => {
        const groupTools = TOOLS.filter(t => t.group === groupKey);
        if (groupTools.length === 0) return null;
        return (
          <div key={groupKey} className="mb-5">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              {GROUP_LABELS[groupKey]}
            </h2>
            <div className="space-y-0.5">
              {groupTools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => onAction(tool.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-zinc-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-zinc-500">{tool.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-800 block">{tool.label}</span>
                    <span className="text-[11px] text-zinc-400 block">{tool.description}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </WorkspaceCanvas>
  );
};

export default ToolsLanding;
