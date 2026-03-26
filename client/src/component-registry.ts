/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOVERNED COMPONENT REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file is the SINGLE SOURCE OF TRUTH mapping Figma library component
 * names to their canonical code implementations. It is consumed by:
 *
 *   1. Figma Code Connect (`.figma.tsx` files reference these paths)
 *   2. Codex / Claude Code / Copilot (via CLAUDE.md + copilot-instructions.md)
 *   3. Human developers (import guidance)
 *
 * CONTRACT RULES (NON-NEGOTIABLE):
 *   - Agents MUST use a component from this registry if one exists.
 *   - Agents MUST NOT create a new primitive if a mapped one already covers
 *     the need (e.g. no ad-hoc `<StatusDot>` when `<WorkspaceStatusBadge>`
 *     exists).
 *   - If Figma adds a new frame not in this list, the developer MUST add a
 *     row here AND create a Code Connect mapping before using it in product.
 *   - If a mapped component is deprecated, it MUST be removed from this file
 *     and from the `.figma.tsx` Code Connect files at the same time.
 *
 * @version 1.0.0
 */

// ─── Type Definitions ───────────────────────────────────────────────────────

export interface ComponentRegistryEntry {
  /** Figma library component name (must match Figma exactly) */
  figmaName: string;
  /** Canonical import path (from @/ alias root) */
  importPath: string;
  /** Exported symbol name */
  exportName: string;
  /** Component category */
  category: 'primitive' | 'layout' | 'state' | 'pattern' | 'domain';
  /** Short description of when to use this component */
  usage: string;
  /** Related sub-components that ship together */
  subComponents?: string[];
}

