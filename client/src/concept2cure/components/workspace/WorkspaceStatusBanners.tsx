/**
 * WorkspaceStatusBanners — Inline notification banners extracted from the
 * shell render block: pending-move, cut-blocked, browse-context, edit-context.
 */

import React, { useCallback } from 'react';
import {
  Scissors,
  X,
  AlertTriangle,
  FileText,
  Sparkles,
  ShieldCheck,
  Target,
  AppWindow,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeArtifact } from './ProjectFileTree';
import type { PendingMove, Phase4Panel } from './workspaceShellControllers';

// ── Pending-move banner ──────────────────────────────────────────────────────
export const PendingMoveBanner: React.FC<{
  pendingMove: PendingMove;
  onCancel: () => void;
}> = ({ pendingMove, onCancel }) => (
  <div className="flex items-center gap-2.5 px-4 h-10 border-b border-amber-200 bg-amber-50 shrink-0">
    <Scissors className="w-4 h-4 text-amber-600" />
    <span className="text-xs text-amber-900 font-medium truncate">
      Moving: {pendingMove.artifact.title}
    </span>
    {pendingMove.fromSection && (
      <span className="text-xs text-amber-700">from {pendingMove.fromSection}</span>
    )}
    {pendingMove.targetSection ? (
      <>
        <span className="text-xs text-amber-500">→</span>
        <span className="text-xs text-amber-800 font-semibold">{pendingMove.targetSection}</span>
      </>
    ) : (
      <span className="text-xs text-amber-600 ml-1">Select a dossier section to paste</span>
    )}
    {pendingMove.artifact.status === 'approved' && (
      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
        ⚠ Approved
      </span>
    )}
    <button
      onClick={onCancel}
      className="ml-auto text-xs text-amber-800 hover:text-red-600 font-medium flex items-center gap-1"
    >
      <X className="w-3.5 h-3.5" />
      Cancel
      <kbd className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-800 font-mono">
        Esc
      </kbd>
    </button>
  </div>
);

// ── Cut-blocked feedback ─────────────────────────────────────────────────────
export const CutBlockedBanner: React.FC<{
  message: string;
  onDismiss: () => void;
}> = ({ message, onDismiss }) => (
  <div className="flex items-center gap-2.5 px-4 h-9 border-b border-red-200 bg-red-50 shrink-0 animate-in fade-in duration-200">
    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
    <span className="text-xs text-red-800 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-auto">
      <X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
    </button>
  </div>
);

// ── Browse-mode context band ─────────────────────────────────────────────────
export const BrowseContextBand: React.FC<{
  artifact: TreeArtifact;
  onOpen: () => void;
}> = ({ artifact, onOpen }) => (
  <div className="flex items-center gap-2.5 px-4 h-9 border-b border-blue-100 bg-blue-50/40 shrink-0">
    <FileText className="w-3.5 h-3.5 text-blue-500" />
    <span className="text-xs text-blue-800 font-medium truncate">{artifact.title}</span>
    {artifact.ctdSection && (
      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100/60 text-blue-600 font-medium">
        {artifact.ctdSection}
      </span>
    )}
    <span
      className={cn(
        'text-xs px-1.5 py-0.5 rounded font-medium',
        artifact.status === 'locked'
          ? 'bg-red-100/60 text-red-600'
          : artifact.status === 'approved'
          ? 'bg-green-100/60 text-green-600'
          : 'bg-stone-100 text-stone-500'
      )}
    >
      {artifact.status || 'draft'}
    </span>
    <button
      onClick={onOpen}
      className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
    >
      Open →
    </button>
  </div>
);

// ── Edit-mode compact doc bar ────────────────────────────────────────────────
export const EditDocContextBar: React.FC<{
  artifact: TreeArtifact;
  phase4Panel: Phase4Panel;
  projectId?: string;
  industryMode?: string;
  onVerify: (id: string) => void;
  onTransform: (
    ctdSection?: string,
    templateKey?: string,
    artifactId?: string,
    artifactTitle?: string
  ) => void;
  onProgramTwin: () => void;
  onSubmissionApps: (ctdSection?: string, templateKey?: string) => void;
  onReviewPulse: () => void;
}> = ({
  artifact,
  phase4Panel,
  projectId,
  industryMode,
  onVerify,
  onTransform,
  onProgramTwin,
  onSubmissionApps,
  onReviewPulse,
}) => (
  <div className="flex items-center gap-2 px-4 h-8 border-b border-stone-100 bg-white shrink-0">
    <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
    <span className="text-xs font-semibold text-stone-800 truncate">{artifact.title}</span>
    {artifact.ctdSection && (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium shrink-0">
        {artifact.ctdSection}
      </span>
    )}
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
        artifact.status === 'locked'
          ? 'bg-red-50 text-red-600'
          : artifact.status === 'approved'
          ? 'bg-green-50 text-green-600'
          : artifact.status === 'review'
          ? 'bg-amber-50 text-amber-600'
          : 'bg-stone-50 text-stone-400'
      )}
    >
      {artifact.status || 'draft'}
    </span>
    {!!artifact.version && (
      <span className="text-[10px] text-stone-400 tabular-nums">v{artifact.version}</span>
    )}
    <div className="ml-auto flex items-center gap-0.5">
      <button
        onClick={() => onVerify(artifact.id)}
        className="p-1 text-stone-300 hover:text-emerald-600 rounded hover:bg-emerald-50 transition-colors"
        title="Verify document"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() =>
          onTransform(artifact.ctdSection, artifact.templateId, artifact.id, artifact.title)
        }
        className="p-1.5 text-stone-400 hover:text-violet-600 rounded-md hover:bg-blue-50"
        title="Transform Canvas"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onProgramTwin}
        className="p-1.5 text-stone-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
        title="Program Twin"
      >
        <Target className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onSubmissionApps(artifact.ctdSection, artifact.templateId)}
        className="p-1.5 text-stone-400 hover:text-orange-600 rounded-md hover:bg-orange-50"
        title="AI Assistants"
      >
        <AppWindow className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onReviewPulse}
        className={cn(
          'p-1 rounded transition-colors',
          phase4Panel === 'pulse'
            ? 'text-rose-600 bg-rose-50'
            : 'text-stone-300 hover:text-rose-600 hover:bg-rose-50'
        )}
        title="Review Pulse"
      >
        <Activity className="w-3.5 h-3.5" />
      </button>
      <NotificationCenter projectId={projectId} industryMode={industryMode} />
    </div>
  </div>
);

// Lazy-load NotificationCenter to avoid circular deps
const NotificationCenter = React.lazy(() =>
  import('./NotificationCenter').then(m => ({ default: m.NotificationCenter ?? m.default }))
);
