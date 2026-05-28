# Mutation Primitives — pre-Phase-10.1 backend brief

> One-page brief for Claude Code. Before Phase 10.1 (per-surface AnA dock threading) and before any of the five moats can write audit rows, the universal mutation pattern must exist. This document specifies the **six governed-action endpoints** every UI in the system will consume.
>
> Read after `CLAUDE.md` and `HANDOFF.md`. ~3 days of backend work. Zero new UI — everything we've designed already uses these.

---

## 0 · Why this gates everything

Audit of the current codebase (May 26, 2026):

- **One mutation hook exists** — `useAcceptAnaDraft` posting to `/api/cerv2-sections/:id/accept-ana-draft`.
- **Every other UI mutation is inert** — buttons render but route to console.log or fixture state.
- **The persistent AnA dock's "Approve and run" agentic action card has no server counterpart** — `c2c_ana_actions` doesn't exist.
- **Phase 5's e-sign modal isn't wired** — `<EsignModal>` exists, `/api/audit/logs` exists, but the modal's confirm path doesn't POST anywhere.

Result: ProjectHome's `PH_GOVERNANCE` shows fake "pending / signed / reserved" states; the Today's-Queue "Approve" buttons don't approve anything; the compliance-gate "Apply fix" button doesn't apply. All UI for governed actions is presentational.

This brief lands the six mutation endpoints + one ledger table that every governed UI action consumes. Once shipped, **every existing button starts writing audit rows correctly** with zero UI changes.

---

## 1 · The six universal mutations

All six share one envelope: `{ target, reason, payload, idempotencyKey }`. All six write to `audit_logs` using the PDEV pattern (`actor_id`, `action`, `target`, `reason`, `sha256_chain`). All six are exposed under `/api/c2c/actions/*`.

### 1.1 `POST /api/c2c/actions/claim`
Claim a work item, blocker, HAQ, or section. Reassigns ownership atomically.
```json
{
  "target":  "section:doc_8a21f:m2.5",
  "reason":  "Picking up from Marina while she's blocked on §2.7",
  "payload": { "ownerId": "user_jc" }
}
```
Audit action: `c2c.work.claim`.

### 1.2 `POST /api/c2c/actions/transition`
Transition state along a governed lifecycle. Validates the transition is legal for the target's type.
```json
{
  "target":  "section:doc_8a21f:m2.5",
  "reason":  "Reviewer feedback addressed; ready for QC",
  "payload": { "from": "drafted", "to": "review" }
}
```
Audit action: `c2c.work.transition`.

### 1.3 `POST /api/c2c/actions/resolve`
Resolve a blocker, contradiction, validator finding, or compliance gate.
```json
{
  "target":  "gate:doc_8a21f:m2.5:g2",
  "reason":  "Source-data mismatch corrected per CSR-201 Table 14.1.1",
  "payload": { "fixApplied": "186 adults dosed (184 efficacy-evaluable per protocol)" }
}
```
Audit action: `c2c.work.resolve`.

### 1.4 `POST /api/c2c/actions/sign`
Apply an e-signature. Requires the Part-11 meaning enum; gates the `<EsignModal>`.
```json
{
  "target":  "section:doc_8a21f:m2.5",
  "reason":  "Final QC pass complete; attesting to data integrity",
  "payload": {
    "meaning": "approval",
    "credentialBindingHash": "sha256-…"
  }
}
```
Audit action: `c2c.work.sign`. Server enforces re-authentication if `meaning IN ('approval','release','submission')`.

### 1.5 `POST /api/c2c/actions/accept-ai-suggestion`
Accept an AnA-proposed draft / rewrite / fix / propagation. Supersedes the legacy `useAcceptAnaDraft` route.
```json
{
  "target":  "section:doc_8a21f:m2.5",
  "reason":  "Strengthen-against-precedent pass — accepting AnA v0.4 over v0.3",
  "payload": {
    "actionId":   "act_…",        // c2c_ana_actions row
    "supersedes": "version:v0.3"
  }
}
```
Audit action: `c2c.work.accept_ai_suggestion`. Triggers a `c2c_document_section_versions` snapshot.

### 1.6 `POST /api/c2c/actions/lock`
Lock an artifact (section, document, HAQ response) for review. Immutable until explicitly unlocked.
```json
{
  "target":  "document:doc_8a21f",
  "reason":  "Submission to FDA Day -1; locking the dossier",
  "payload": { "until": "2026-06-04T23:59:59Z" }
}
```
Audit action: `c2c.work.lock`.

