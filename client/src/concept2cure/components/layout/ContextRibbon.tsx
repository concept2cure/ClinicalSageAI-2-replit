/**
 * @fileoverview Context Ribbon - Thin Operator Bar
 * @module concept2cure/components/layout/ContextRibbon
 * @version 2.0.0
 *
 * @description
 * The Context Ribbon is a thin operator-level bar showing ONLY metadata
 * that no other component provides:
 * - Project context (name + workspace mode) — the anchor
 * - CORTEX connection status — operator-level
 * - Active users — operator-level
 *
 * Page-level concerns (deadline, risk) belong in WorkspaceStatusStrip.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Activity,
  CloudLightning,
  Target,
  Users,
  Zap,
  Mountain,
  ShieldCheck,
} from 'lucide-react';
import { WorkspaceStatusBadge, WORKFLOW_STATUS_CONFIG } from '@/components/ui/workspace-primitives';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ConnectionStatus = 'LIVE' | 'SYNCING' | 'OFFLINE';
export type WorkspaceMode = 'monitoring' | 'drafting' | 'review' | 'submission' | 'audit';

export interface ContextRibbonProps {
  /** Project name displayed as the anchor context */
  project?: string;
  /** Optional status label override */
  status?: string;
  /** Current workspace mode */
  workspaceMode?: WorkspaceMode;

  /** CORTEX connection status */
  connection?: ConnectionStatus;
  /** Timestamp of last sync */
  lastSyncTime?: string;

  /** Number of active collaborators */
  activeUsers?: number;

  /** Click handler for the project anchor */
  onProjectClick?: () => void;
  /** Click handler for the connection indicator */
  onConnectionClick?: () => void;

  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_CONFIG: Record<
  WorkspaceMode,
  {
    label: string;
    color: string;
    icon: React.ReactNode;
  }
> = {
  monitoring: {
    label: 'Monitoring',
    color: 'text-blue-600',
    icon: <Activity className="w-3 h-3" />,
  },
  drafting: { label: 'Drafting', color: 'text-violet-600', icon: <Target className="w-3 h-3" /> },
  review: { label: 'Review', color: 'text-amber-600', icon: <Activity className="w-3 h-3" /> },
  submission: {
    label: 'Submission',
    color: 'text-green-600',
    icon: <Mountain className="w-3 h-3" />,
  },
  audit: { label: 'Audit Mode', color: 'text-red-600', icon: <ShieldCheck className="w-3 h-3" /> },
};

/** Connection status mapped to WorkspaceStatusBadge-compatible configs */
const CONNECTION_STATUS_CONFIG: Record<
  ConnectionStatus,
  { key: string; label: string; color: string; icon: React.ReactNode }
> = {
  LIVE: {
    key: 'connected',
    label: 'Connected',
    color: 'bg-blue-100 text-blue-700',
    icon: <CloudLightning className="w-3 h-3" />,
  },
  SYNCING: {
    key: 'syncing',
    label: 'Syncing',
    color: 'bg-amber-100 text-amber-700',
    icon: <CloudLightning className="w-3 h-3 animate-pulse" />,
  },
  OFFLINE: {
    key: 'offline',
    label: 'Offline',
    color: 'bg-zinc-100 text-zinc-500',
    icon: <CloudLightning className="w-3 h-3" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ContextRibbon: React.FC<ContextRibbonProps> = ({
  project = 'Global Dashboard',
  status = 'Monitoring',
  workspaceMode = 'monitoring',
  connection = 'LIVE',
  lastSyncTime,
  activeUsers = 0,
  onProjectClick,
  onConnectionClick,
  className,
}) => {
  const modeConfig = MODE_CONFIG[workspaceMode];
  const connConfig = CONNECTION_STATUS_CONFIG[connection];

  return (
    <div
      className={cn(
        'h-8 bg-white/80 backdrop-blur-sm border-b border-zinc-100 flex items-center justify-between px-4 text-xs z-30 select-none',
        className
      )}
    >
      {/* ═══════ LEFT: PROJECT CONTEXT ═══════ */}
      <div className="flex items-center gap-3">
        <button
          onClick={onProjectClick}
          className="flex items-center gap-1.5 hover:bg-zinc-50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors duration-150"
        >
          <span className="font-medium text-zinc-700 text-[11px]">{project}</span>
          <span className="text-zinc-300">/</span>
          <span className={cn('font-medium text-[11px] flex items-center gap-1', modeConfig.color)}>
            {modeConfig.icon}
            {status || modeConfig.label}
          </span>
        </button>
      </div>

      {/* ═══════ RIGHT: OPERATOR TELEMETRY ═══════ */}
      <div className="flex items-center gap-3">
        {/* Active Users */}
        {activeUsers > 0 && (
          <>
            <div className="flex items-center gap-1 text-zinc-400">
              <Users className="w-3 h-3" />
              <span className="font-medium text-[11px]">{activeUsers}</span>
            </div>
            <div className="h-3 w-px bg-zinc-200" />
          </>
        )}

        {/* CORTEX Connection */}
        <button
          onClick={onConnectionClick}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-zinc-50 transition-colors duration-150"
          title={`AnA Cortex: ${connConfig.label}${lastSyncTime ? ` \u2022 Last sync: ${lastSyncTime}` : ''}`}
        >
          <Zap className="w-3 h-3 text-blue-500" />
          <span className="text-[10px] font-medium text-zinc-400 tracking-wide">CORTEX</span>
          <WorkspaceStatusBadge status={connConfig.key} config={connConfig} />
        </button>
      </div>
    </div>
  );
};

export default ContextRibbon;
