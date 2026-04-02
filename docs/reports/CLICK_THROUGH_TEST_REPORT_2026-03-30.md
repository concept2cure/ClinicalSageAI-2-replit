# ClinicalSageAI — Full End-to-End Click-Through Test Report

**Date**: 2026-03-30
**Auditor**: Claude Code (11-segment parallel audit)
**Scope**: Every screen a biotech client sees from first visit through document publish
**Branch**: `concept2cure-v2`

---

## Executive Summary

**95 features tested across 11 segments. Results: 75 PASS, 11 CONDITIONAL PASS, 9 FAIL.**

The platform has a **strong regulatory compliance core** — authentication, e-signatures, approval gating, tracked changes, RIM intelligence, and the 43 slash commands are production-quality. The critical gaps are in **project creation wiring** (localStorage vs database), **4 missing TipTap packages**, and **decorative SSO/onboarding**.

---

## Scorecard by Segment

| # | Segment | Pass | Conditional | Fail | Critical Issue |
|---|---------|------|-------------|------|----------------|
| 1 | Login & Auth | 9 | 1 | 2 | SSO decorative; onboarding data lost |
| 2 | Dashboard & Nav | 4 | 0 | 3 | Sign Out broken; 2 nav items misrouted |
| 3 | Projects | 1 | 0 | 1 | Projects saved to localStorage only |
| 4 | Project Home | 5 | 2 | 0 | Minor nav routing issues |
| 5 | Document Creation | 4 | 1 | 1 | Two document tables, no cross-reference |
| 6 | Editor | 7 | 0 | 1 | 4 missing TipTap packages |
| 7 | Review & Approval | 8 | 0 | 0 | None — strongest segment |
| 8 | Export & DMS | 13 | 3 | 0 | PDF low-fidelity, minor wiring |
| 9 | AnA Chat | 8 | 2 | 0 | Raw fetch(), volatile chat history |
| 10 | Regulatory Tools | 9 | 0 | 0 | None — comprehensive |
| 11 | Settings & Billing | 8 | 0 | 9 | Security section decorative |

---

## CRITICAL ISSUES (Must Fix Before Demo)

### 1. Projects Never Reach the Database
- **Segment**: 3 (Projects)
- **File**: `client/src/concept2cure/contexts/ProjectContext.tsx`
- **Problem**: `NewProjectModal` calls `ProjectContext.createProject()` which saves to `localStorage` only. The production-quality `POST /api/concept2cure/projects` endpoint (with Drizzle INSERT, audit logging, CTD section bootstrapping) is never called.
- **Impact**: All projects exist only in the browser. Clear cache = lose everything.
- **Fix**: Wire `NewProjectModal` to call `apiRequest('POST', '/api/concept2cure/projects', {...})` instead of `ProjectContext.createProject()`.

### 2. Sign Out Button Has No onClick Handler
- **Segment**: 2, 11 (Dashboard, Settings)
- **File**: `client/src/concept2cure/layouts/ZenSettings.tsx:1438`
- **Problem**: The Sign Out button renders but has no `onClick` handler. Users cannot log out.
- **Impact**: Users trapped in session — must clear cookies manually.
- **Fix**: Add `onClick={() => authService.logout()}` to the Sign Out button.

### 3. 4 Missing TipTap Extension Packages
- **Segment**: 6 (Editor)
- **File**: `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx`
- **Problem**: Imports `@tiptap/extension-text-align`, `@tiptap/extension-superscript`, `@tiptap/extension-subscript`, `@tiptap/extension-font-family` — none in `package.json`.
- **Impact**: Editor may crash at runtime if packages aren't hoisted from other deps.
- **Fix**: `npm install @tiptap/extension-text-align @tiptap/extension-superscript @tiptap/extension-subscript @tiptap/extension-font-family`

### 4. SSO Buttons Are Decorative in Production
- **Segment**: 1 (Auth)
- **File**: `client/src/concept2cure/auth/ZenLogin.tsx:607-615`
- **Problem**: In production mode, Microsoft/Google SSO buttons fake success with a `setTimeout` — no real OAuth redirect.
- **Impact**: Enterprise clients expecting SSO will find non-functional buttons.
- **Fix**: Implement real OAuth redirect flow or hide SSO buttons in production.

### 5. Onboarding Data Never Persisted
- **Segment**: 1 (Auth)
- **File**: `client/src/concept2cure/auth/ZenOnboarding.tsx:252-264`
- **Problem**: `handleComplete()` does `await new Promise(resolve => setTimeout(resolve, 1000))` then sets a localStorage flag. Project name, submission type, and preferences are thrown away.
- **Fix**: Call `POST /api/concept2cure/onboarding/complete` with preferences.

### 6. Two Competing Document Tables
- **Segment**: 5 (Document Creation)
- **Tables**: `concept2cureArtifacts` (used by DossierMap, IND AutoDraft) vs `documents` (used by "Open in Editor" from chat)
- **Problem**: Documents created from different paths land in different tables. They're invisible to each other's query paths.
- **Fix**: Converge on `concept2cureArtifacts` as the single document table. Add migration to move any `documents` records.

---

## HIGH PRIORITY ISSUES

### 7. Security Section in Settings Is Decorative
- **Segment**: 11
- **File**: `client/src/concept2cure/layouts/ZenSettings.tsx`
- **Problem**: 2FA toggle is local `useState(true)` not connected to real MFA endpoints. Password Change, Active Sessions, Export Data, Delete Account buttons have no handlers.
- **Fix**: Wire to existing `POST /api/auth/mfa/setup|enable|disable` endpoints.