// ─── The Registry ───────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  // ── Primitives (shadcn / Radix) ─────────────────────────────────────────
  {
    figmaName: 'C2C / Button',
    importPath: '@/components/ui/button',
    exportName: 'Button',
    category: 'primitive',
    usage: 'All clickable actions. Use variant + size props. Never raw <button>.',
    subComponents: ['buttonVariants'],
  },
  {
    figmaName: 'C2C / Badge',
    importPath: '@/components/ui/badge',
    exportName: 'Badge',
    category: 'primitive',
    usage: 'Inline labels, counts, tags. Not for workflow status — use WorkspaceStatusBadge.',
    subComponents: ['badgeVariants'],
  },
  {
    figmaName: 'C2C / Input',
    importPath: '@/components/ui/input',
    exportName: 'Input',
    category: 'primitive',
    usage: 'Single-line text inputs. Wrap in FormField for forms.',
  },
  {
    figmaName: 'C2C / Textarea',
    importPath: '@/components/ui/textarea',
    exportName: 'Textarea',
    category: 'primitive',
    usage: 'Multi-line text inputs. Wrap in FormField for forms.',
  },
  {
    figmaName: 'C2C / Card',
    importPath: '@/components/ui/card',
    exportName: 'Card',
    category: 'primitive',
    usage: 'Content containers. Use with CardHeader, CardTitle, CardContent, CardFooter.',
    subComponents: ['CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
  },
  {
    figmaName: 'C2C / Dialog',
    importPath: '@/components/ui/dialog',
    exportName: 'Dialog',
    category: 'primitive',
    usage: 'Modal dialogs for confirmations and forms. Use DialogHeader + DialogFooter.',
    subComponents: [
      'DialogContent',
      'DialogHeader',
      'DialogTitle',
      'DialogDescription',
      'DialogFooter',
      'DialogTrigger',
      'DialogClose',
    ],
  },
  {
    figmaName: 'C2C / Tabs',
    importPath: '@/components/ui/tabs',
    exportName: 'Tabs',
    category: 'primitive',
    usage: 'Section-level tab navigation within a workspace surface.',
    subComponents: ['TabsList', 'TabsTrigger', 'TabsContent'],
  },
  {
    figmaName: 'C2C / Select',
    importPath: '@/components/ui/select',
    exportName: 'Select',
    category: 'primitive',
    usage: 'Dropdown pickers. Use inside FormField for forms.',
    subComponents: ['SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem'],
  },
  {
    figmaName: 'C2C / Alert',
    importPath: '@/components/ui/alert',
    exportName: 'Alert',
    category: 'primitive',
    usage: 'Inline banners for warnings, info, errors. Not for toasts.',
    subComponents: ['AlertTitle', 'AlertDescription'],
  },
  {
    figmaName: 'C2C / Table',
    importPath: '@/components/ui/table',
    exportName: 'Table',
    category: 'primitive',
    usage: 'Data tables. Use with TableHeader, TableBody, TableRow, TableHead, TableCell.',
    subComponents: [
      'TableHeader',
      'TableBody',
      'TableRow',
      'TableHead',
      'TableCell',
      'TableCaption',
    ],
  },
  {
    figmaName: 'C2C / Progress',
    importPath: '@/components/ui/progress',
    exportName: 'Progress',
    category: 'primitive',
    usage: 'Completion bars. Pass `value` 0–100.',
  },
  {
    figmaName: 'C2C / Tooltip',
    importPath: '@/components/ui/tooltip',
    exportName: 'Tooltip',
    category: 'primitive',
    usage: 'Hover tooltips. Wrap in TooltipProvider at app root.',
    subComponents: ['TooltipTrigger', 'TooltipContent', 'TooltipProvider'],
  },
  {
    figmaName: 'C2C / DropdownMenu',
    importPath: '@/components/ui/dropdown-menu',
    exportName: 'DropdownMenu',
    category: 'primitive',
    usage: 'Context / overflow menus with items/separators.',
    subComponents: [
      'DropdownMenuTrigger',
      'DropdownMenuContent',
      'DropdownMenuItem',
      'DropdownMenuSeparator',
      'DropdownMenuLabel',
    ],
  },
  {
    figmaName: 'C2C / Switch',
    importPath: '@/components/ui/switch',
    exportName: 'Switch',
    category: 'primitive',
    usage: 'Binary toggles. Wrap in FormField for forms.',
  },
  {
    figmaName: 'C2C / Checkbox',
    importPath: '@/components/ui/checkbox',
    exportName: 'Checkbox',
    category: 'primitive',
    usage: 'Multi-select / boolean checks. Wrap in FormField for forms.',
  },
  {
    figmaName: 'C2C / Skeleton',
    importPath: '@/components/ui/skeleton',
    exportName: 'Skeleton',
    category: 'primitive',
    usage:
      'Content placeholder shimmer. Use SkeletonTable/SkeletonCard from statesV2 for compound loading.',
  },

  // ── Layout (Workspace Primitives) ───────────────────────────────────────
  {
    figmaName: 'C2C / WorkspaceHeader',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'WorkspaceHeader',
    category: 'layout',
    usage: 'Compact single-line header for workspace surfaces (editor, dossier, review).',
  },
  {
    figmaName: 'C2C / WorkspaceHeaderRich',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'WorkspaceHeaderRich',
    category: 'layout',
    usage: 'Two-line header for section-level pages with secondary info.',
  },
  {
    figmaName: 'C2C / PageTitleHeader',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'PageTitleHeader',
    category: 'layout',
    usage: 'Dashboard-level page header. Large title + optional badges/description.',
  },
  {
    figmaName: 'C2C / Canvas',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'WorkspaceCanvas',
    category: 'layout',
    usage: 'Centered content wrapper with max-width constraint. Wraps all workspace content.',
  },
  {
    figmaName: 'C2C / StatusBadge',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'WorkspaceStatusBadge',
    category: 'layout',
    usage:
      'Workflow status chips (not-started, drafting, in-review, approved, blocked, locked, ready).',
    subComponents: ['WORKFLOW_STATUS_CONFIG'],
  },
  {
    figmaName: 'C2C / SectionPanel',
    importPath: '@/components/ui/workspace-primitives',
    exportName: 'SectionPanel',
    category: 'layout',
    usage: 'Collapsible content section in workspace surfaces.',
  },

  // ── State Wrappers ─────────────────────────────────────────────────────
  {
    figmaName: 'C2C / DataState',
    importPath: '@/components/ui/statesV2',
    exportName: 'DataStateWrapper',
    category: 'state',
    usage:
      'Async boundary: handles loading/error/empty/success for any query. REQUIRED for all data display.',
  },
  {
    figmaName: 'C2C / LoadingState',
    importPath: '@/components/ui/statesV2',
    exportName: 'LoadingState',
    category: 'state',
    usage:
      'Full-section loading spinner. Use SkeletonCard/SkeletonTable for content-shaped loading.',
  },
  {
    figmaName: 'C2C / ErrorState',
    importPath: '@/components/ui/statesV2',
    exportName: 'ErrorState',
    category: 'state',
    usage: 'Error display with retry button. Always pass onRetry.',
  },

  // ── Domain Patterns ────────────────────────────────────────────────────
  {
    figmaName: 'C2C / ConversationBubble',
    importPath: '@/design-system/patterns/ConversationBubble',
    exportName: 'ConversationBubble',
    category: 'pattern',
    usage:
      'Chat messages for AnA assistant. Supports user/assistant/system roles, citations, streaming.',
  },
  {
    figmaName: 'C2C / MetricCard',
    importPath: '@/design-system/patterns/MetricCard',
    exportName: 'MetricCard',
    category: 'pattern',
    usage: 'Dashboard KPI cards with trend, sparkline, and change indicator.',
  },
  {
    figmaName: 'C2C / ActionBar',
    importPath: '@/design-system/patterns/ActionBar',
    exportName: 'ActionBar',
    category: 'pattern',
    usage: 'Page action bars with search, filter, view toggle, and primary/secondary actions.',
  },
  {
    figmaName: 'C2C / EmptyState',
    importPath: '@/design-system/patterns/EmptyState',
    exportName: 'EmptyState',
    category: 'pattern',
    usage:
      'Rich illustrated empty states. For simple empties inside DataStateWrapper, use statesV2.EmptyState.',
  },
];

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/** Find a registry entry by Figma component name */
export function findByFigmaName(name: string): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find(e => e.figmaName === name);
}

/** Find a registry entry by code export name */
export function findByExportName(name: string): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find(e => e.exportName === name);
}

/** Get all entries for a category */
export function getByCategory(
  category: ComponentRegistryEntry['category']
): ComponentRegistryEntry[] {
  return COMPONENT_REGISTRY.filter(e => e.category === category);
}