### Decline / reverse counterparts
Each mutation has a documented reverse:
- `/actions/unclaim` (with reason)
- `/actions/transition-back` (reason required)
- `/actions/reopen` (resolve → open)
- `/actions/revoke-signature` (Part-11 §11.50(b) — requires the original signature reason + a counter-reason)
- `/actions/reject-ai-suggestion`
- `/actions/unlock`

---

## 2 · The `c2c_ana_actions` ledger

This table is the agentic-action lifecycle store. Every governed mutation begins as a row here (proposed) and ends as a row in `audit_logs` (executed). The ledger lets us replay, undo, and inspect agentic chains.

```sql
CREATE TABLE c2c_ana_actions (
  id              text PRIMARY KEY,                      -- act_<uuid>
  org_id          uuid NOT NULL,
  conversation_id text REFERENCES c2c_ana_conversations(id),
  domain          text NOT NULL,                          -- 'mdx' | 'biopharma' | 'pdev'
  surface         text NOT NULL,                          -- 'overview' | 'ind' | 'authoring' | …
  command         text NOT NULL,                          -- 'claim' | 'transition' | 'resolve' | 'sign' | 'accept' | 'lock'
  target          text NOT NULL,                          -- typed pointer, see §3
  risk            text NOT NULL DEFAULT 'low',            -- 'low' | 'med' | 'high'
  payload         jsonb NOT NULL,
  agentic_mode    text NOT NULL DEFAULT 'suggest',        -- 'suggest' | 'act_without_asking'
  state           text NOT NULL DEFAULT 'proposed',       -- proposed | approved | modified | skipped | executed | failed | reversed
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  proposed_by     uuid NOT NULL REFERENCES users(id),
  decided_at      timestamptz,
  decided_by      uuid REFERENCES users(id),
  decision_reason text,                                   -- required when risk='high' AND state='approved'
  executed_at     timestamptz,
  audit_row_id    bigint REFERENCES audit_logs(id),       -- backlink once executed
  reverse_of      text REFERENCES c2c_ana_actions(id),    -- set when this row reverses another
  idempotency_key text UNIQUE
);
CREATE INDEX c2c_ana_actions_conv_idx   ON c2c_ana_actions (conversation_id);
CREATE INDEX c2c_ana_actions_state_idx  ON c2c_ana_actions (state) WHERE state IN ('proposed','approved');
CREATE INDEX c2c_ana_actions_target_idx ON c2c_ana_actions (target);
```

Idempotency: every mutation accepts an optional `idempotencyKey`. If a row already exists with the same `(org_id, idempotency_key)`, the existing row is returned with HTTP 200 — no double-write. Required for the AnA dock's "Approve and run" button (UI may retry on network blip).

---

## 3 · Typed target pointers

Every `target` is a typed URI. Server-side resolver validates the typed prefix exists.

