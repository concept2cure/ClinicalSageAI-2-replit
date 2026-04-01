# Stage 8 - Protected Organs Lock

Date: 2026-04-01
Scope: Stage 8 merge reconciliation and canonical state lock

## Purpose

Define files and subsystems that must not receive deep rewrites during Stage 8 and Stage 9 entry work. Changes are limited to reconciliation, safety, compatibility, and proof capture.

## Lock rules

1. No broad architecture rewrite in any locked file.
2. No route deletions in locked files without route ownership proof.
3. No auth boundary changes without explicit test updates and conflict notes.
4. No shell contract changes (URL contract, project identity source, artifact handoff semantics) unless explicitly approved in later stages.

## Locked files (client shell and governed workspace)

- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx`

Lock reason: these files define the canonical beta shell, project routing behavior, AnA context/handoff continuity, and governed workspace orchestration.

## Locked files (backend mount/auth/db organs)

- `server/index.ts`
- `server/routes/concept2cure.ts`
- `server/routes/auth.ts`
- `server/db.ts`
- `server/db.js`
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/routes/chat.ts`

Lock reason: these files define server mount order, auth and tenant boundaries, canonical product APIs, db compatibility surface, and chat thread/provenance behavior.

## Allowed edits while lock is active

- Conflict-only manual reconcile edits that preserve behavior.
- Compatibility comments/fences clarifying non-canonical paths.
- Test updates that prove behavior equivalence and guard against drift.
- Documentation of reconciliation decisions.

## Explicitly disallowed while lock is active

- New feature expansions in locked organs.
- Refactors aimed at style/aesthetics only.
- Removal of compatibility shims without live owner/traffic proof.
- Any change that breaks Stage 9 pulse path (root -> login -> project route -> workspace shell -> governed open flow).

## Unlock conditions

Locked organs can be partially unlocked only after:

1. Stage 8 merge recommendation accepted.
2. Stage 9 authenticated browser pulse certification passes for canonical beta path.
3. A stage-specific plan explicitly authorizes deeper surgery (e.g., Stage 10 seam extraction, Stage 11 route convergence).
