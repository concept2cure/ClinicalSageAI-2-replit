# CURRENT CANONICAL STATE — PR-aware lock (2026-04-01)

## Scope and constraints

This lock reflects current live code in this checkout plus open-PR risk posture.
Remote PR branch refs are not locally available, so PR sections are intent-aware and conservative.

## Canonical browser entry

- Browser entry remains `client/src/main.tsx` rendering `<App />`.
- Root app shell route authority remains `client/src/App.jsx` with Concept2Cure aliases/fences.

## Canonical auth entry

- Canonical login path: `/concept2cure/login`.
- Alias paths expected to redirect: `/login`, `/auth`, `/sign-in`.
- Protected project shell route path remains under `/concept2cure/*` with auth-aware flow.

## Canonical shell

- Primary shell entry: `/concept2cure`.
- Canonical project shell: `/concept2cure/project/:projectId`.
- Legacy `/client-portal/*` is compatibility-fenced back to Concept2Cure shell.

## Canonical workspace

- Workspace orchestration remains under ZenApp + `ProjectWorkspaceShell` flow.
- Workspace must preserve create/open/edit + context return continuity.

## Canonical AnA surface

- Primary AnA surface remains the Concept2Cure persistent chat panel.
- Backend chat safety expects tenant-aware and thread/org-bound behavior.

## Canonical beta demo path

1. `/` resolves into Concept2Cure auth-aware flow.
2. login aliases resolve to `/concept2cure/login`.
3. authenticated user enters `/concept2cure` then project route.
4. governed artifact/document route can be opened and return to project workspace.

## Compatibility fences

- `/client-portal` and `/client-portal/:rest*` must not become alternate product shells.
- Billing and auxiliary aliases must route back into Concept2Cure-owned surfaces.

## Tolerated dormant/legacy surfaces

- Legacy pages/routes not mounted on canonical shell may remain present in code if fenced and unreachable from beta-safe navigation.

## Not-for-promotion surfaces

- Any demo/mock/stub route that is not fail-closed in production.
- Any command/panel route not mounted in canonical shell.

## Outstanding PR impact on canonical behavior

### PRs that likely change canonical behavior (high review)
- PR 334 (conversation scope + command/panel safety) — yes, likely canonical behavior impact.
- PR 333 (governed fail-close + exports) — yes, governed behavior impact.
- PR 335 (mock/fallback fail-close + tenant strictness) — yes, runtime behavior impact.

### PR that must not alter canonical behavior in one shot
- PR 332 — full merge is explicitly disallowed; only tiny proven slices may be rescued.

