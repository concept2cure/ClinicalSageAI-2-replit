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
      'flex items-center gap-3 px-4 h-11 border-b border-stone-200 bg-white shrink-0',
      className
    )}
    data-testid={testId}
  >
    {onBack && (
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors"
        aria-label="Go back"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back</span>
      </button>
    )}
    {onBack && <span className="text-stone-300">/</span>}
    {titleIcon}
    {breadcrumb && (
      <>
        <span className="text-xs font-mono text-stone-400">{breadcrumb}</span>
        <span className="text-stone-300">/</span>
      </>
    )}
    <span className="text-sm font-semibold text-stone-900 truncate">{title}</span>
    {status && <WorkspaceStatusBadge status={status.key} config={status} />}
    {typeBadge && (
      <span className="text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium ml-2">
        {typeBadge}
      </span>
    )}
    {subtitle && <span className="text-xs text-stone-500 ml-1">{subtitle}</span>}
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
    className={cn('border-b border-stone-100 bg-white px-6 py-3', className)}
    data-testid={testId}
  >
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors text-stone-400 hover:text-stone-700"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {breadcrumb && (
            <>
              <span className="text-xs font-mono text-stone-400">{breadcrumb}</span>
              <span className="text-stone-300">/</span>
            </>
          )}
          <h2 className="text-sm font-semibold text-stone-900 truncate">{title}</h2>
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
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {badges && badges.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            {badges.map((b, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 font-medium"
              >
                {b.value ?? b.label}
              </span>
            ))}
          </div>
        )}
        {description && <p className="text-sm text-stone-500 mt-2">{description}</p>}
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
    color: 'bg-stone-100 text-stone-600',
    icon: <Clock className="w-3 h-3" />,
    bg: 'bg-stone-50',
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
    color: 'bg-stone-200 text-stone-700',
    icon: <Lock className="w-3 h-3" />,
    bg: 'bg-stone-100',
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
  default: 'bg-stone-50/50',
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
    className={cn('rounded-xl border border-stone-200 bg-white overflow-hidden', className)}
    data-testid={testId}
  >
    {title && (
      <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 border-b border-stone-100">
        {titleIcon}
        <span className="text-sm font-semibold text-stone-900">{title}</span>
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
    className={cn('border-b border-stone-100 bg-stone-50/50 px-6', className)}
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
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span
              className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                activeTab === tab.id ? 'bg-stone-200 text-stone-700' : 'bg-stone-100 text-stone-500'
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
  <div className={cn('flex items-center justify-between gap-4 px-4 py-2 border-b border-stone-100 bg-white', className)}>
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
          : 'bg-stone-300';

  return (
    <div className={cn('rounded-xl border border-stone-200 bg-white p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        {summary && <p className="text-xs text-stone-500">{summary}</p>}
        {children}
      </div>
      {progress != null && (
        <div className="w-full bg-stone-100 rounded-full h-2">
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
    <span className="text-stone-300">·</span>
    <span className={cn('text-[11px] text-stone-400', className)}>{children}</span>
  </>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 11. STATUS ICON MAP — Shared icon/color mapping for dossier-style trees
// ═══════════════════════════════════════════════════════════════════════════════

export const STATUS_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  approved: { icon: CheckCircle2, color: 'text-emerald-500' },
  'in-review': { icon: Clock, color: 'text-amber-500' },
  drafting: { icon: FileText, color: 'text-blue-500' },
  'not-started': { icon: Clock, color: 'text-stone-300' },
  blocked: { icon: AlertTriangle, color: 'text-red-500' },
  locked: { icon: Lock, color: 'text-stone-400' },
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
      'w-72 shrink-0 border-l border-stone-200 bg-white flex flex-col min-h-0',
      className
    )}
    data-testid={testId}
  >
    {title && (
      <div className="flex items-center justify-between px-3 h-11 border-b border-stone-200 shrink-0">
        <span className="text-xs font-semibold text-stone-700">{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
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

// ═══════════════════════════════════════════════════════════════════════════════
// 13. INSPECTOR RIBBON — Grouped toggle bar for editor inspector panels
// ═══════════════════════════════════════════════════════════════════════════════

export interface InspectorRibbonItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Override active color (default: bg-blue-600 text-white) */
  activeColor?: string;
  /** Badge count (e.g., unresolved comments) */
  badge?: number;
  /** Show pulse indicator when active */
  pulse?: boolean;
  /** Contextual suggestion indicator — shows a small dot when this panel is relevant to the current lifecycle stage */
  suggested?: boolean;
  testId?: string;
}

export interface InspectorRibbonGroup {
  label: string;
  items: InspectorRibbonItem[];
}

interface InspectorRibbonProps {
  groups: InspectorRibbonGroup[];
  activeInspector: string | null;
  onToggle: (id: string) => void;
  /** When set, only the group containing the active inspector (or this stage name) shows expanded.
   *  Other groups collapse to just the group label as a clickable pill.
   *  Set to null to show all groups expanded (legacy behavior). */
  progressiveCollapse?: boolean;
  className?: string;
  testId?: string;
}

export const InspectorRibbon: React.FC<InspectorRibbonProps> = ({
  groups,
  activeInspector,
  onToggle,
  progressiveCollapse = true,
  className,
  testId = 'inspector-ribbon',
}) => {
  // Determine which group is "active" (contains the active inspector panel)
  const activeGroupIdx = activeInspector
    ? groups.findIndex(g => g.items.some(i => i.id === activeInspector))
    : -1;

  return (
    <div
      className={cn('flex items-stretch px-3 border-b border-stone-100 bg-stone-50/40 shrink-0 overflow-x-auto', className)}
      data-testid={testId}
      role="toolbar"
      aria-label="Inspector panel toggles"
    >
      {groups.map((group, gi) => {
        const isActiveGroup = gi === activeGroupIdx;
        const hasActiveItem = group.items.some(i => i.id === activeInspector);
        // When progressive collapse is on, only show items for the active group
        // Other groups show as collapsed clickable pills
        const showExpanded = !progressiveCollapse || isActiveGroup || activeGroupIdx === -1;

        return (
          <div
            key={group.label}
            className={cn(
              'flex flex-col items-center py-1',
              gi < groups.length - 1 && 'pr-3 mr-3 border-r border-stone-200'
            )}
          >
            {showExpanded ? (
              <>
                <div className="flex items-center gap-0.5">
                  {group.items.map(item => {
                    const isActive = activeInspector === item.id;
                    return (
                      <button
                        key={item.id}
                        data-testid={item.testId || `ribbon-${item.id}`}
                        onClick={() => onToggle(item.id)}
                        className={cn(
                          'px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap',
                          isActive
                            ? (item.activeColor || 'bg-blue-600 text-white font-medium shadow-sm')
                            : 'text-stone-600 hover:bg-white hover:shadow-sm'
                        )}
                      >
                        {item.icon}
                        {item.label}
                        {item.badge != null && item.badge > 0 && (
                          <span
                            className={cn(
                              'ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-semibold',
                              isActive ? 'bg-white text-blue-600' : 'bg-amber-500 text-white'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                        {item.pulse && isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        )}
                        {item.suggested && !isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[9px] font-medium uppercase tracking-widest text-stone-400 mt-0.5">
                  {group.label}
                </span>
              </>
            ) : (
              /* Collapsed group — just a clickable label pill that opens the first item */
              <button
                onClick={() => onToggle(group.items[0].id)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-md transition-all whitespace-nowrap',
                  hasActiveItem
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                )}
                aria-label={`Open ${group.label} panels`}
                data-testid={`ribbon-group-${group.label.toLowerCase()}`}
              >
                {group.label}
                {group.items.some(i => (i.badge ?? 0) > 0) && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 14. INSPECTOR DRAWER — Standard wrapper for inspector panel content (w-80)
// ═══════════════════════════════════════════════════════════════════════════════

interface InspectorDrawerProps {
  /** Whether this drawer is visible */
  visible: boolean;
  /** Width override (default: w-80) */
  width?: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  visible,
  width = 'w-80',
  children,
  className,
  testId,
}) => {
  // Track mount state for slide animation
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [isAnimating, setIsAnimating] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Trigger animation on next frame
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      // Delay unmount for exit animation
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!shouldRender) return null;

  return (
    <>
      {/* Mobile: overlay with backdrop */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-black/20 transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />
      <div
        className={cn(
          // Mobile: fixed overlay from right. Desktop: inline side panel.
          'fixed right-0 top-0 bottom-0 z-50 md:relative md:z-auto',
          width,
          'shrink-0 border-l border-stone-200 h-full overflow-hidden bg-white',
          'transition-all duration-200 ease-out',
          isAnimating ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
          className,
        )}
        data-testid={testId}
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </div>
    </>
  );
};