### 8. Integrations Store Credentials in localStorage
- **Segment**: 11
- **Problem**: 10 enterprise integrations (Medidata, Veeva, Slack, etc.) save OAuth secrets and API keys to unencrypted browser storage.
- **Fix**: Move credential storage to server-side encrypted storage.

### 9. Sidebar Navigation Bugs
- **Segment**: 2
- **File**: `client/src/concept2cure/layouts/ZenSidebar.tsx:923`
- **Problem**: "Overview" maps to wrong layout ID → falls back to projects list. "Submit" ID missing from layout map.
- **Fix**: Add correct entries to `SIDEBAR_NAV_TO_LAYOUT` map.

### 10. 6 Raw fetch() Calls in AnA Chat
- **Segment**: 9
- **File**: `AnaPersistentPanel.tsx`
- **Problem**: Bypasses `apiRequest()` centralized auth. Has its own token refresh mechanism.
- **Fix**: Replace with `apiRequest()` calls.

---

## MEDIUM PRIORITY ISSUES

| # | Issue | Segment | Fix |
|---|-------|---------|-----|
| 11 | Chat messages not persisted (lost on refresh) | 9 | Persist to DB, load on mount |
| 12 | PDF export low-fidelity (pdf-lib text layout) | 8 | Use puppeteer for HTML→PDF |
| 13 | Google Drive folderPath expects ID but UI shows path | 8 | Fix UI placeholder |
| 14 | Signup uses raw `fetch()` not `apiRequest()` | 1 | Replace with `apiRequest()` |
| 15 | Appearance settings (theme, compact) not persisted | 11 | Persist to user profile |
| 16 | 36 raw `<button>` elements across 17 files | Frontend | Replace with `<Button>` |
| 17 | 13 raw `<textarea>` elements across 8 files | Frontend | Replace with `<Textarea>` |

---

## What Works Excellently

These areas are **production-quality** and require no changes:

1. **Authentication** — bcrypt, JWT, account lockout, rate limiting, MFA (TOTP + recovery codes)
2. **Review & Approval** — Reviewer assignment, tracked changes, approval gating, e-signatures (21 CFR Part 11)
3. **E-Signatures** — PIN verification, document hashing, signature meaning/intent, full audit trail
4. **RIM Intelligence** — 6 judgment models, 16 patterns, 4 interceptors, signal capture
5. **AnA Chat** — 43 slash commands, domain prompts, context-aware, 3 chat modes
6. **Regulatory Tools** — 510(k), PMA, CSR, HAQ Manager, Compliance Scanner, Hallucination Check
7. **DMS Connectors** — All 5 (SharePoint, OneDrive, Google Drive, Veeva Vault, Box) with real upload methods
8. **Editor** — 28+ TipTap extensions, CRDT collaboration, source traceability, AI actions
9. **Dossier Map** — Full CTD hierarchy, section-level status tracking
10. **Billing** — Real Stripe integration, 5 tabs

---

## Fix Plan: Priority Order

### Phase 1: Demo Blockers (1 day)
1. Wire Sign Out button → `authService.logout()`
2. Install 4 missing TipTap packages
3. Wire `NewProjectModal` → `POST /api/concept2cure/projects`
4. Fix sidebar nav map (Overview, Submit entries)

### Phase 2: Data Integrity (2 days)
5. Converge document tables to single `concept2cureArtifacts`
6. Persist onboarding data to server
7. Persist chat messages to DB
8. Move integration credentials from localStorage to server

### Phase 3: Standards Compliance (3 days)
9. Replace 6 raw `fetch()` in AnaPersistentPanel with `apiRequest()`
10. Replace raw `fetch()` in ZenSignup with `apiRequest()`
11. Wire security settings to real MFA endpoints
12. Replace 36 raw buttons with `<Button>` component
13. Replace 13 raw textareas with `<Textarea>` component

### Phase 4: Polish (2 days)
14. Implement real SSO OAuth flow (or hide buttons)
15. Upgrade PDF export to use puppeteer
16. Persist appearance settings
17. Fix Google Drive folder path UI

---

## Detailed Segment Reports

Each segment has a dedicated report with line-by-line evidence:

| Report | File |
|--------|------|
| Segment 1: Auth | `docs/reports/clickthrough-seg1-auth.md` |
| Segment 2: Dashboard | `docs/reports/clickthrough-seg2-dashboard.md` |
| Segment 3: Projects | `docs/reports/clickthrough-seg3-projects.md` |
| Segment 4: Project Home | `docs/reports/clickthrough-seg4-project-home.md` |
| Segment 5: Doc Creation | `docs/reports/clickthrough-seg5-doc-creation.md` |
| Segment 6: Editor | `docs/reports/clickthrough-seg6-editor.md` |
| Segment 7: Review | `docs/reports/clickthrough-seg7-review.md` |
| Segment 8: Export | `docs/reports/clickthrough-seg8-export.md` |
| Segment 9: Chat | `docs/reports/clickthrough-seg9-chat.md` |
| Segment 10: Regulatory | `docs/reports/clickthrough-seg10-regulatory.md` |
| Segment 11: Settings | `docs/reports/clickthrough-seg11-settings.md` |
