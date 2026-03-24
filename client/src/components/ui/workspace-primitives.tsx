/**
 * Canonical Workspace Primitives
 *
 * These are the ONE approved set of layout components for the core biotech workflow.
 * All core workflow surfaces (Project Home, Dossier, Documents, Section Workspace,
 * Review, Submissions) MUST use these primitives instead of local layout JSX.
 *
 * @version 1.0.0
 * @module client/src/components/ui/workspace-primitives
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  XCircle,
  Lock,
  type LucideIcon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WORKSPACE HEADER — Canonical page/workspace header for all core surfaces
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceHeaderProps {
  /** Page/section title */
  title: string;
  /** Optional subtitle or context (module name, project name, etc.) */
  subtitle?: string;
  /** Optional title icon rendered before the title */
  titleIcon?: React.ReactNode;
  /** Breadcrumb segments before the title (e.g., section code) */
  breadcrumb?: string;
  /** Back button handler — omit to hide back button */
  onBack?: () => void;
  /** Status badge — pass a StatusBadgeConfig or use WorkspaceStatusBadge directly */
  status?: StatusBadgeConfig;
  /** Primary action buttons (right-aligned) */
  actions?: React.ReactNode;
  /** Additional metadata below title (readiness score, blocked state, etc.) */
  meta?: React.ReactNode;
  /** Type/classification badge (e.g., "IND", "NDA", project type) */
  typeBadge?: string;
  /** Additional className for outer div */
  className?: string;
  /** Test ID for testing */
  testId?: string;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  subtitle,
  titleIcon,
  breadcrumb,
  onBack,
  status,
  actions,
  meta,
  typeBadge,
  className,
  testId = 'workspace-header',
}) => (
  <div
    className={cn(
      'flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white shrink-0',
      className
    )}
    data-testid={testId}
  >
    {onBack && (
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        aria-label="Go back"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back</span>
      </button>
    )}
    {onBack && <span className="text-zinc-300">/</span>}
    {titleIcon}
    {breadcrumb && (
      <>
        <span className="text-xs font-mono text-zinc-400">{breadcrumb}</span>
        <span className="text-zinc-300">/</span>
      </>
    )}
    <span className="text-sm font-semibold text-zinc-900 truncate">{title}</span>
    {status && <WorkspaceStatusBadge status={status.key} config={status} />}
    {typeBadge && (
      <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-medium ml-2">
        {typeBadge}
      </span>
    )}
    {subtitle && <span className="text-xs text-zinc-500 ml-1">{subtitle}</span>}
    {meta && <div className="flex items-center gap-2 ml-2">{meta}</div>}
    {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. WORKSPACE HEADER RICH — For section-level headers with multi-line content
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceHeaderRichProps {
  /** Primary title */
  title: string;
  /** Breadcrumb segments */
  breadcrumb?: string;
  /** Back button handler */
  onBack?: () => void;
  /** Status badge */
  status?: StatusBadgeConfig;
  /** Primary action buttons (right-aligned) */
  actions?: React.ReactNode;
  /** Secondary info line (module, project name, readiness, etc.) */
  secondaryInfo?: React.ReactNode;
  className?: string;
  testId?: string;
}

export const WorkspaceHeaderRich: React.FC<WorkspaceHeaderRichProps> = ({
  title,
  breadcrumb,
  onBack,
  status,
  actions,
  secondaryInfo,
  className,
  testId = 'workspace-header-rich',
}) => (
  <div
    className={cn('border-b border-zinc-100 bg-white px-6 py-3', className)}
    data-testid={testId}
  >
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-zinc-700"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {breadcrumb && (
            <>
              <span className="text-xs font-mono text-zinc-400">{breadcrumb}</span>
              <span className="text-zinc-300">/</span>
            </>
          )}
          <h2 className="text-sm font-semibold text-zinc-900 truncate">{title}</h2>
          {status && <WorkspaceStatusBadge status={status.key} config={status} />}
        </div>
        {secondaryInfo && (
          <div className="flex items-center gap-2 mt-0.5">{secondaryInfo}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PAGE TITLE HEADER — For dashboard-level titles (Project Home, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

interface PageTitleHeaderProps {
  title: string;
  description?: string;
  /** Inline metadata badges */
  badges?: Array<{ label: string; value?: string }>;
  actions?: React.ReactNode;
  className?: string;
  testId?: string;
}

export const PageTitleHeader: React.FC<PageTitleHeaderProps> = ({
  title,
  description,
  badges,
  actions,
  className,
  testId = 'page-title-header',
}) => (
  <div className={cn('mb-8', className)} data-testid={testId}>
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        {badges && badges.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            {badges.map((b, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 font-medium"
              >
                {b.value ?? b.label}
              </span>
            ))}
          </div>
        )}
        {description && <p className="text-sm text-zinc-500 mt-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WORKSPACE STATUS BADGE — Canonical status indicator
// ═══════════════════════════════════════════════════════════════════════════════

export interface StatusBadgeConfig {
  key: string;
  label: string;
  color: string;
  icon?: React.ReactNode;
  bg?: string;
}

/** The ONE canonical status config for all workflow surfaces */
export const WORKFLOW_STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  'not-started': {
    key: 'not-started',
    label: 'Not Started',
    color: 'bg-zinc-100 text-zinc-600',
    icon: <Clock className="w-3 h-3" />,
    bg: 'bg-zinc-50',
  },
  drafting: {
    key: 'drafting',
    label: 'Drafting',
    color: 'bg-blue-100 text-blue-700',
    icon: <FileText className="w-3 h-3" />,
    bg: 'bg-blue-50',
  },
  'in-review': {
    key: 'in-review',
    label: 'In Review',
    color: 'bg-amber-100 text-amber-700',
    icon: <AlertTriangle className="w-3 h-3" />,
    bg: 'bg-amber-50',
  },
  approved: {
    key: 'approved',
    label: 'Approved',
    color: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 className="w-3 h-3" />,
    bg: 'bg-emerald-50',
  },
  blocked: {
    key: 'blocked',
    label: 'Blocked',
    color: 'bg-red-100 text-red-700',
    icon: <XCircle className="w-3 h-3" />,
    bg: 'bg-red-50',
  },
  locked: {
    key: 'locked',
    label: 'Locked',
    color: 'bg-purple-100 text-purple-700',
    icon: <Lock className="w-3 h-3" />,
    bg: 'bg-purple-50',
  },
  ready: {
    key: 'ready',
    label: 'Ready',
    color: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 className="w-3 h-3" />,
    bg: 'bg-emerald-50',
  },
  'needs-work': {
    key: 'needs-work',
    label: 'Needs Work',
    color: 'bg-amber-100 text-amber-700',
    icon: <AlertTriangle className="w-3 h-3" />,
    bg: 'bg-amber-50',
  },
  'needs-review': {
    key: 'needs-review',
    label: 'Needs Review',
    color: 'bg-amber-100 text-amber-700',
    icon: <Clock className="w-3 h-3" />,
    bg: 'bg-amber-50',
  },
};

interface WorkspaceStatusBadgeProps {
  status: string;
  config?: StatusBadgeConfig;
  className?: string;
}

export const WorkspaceStatusBadge: React.FC<WorkspaceStatusBadgeProps> = ({
  status,
  config,
  className,
}) => {
  const resolved = config || WORKFLOW_STATUS_CONFIG[status] || WORKFLOW_STATUS_CONFIG['not-started'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
        resolved.color,
        className
      )}
    >
      {resolved.icon}
      {resolved.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WORKSPACE CANVAS — The standard content area wrapper
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceCanvasProps {
  /** Max width constraint: '3xl' | '4xl' | '5xl' | 'full' */
  maxWidth?: '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  /** Background color */
  bg?: 'default' | 'white' | 'none';
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

const MAX_WIDTH_MAP = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-full',
};

const BG_MAP = {
  default: 'bg-zinc-50/50',
  white: 'bg-white',
  none: '',
};

export const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({
  maxWidth = '3xl',
  bg = 'default',
  children,
  className,
  testId = 'workspace-canvas',
}) => (
  <div
    className={cn('flex-1 flex flex-col min-h-0 overflow-y-auto', BG_MAP[bg], className)}
    data-testid={testId}
  >
    <div
      className={cn(
        'mx-auto w-full px-6 py-6 space-y-4',
        maxWidth !== 'full' && MAX_WIDTH_MAP[maxWidth]
      )}
    >
      {children}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SECTION PANEL — Standard card/panel for workflow sections
// ═══════════════════════════════════════════════════════════════════════════════

interface SectionPanelProps {
  /** Optional panel title */
  title?: string;
  /** Optional title icon */
  titleIcon?: React.ReactNode;
  /** Optional right-side header element (badge, action button, etc.) */
  headerRight?: React.ReactNode;
  /** Whether to suppress default padding (for list content) */
  noPadding?: boolean;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export const SectionPanel: React.FC<SectionPanelProps> = ({
  title,
  titleIcon,
  headerRight,
  noPadding = false,
  children,
  className,
  testId,
}) => (
  <div
    className={cn('rounded-xl border border-zinc-200 bg-white overflow-hidden', className)}
    data-testid={testId}
  >
    {title && (
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-100">
        {titleIcon}
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-5'}>{children}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WORKSPACE TAB BAR — Canonical tab bar for section-level navigation
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  testId?: string;
}

export const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  testId = 'workspace-tab-bar',
}) => (
  <div
    className={cn('border-b border-zinc-100 bg-zinc-50/50 px-6', className)}
    data-testid={testId}
  >
    <div className="flex gap-1" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
            activeTab === tab.id
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span
              className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                activeTab === tab.id ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-100 text-zinc-500'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. WORKSPACE ACTION BAR — Canonical action button group
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceActionBarProps {
  /** Left-aligned content (info, breadcrumbs, etc.) */
  left?: React.ReactNode;
  /** Right-aligned primary + secondary actions */
  children: React.ReactNode;
  className?: string;
}

export const WorkspaceActionBar: React.FC<WorkspaceActionBarProps> = ({
  left,
  children,
  className,
}) => (
  <div className={cn('flex items-center justify-between gap-4 px-4 py-2 border-b border-zinc-100 bg-white', className)}>
    {left && <div className="flex items-center gap-2">{left}</div>}
    <div className="flex items-center gap-2 ml-auto">{children}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. WORKSPACE STATUS STRIP — Readiness/progress strip
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkspaceStatusStripProps {
  /** Progress value (0-100) */
  progress?: number;
  /** Summary text (e.g., "3 of 6 sections ready") */
  summary?: string;
  /** Color override based on progress */
  variant?: 'default' | 'success' | 'warning' | 'danger';
  children?: React.ReactNode;
  className?: string;
}

export const WorkspaceStatusStrip: React.FC<WorkspaceStatusStripProps> = ({
  progress,
  summary,
  variant = 'default',
  children,
  className,
}) => {
  const progressColor =
    variant === 'success' || (progress != null && progress >= 80)
      ? 'bg-emerald-500'
      : variant === 'warning' || (progress != null && progress >= 50)
        ? 'bg-amber-500'
        : variant === 'danger' || (progress != null && progress < 50)
          ? 'bg-red-400'
          : 'bg-zinc-300';

  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        {summary && <p className="text-xs text-zinc-500">{summary}</p>}
        {children}
      </div>
      {progress != null && (
        <div className="w-full bg-zinc-100 rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all', progressColor)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SECONDARY INFO — Metadata dots pattern for headers
// ═══════════════════════════════════════════════════════════════════════════════

interface SecondaryInfoItemProps {
  children: React.ReactNode;
  className?: string;
}

export const SecondaryInfoItem: React.FC<SecondaryInfoItemProps> = ({ children, className }) => (
  <>
    <span className="text-zinc-300">·</span>
    <span className={cn('text-[11px] text-zinc-400', className)}>{children}</span>
  </>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 11. STATUS ICON MAP — Shared icon/color mapping for dossier-style trees
// ═══════════════════════════════════════════════════════════════════════════════

export const STATUS_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  approved: { icon: CheckCircle2, color: 'text-emerald-500' },
  'in-review': { icon: Clock, color: 'text-amber-500' },
  drafting: { icon: FileText, color: 'text-blue-500' },
  'not-started': { icon: Clock, color: 'text-zinc-300' },
  blocked: { icon: AlertTriangle, color: 'text-red-500' },
  locked: { icon: Lock, color: 'text-zinc-400' },
  ready: { icon: CheckCircle2, color: 'text-emerald-500' },
  'needs-work': { icon: AlertTriangle, color: 'text-amber-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 12. INSPECTOR PANEL — Right-rail inspector wrapper
// ═══════════════════════════════════════════════════════════════════════════════

interface InspectorPanelProps {
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  title,
  onClose,
  children,
  className,
  testId = 'inspector-panel',
}) => (
  <div
    className={cn(
      'w-72 shrink-0 border-l border-zinc-200 bg-white flex flex-col min-h-0',
      className
    )}
    data-testid={testId}
  >
    {title && (
      <div className="flex items-center justify-between px-3 h-11 border-b border-zinc-200 shrink-0">
        <span className="text-xs font-semibold text-zinc-700">{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Close inspector"
          >
            ×
          </button>
        )}
      </div>
    )}
    <div className="flex-1 overflow-y-auto p-3">{children}</div>
  </div>
);
