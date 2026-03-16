# Task K — Active Project Enforcement Verification

**Date**: 2026-03-11
**Branch**: `concept2cure-v2`

---

## Audit Method

Static code trace of `activeProjectId` guards in `ZenApp.tsx` plus component-level guards in module code.

---

## Truth Table — Active Project Guards

| Module                         | Guard Level      | Guard Type                     | No-Project UX                            | Status                    |
| ------------------------------ | ---------------- | ------------------------------ | ---------------------------------------- | ------------------------- |
| **IND Workspace**              | ZenApp (L1460)   | Hard stop                      | "Select a project" + button              | ✅ Pre-existing           |
| **RI Copilot (RICopilotHome)** | Component (L321) | Hard stop                      | Brand empty state + "Choose Project" CTA | ✅ Pre-existing           |
| **EditorPanel**                | Component (L284) | Per-operation early return     | No auto-create, no save, no load         | ✅ Pre-existing           |
| **eCTD CoAuthor**              | ZenApp           | Hard stop                      | "Select a project" + button              | ✅ **Added this session** |
| **CMC Platform**               | ZenApp           | Hard stop                      | "Select a project" + button              | ✅ **Added this session** |
| **Document Vault**             | Component        | Data-empty (no project filter) | Empty document list                      | ⚠️ Acceptable\*           |

\*Document Vault shows all org documents; project context is optional for browsing.

---

## Fixes Applied

### eCTD CoAuthor (NEW GUARD)

Added project gate in `ZenApp.tsx` before `ECTDCoAuthorStandalone` render:

```tsx
{!activeProjectId ? (
  <div>... "Select a project to begin authoring CTD sections." + button ...</div>
) : (
  <ECTDCoAuthorStandalone ... />
)}
```

### CMC Platform (NEW GUARD)

Added project gate in `ZenApp.tsx` before CMC traceability bar + module render:

```tsx
{
  !activeProjectId ? (
    <div>... "Select a project to access CMC modules." + button ...</div>
  ) : (
    <> {/* traceability bar + CMCModuleStandalone */} </>
  );
}
```

---

## Server-Side Enforcement

All artifact API endpoints enforce project access:

| Endpoint                                | Guard                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| `POST projects/:projectId/artifacts`    | `verifyProjectAccess()` + org-scoped                                |
| `GET projects/:projectId/artifacts`     | `verifyProjectAccess()` + org-scoped                                |
| `PUT projects/:projectId/artifacts/:id` | `verifyProjectAccess()` + org-scoped                                |
| Provenance events                       | `artifact_id` FK → requires valid artifact → requires valid project |

---

## Verdict

| Module        |   Before    |  After   |
| ------------- | :---------: | :------: |
| IND Workspace |     ✅      |    ✅    |
| RI Copilot    |     ✅      |    ✅    |
| EditorPanel   |     ✅      |    ✅    |
| eCTD CoAuthor | ❌ No guard | ✅ Fixed |
| CMC Platform  | ❌ No guard | ✅ Fixed |

**PASS** — All document-creating modules now enforce active project selection.
