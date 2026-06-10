# GOVERNANCE_BINDING_CONTRACT.md — Tasking · Approval Gates · RBAC

> **Binding contract for Claude Code on the compliance core.** It records the
> confirmed governance invariants AND the verified code reality, so the UI's
> compliance model is backed by enforcement, not aspiration. Companion to the
> governance design spec; this file is the **code-reality binding** of it.
> Basis: a three-agent verification of `concept2cure-v2` (2026-06-03).
> Branch: `concept2cure-v2`.

## 0. The through-line (the invariant that holds it together)

**Permission is the source of truth — never the task.** Tasking eligibility and
approval authority are **server-side projections of RBAC, re-checked at action
time** — never carried on the task or the workflow step. Admin owns the
permission atoms `(role × action × resourceType/CTD-module × classification ×
scope)`; the task and the gate only *reference* them. "Who can sign the Reg-Lead
gate on labeling for Org A" is *derived* as the set of users holding
`sign × labeling × Regulatory × {scope}` — it is not stored.

## 1. Confirmed invariants (non-negotiable — operator-confirmed)

1. **Permission is derived, not connected.** Eligibility/authority are projections
   of the atom store, evaluated server-side at action time.
2. **SoD author≠approver is a HARD, un-disableable code path.** Admin may only
   *add* approvers (tighten to four-eyes); **no one — including System Admin — can
   remove the author/approver split or self-approve.** It is a code invariant, not
   a permission row Admin can edit.
3. **A gate is a signed state transition** — meaning (Authored/Reviewed/Approved) +
   re-auth at every signing + SHA-256 content/version binding. A post-sign edit
   auto-invalidates the signature and opens a `change_control` record.
4. **Type drives the chain** — risk tier, gate chain, eligible roles, classification,
   and rule pack are all functions of the document/filing type. Labeling and
   submission-publish are Highest risk → forced four-eyes.
5. **Server-side enforcement; client role is distrusted.** (Already real — keep.)

## 1.5. Build status — shipped this session (on `concept2cure-v2`)

The foundational governance core is now built, tested, and pushed:
- **SoD author≠signer is enforced (un-disableable)** on `/api/c2c/actions/sign` +
  `/lock` (`a5f0fc3`) — self-sign now 403s, resolved from the real owner column
  per target type. 8 unit tests.
- **The permission-atom engine** (`f358707`) — server-side `(role × action ×
  resourceType × ctdModule × classification)`, deny-by-default, explicit-deny-wins;
  code defaults ∪ Admin-curated `c2c_governance_grants` (idempotent migration).
  This is the "derived, not connected" core. 8 unit tests.
- **The eligibility projection** (`cffda64`) — `GET /api/c2c/governance/eligible`
  + `/can` derive who-can-act from RBAC server-side (not stored on the task).
- **RBAC authority gate on sign/lock** (`4212919`) — dark-launched behind
  `GOVERNANCE_RBAC_ENFORCE`; flip on after validating role data in preview.

These move several §2 rows from BUILD/PARTIAL toward REAL. The remainder
(four-eyes, classification model, substrate consolidation + signature-as-state-
transition + change_control wiring, the universal state machine, the
non-skippable legacy review quorum) is the live-infra / substrate-decision tier
in §6–§7 — it needs the real preview DB and the canonical-substrate call.

## 2. Reality — real / connect / build (the binding truth)

Legend: **REAL** (built, keep) · **CONNECT** (foundation exists, wire it) ·
**BUILD** (does not exist).

### 2.1 Authorization model

