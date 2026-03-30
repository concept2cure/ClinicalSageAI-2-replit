# AnA Single-Brain Hardening — Proof Deliverable

> Date: 2026-03-30
> Sprint: AnA Single-Brain Hardening
> Branch: `concept2cure-v2`
> Test suite: `tests/ana-single-brain.test.ts` — **24/24 passing**

---

## Executive Summary

This sprint eliminated split-brain runtime behavior in AnA, moved evidence validation into the canonical path, tightened memory acceptance, centralized auth, and reduced UI/runtime/auth drift. The result is a single coherent AnA brain where `/chat` and `/stream` endpoints share identical capabilities, evidence is validated semantically, memory acceptance has quality gates, and auth flows through one module.

---

## Phase Completion Matrix

| Phase | Name                        | Status           | Key Deliverable                                                       |
| ----- | --------------------------- | ---------------- | --------------------------------------------------------------------- |
| 1     | Audit                       | ✅ Complete      | `docs/audits/ANA-SINGLE-BRAIN-AUDIT-2026-03-30.md`                    |
| 2     | Runtime Unification         | ✅ Complete      | `/chat` now has command + guidance executors matching `/stream`       |
| 3     | Panel Refactoring           | ✅ Complete      | Auth centralized, dev-login removed, fallback markers added           |
| 4     | PR Salvage (#309/#310/#311) | ✅ Complete      | Queue state, evidence validation, auth token — all salvaged correctly |
| 5     | Evidence Validation         | ✅ Complete      | `server/services/ana-ri/evidence-validation.ts`                       |
| 6     | Enforcement Upgrade         | ✅ Complete      | Overclaim detection in `enforcement.ts`                               |
| 7     | Memory Acceptance           | ✅ Complete      | `server/services/ana-ri/memory-acceptance.ts`                         |
| 8     | Fallback Honesty            | ✅ Complete      | `_fallback` markers on cortex degraded path                           |
| 9     | Auth Reconciliation         | ✅ Complete      | `client/src/utils/authToken.ts` — single source of truth              |
| 10    | Tests                       | ✅ Complete      | 24/24 passing                                                         |
| 11    | Proof                       | ✅ This document |

---

## New Files Created

### Server

| File                                            | Purpose                                                               | Lines |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----- |
| `server/services/ana-ri/response-contract.ts`   | Canonical response envelope types + builder helpers                   | ~160  |
| `server/services/ana-ri/evidence-validation.ts` | Semantic evidence validation (grounding, overclaims, contradictions)  | ~280  |
| `server/services/ana-ri/memory-acceptance.ts`   | Memory quality gate (confidence scoring, dedup, contradiction checks) | ~280  |

### Client

| File                                                | Purpose                                                                       | Lines |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ----- |
| `client/src/utils/authToken.ts`                     | Centralized auth token management (sessionStorage-first)                      | ~90   |
| `client/src/concept2cure/hooks/useAnaChatClient.ts` | Canonical chat runtime adapter (stream primary + chat fallback)               | ~240  |
| `client/src/concept2cure/hooks/useAnaQueueState.ts` | Queue state machine (idle→queued→streaming→post_processing→completed/blocked) | ~130  |

### Tests & Docs

| File                                               | Purpose                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `tests/ana-single-brain.test.ts`                   | 24 tests covering evidence, memory, contracts, enforcement |
| `docs/audits/ANA-SINGLE-BRAIN-AUDIT-2026-03-30.md` | Phase 1 audit document                                     |
| `docs/proof/ANA-SINGLE-BRAIN-PROOF-2026-03-30.md`  | This file                                                  |

---

## Files Modified

### Server

| File                                    | Changes                                                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/routes/ana-ri.ts`               | Added command/guidance executors to `/chat`; added evidence validation + `grounding_strip` SSE event to `/stream`; added `queueMeta` to both paths                                           |
| `server/services/ana-ri/enforcement.ts` | Added `OVERCLAIM_ENFORCEMENT_PATTERNS` (4 patterns); `checkEvidenceDiscipline()` now returns `knownRatio`, `hasOverclaims`, `overclaimCount`; compliance fails on overclaims without [KNOWN] |
| `server/services/ana-ri/index.ts`       | Added barrel exports for evidence-validation, memory-acceptance, response-contract                                                                                                           |

### Client

| File                                                             | Changes                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/lib/auth-headers.ts`                                 | Replaced direct localStorage access with import from `authToken.ts`                                                                                                                                        |
| `client/src/lib/queryClient.ts`                                  | Replaced `_cachedAuthToken` with `getAuthToken()` from `authToken.ts`                                                                                                                                      |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Removed `refreshTokenOnce()` (dev-login token refresh); replaced `buildChatHeaders()` (14-line localStorage) with `getAuthHeaders()`; added `_fallback` markers to cortex path; fixed firecrawl fetch auth |

---

## Before / After Comparisons

### 1. Runtime Parity: `/chat` vs `/stream`

| Capability                                      | Before (split-brain) | After (unified)      |
| ----------------------------------------------- | -------------------- | -------------------- |
| Command execution (`processCommandsInResponse`) | `/stream` only       | Both paths           |
| Guidance execution (`processResponseActions`)   | `/stream` only       | Both paths           |
| Evidence validation (`validateEvidence`)        | Neither              | Both paths           |
| Queue metadata (`queueMeta`)                    | Neither              | Both paths           |
| Memory metadata                                 | Neither              | `/chat` response     |
| Enrichment sources                              | Neither              | `/chat` response     |
| `grounding_strip` SSE event                     | N/A                  | `/stream` done event |

### 2. Auth Token Access

| Pattern                             | Before                       | After                        |
| ----------------------------------- | ---------------------------- | ---------------------------- |
| `localStorage.getItem('token')`     | 6+ direct calls              | 0 — all via `getAuthToken()` |
| `localStorage.getItem('authToken')` | 4+ fallback calls            | 0                            |
| `refreshTokenOnce()` dev-login      | 1 function (30 lines)        | Deleted                      |
| Auth in queryClient                 | `_cachedAuthToken` variable  | `getAuthToken()` import      |
| Auth in AnaPersistentPanel          | 14-line `buildChatHeaders()` | 1-line `getAuthHeaders()`    |

### 3. Evidence Validation

| Aspect              | Before                              | After                                                                       |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Evidence checking   | Format-only (`[KNOWN]` regex count) | Semantic: grounding ratio, overclaim detection, contradiction detection     |
| Overclaim detection | None                                | 4 enforcement patterns, flags strong language without [KNOWN]               |
| Location            | Only in `enforcement.ts`            | `evidence-validation.ts` (semantic) + `enforcement.ts` (format + overclaim) |
| Integration         | Post-hoc scoring                    | Inline in both `/chat` and `/stream` response pipelines                     |

### 4. Memory Acceptance

| Aspect              | Before                        | After                                                                            |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Quality gate        | None — all AI output accepted | `evaluateMemoryCandidate()` pipeline                                             |
| Confidence scoring  | N/A                           | Based on provenance, evidence validation, content quality                        |
| Dedup               | None                          | Hash-based dedup key + check against existing entries                            |
| Contradiction check | None                          | Pattern-based detection (sufficient/insufficient, compliant/non-compliant, etc.) |
| Decision levels     | N/A                           | `auto_accept` (≥0.7), `pending_review` (0.3-0.7), `reject` (<0.3)                |

### 5. Fallback Honesty

| Aspect                       | Before                                 | After                                                                  |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Cortex fallback path         | Silent — UI doesn't know it's degraded | `_fallback` object with `active`, `reason`, `degraded_capabilities`    |
| Degraded capabilities listed | N/A                                    | orchestration, memory_injection, rim_interception, evidence_validation |
| Response contract            | Different shapes per path              | `AnaCanonicalResponse` type shared across all paths                    |

---

## Test Coverage

```
24 tests across 5 describe blocks:

Evidence Validation (6)
  ✓ validates a well-grounded response
  ✓ flags a poorly grounded response
  ✓ passes short responses without deep validation
  ✓ detects multiple source types
  ✓ quick check detects need for attention
  ✓ quick check passes labeled content

Memory Acceptance (6)
  ✓ accepts high-confidence memory
  ✓ rejects too-short content
  ✓ rejects too-long content
  ✓ rejects duplicates
  ✓ flags contradictions for human review
  ✓ lowers confidence for unvalidated evidence

Contradiction Detection (3)
  ✓ detects sufficient/insufficient contradiction
  ✓ detects compliant/non-compliant contradiction
  ✓ does not flag non-contradictory memories

Response Contract (5)
  ✓ builds queue metadata for successful turn
  ✓ builds queue metadata for blocked turn
  ✓ builds queue metadata with error reason
  ✓ builds fallback marker
  ✓ builds empty evidence verdict

Evidence Discipline — Upgraded (4)
  ✓ detects overclaims when no KNOWN labels exist
  ✓ allows strong language when KNOWN labels are present
  ✓ reports known ratio
  ✓ passes a compliant response
```

---

## Known Remaining Work (Not in Sprint Scope)

1. **Hook wiring**: `useAnaChatClient` and `useAnaQueueState` exist but are not yet wired into `AnaPersistentPanel` — the panel still uses its inline fetch chain (now hardened) and `isThinking` boolean. Wiring these hooks is a UI refactor that requires end-to-end testing.

2. **Pre-existing ana-ri.ts issues**: Cognitive complexity (155 in `/chat`, 106 in `/stream`), duplicate `CommandContext` interface, duplicate `research-intelligence` imports. These are pre-existing and require a larger decomposition effort.

3. **Org ID centralization**: `queryClient.ts` still reads `localStorage.getItem('organizationId')` directly. This should be moved to `authToken.ts` in a follow-up.

---

## Architecture Diagram (Post-Sprint)

```
User Message
    │
    ├─→ /api/ana-ri/stream (PRIMARY)
    │     ├─ Context enrichment (RIM + memory assembler)
    │     ├─ AI Gateway → Claude/OpenAI
    │     ├─ Command executor (27 commands)
    │     ├─ Guidance executor (response actions)
    │     ├─ Evidence validation (NEW) → grounding_strip SSE
    │     ├─ RIM interceptors (non-blocking)
    │     └─ SSE: text → orchestration → grounding_strip → done(queueMeta)
    │
    ├─→ /api/ana-ri/chat (FALLBACK 1 — now at parity)
    │     ├─ Same context enrichment
    │     ├─ Same AI Gateway
    │     ├─ Same command executor (NEW)
    │     ├─ Same guidance executor (NEW)
    │     ├─ Same evidence validation (NEW)
    │     ├─ Same RIM interceptors
    │     └─ JSON: response + evidence + queueMeta + memory + actions
    │
    └─→ /api/cortex/chat (FALLBACK 2 — marked degraded)
          ├─ Basic chat only
          └─ _fallback: { active: true, degraded_capabilities: [...] }
```

```
Memory Acceptance Pipeline (NEW)
    │
    Input: AI response content + provenance
    ├─ Basic validation (length, format)
    ├─ Confidence scoring (provenance quality × content quality)
    ├─ Dedup key generation (hash of normalized content + category)
    ├─ Existing memory check (prevent duplicates)
    ├─ Contradiction check (pattern-based negation detection)
    └─ Decision: auto_accept | pending_review | reject
```

```
Auth Token Flow (NEW — Single Source of Truth)
    │
    authToken.ts ← getAuthToken() / setAuthToken() / clearAuthToken()
         │
         ├─ auth-headers.ts (getAuthHeaders → { Authorization: Bearer ... })
         ├─ queryClient.ts (apiRequest() uses getAuthToken())
         └─ AnaPersistentPanel.tsx (getAuthHeaders() for fetch calls)
```