| Prefix | Resolves to | Example |
|---|---|---|
| `program:<id>` | `regulatory_programs` row | `program:bx-204` |
| `document:<id>` | `c2c_documents` row | `document:doc_8a21f` |
| `section:<docId>:<sectionKey>` | `c2c_document_sections` row | `section:doc_8a21f:m2.5` |
| `paragraph:<docId>:<sectionKey>:<paragraphId>` | text run inside a section | `paragraph:doc_8a21f:m2.5:p4` |
| `task:<id>` | `c2c_project_work_items` row | `task:T-4811` |
| `haq:<id>` | inbound HAQ from correspondence | `haq:HAQ-2026-04-22-A` |
| `submission:<id>` | `c2cSubmissionPackages` row | `submission:NDA-212345` |
| `blocker:<id>` | `c2c_submission_blockers` row | `blocker:b1` |
| `gate:<docId>:<sectionKey>:<gateId>` | inline compliance-gate finding (Moat #1) | `gate:doc_8a21f:m2.5:g2` |
| `signal:<id>` | PV signal | `signal:s1` |
| `interaction:<id>` | FDA / EMA / PMDA correspondence | `interaction:int_…` |

---

## 4 · Audit envelope

Every mutation writes one `audit_logs` row before returning success. PDEV pattern, no exceptions.

```jsonc
{
  "action": "c2c.work.claim",
  "actor_id": "user_jc",
  "target": "section:doc_8a21f:m2.5",
  "target_type": "section",
  "target_id":   "doc_8a21f:m2.5",
  "reason": "Picking up from Marina while she's blocked on §2.7",
  "payload_hash": "sha256-…",
  "ana_action_id": "act_…",     // backlink to c2c_ana_actions row, if AnA-mediated
  "sha256_chain": "sha256-…",
  "occurred_at": "2026-05-26T07:48:11.043Z"
}
```

High-risk actions (`sign`, `lock`, `submission` family) MUST be re-authenticated (the existing `<EsignModal>` re-prompts for password). The server validates the re-auth nonce before writing.

---

## 5 · Hook surface (client)

One generic hook + six convenience wrappers. Drop into `client/src/concept2cure/_shared/hooks/`.

```ts
// Generic
export function useC2cAction<TPayload = unknown>(command: C2cActionCommand): {
  trigger: (args: { target: string; reason: string; payload?: TPayload; risk?: C2cRisk }) => Promise<C2cActionResult>;
  pending: boolean;
  error: string | null;
};

// Convenience wrappers (auto-set `command`)
export const useClaim            = () => useC2cAction('claim');
export const useTransition       = () => useC2cAction('transition');
export const useResolve          = () => useC2cAction('resolve');
export const useSign             = () => useC2cAction('sign');
export const useAcceptAi         = () => useC2cAction('accept-ai-suggestion');
export const useLock             = () => useC2cAction('lock');
```

`useC2cAction` handles the reason-required Part-11 modal automatically when `risk='high'`. The modal IS the existing `<EsignModal>`.

---

## 6 · Migration · what to rewire

When this lands, six existing UI surfaces start writing audit rows correctly with no code change in the surface itself — only the underlying hook wraps differently:

| UI surface | Currently | After |
|---|---|---|
| ProjectHome governance panel | `PH_GOVERNANCE` fixture | reads `audit_logs WHERE action='c2c.work.sign' AND target='program:…'`; signature panel renders the real chain |
| Authoring's "Submit for review" button | inert | `useTransition().trigger({ target: 'document:…', payload: { from: 'draft', to: 'review' } })` |
| Selection-toolbar "Apply fix" button (Moat #1) | inert | `useResolve().trigger({ target: 'gate:doc:sec:g2', payload: { fixApplied: '…' } })` |
| AnA dock "Approve and run" card | inert | `useC2cAction(card.command).trigger(card.envelope)` |
| Project home "Resolve" on blockers | inert | `useResolve().trigger({ target: 'blocker:…' })` |
| `useAcceptAnaDraft` | `/api/cerv2-sections/:id/accept-ana-draft` | `useAcceptAi().trigger({ target: 'section:…', payload: { …existing payload } })` — legacy route 301-redirects |

Six surfaces light up the moment the backend lands.

---

## 7 · Acceptance

- [ ] All six endpoints under `/api/c2c/actions/*` ship with the documented envelope.
- [ ] All six write `c2c_ana_actions` row + `audit_logs` row in one transaction.
- [ ] Idempotency key honored; duplicate POSTs return the same `act_…` ID.
- [ ] High-risk mutations refuse without a re-auth nonce (HTTP 401 with `WWW-Authenticate: ReAuth required`).
- [ ] Reverse counterparts work for every mutation.
- [ ] Legacy `/api/cerv2-sections/:id/accept-ana-draft` redirects to `/api/c2c/actions/accept-ai-suggestion` (301).
- [ ] `audit_logs.sha256_chain` is recomputed on every write (existing middleware).
- [ ] Hook surface lives at `client/src/concept2cure/_shared/hooks/useC2cAction.ts`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 8 · Out of scope

- The Phase 9 `c2c_documents` schema migration — a separate brief.
- The Phase 10.1 per-(domain, surface) thread store extension — depends on this, not the other way around.
- Specific moats (compliance gates, HAQ simulator, propagation, submission gateway, network) — they consume these endpoints but have their own briefs.
- The shared `<EsignModal>` re-auth gate — already exists from Phase 5; this brief assumes it's the modal that fires on `risk='high'`.

---

## 9 · Timeline

| Day | Work |
|---|---|
| 1 | Schema migration: `c2c_ana_actions` table, indexes, FK to `audit_logs`. Idempotency-key uniqueness constraint. |
| 2 | Six route handlers + reverse counterparts. Each writes `c2c_ana_actions` then `audit_logs` in one transaction. Typed-target resolver. Re-auth gate. |
| 3 | Client hook (`useC2cAction` + six wrappers). Legacy `useAcceptAnaDraft` shim. ProjectHome governance panel rewire. Smoke tests. |

After day 3, every other roadmap item has a writable audit floor.
