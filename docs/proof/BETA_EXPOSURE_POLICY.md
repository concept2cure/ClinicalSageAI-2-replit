# Beta Exposure Policy

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Define exactly what human beta testers see vs what is hidden

---

## 1. Beta-Visible Surfaces (Green)

These surfaces are tested, governed, and safe for human exposure.

### Shell

| Surface | Entry point | Evidence |
|---------|------------|---------|
| Login page | `/concept2cure/login` | PULSE-02, PULSE-04 tests |
| Zen shell + sidebar | `/concept2cure` | PULSE-04, SMOKE-01–06 tests |
| Command palette | `⌘K` / `Ctrl+K` | `useZenKeyboardShortcuts` hook |
| Settings panel | `⌘,` / `Ctrl+,` | `useZenKeyboardShortcuts` hook |
| Project switcher | Sidebar project list | PULSE-05 test |

### Project Workspace

| Surface | Entry point | Evidence |
|---------|------------|---------|
| Project home / Overview | Project tab "Overview" | Guided demo Step 1 |
| Tools (documents workspace) | Project tab "Tools" | SMOKE-03 test |
| Vault | Project tab "Vault" | SMOKE-05 test |
| Review | Project tab "Review" | SMOKE-04 test |
| Submit | Project tab "Submit" | — |
| Setup | Project tab "Setup" | SMOKE-06 test |
| File/Dossier/Template tree | Workspace left panel | ProjectWorkspaceShell |
| Editor panel | Document open | Guided demo Steps 3-6 |
| Inspector (provenance/audit) | Editor right panel | Guided demo Step 6 |

### AnA Chat

| Surface | Entry point | Evidence |
|---------|------------|---------|
| AnA persistent panel | Shell chat area | PULSE-07 test |
| Chat message send | Chat input | AnA benchmark proof |
| Save to Vault | Response action button | Guided demo Step 2 |
| Insert to Editor | Response action button | Guided demo Step 4 |

### Document Lifecycle

| Surface | Entry point | Evidence |
|---------|------------|---------|
| Draft status | Artifact creation | Contract tests |
| Review promotion | Governance boundary | Governed lifecycle E2E |
| Approval | Decision lifecycle | Governed lifecycle E2E |
| Lock | Decision lifecycle | Governed lifecycle E2E |
| Export gate | Governed contract service | Contract tests |

---

## 2. Deliberately Hidden / Demoted (Yellow)

These surfaces exist in code but are not in the beta path. They show empty states
or redirect to governed surfaces.

| Surface | Disposition | Redirect target |
|---------|------------|----------------|
| Mission Control | Demoted in ZenApp `DEMOTED_REDIRECTS` | → `projects` |
| SnowGlobe | Demoted in ZenApp `DEMOTED_REDIRECTS` | → `projects` |
| SnowGlobe Chambers | Demoted | → `projects` |
| Rules | Demoted | → `projects` |
| eCTD CoAuthor (standalone) | Demoted | → `documents` |
| CMC (standalone) | Demoted | → `documents` |
| Document Vault (standalone) | Demoted | → `vault` |
| Clinical Trial | Demoted | → `documents` |
| Document Builder (standalone) | Demoted | → `documents` |
| Artifacts Gallery | Demoted | → `artifacts-center` |
| Sherpa | Demoted | → `projects` |
| Analytics | Demoted | → `projects` |
| Timeline | Demoted | → `projects` |
| Audit (standalone) | Demoted | → `projects` |
| Enablement Center | Demoted | → `projects` |
| Platform Admin | Demoted | → `projects` |
| Biologics Dashboard | Demoted | → `projects` |
| CTD Onboarding | Demoted | → `projects` |
| Client Intelligence | Demoted | → `projects` |
| Collaboration Hub | Demoted | → `projects` |
| User Inbox | Demoted | → `projects` |
| Client Branding | Demoted | → `projects` |
| Training Center | Demoted | → `projects` |
| Client Onboarding | Demoted | → `projects` |
| Knowledge Base (standalone) | Demoted | → `projects` |
| Project Knowledge (standalone) | Demoted | → `projects` |
| AnA Platform Control | Demoted | → `projects` |
| Dr. Sage | Not in shell | No route |

### Compatibility Redirects

These old layout mode names auto-redirect to the canonical workspace:

| Old mode | Redirects to |
|----------|-------------|
| `workspace` | `regulatory-workspace` |
| `assistant` | `regulatory-workspace` |
| `ctd` | `regulatory-workspace` |
| `medtech-dashboard` | `regulatory-workspace` |
| `dossier` | `regulatory-workspace` |

---

## 3. Legacy Routes (Red — Not Beta Path)

These routes exist in `App.jsx` but are not part of the beta journey.
They are lazy-loaded secondary routes for specialist modules.

| Route family | Example paths | Status |
|-------------|--------------|--------|
| CMC routes | `/cmc-*`, `/stability` | Legacy; outside concept2cure shell |
| CSR routes | `/csr-*` | Legacy |
| CER routes | `/cer-*`, `/cerv2-*` | Legacy |
| Admin routes | `/admin`, `/settings` | Legacy |
| IVDR routes | `/ivdr` | Legacy |
| 510k standalone | `/510k-*` | Has shell embed; standalone is legacy |
| Client portal | `/client-portal/*` | Deprecated; not beta path |

### Login Alias Redirects

All legacy login paths redirect to the canonical login:

| Old path | Redirects to |
|----------|-------------|
| `/sign-in` | `/concept2cure/login` |
| `/auth` | `/concept2cure/login` |
| `/login` | `/concept2cure/login` |

---

## 4. Enforcement Mechanism

The beta exposure policy is enforced through three layers:

1. **ZenApp `DEMOTED_REDIRECTS`** — any demoted layout mode auto-redirects to its target
2. **ZenRouter auth gates** — unauthenticated users are redirected to login
3. **App.jsx root redirect** — root `/` redirects to `/concept2cure`

No feature flags are needed for the current beta scope because demoted surfaces
already redirect to governed surfaces. Future feature flags should be added when
re-enabling demoted surfaces for wider beta.

---

## 5. Beta Health Check

Run before every beta session:

```bash
./scripts/beta-health-check.sh http://localhost:5000
```

This script verifies network, health endpoints, auth enforcement, client build,
and all 96 beta-critical tests.
