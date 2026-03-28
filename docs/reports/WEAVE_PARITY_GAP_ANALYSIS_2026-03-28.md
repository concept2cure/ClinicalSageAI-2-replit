# Weave.bio Parity Gap Analysis — ClinicalSageAI

**Date**: March 28, 2026
**Scope**: Full biotech workflow: Login → CSR/CTD/IND Submission

---

## What's FUNCTIONAL (do NOT rebuild)

| Area | Status | Evidence |
|------|--------|----------|
| Authentication & Onboarding | FUNCTIONAL | JWT + MFA + 5-step onboarding + audit trail |
| Project CRUD | FUNCTIONAL | Full REST API, org isolation, Zod validation, soft deletes |
| Project Management | FUNCTIONAL (another session) | Being handled by separate Claude Code agent |
| Task Management | FUNCTIONAL (another session) | Being handled by separate Claude Code agent |
| Document Creation | FUNCTIONAL | 3 modes (blank, template, AI), SHA-256 versioning, audit trail |
| Document Editing | FUNCTIONAL | TipTap editor, optimistic concurrency, version control |
| Document Lifecycle | FUNCTIONAL | State machine (draft→review→approved→locked), role-based, attestation |
| AI Chat (AnA) | FUNCTIONAL | Claude primary, OpenAI fallback, 43+ slash commands, persona routing |
| RIM Intelligence | FUNCTIONAL | 6 judgment models, pattern registry, signal capture, 4 interceptors |
| CTD Navigation (DossierTree) | FUNCTIONAL | Loads real artifacts, computes section coverage, status mapping |
| Submission Readiness | FUNCTIONAL | Backend computes real readiness from artifacts/reviews/tasks |
| Knowledge Management | FUNCTIONAL | 3-layer memory, document upload, connected apps |
| Design System | FUNCTIONAL | Warm stone palette, zen design tokens, Claude.ai-inspired |

---

## What's PARTIALLY WIRED (needs completion)

| Area | Current State | Gap | Priority |
|------|---------------|-----|----------|
| eCTD Navigator | UI scaffolded, no API wiring | Wire to real artifact data like DossierTree | HIGH |
| Submission Builder | UI scaffolded, no endpoint calls | Wire artifact assignment + package generation | HIGH |
| Template Library | Templates defined in code, no persistence | Wire template CRUD to DB + document creation | MEDIUM |
| Review Assignment | UI exists, partial backend | Verify reviewer workflow end-to-end | MEDIUM |
| Document Comments | Schema exists, UI exists | Verify inline comments persist + load | MEDIUM |

---

## What's MISSING (needs building)

| Area | What's Needed | Weave Parity? | Priority |
|------|---------------|---------------|----------|
| Submission Package Export | POST endpoint to assemble eCTD package from project artifacts | YES | HIGH |
| CSR-specific workflow | Guided CSR authoring (sections 1-16) with AI drafting | YES | HIGH |
| IND-specific checklist | IND requirements checklist mapped to CTD sections | YES | HIGH |
| Document comparison/diff | Side-by-side version comparison UI | YES | MEDIUM |
| Regulatory calendar integration | Milestone dates tied to regulatory timelines | NICE-TO-HAVE | LOW |

---

## Recommended Build Order (this session)

Since project/task management is handled by another session, focus on:

1. **Wire eCTD Navigator** — Connect to real artifact data (HIGH, ~30 min)
2. **Wire Submission Builder** — Artifact assignment + readiness calculation (HIGH, ~45 min)
3. **Build Submission Package endpoint** — Assemble eCTD package from artifacts (HIGH, ~1 hr)
4. **Wire Template Library** — Persist templates, create documents from them (MEDIUM, ~30 min)
5. **Verify Review workflow** — Comments, reviewer assignment, approval flow (MEDIUM, ~30 min)
