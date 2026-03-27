# Beta Operator Checklist

**Date:** 2026-03-27
**Purpose:** Pre-flight checks before demo or beta user session

---

## Pre-Demo Checks (5 minutes)

- [ ] Server running (`npm run dev` or production build)
- [ ] Database accessible (projects API responds)
- [ ] At least one test project exists (or create one)
- [ ] Clear `concept2cure_first_run_complete` from localStorage if demoing onboarding
- [ ] Verify sidebar shows 6 global items (New, Search, Projects, Apps, Artifacts, Setup)

## Pre-Beta Checks (10 minutes)

- [ ] Fresh user account created (or existing test account)
- [ ] `concept2cure_first_run_complete` NOT set in localStorage for new user
- [ ] API endpoint `POST /api/concept2cure/projects` is functional
- [ ] API endpoint `GET /api/concept2cure/artifacts` returns data
- [ ] API endpoint `GET /api/concept2cure/projects/:id/artifacts` returns data
- [ ] 510(k) workspace route (`/concept2cure/project/:id/510k`) loads

## User Creation / Onboarding Checks

- [ ] New user sees 4-screen onboarding (Welcome → Setup → Create Project → You're Set)
- [ ] Track selection works (Pharma shows IND/NDA/BLA/MAA; Device shows 510K/PMA/De Novo/IVDR)
- [ ] Project creation succeeds (user sees "You're Set" with project name)
- [ ] If project creation fails: user sees red error banner, can retry
- [ ] Suggested actions land in correct destinations:
  - "Start in Work" → Work tab
  - "Browse Apps" → Apps page
  - "Open Vault" → Vault tab
  - "Open 510(k) Workspace" → embedded 510(k) page

## Project Creation Checks

- [ ] Project appears in sidebar after creation
- [ ] Project shows correct submission type badge (violet or blue)
- [ ] Clicking project activates it (5 project tabs appear)
- [ ] Overview shows readiness line and quick actions

## Workflow Checks

- [ ] Overview → shows readiness + recent artifacts (or empty state if fresh)
- [ ] Work → opens 3-pane document workspace
- [ ] Vault → shows folder-grouped browser (or empty state if fresh)
- [ ] Review → shows 6-tab inline surface (Quality, Compliance, Readiness, Evidence, Audit, Traceability)
- [ ] Submit → shows section readiness checklist

## Global Destination Checks

- [ ] Apps → 3 tabbed groups, cards disabled without project
- [ ] Artifacts → tab filters work, search works
- [ ] Setup → 7 section cards, clicking opens settings modal

## Fallback Notes

| Scenario | Action |
|----------|--------|
| Onboarding won't appear | Clear `concept2cure_first_run_complete` from localStorage |
| Project creation fails | Check server logs; verify `POST /api/concept2cure/projects` endpoint |
| 510(k) workspace blank | Check route `/concept2cure/project/:id/510k`; verify CERV2Page loads |
| Sidebar missing items | Hard refresh; check ZenSidebar.tsx is the deployed version |
| Project tabs not showing | Click a project in sidebar to activate it |
| Review takes over screen | Verify ReviewReadiness is the Phase 7+ version (inline, not `fixed inset-0`) |
| AnA not visible | AnA shows in compact mode on project tabs; check layoutMode is not 'workspace' |

---

**Run this checklist before every beta session. Takes ~15 minutes.**