| Element | Verdict | Evidence | Claude Code action |
|---|---|---|---|
| Server-side role resolution; client role distrusted; deny-by-default | **REAL** | `server/auth.ts:100-119`; `mw/rbac.ts:21` ("ignore client-supplied role") | Keep; route everything through one resolver |
| Single canonical role taxonomy | **BUILD** | **8 disjoint role vocabularies**; canonical `organization_users.role` has 4 (admin/manager/member/viewer); `approver`/`reviewer`/`author` are checked (`concept2cure.ts:9091`) but **unassignable** (`tenant-users.ts` writes 4) | Define one taxonomy; widen the assignable enum so governance roles exist |
| Permission atoms `(role×action×resource/CTD×classification×scope)`, Admin-owned | **BUILD** | only hard-coded matrices (`part11ComplianceService.ts:651`, `concept2cure.ts:9091`) + free-text `permissions json`; no atoms table; no admin permissions route (`admin-security.ts` is read-only) | Build a `role_permissions`/policy store Admin curates as rows |
| SoD author≠approver | **PARTIAL** | hard-coded (no toggle) on the **review** path (`concept2cure.ts:10364, 10807`); **absent** on approve/sign/lock; quorum gate **skipped when no reviewers assigned** (`:9292`) | Build a shared author≠signer primitive on approve/sign/lock; make quorum non-skippable |
| Scope (org/project/program) | **PARTIAL** | org REAL (everywhere); project REAL but a parallel system (`client_user_permissions`, `project-sharing-access.ts`); program is **not** a permission axis | Unify the two scope systems; add program/workspace |

### 2.2 Gate · e-signature · state machine

| Element | Verdict | Evidence | Action |
|---|---|---|---|
| E-sig record: meaning enum + content/version SHA-256 hash | **REAL in substrate A only** | `compliance.electronic_signatures` (`db/migrations/080_*`) — 10-value `signature_meaning`, `record_hash`+`record_version`, immutable trigger. Free-text in `electronic_signatures` (public). **Absent in `c2c/actions` sign (the UI path)** — it binds the action payload hash, not document content | **Decision:** make substrate A canonical; CONNECT the UI sign to it |
| Re-auth every signing (11.200) | **REAL (C/D) · STUBBED (B)** | bcrypt+TOTP in `c2c/actions.ts:201-224` and `esignature.ts:67-115`; `signing/routes.ts:284` says *"for demo, we'll just proceed"* | CONNECT real re-auth into substrate B |
| Content-hash binding → post-sign auto-invalidate → change_control | **PARTIAL/MISSING** | detect-on-read only (`cortexComplianceService.verifySignature`); immutable trigger permits TRUE→FALSE; `compliance.change_control` table exists with `approval_signature_id` FK — **but nothing wires edit→invalidate→change_control** | CONNECT: write-time hook flips `is_valid=false` + opens change_control |
| Universal `submission_status_history` | **MISSING** | only `ectd_submission_status_history` (eCTD-only, **no allowed-transition guard**); `governance-boundary-service` has the real transition guard but persists to `governance_boundary_transitions` and gates on assumptions/decisions/contradictions, **not signatures**; signatures are **not recorded as transitions** in any machine | **Decision + BUILD:** designate/unify one machine; record signatures as transitions |
| Gate chains vary by type, enforced order | **PARTIAL** | REAL ordered chains in substrate B (`signing.workflow_definitions`) for **CER/CSR/Protocol/eCTD**; `sign_document` enforces step order. **API layer is broken (schema drift, `signing/routes.ts:78-152`)**; **no chains for CMC/MDx/510(k)/HAQ/labeling** | CONNECT (fix the drift) + BUILD (missing chains) |
| Four-eyes (two **independent** approvers) | **MISSING** | order enforced; independence never checked; `requires_dual_control`/`signatureLevel` flags exist but **unread** | BUILD: distinct-signer check in `sign_document`; read the dual-control flags |

### 2.3 Classification · CTD · the projection (the through-line)

| Element | Verdict | Evidence | Action |
|---|---|---|---|
| Classification tiers (PHI/PII/Regulatory) | **MISSING** | only log-scrub keys (`logger.ts:75`) + a coarse RAG `accessLevel`; `c2c_documents` has no classification column; classification feeds **no** gate | BUILD: classification column + service; make it a gate input |
| CTD→table map (as a permission axis) | **PARTIAL** | real CTD tree (`ectd.module_structure`), section→path (`reg/ectdMap.ts`), docs typed by module/section (`ctd_onboarding_documents`, `c2c_document_sections.section_key`) — but **never joined to a role/action grant** | CONNECT: bind CTD-module as a `resourceType` in the atom store |
| **Tasking eligibility / approval authority = projection of RBAC** | **MISSING — authority is carried/stored** | assignment is **workload-only** (`getOptimalAssignee`, zero permission filter); approvers are a **stored list matched by string equality** (`ApprovalOrchestrator.ts:207`); `/api/c2c/actions/sign` has **no RBAC gate** (re-auth only); OPA (`concept2cure.rego`) is hollow + observe-only + unmounted on sign/approve/assign | **BUILD** an eligibility-derivation endpoint ("who can sign/approve/be-assigned this"); gate assignment on capability; CONNECT: resolve `approverType:'role'` to holders; turn OPA to enforce + read `resourceType` |

