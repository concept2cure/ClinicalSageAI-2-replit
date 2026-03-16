/**
 * ProjectLauncher — the project-level bridge between the hub and track workspaces.
 *
 * When a user selects a project, they land here first.
 * The primary CTA opens the real track workspace (CERV2, CoAuthor, IVDR).
 * The internal regulatory-workspace is secondary/fallback.
 */

import React from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  FolderOpen,
  Sparkles,
} from 'lucide-react';

// ─── Track → Route mapping ───────────────────────────────────────────────────

interface TrackRoute {
  label: string;
  path: string;
  /** Query string appended to path (e.g. ?mode=cer) */
  query?: string;
}

const TRACK_ROUTES: Record<string, TrackRoute> = {
  // Device tracks → CERV2Page
  '510K': { label: 'Open 510(k) Workspace', path: '/cerv2' },
  PMA: { label: 'Open PMA Workspace', path: '/cerv2', query: '?mode=pma' },
  DE_NOVO: { label: 'Open De Novo Workspace', path: '/cerv2', query: '?mode=de_novo' },
  CER: { label: 'Open CER Workspace', path: '/cerv2', query: '?mode=cer' },
  HDE: { label: 'Open HDE Workspace', path: '/cerv2', query: '?mode=hde' },

  // Drug/biologic tracks → CoAuthor (eCTD)
  IND: { label: 'Open eCTD Co-Author', path: '/coauthor' },
  NDA: { label: 'Open eCTD Co-Author', path: '/coauthor' },
  BLA: { label: 'Open eCTD Co-Author', path: '/coauthor' },
  MAA: { label: 'Open eCTD Co-Author', path: '/coauthor' },
  ANDA: { label: 'Open eCTD Co-Author', path: '/coauthor' },

  // EU device
  IVDR: { label: 'Open IVDR Hub', path: '/ivdr' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  name: string;
  type: string;
  description?: string;
  sponsor?: string;
  product?: string;
  lastUpdated?: Date | string;
  conversationCount?: number;
}

interface ProjectLauncherProps {
  project: ProjectData;
  onOpenWorkspace: () => void;
  onOpenDocuments: () => void;
  onBack: () => void;
  onStartChat: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectLauncher: React.FC<ProjectLauncherProps> = ({
  project,
  onOpenWorkspace,
  onOpenDocuments,
  onBack,
  onStartChat,
}) => {
  const [, navigate] = useLocation();
  const trackRoute = TRACK_ROUTES[project.type];

  const handlePrimaryAction = () => {
    if (trackRoute) {
      // Map track type → correct module segment
      const moduleSegment = (() => {
        switch (project.type) {
          case '510K':
            return '510k';
          case 'PMA':
            return '510k?mode=pma';
          case 'DE_NOVO':
            return '510k?mode=de_novo';
          case 'CER':
            return '510k?mode=cer';
          case 'HDE':
            return '510k?mode=hde';
          // Drug/biologic tracks — not yet embedded, fall through to workspace
          default:
            return null;
        }
      })();
      if (moduleSegment) {
        navigate(`/concept2cure/project/${project.id}/${moduleSegment}`);
      } else {
        // Unsupported track → fallback to internal workspace
        onOpenWorkspace();
      }
    } else {
      // Generic/unmapped type → fallback to internal workspace
      onOpenWorkspace();
    }
  };

  const dotColor: Record<string, string> = {
    '510K': 'bg-blue-500',
    IND: 'bg-violet-500',
    NDA: 'bg-emerald-500',
    BLA: 'bg-teal-500',
    PMA: 'bg-orange-500',
    CER: 'bg-pink-500',
    MAA: 'bg-indigo-500',
    DE_NOVO: 'bg-cyan-500',
    IVDR: 'bg-amber-500',
  };

  const typeLabel: Record<string, string> = {
    '510K': '510(k) Submission',
    IND: 'Investigational New Drug',
    NDA: 'New Drug Application',
    BLA: 'Biologics License Application',
    PMA: 'Premarket Approval',
    CER: 'Clinical Evaluation Report',
    MAA: 'Marketing Authorization Application',
    DE_NOVO: 'De Novo Classification',
    ANDA: 'Abbreviated NDA',
    IVDR: 'In Vitro Diagnostic Regulation',
    HDE: 'Humanitarian Device Exemption',
  };

  const formattedDate = project.lastUpdated
    ? new Date(project.lastUpdated).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // ─── Secondary tools list ──────────────────────────────────────────────────

  const tools = [
    trackRoute ? { label: 'Open Project Workspace', action: onOpenWorkspace, live: true } : null,
    {
      label: 'Open Documents',
      action: onOpenDocuments,
      live: true,
    },
    { label: 'Ask RI', action: onStartChat, live: true },
  ].filter(Boolean) as { label: string; action: () => void; live: boolean }[];

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/30">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Back */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Projects
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('w-2 h-2 rounded-full', dotColor[project.type] ?? 'bg-zinc-400')} />
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {typeLabel[project.type] ?? project.type}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
            {formattedDate && <span>Created {formattedDate}</span>}
            {project.conversationCount != null && (
              <span>
                {project.conversationCount} conversation{project.conversationCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Primary + Secondary CTAs */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={handlePrimaryAction}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            {trackRoute?.label ?? 'Open Project Workspace'}
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>

          {tools.map(tool => (
            <button
              key={tool.label}
              onClick={tool.action}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
            >
              {tool.label === 'Open Project Workspace' && (
                <FolderOpen className="w-4 h-4 text-zinc-400" />
              )}
              {tool.label === 'Open Documents' && <FileText className="w-4 h-4 text-zinc-400" />}
              {tool.label === 'Ask RI' && <MessageSquare className="w-4 h-4 text-zinc-400" />}
              {tool.label}
            </button>
          ))}
        </div>

        {/* Available Tools table */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Available Tools
          </h2>
          <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-zinc-100">
                <ToolRow label="510(k) Workspace" status="Live" href="/cerv2" />
                <ToolRow label="eCTD Co-Author" status="Early Access" href="/coauthor" />
                <ToolRow label="Precedent Search" status="Live" href="/cerv2" />
                <ToolRow label="Document Vault" status="Live" href="/vault" />
                <ToolRow label="IVDR Hub" status="Available" href="/ivdr" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ToolRow: React.FC<{ label: string; status: string; href: string }> = ({
  label,
  status,
  href,
}) => {
  const statusColor =
    status === 'Live'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'Early Access'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-zinc-100 text-zinc-500';

  return (
    <tr
      onClick={() => {
        window.location.href = href;
      }}
      className="cursor-pointer hover:bg-zinc-50 transition-colors"
    >
      <td className="px-4 py-2.5 font-medium text-zinc-900">{label}</td>
      <td className="px-4 py-2.5">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', statusColor)}>
          {status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <ChevronRight className="w-4 h-4 text-zinc-400 inline-block" />
      </td>
    </tr>
  );
};

export default ProjectLauncher;
