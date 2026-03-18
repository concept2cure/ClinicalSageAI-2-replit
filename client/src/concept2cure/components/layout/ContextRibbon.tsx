/**
 * @fileoverview Context Ribbon - The Persistent Anchor
 * @module concept2cure/components/layout/ContextRibbon
 * @version 1.0.0
 *
 * @description
 * The Context Ribbon is the "North Star" that keeps users oriented:
 * - Always visible at the top of the workspace
 * - Shows current project/submission context
 * - Real-time risk level indicator
 * - Deadline countdown
 * - Lumen Cortex connection status
 *
 * THE SHERPA METAPHOR:
 * "The Context Ribbon is your compass and altimeter.
 * It shows where you are on the mountain, how much time until the storm,
 * and whether your guide (Lumen) is connected."
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Activity,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CloudLightning,
  Mountain,
  Target,
  Users,
  Zap,
  Wifi,
  WifiOff,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConnectionStatus = 'LIVE' | 'SYNCING' | 'OFFLINE';
export type WorkspaceMode = 'monitoring' | 'drafting' | 'review' | 'submission' | 'audit';

export interface ContextRibbonProps {
  // Project Context
  project?: string;
  status?: string;
  workspaceMode?: WorkspaceMode;

  // Deadlines
  deadline?: string; // Target date string
  daysRemaining?: number; // Pre-calculated days

  // Risk
  riskLevel?: RiskLevel;
  riskItems?: number; // Count of outstanding risks

  // Connection
  connection?: ConnectionStatus;
  lastSyncTime?: string;

  // Team
  activeUsers?: number;

  // Actions
  onProjectClick?: () => void;
  onRiskClick?: () => void;
  onConnectionClick?: () => void;

  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const RISK_CONFIG: Record<
  RiskLevel,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ReactNode;
    pulse: boolean;
  }
> = {
  LOW: {
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: <ShieldCheck className="w-4 h-4" />,
    pulse: false,
  },
  MEDIUM: {
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: <AlertTriangle className="w-4 h-4" />,
    pulse: false,
  },
  HIGH: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: <AlertTriangle className="w-4 h-4" />,
    pulse: true,
  },
  CRITICAL: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: <AlertTriangle className="w-4 h-4" />,
    pulse: true,
  },
};

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

const CONNECTION_CONFIG: Record<
  ConnectionStatus,
  {
    color: string;
    icon: React.ReactNode;
    label: string;
  }
> = {
  LIVE: {
    color: 'text-blue-500',
    icon: <CloudLightning className="w-4 h-4" />,
    label: 'Connected',
  },
  SYNCING: {
    color: 'text-amber-500',
    icon: <Wifi className="w-4 h-4 animate-pulse" />,
    label: 'Syncing...',
  },
  OFFLINE: { color: 'text-zinc-400', icon: <WifiOff className="w-4 h-4" />, label: 'Offline' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ContextRibbon: React.FC<ContextRibbonProps> = ({
  project = 'Global Dashboard',
  status = 'Monitoring',
  workspaceMode = 'monitoring',
  deadline,
  daysRemaining,
  riskLevel = 'LOW',
  riskItems,
  connection = 'LIVE',
  lastSyncTime,
  activeUsers = 0,
  onProjectClick,
  onRiskClick,
  onConnectionClick,
  className,
}) => {
  const riskConfig = RISK_CONFIG[riskLevel];
  const modeConfig = MODE_CONFIG[workspaceMode];
  const connConfig = CONNECTION_CONFIG[connection];

  // Calculate days if deadline is provided but daysRemaining isn't
  const days =
    daysRemaining ??
    (deadline
      ? Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null);

  return (
    <div
      className={cn(
        'h-12 bg-white border-b border-zinc-200 flex items-center justify-between px-6 text-xs shadow-sm z-30 select-none',
        className
      )}
    >
      {/* ═══════ LEFT: ACTIVE CONTEXT ═══════ */}
      <div className="flex items-center gap-4">
        {/* Context Indicator */}
        <div className="flex items-center gap-2 text-zinc-500 font-bold tracking-widest">
          <Activity className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px]">ACTIVE CONTEXT</span>
        </div>

        {/* Project / Status */}
        <button
          onClick={onProjectClick}
          className="flex items-center gap-2 hover:bg-zinc-50 rounded-lg px-2 py-1 -ml-2 transition-colors"
        >
          <span className="font-bold text-zinc-800 bg-zinc-100 px-3 py-1 rounded border border-zinc-200 shadow-sm">
            {project}
          </span>
          <span className="text-zinc-300">/</span>
          <span className={cn('font-medium uppercase flex items-center gap-1', modeConfig.color)}>
            {modeConfig.icon}
            {status || modeConfig.label}
          </span>
        </button>
      </div>

      {/* ═══════ RIGHT: HEALTH & TELEMETRY ═══════ */}
      <div className="flex items-center gap-4">
        {/* Deadline Countdown */}
        {days !== null && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
              days <= 7 && 'bg-red-50 border-red-200',
              days > 7 && days <= 14 && 'bg-amber-50 border-amber-200',
              days > 14 && days <= 30 && 'bg-blue-50 border-blue-200',
              days > 30 && 'bg-zinc-50 border-zinc-200'
            )}
          >
            <Clock
              className={cn(
                'w-3.5 h-3.5',
                days <= 7 && 'text-red-500',
                days > 7 && days <= 14 && 'text-amber-500',
                days > 14 && days <= 30 && 'text-blue-500',
                days > 30 && 'text-zinc-500'
              )}
            />
            <span className="text-zinc-600">DUE:</span>
            <span
              className={cn(
                'font-mono font-bold',
                days <= 7 && 'text-red-600',
                days > 7 && days <= 14 && 'text-amber-600',
                days > 14 && days <= 30 && 'text-blue-600',
                days > 30 && 'text-zinc-600'
              )}
            >
              {days}d
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-200" />

        {/* Risk Level */}
        <button
          onClick={onRiskClick}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors hover:shadow-sm',
            riskConfig.bgColor,
            riskConfig.borderColor
          )}
        >
          <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
            RISK:
          </span>
          <div className={cn(riskConfig.color, riskConfig.pulse && 'animate-pulse')}>
            {riskConfig.icon}
          </div>
          <span className={cn('font-black', riskConfig.color)}>{riskLevel}</span>
          {riskItems !== undefined && riskItems > 0 && (
            <span
              className={cn(
                'px-1.5 py-0.5 text-[10px] font-bold rounded-full',
                riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-200 text-zinc-600'
              )}
            >
              {riskItems}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-zinc-200" />

        {/* Active Users */}
        {activeUsers > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-medium">{activeUsers}</span>
              <span className="text-zinc-400">online</span>
            </div>
            <div className="h-6 w-px bg-zinc-200" />
          </>
        )}

        {/* RI Connection */}
        <button
          onClick={onConnectionClick}
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-zinc-50 transition-colors"
          title={`AnA Cortex: ${connConfig.label}${lastSyncTime ? ` • Last sync: ${lastSyncTime}` : ''}`}
        >
          <Zap className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px] font-bold text-zinc-500 tracking-wider">CORTEX</span>
          <div className={connConfig.color}>{connConfig.icon}</div>
          <span
            className={cn(
              'font-mono text-[10px]',
              connection === 'LIVE' ? 'text-blue-600' : 'text-zinc-400'
            )}
          >
            {connection}
          </span>
        </button>
      </div>
    </div>
  );
};

export default ContextRibbon;