## 3. The four signing substrates (operator decision required)

| Substrate | Has | Use it for |
|---|---|---|
| **A `compliance.*`** (`080_*`, `cortexComplianceService`) | meaning enum (10), content+version hash, immutable trigger, `change_control` table | **Canonical signature record** (recommended) |
| **B `signing.*`** (`041_*`, `signing/routes.ts`) | ordered chains-by-type, step-order enforcement | **Canonical chain engine** (fix the API drift) |
| **C `electronic_signatures`** (public, `esignature.ts`) | free-text meaning, metadata-only hash, UI-wired | Deprecate / migrate onto A |
| **D `c2c/actions` sign** (`actions.ts`) | re-auth, audit ledger, no document binding | Keep as the **audit envelope**; do not treat as the Part 11 record |

**Recommendation:** A for the record, B for the chain, D for the audit envelope,
retire C. **This is the operator's call** and it gates §2.2.

## 4. Refuse-list (Claude Code guardrails — must 4xx, never proceed)

1. **SoD breach** — signer/approver == author/creator of the target → 403 (un-disableable).
2. **Authority-on-the-task** — never trust an assignee/approver list as authority;
   re-derive from the atom store at action time.
3. **Ungrounded advancement** — the groundedness gate (`ai-governance/review-policy`)
   must fire on `sign`/`lock`, not only `accept-ai-suggestion`.
4. **In-place edit of an approved/signed record** — must invalidate the signature
   and open `change_control`; never silently mutate.
5. **PHI mis-handling** — (gate to build) block export/publish/sign on un-redacted PHI.
6. **Re-auth skipped** — every signing re-authenticates (password + TOTP); never
   reuse session auth.

## 5. What was NOT changed this pass, and why (transparent)

No enforcement code was blind-shipped on the compliance heart. Each candidate fix
encodes a **policy decision tied to the unbuilt/fragmented model**:
- A **role-gate on `/sign`** depends on the (broken) role taxonomy — gating to
  `['admin','approver','reviewer']` collapses to admin-only because the other two
  are unassignable, breaking legitimate signing.
- **author≠signer on the universal `/sign`** needs the canonical substrate decision
  (the UI path D binds no document/meaning) and per-target author resolution.
- **Four-eyes** has no policy primitive to read yet.

On the compliance heart, a wrong gate is itself a finding. These are precise
BUILD/CONNECT items in §2, to be implemented against the live DB once the §6
decisions are made — not guessed.

## 6. Operator decisions that gate the build

1. **Canonical signature substrate** (recommend A) + **canonical chain engine** (B).
2. **The role taxonomy** (the "8 roles") — define once; widen the assignable enum so
   `author/reviewer/approver` are real, assignable roles.
3. **Four-eyes policy primitive** — per-type, Admin-tightenable, never loosenable.
4. **Universal status machine** — unify `ectd_submission_status_history` + the
   boundary machine, or designate one; record signatures as transitions.
5. **Classification model** — PHI/PII/Regulatory as a first-class column + which
   document families carry it + that it is a gate input.

## 7. Build order (once §6 is decided)

1. Atom store + canonical taxonomy (the source of truth everything derives from).
2. author≠signer primitive on approve/sign/lock + non-skippable quorum (the SoD invariant).
3. Eligibility-derivation endpoint (turns "carried" into "derived").
4. Canonical substrate consolidation + signature-as-state-transition + change_control wiring.
5. Four-eyes + the missing type chains (labeling/CMC/MDx/510(k)/HAQ) + risk-tier gate composition.
6. Classification model + PHI gate; CTD-module as a permission axis.

---

*This contract binds the governance design spec to verified code reality. Where it
says REAL, verify and keep; where CONNECT, wire the existing pieces; where BUILD,
it does not exist yet. The confirmed invariants in §1 and the refuse-list in §4 are
the floor for every tasking, approval, signature, and submission flow.*
