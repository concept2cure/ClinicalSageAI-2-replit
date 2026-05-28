# Phase 10.1 — Persistent AnA dock (install delta)

> Companion to `PHASE_10_INSTALL.md`. Adds the always-present, agentic right-side AnA dock as a chassis primitive. Read after `PHASE_10_INSTALL.md`.

---

## 0 · What this delta ships

The biopharma kit now includes `AnaDock.jsx` — a 400px persistent conversation surface that replaces the legacy 32px-only seam pattern. It is:

- **Always available** on every biopharma surface (seam when closed, dock when open).
- **Scope-aware** — header auto-updates as `activeNav` changes; the system context AnA receives includes `{ workstream, activeNav, authoringView }`.
- **Per-surface threaded** — each surface keeps its own thread; switching surfaces preserves both conversations.
- **Agentic** — composer exposes 8 governed slash commands (`/draft`, `/cite`, `/precedent`, `/compare`, `/validate`, `/submit`, `/lock`, `/flag`) each tagged with a risk level. A *Suggest only* ↔ *Act without asking* toggle flips between confirmation-required and direct-execution modes. Every action card carries the audit-reason capture line.

This pattern graduates to the shared chassis in v2 — `_shared/shell/AnaDock.tsx` takes `domain` + `activeNav` props and the host shell wires it once.

---

## 1 · Files

| Kit source                      | Lands at                                                     |
|---------------------------------|--------------------------------------------------------------|
| `ui_kits/biopharma/AnaDock.jsx` | `client/src/concept2cure/_shared/shell/AnaDock.tsx`          |
| `ui_kits/biopharma/styles.css`  | merge the `ANA DOCK` banner block into `_shared/app.css`     |

The seam component (`AnaSeam`) stays as-is — it's now imported from the same file.

---

## 2 · Hooks Phase 10.1 introduces

```ts
// Per-(user, domain, surface) thread store
useAnaThread(domain, surface)              // GET /api/ana-ri/threads?domain=…&surface=…
useAnaThreadSend()                         // POST /api/ana-ri/stream (already exists — add moduleContext.surface)
useAnaThreadReset()                        // POST /api/ana-ri/threads/reset

// Agentic action lifecycle
useAnaActionPropose()                      // POST /api/ana-ri/actions  (creates a pending action card)
useAnaActionApprove()                      // POST /api/ana-ri/actions/:id/approve (audited)
useAnaActionModify()                       // PATCH /api/ana-ri/actions/:id
useAnaActionSkip()                         // POST /api/ana-ri/actions/:id/skip (audited)

// User preference for agentic mode (per domain)
useAnaAgenticMode(domain)                  // GET /api/ana-ri/preferences/agentic?domain=…
useAnaAgenticToggle()                      // PUT /api/ana-ri/preferences/agentic
```

Every action mutation MUST forward `reason: string`. The `Approve and run` button in the dock requires a non-empty reason if the action's `risk='high'` (the kit's UI elides this for the demo; v2 must enforce it).

---

## 3 · Database delta (additive)

Phase 8 already shipped `c2c_ana_conversations` and `c2c_ana_conversation_turns`. Phase 10.1 adds **per-surface scoping** + **the agentic action ledger**:

```sql
-- Per-(user, domain, surface) thread index — was Phase 8 (user, surface).
ALTER TABLE c2c_ana_conversations
  ADD COLUMN IF NOT EXISTS domain text;
CREATE INDEX IF NOT EXISTS c2c_ana_conversations_user_domain_surface_idx
  ON c2c_ana_conversations (owner_id, domain, surface);

-- Agentic action ledger — proposed / approved / modified / skipped lifecycle.
CREATE TABLE c2c_ana_actions (
  id              text PRIMARY KEY,                      -- act_<uuid>
  org_id          uuid NOT NULL,
  conversation_id text NOT NULL REFERENCES c2c_ana_conversations(id),
  domain          text NOT NULL,
  surface         text NOT NULL,
  command         text NOT NULL,                          -- 'draft' | 'cite' | 'precedent' | …
  risk            text NOT NULL,                          -- 'low' | 'med' | 'high'
  payload         jsonb NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  proposed_by     uuid NOT NULL REFERENCES users(id),
  agentic_mode    text NOT NULL,                          -- 'suggest' | 'act_without_asking'
  state           text NOT NULL DEFAULT 'proposed',       -- proposed | approved | modified | skipped | executed | failed
  decided_at      timestamptz,
  decided_by      uuid REFERENCES users(id),
  decision_reason text,                                   -- required when risk='high' and state='approved'
  executed_at     timestamptz,
  result_ref      text
);
CREATE INDEX c2c_ana_actions_conv_idx ON c2c_ana_actions (conversation_id);
CREATE INDEX c2c_ana_actions_state_idx ON c2c_ana_actions (state) WHERE state IN ('proposed','approved');

-- Per-user preference: default agentic mode per domain.
CREATE TABLE c2c_ana_agentic_prefs (
  user_id  uuid NOT NULL REFERENCES users(id),
  domain   text NOT NULL,
  mode     text NOT NULL DEFAULT 'suggest',                -- 'suggest' | 'act_without_asking'
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, domain)
);
```

---

## 4 · Audit integration

```
ana.action.propose       (POST /api/ana-ri/actions)
ana.action.approve       (POST /api/ana-ri/actions/:id/approve)   — requires reason when risk='high'
ana.action.modify        (PATCH /api/ana-ri/actions/:id)
ana.action.skip          (POST /api/ana-ri/actions/:id/skip)
ana.action.execute       (server-side post-approval — writes result_ref)
ana.agentic.toggle       (PUT  /api/ana-ri/preferences/agentic)
```

Every audit row: `{ action, actor_id, target: action_id, reason, sha256_chain }`.

---

## 5 · Acceptance

- [ ] Dock renders on every biopharma surface (and every MDX surface once promoted to `_shared/`).
- [ ] Seam ↔ dock toggle persists per user (localStorage in kit; `users.preferences->>'anaDockOpen'` in v2).
- [ ] ⌘\ keyboard shortcut toggles the dock from any surface.
- [ ] Header label and suggestion chips update within 100ms when `activeNav` changes.
- [ ] Threads are per `(user, domain, surface)` — leaving and returning resumes the conversation.
- [ ] Slash menu surfaces all 8 governed commands; each shows its risk chip.
- [ ] `Suggest only` ↔ `Act without asking` toggle persists per `(user, domain)`.
- [ ] `risk='high'` actions in `Act without asking` mode still pause for a one-tap confirmation (audit requirement).
- [ ] Every approved action writes an `audit_logs` row with non-empty `reason`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 6 · Out of scope

- Voice / push-to-talk in the composer (Phase 10.2 candidate).
- Cross-surface action queueing ("AnA, draft three NDAs across BX-204 / BX-301 / BX-099") — single-surface actions only at launch.
- Long-running action streaming UI — current cards complete synchronously; multi-step background actions land in Phase 10.2.
