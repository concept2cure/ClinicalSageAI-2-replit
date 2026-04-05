---
name: Concept2cure-V2-component-registry
description: >
  Frontend component map for ClinicalSageAI-2-replit. Prevents recreating existing
  components (the #1 problem in this repo). Lists all modules with file paths and route
  slugs. Maps layout modes to component files in ZenApp.tsx. Documents the AnA chat
  integration pattern. Trigger on: new component, new page, new route, frontend feature,
  React component, "build a UI for," "create a page," "add a module," layout, ZenApp,
  sidebar, routing, "does this component exist," "where is the component for," or any
  frontend development task.
---

# Component Registry — Frontend Module Map

Before creating ANY new React component, check this registry. The #1 source of
technical debt in this repo is duplicate components built because the developer didn't
know the original existed.

## Rule: Search Before You Build

```
BEFORE writing a new component:
1. Search this registry by keyword
2. Search the codebase: grep -r "ComponentName" client/src/
3. Check ZenApp.tsx route mappings
4. If it exists → reuse or extend it
5. If it truly doesn't exist → create it in the correct directory
```

## Directory Structure

```
client/src/
  components/
    ui/               ← Shadcn primitives (Button, Card, Input, Dialog, etc.)
    domain/           ← TrialSage-specific business components
    layout/           ← Shell, Sidebar, TopBar, Breadcrumbs
    charts/           ← Recharts wrappers for regulatory data viz
    shared/           ← Cross-cutting utilities (LoadingState, EmptyState, ErrorBoundary)
  pages/              ← Route-level page components (one per route)
  hooks/              ← Custom React hooks
  lib/                ← Utility functions, API client, constants
  styles/             ← Global CSS, design tokens
```

## ZenApp.tsx — The Router

`client/src/ZenApp.tsx` is the central routing component. Every page-level component
is registered here. Layout modes determine which shell wraps the content.

### Layout Modes

| Mode           | Shell                    | Use Case                         |
|----------------|--------------------------|----------------------------------|
| `dashboard`    | Sidebar + TopBar + Main  | Standard authenticated pages     |
| `fullscreen`   | TopBar only + Full Main  | Document viewer, presentations   |
| `minimal`      | No chrome                | Auth pages, onboarding wizard    |
| `embedded`     | No chrome, no padding    | iFrame embeds, widget mode       |

### Adding a New Route

```typescript
// In ZenApp.tsx — add to the route config array
{
  path: '/submissions/:id/history',
  component: lazy(() => import('./pages/SubmissionHistory')),
  layout: 'dashboard',
  requiredRole: 'regulatory-author',  // RBAC gate
  title: 'Submission History',
}
```

Rules:
- Every route uses `lazy()` for code splitting
- Every authenticated route has a `requiredRole`
- Route paths use kebab-case: `/regulatory-intelligence`, not `/regulatoryIntelligence`
- Dynamic segments use `:param` syntax

## Module Registry

This is the authoritative list. CTRL+F before building anything.

### Core Navigation Modules

| Module                  | Route                      | Component File                        |
|-------------------------|----------------------------|---------------------------------------|
| Dashboard               | `/dashboard`               | `pages/Dashboard.tsx`                 |
| Submissions             | `/submissions`             | `pages/Submissions.tsx`               |
| Submission Detail       | `/submissions/:id`         | `pages/SubmissionDetail.tsx`          |
| eCTD Builder            | `/submissions/:id/builder` | `pages/ECTDBuilder.tsx`               |
| Document Library        | `/documents`               | `pages/DocumentLibrary.tsx`           |
| Document Viewer         | `/documents/:id`           | `pages/DocumentViewer.tsx`            |
| Regulatory Intelligence | `/intelligence`            | `pages/RegulatoryIntelligence.tsx`    |
| Trial Tracker           | `/trials`                  | `pages/TrialTracker.tsx`              |
| Trial Detail            | `/trials/:id`              | `pages/TrialDetail.tsx`              |
| Settings                | `/settings`                | `pages/Settings.tsx`                  |
| User Management         | `/settings/users`          | `pages/UserManagement.tsx`            |
| Organization Settings   | `/settings/organization`   | `pages/OrganizationSettings.tsx`      |
| Audit Log               | `/settings/audit-log`      | `pages/AuditLog.tsx`                  |

### Auth & Onboarding

| Module             | Route           | Component File                   |
|--------------------|-----------------|----------------------------------|
| Login              | `/login`        | `pages/auth/Login.tsx`           |
| Register           | `/register`     | `pages/auth/Register.tsx`        |
| Forgot Password    | `/forgot`       | `pages/auth/ForgotPassword.tsx`  |
| MFA Setup          | `/mfa-setup`    | `pages/auth/MFASetup.tsx`        |
| Onboarding Wizard  | `/onboarding`   | `pages/onboarding/Wizard.tsx`    |

### Analytics & Reporting

| Module                | Route                  | Component File                      |
|-----------------------|------------------------|-------------------------------------|
| Analytics Dashboard   | `/analytics`           | `pages/AnalyticsDashboard.tsx`      |
| Submission Analytics  | `/analytics/submissions`| `pages/SubmissionAnalytics.tsx`    |
| Compliance Reports    | `/reports/compliance`  | `pages/ComplianceReports.tsx`       |

> **NOTE**: This registry must be updated whenever a new page component is created.
> If you create a new page and don't update this file, you are creating the problem
> this skill exists to prevent.

## AnA Chat Integration

The AI assistant ("AnA") is a persistent chat overlay, NOT a separate page:

```
Location:   client/src/components/domain/AnAChat/
Files:
  AnAChatPanel.tsx        ← Slide-out panel component
  AnAChatInput.tsx        ← Message input with file attachment
  AnAChatMessage.tsx      ← Individual message bubble
  AnAChatContext.tsx       ← React context for chat state
  useAnAChat.ts           ← Hook for triggering AnA from any component
```

### Integration Pattern

```typescript
// From any component, trigger AnA with context
import { useAnAChat } from '@/hooks/useAnAChat';

function SubmissionDetail() {
  const { openChat, sendMessage } = useAnAChat();

  const handleAIReview = () => {
    openChat();
    sendMessage({
      type: 'regulatory-review',
      context: { submissionId, sectionCode },
      prompt: 'Review this section for ICH compliance gaps',
    });
  };
}
```

AnA always receives the current page context (route, entity ID, user role) so it
can tailor responses without the user re-explaining where they are.

## Shared Components (Use These, Don't Rebuild)

| Component        | Location                              | Purpose                        |
|------------------|---------------------------------------|--------------------------------|
| LoadingState     | `components/shared/LoadingState.tsx`  | Skeleton loader                |
| EmptyState       | `components/shared/EmptyState.tsx`    | Empty view with CTA            |
| ErrorBoundary    | `components/shared/ErrorBoundary.tsx` | Catch + display errors         |
| StatusBadge      | `components/domain/StatusBadge.tsx`   | Regulatory status pill         |
| DataTable        | `components/domain/DataTable.tsx`     | Sortable, filterable table     |
| ConfirmDialog    | `components/ui/ConfirmDialog.tsx`     | Destructive action confirmation|
| FileUpload       | `components/domain/FileUpload.tsx`    | Validated file upload          |
| BreadcrumbNav    | `components/layout/BreadcrumbNav.tsx` | Auto breadcrumbs from route    |
| KPICard          | `components/charts/KPICard.tsx`       | Metric card with sparkline     |
| TimelineChart    | `components/charts/TimelineChart.tsx` | Submission/trial timeline      |
