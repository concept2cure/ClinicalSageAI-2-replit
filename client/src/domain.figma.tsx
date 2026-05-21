/**
 * Code Connect — Concept2Cure Domain Components
 *
 * Maps the 5 workspace-layout components and 4 domain patterns from the
 * Figma library to their canonical code implementations.
 *
 * GOVERNED CONTRACT — these are the ONLY approved workspace layout primitives.
 * Do NOT create alternative layout wrappers, headers, or status badges.
 *
 * @version 1.0.0
 * @see workspace-primitives.tsx for full export list
 * @see statesV2.tsx for async state wrappers
 */

// Figma Code Connect is an optional dev dependency. Provide a typed shim
// that matches the surface used below so this file compiles without it.
const figma = {
  connect: (_component: any, _url: string, _config: any) => undefined,
  enum: (_name: string, _map: any) => undefined as any,
  string: (_name: string) => undefined as any,
  boolean: (_name: string) => undefined as any,
  children: (_name: string) => undefined as any,
  instance: (_name: string) => undefined as any,
};

// ─── Workspace Layout ───────────────────────────────────────────────────────

import {
  WorkspaceHeader,
  WorkspaceHeaderRich,
  PageTitleHeader,
  WorkspaceCanvas,
  WorkspaceStatusBadge,
  WorkspaceTabBar,
  WorkspaceActionBar,
  SectionPanel,
  InspectorPanel,
  InspectorDrawer,
  WORKFLOW_STATUS_CONFIG,
} from '@/components/ui/workspace-primitives';

// ─── State Wrappers ─────────────────────────────────────────────────────────

import {
  DataStateWrapper,
  LoadingState,
  ErrorState,
  EmptyState as EmptyStateV2,
  SkeletonTable,
  SkeletonCard,
  SkeletonText,
  InlineLoading,
} from '@/components/ui/statesV2';

// ─── Domain Patterns ────────────────────────────────────────────────────────

