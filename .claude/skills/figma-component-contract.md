# Skill: Figma–Code Governed Component Contract

## Description

Enforces the governed contract between the Figma library, the frontend component
system, and AI agents (Codex, Claude Code, Copilot). Every UI implementation must
use the canonical mapped component from the component registry.

## Activation

This skill activates when:

- Creating or modifying any React component in `client/src/`
- Implementing a screen, panel, or layout from a Figma design
- Adding UI elements that match existing design-system components
- Touching workspace layout (headers, canvases, status badges)
- Adding loading/error/empty states
- Building chat or dashboard UI

## The Contract

### Source of Truth Chain

```
Figma library frame
    ↓ mapped by
Code Connect (.figma.tsx files)
    ↓ references
Component Registry (client/src/component-registry.ts)
    ↓ imports from
Canonical implementations (@/components/ui/*, @/design-system/patterns/*)
```

### Registry Location

`client/src/component-registry.ts` — 28 governed components across 5 categories:

- **primitive** (16): Button, Badge, Input, Textarea, Card, Dialog, Tabs, Select, Alert, Table, Progress, Tooltip, DropdownMenu, Switch, Checkbox, Skeleton
- **layout** (6): WorkspaceHeader, WorkspaceHeaderRich, PageTitleHeader, WorkspaceCanvas, WorkspaceStatusBadge, SectionPanel
- **state** (3): DataStateWrapper, LoadingState, ErrorState
- **pattern** (4): ConversationBubble, MetricCard, ActionBar, EmptyState

### Hard Rules

1. **MUST check the registry first** — Before creating any UI element, check
   if `client/src/component-registry.ts` already has a mapping for it.

2. **MUST use the mapped component** — If a registry entry exists whose `usage`
   description covers the need, import from its `importPath`.

3. **MUST NOT create ad-hoc primitives** — No inline `<button>`, no custom
   `<StatusDot>`, no local `LoadingSpinner` when governed components exist.

4. **MUST NOT duplicate** — If you need Button, use `@/components/ui/button`.
   If you need a status badge, use `WorkspaceStatusBadge` from workspace-primitives.

5. **MUST wrap data displays** — Every component rendering async data MUST use
   `DataStateWrapper` from `@/components/ui/statesV2`.

6. **MUST use workspace layout** — Any "page" or "workspace" surface MUST use
   `WorkspaceHeader` or `WorkspaceHeaderRich` + `WorkspaceCanvas`.

7. **MUST use workflow status config** — Never hardcode status colors. Use
   `WORKFLOW_STATUS_CONFIG` from workspace-primitives.

8. **New components require registration** — If you genuinely need a new component
   not in the registry, you MUST:
   a. Add an entry to `component-registry.ts`
   b. Create a Code Connect mapping in the appropriate `.figma.tsx` file
   c. Get user confirmation before creating the new file

### Figma Code Connect Files

| File                              | Scope                                |
| --------------------------------- | ------------------------------------ |
| `client/src/primitives.figma.tsx` | 15 shadcn/Radix primitives           |
| `client/src/domain.figma.tsx`     | 9 workspace layout + domain patterns |

### Quick Reference — Common Mistakes

| Wrong                                  | Right                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| `<button className="...">`             | `<Button variant="..." size="...">`                         |
| `<div className="badge ...">`          | `<Badge variant="...">` or `<WorkspaceStatusBadge>`         |
| `{isLoading && <div>Loading...</div>}` | `<DataStateWrapper>` or `<LoadingState>`                    |
| Custom status pill with inline colors  | `<WorkspaceStatusBadge status="drafting">`                  |
| `<div className="max-w-4xl mx-auto">`  | `<WorkspaceCanvas maxWidth="4xl">`                          |
| Local `EmptyState` component           | Import from `statesV2` or `design-system/patterns`          |
| Raw `<input>` elements                 | `<Input>` from `@/components/ui/input` inside `<FormField>` |

## Verification

After any UI change, verify:

- [ ] Every UI element maps to a registry entry in `component-registry.ts`
- [ ] No raw HTML elements that have governed equivalents
- [ ] Async data is wrapped in `DataStateWrapper`
- [ ] Status badges use `WORKFLOW_STATUS_CONFIG`
- [ ] Workspace surfaces use `WorkspaceHeader` + `WorkspaceCanvas`