import { ConversationBubble } from '@/design-system/patterns/ConversationBubble';
import { MetricCard } from '@/design-system/patterns/MetricCard';
import { ActionBar } from '@/design-system/patterns/ActionBar';
import { EmptyState as DesignEmptyState } from '@/design-system/patterns/EmptyState';

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE HEADER (compact bar)
// Figma: C2C / WorkspaceHeader    Code: <WorkspaceHeader>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(WorkspaceHeader, 'FIGMA_URL_PLACEHOLDER/WorkspaceHeader', {
  props: {
    title: figma.string('Title'),
    breadcrumb: figma.string('Breadcrumb'),
    typeBadge: figma.string('Type Badge'),
    statusKey: figma.enum('Status', {
      'Not Started': 'not-started',
      Drafting: 'drafting',
      'In Review': 'in-review',
      Approved: 'approved',
      Blocked: 'blocked',
      Locked: 'locked',
    }),
  },
  example: ({ title, breadcrumb, typeBadge, statusKey }: any) => (
    <WorkspaceHeader
      title={title}
      breadcrumb={breadcrumb}
      typeBadge={typeBadge}
      onBack={() => {}}
      status={WORKFLOW_STATUS_CONFIG[statusKey]}
    />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE HEADER RICH (two-line header)
// Figma: C2C / WorkspaceHeaderRich   Code: <WorkspaceHeaderRich>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(WorkspaceHeaderRich, 'FIGMA_URL_PLACEHOLDER/WorkspaceHeaderRich', {
  props: {
    title: figma.string('Title'),
    breadcrumb: figma.string('Breadcrumb'),
    statusKey: figma.enum('Status', {
      'Not Started': 'not-started',
      Drafting: 'drafting',
      'In Review': 'in-review',
      Approved: 'approved',
      Blocked: 'blocked',
    }),
  },
  example: ({ title, breadcrumb, statusKey }: any) => (
    <WorkspaceHeaderRich
      title={title}
      breadcrumb={breadcrumb}
      onBack={() => {}}
      status={WORKFLOW_STATUS_CONFIG[statusKey]}
    />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE TITLE HEADER (dashboard-level)
// Figma: C2C / PageTitleHeader   Code: <PageTitleHeader>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(PageTitleHeader, 'FIGMA_URL_PLACEHOLDER/PageTitleHeader', {
  props: {
    title: figma.string('Title'),
    description: figma.string('Description'),
  },
  example: ({ title, description }: any) => <PageTitleHeader title={title} description={description} />,
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE STATUS BADGE
// Figma: C2C / StatusBadge   Code: <WorkspaceStatusBadge>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(WorkspaceStatusBadge, 'FIGMA_URL_PLACEHOLDER/StatusBadge', {
  props: {
    statusKey: figma.enum('Status', {
      'Not Started': 'not-started',
      Drafting: 'drafting',
      'In Review': 'in-review',
      Approved: 'approved',
      Blocked: 'blocked',
      Locked: 'locked',
      Ready: 'ready',
      'Needs Work': 'needs-work',
      'Needs Review': 'needs-review',
    }),
  },
  example: ({ statusKey }: any) => (
    <WorkspaceStatusBadge status={statusKey} config={WORKFLOW_STATUS_CONFIG[statusKey]} />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE CANVAS (content wrapper)
// Figma: C2C / Canvas   Code: <WorkspaceCanvas>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(WorkspaceCanvas, 'FIGMA_URL_PLACEHOLDER/Canvas', {
  props: {
    maxWidth: figma.enum('Max Width', {
      '3xl': '3xl',
      '4xl': '4xl',
      '5xl': '5xl',
      Full: 'full',
    }),
  },
  example: ({ maxWidth }: any) => <WorkspaceCanvas maxWidth={maxWidth}><span /></WorkspaceCanvas>,
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA STATE WRAPPER (async boundary)
// Figma: C2C / DataState   Code: <DataStateWrapper>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(DataStateWrapper, 'FIGMA_URL_PLACEHOLDER/DataState', {
  props: {
    state: figma.enum('State', {
      Loading: 'loading',
      Error: 'error',
      Empty: 'empty',
      Success: 'success',
    }),
  },
  example: () => {
    const Wrapper = DataStateWrapper as any;
    return (
      <Wrapper
        isLoading={false}
        error={null}
        data={[]}
        loadingComponent={<SkeletonCard />}
        emptyTitle="No items yet"
        emptyDescription="Create your first item."
        render={(data: any) => <div>{/* render data */}</div>}
      />
    );
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION BUBBLE
// Figma: C2C / ConversationBubble   Code: <ConversationBubble>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(ConversationBubble, 'FIGMA_URL_PLACEHOLDER/ConversationBubble', {
  props: {
    role: figma.enum('Role', {
      User: 'user',
      Assistant: 'assistant',
      System: 'system',
    }),
    isStreaming: figma.boolean('Streaming'),
  },
  example: ({ role, isStreaming }: any) => (
    <ConversationBubble content="Message content" role={role} isStreaming={isStreaming} />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD
// Figma: C2C / MetricCard   Code: <MetricCard>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(MetricCard, 'FIGMA_URL_PLACEHOLDER/MetricCard', {
  props: {
    label: figma.string('Label'),
    value: figma.string('Value'),
    trend: figma.enum('Trend', {
      Up: 'up',
      Down: 'down',
      Stable: 'stable',
    }),
    size: figma.enum('Size', {
      Small: 'sm',
      Medium: 'md',
      Large: 'lg',
    }),
  },
  example: ({ label, value, trend, size }: any) => (
    <MetricCard label={label} value={value} trend={trend} size={size} />
  ),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION BAR
// Figma: C2C / ActionBar   Code: <ActionBar>
// ═══════════════════════════════════════════════════════════════════════════════

figma.connect(ActionBar, 'FIGMA_URL_PLACEHOLDER/ActionBar', {
  props: {
    title: figma.string('Title'),
    subtitle: figma.string('Subtitle'),
    sticky: figma.boolean('Sticky'),
  },
  example: ({ title, subtitle, sticky }: any) => (
    <ActionBar
      title={title}
      subtitle={subtitle}
      sticky={sticky}
      primaryAction={{ label: 'Action', onClick: () => {} }}
    />
  ),
});
