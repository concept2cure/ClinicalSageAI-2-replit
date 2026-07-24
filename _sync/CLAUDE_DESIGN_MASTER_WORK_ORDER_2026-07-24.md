# Claude Design — Master UI Work Order

**Date:** 24 July 2026
**Repository:** `concept2cure/ClinicalSageAI-2-replit`
**Base branch:** `concept2cure-v2`
**Repository snapshot:** commit `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Companion:** `Concept2Cure_v2_Claude_Code_Master_Work_Order_20260724.md` (the backend/platform work order, WO-00 … WO-16)
**Owner of this document:** the Claude Code control-tower session
**Audience:** Claude Design

---

## 0. Why this document exists

The backend program (WO-00 … WO-16) converts the codebase from a broad regulatory
platform into a provable submission operating system. Most of those work orders
have a user-visible face. This document is the **only** authorization for building
that face, and it defines how UI work stays in lockstep with backend work.

Two failure modes this exists to prevent:

1. **Design builds ahead of a contract.** A surface is designed against an
   endpoint shape that later changes, and the UI silently breaks or — worse —
   renders stale/fabricated state that looks live.
2. **Backend lands a capability with no face.** Measured directly against the code
   at `2a5b46d`: **244** `/api` prefixes are mounted in `server/bootstrap/register-*.ts`;
   **92 of them (38%) appear nowhere in `client/src`**. Capability no user can
   reach is not capability. *(Method: literal-prefix match of every `app.use('/api/…')`
   mount against the full text of `client/src/**/*.{ts,tsx}`. It undercounts
   dynamically-constructed URLs and overcounts prefixes referenced in dead client
   code — treat it as a floor with a known method, not a precise census.)*

The mechanism that prevents both is **contract-first sequencing**, defined in §3.

### 0.1 Every prior brief is dead. Read the code.

**No document in this repository is evidence of what the code does — including
this one.** Every `HANDOFF_TO_DESIGN_*.md`, every file in `_sync/`, every
`docs/reports/*` audit, every gap analysis, and every PR description is a
**historical record of what someone believed on a past date**. None of them are
authoritative. They may be stale, superseded, or simply wrong.

The only authority is **the code at the current head of `concept2cure-v2`**, plus
the typed contract published for that specific work order under §3.2.

This is a hard rule, not a caution:

- Do not cite a brief as a reason to build something.
- Do not treat a brief's claim that a backend "exists" as evidence that it exists.
- Do not treat a brief's claim that something is "missing" as evidence it is missing.
- If a brief and the code disagree, the code wins and the brief gets retracted.
- If you cannot verify a claim by reading the code, it is **not a fact yet** — it
  is a question for `_sync/`.

**The concrete case that proves the rule.**
`HANDOFF_TO_DESIGN_document_authoring.md` (12 June 2026) §2 told design that
`server/routes/realtime-collab.ts` was a "production Yjs CRDT + WebSocket server."
It is not, and was not. That file is pure Express REST — no `yjs` import, no
`Y.Doc`, no WebSocket upgrade handler. It advertises a socket URL
(`/ws/collab/:roomKey`, line 372) that nothing serves. Meanwhile the *actual* Y.js
server (`server/services/hocuspocus-server.ts`, mounted at
`server/startup/services.ts:284`, listening at `/collab`) went unmentioned.

One wrong sentence in a brief plausibly cost this program a year of
believing collaborative editing was unbuilt while a working CRDT server sat
running and unconnected. That is the cost of trusting a document over the code.

Every prior brief is superseded by this work order and carries a deprecation
banner in-repo. UX-00 finishes the job.

---

## 1. Non-negotiable rules

These extend the standing policies already in
`_sync/CLAUDE_DESIGN_KIT_BACKLOG.md`, which remain in force:
**kit-or-nothing**, **delete-on-replace**, **installed = merged + deployed**.

Additional binding rules for this program:

0. **Code is the only authority (§0.1).** No brief, audit, gap analysis, PR
   description, code comment, or `_sync/` document — including this one — is
   evidence of system behavior. Verify against the code at the current head of
   `concept2cure-v2` and the contract published for the work order. An unverified
   claim is a question, never a premise.
1. **No new top-level destination.** If an existing project, document, dossier,
   review, submission, Vault, or AnA surface can own the workflow, it does. The
   left rail and Apps page must not become a catalog of backend services. Every
   work order below names its host surface; adding a new rail entry requires
   explicit written approval from the control tower.
2. **Four honest states, always.** Every surface renders exactly one of: **live
   data**, **honest empty**, **honest pending**, **honest error**. There is no
   fifth state. No fixture data, no placeholder metric, no fabricated compliance
   score, no local-only success presented as persisted truth. A governed action
   whose backend is absent renders **disabled with a reason**, never as a button
   that appears to work.
3. **Never invent a number.** Scores, percentages, coverage figures and readiness
   values are rendered only when the backend supplies them *with their
   denominator*. A metric without a denominator is a design bug, not a display
   choice.
4. **The UI may not soften a governance boundary.** Freeze, approval, e-signature,
   review-required and blocked states are backend truth. The UI surfaces them; it
   never routes around them, never offers an "anyway" affordance, and never
   locally optimistically renders a governed transition as complete.
5. **AI output is labeled and never authoritative.** Anything generated by AnA is
   visually distinguishable from human-authored and structured content, carries
   its provenance affordance, and cannot be promoted to an approved artifact from
   inside a chat surface.
6. **Build only against a published contract.** See §3. A surface at readiness
   `routes-ready` may be *designed* but must not be *wired* until its typed
   contract lands.
7. **Compliance rails are gates, not suggestions.** Each surface's `compliance`
   array in the registry names the skills that must run before its PR is
   considered complete. See §4.

---

## 2. The contract boundary — who owns which files

This is the hard line. Crossing it is the primary source of merge conflict and
semantic drift between the two streams.

| Path | Owner | Notes |
|---|---|---|
| `server/**` | **Claude Code** | Design never edits. |
| `shared/schema/**` | **Claude Code** | Drizzle/DB truth. |
| `shared/types/*-api.ts`, `shared/types/*-contract.ts` | **Claude Code** | The typed contracts design imports. |
| `shared/types/*-ui.ts` | **Claude Code** authors, **Design** proposes | UI-shaped view models (precedent: `submission-ui.ts`). Design may request fields; Code lands them. |
| `shared/constants/ui-surface-registry.ts` | **Claude Code** | `readiness`, `apiPrefixes`, `sharedContract`, `discoveryCatalog` are backend facts. |
| `shared/constants/ui-surface-registry.ui-v2.ts` | **Claude Code** | Same. |
| — the `label`, `icon`, `group`, `notes` fields | **Design** proposes | Presentation metadata; Design opens a request, Code applies it in one commit. |
| `client/public/design-system/**` (kits) | **Design** | The canonical kits. Code never authors a kit. |
| `client/src/concept2cure/v2/surfaces/**` | **Design** builds, **Code** ports | Per the kit-or-nothing policy: Design authors the kit, Code ports it and deletes the superseded path. |
| `client/src/concept2cure/v2/styles/**` | **Design** | 23 existing stylesheets; extend, do not fork. |
| `client/src/concept2cure/v2/surfaceViews.ts` | **Claude Code** | The renderer map. Design requests registration; Code lands it. |
| `client/src/concept2cure/v2/dataConnect.tsx` | **Claude Code** | The data-binding layer. |
| `docs/**`, `_sync/**` | Shared | Each side writes its own reports; neither rewrites the other's. |

**Conflict rule:** if a change requires touching a file on the other side of the
line, it stops and becomes a request in `_sync/`. Neither stream edits across the
boundary "just to unblock itself."

---

## 3. The synchronization protocol — contract-first

### 3.1 The current problem, quantified from code

Parsed from `shared/constants/ui-surface-registry.ts` (49 entries) and
`shared/constants/ui-surface-registry.ui-v2.ts` (50 entries) at `2a5b46d` —
**99 registry entries total**:

| Readiness | Count | What it means for Design |
|---|---:|---|
| `contract-ready` | **5** | Typed contract and/or discovery catalog exists. Safe to wire. |
| `routes-ready` | **79** | REST is mounted, but **no typed contract**. Bind here and you are guessing at shapes. |
| `kit-only` | 9 | Prototype exists, backend binding map incomplete. |
| `planned` | 1 | Not prioritized. |

**27** entries name a `sharedContract`; only **3** name a `discoveryCatalog`;
**68 of 99 are Part 11-gated**.

**Those 79 surfaces are the synchronization risk.** 79 places where design must
read route handlers to infer response shapes is 79 chances for silent drift — and
inferring a shape from a handler is exactly the "trust something other than a
published contract" failure this program exists to end. Closing that gap is a
backend obligation, sequenced into the work orders below.

For cross-reference: `client/src/concept2cure/v2/surfaceViews.ts` registers **97**
renderable surfaces. The registry has 99 entries. Those two sets are not proven
identical — reconciling them is UX-00 item 3.

### 3.2 The protocol

For every work order, in this order:

**Step 1 — Code publishes the contract.** Claude Code lands a typed contract at
`shared/types/<domain>-api.ts` (wire shapes) and, where the surface needs a view
model, `shared/types/<domain>-ui.ts`. It updates the surface's registry entry:
`sharedContract` populated, `readiness` promoted to `contract-ready`, `notes`
stating exactly what Design owns.

**Step 2 — Code publishes the state matrix.** In the same commit, a
`_sync/CONTRACT_<domain>.md` listing, for every view in the surface:
- the live-data shape (typed);
- the empty condition and what empty *means* (no data yet vs. not applicable vs. not entitled);
- the pending/long-running condition;
- every error the backend can return, with its user-meaningful cause;
- every governed action, its precondition, and its blocked-reason vocabulary.

**Step 3 — Design builds the kit** against the contract, covering all four states
plus every named error and blocked reason. No guessing; if the matrix is missing a
case, that is a blocking question back to Code, not a design decision.

**Step 4 — Code ports and wires**, deletes the superseded path, and runs the
surface render tests (loading / empty / error / live).

**Step 5 — Joint acceptance** against the work order's gate below.

### 3.3 Cadence

- Design never starts a work order whose **Step 1 has not landed on
  `concept2cure-v2`**. A contract on an unmerged branch does not count.
- Code never marks a backend work order complete while its UI work order is
  unstarted and the capability is user-facing — that recreates the trapped-capability failure.
- Both streams re-baseline from `concept2cure-v2` at each work-order boundary.
- Open questions go in `_sync/` as dated files. Neither stream guesses.

---

## 4. Compliance rails

The `compliance` array on each registry entry names skills that gate the work.
**68 of 99 registry entries are Part 11-gated** (counted from both registry files
at `2a5b46d`). Rails:

| Rail | Skill | Applies to |
|---|---|---|
| `regulatory-compliance-ux` | 21 CFR Part 11 patterns | Any mutation, approval, submission, sign-off, or governed-data flow. Visible audit trails, reason-for-change capture, e-signature manifestation, immutable history, role-scoped visibility. |
| `accessibility-enforcement` | WCAG 2.2 AA | Every surface, no exceptions. Focus order, keyboard traps, ARIA, contrast, focus visibility, color-never-alone. |
| `microcopy-tone` | Reviewer-grade tone | Every user-facing string. Calm, factual, sentence case, no exclamations, no emoji, no cheerleading. |
| `motion-discipline` | Calm motion | 200ms ease-out default, no spring/bounce/overshoot, honor `prefers-reduced-motion`. |

Visual system: `.claude/skills/concept2cure-v2-design-system.md`, plus the existing
`client/src/concept2cure/v2/styles/*.css` (23 stylesheets — extend, do not fork).

---

## 5. UI work-order index

Each maps to its backend counterpart. **Dependency** names the backend work order
that must publish its contract first.

| ID | Backend dep | UI work order | Host surface | Class |
|---|---|---|---|---|
| UX-00 | WO-00 | UI reality sync and state-matrix audit | — | Audit only |
| UX-01 | WO-01 | Three golden journeys as a guided experience | Project home | Convergence |
| UX-02 | WO-02 | Enforcement, blocked-state and failure vocabulary | Cross-cutting | Hardening |
| UX-03 | WO-03 | Submission Proof Packet viewer | Dossier / Report Governance | Productization |
| UX-04 | WO-04 | Live co-editing in the authoring canvas | `document-authoring` | Terminal gap |
| UX-05 | WO-05 | eCTD lifecycle, sequence and package UI | `ectd-compile` | Terminal gap |
| UX-06 | WO-06 | Gateway release operations and ACK lineage | `gateway-transmittals` | Terminal gap |
| UX-07 | WO-07 | Regulator doctrine review experience | Regulatory intelligence | Productization |
| UX-08 | WO-08 | Digital Reviewer Room | `submission-twin` | Category moat |
| UX-09 | WO-09 | Protocol compiler and impact view | Protocol / study design | Category moat |
| UX-10 | WO-10 | Claim coverage in the document canvas | `document-authoring` / dossier | Category moat |
| UX-11 | WO-11 | Evidence graph traversal | Precedent / evidence | Convergence |
| UX-12 | WO-12 | AI context-of-use disclosure | Cross-cutting (AnA) | Validation |
| UX-13 | WO-13 | Regional branch and commitment views | Dossier / global RI | Standards-native |
| UX-14 | WO-14 | Device submission spine | `device-workstream` | Deferred |
| UX-15 | WO-15 | Calibration and model-provenance disclosure | Study Twin / admin | Controlled learning |
| UX-16 | WO-16 | Pilot instrumentation and evidence views | Admin / reporting | Commercial proof |

**Also standing, not tied to one backend WO:**

| ID | Work order | Why |
|---|---|---|
| UX-A | Product narrative collapse — three journeys, role-gated rail | The report's #1 commercial risk is sprawl: ~97 surfaces facing the buyer. |
| UX-B | Capability launcher — typed, context-aware AnA actions | Hundreds of tools are chat-only; hidden capability equals missing capability. |

UX-A and UX-B are the highest commercial leverage in this document. They may run
in parallel with UX-00 through UX-03 because they are **subtractive and
organizational** — they reorganize what exists rather than binding new contracts.

---

## UX-00 — UI reality sync and state-matrix audit

**Class:** audit only. No component changes.

### Objective
Establish what the UI actually renders today, so the backend audit (WO-00) and the
design audit describe the same product.

### Required investigation
1. For each of the ~97 entries in `surfaceViews.ts`, record: does it render live
   data, honest empty, honest pending, honest error, or something else?
2. Flag every instance of the fifth state — fixture data reaching a user-visible
   surface, a hardcoded metric, a disabled control with no stated reason, a
   success toast not backed by a persisted response.
3. Reconcile `surfaceViews.ts` (97 entries) against the registry (49 + 50). Name
   every surface registered in one and not the other.
4. Identify surfaces whose `readiness` in the registry contradicts what the
   component actually does.
5. Audit the 23 stylesheets for divergence from the design system.
6. Record which surfaces have render tests for all four states.
7. **Retire the prior briefs.** For each `HANDOFF_TO_DESIGN_*.md` (7 files) and
   each `_sync/*` status document, check every factual claim about backend
   behavior against the code at head. Record each claim as verified, stale, or
   false — with the file and line that settles it. Claims that survive are
   re-stated in the new contract documents; the brief itself does not regain
   authority. Nothing is carried forward on the strength of the brief alone.

### Outputs
- `_sync/UX_REALITY_SYNC_2026-07.md` — per-surface state audit
- `_sync/UX_STATE_MATRIX_GAPS.md` — every surface missing an honest state
- `_sync/UX_BRIEF_RETIREMENT_LEDGER.md` — every claim in every prior brief, marked
  verified / stale / false against a code citation

### Gate
No component code changed. Every surface classified. Every fifth-state instance
has a ticket. Every prior brief adjudicated claim-by-claim against code.
**Stop and wait.**

---

## UX-A — Product narrative collapse *(may start immediately)*

**Class:** subtractive. This removes and reorganizes; it does not add.

### Objective
A buyer must see one submission operating system, not ~97 surfaces. Collapse the
product into three journeys with everything else reachable by context and role.

### Required implementation
1. Establish the three primary journeys as the product's spine: **IND creation →
   governed submission**, **marketing application authoring → release**, **HA
   question → corrected response**. These are the same three the backend proves in
   WO-01; the names and stages must match exactly.
2. Restructure the left rail to the registry's `navTier` (`global` / `project` /
   `specialist` / `admin`), with specialist surfaces revealed by project state and
   user role — not enumerated by default.
3. Every surface not on a journey path must be reachable in at most two moves from
   a journey surface or ⌘K.
4. Design the project home as the journey entry point: current stage, what is
   blocked and why, the next governed action, and who owns it.
5. Remove rail entries that duplicate a workflow another surface owns; propose
   registry `notes` updates naming the owning surface.

### Non-goals
No new surfaces. No renaming a surface without a registry change request. No
hiding a governed action behind progressive disclosure — blocked work must stay
visible.

### Gate
- A first-time user reaches the correct journey without training.
- Default rail depth is materially reduced; a written before/after count.
- No capability becomes unreachable; a reachability matrix proves it.
- **Stop and wait.**

---

## UX-B — Capability launcher *(may start after UX-A)*

### Objective
Turn chat-only capability into typed, visible, permission-aware actions. A user
must never need to know a tool's exact name.

**Counted from code at `2a5b46d`, not from any report:**
- `server/services/ana/AnaToolDefinitions.ts` — **410 unique advisory tool names**.
- `server/services/ana-ri/command-executor.ts` — **`COMMAND_REGISTRY` has 76
  entries; `COMMAND_HANDLERS` has 70 keys.**

Note the registry/handler mismatch: 76 defined, 70 handled. Six commands may be
declared without an executor. Design must not surface a command as available until
Claude Code confirms it executes — reconciling those six is a WO/UX-B blocker.

### Required implementation
1. A context-aware action surface: what can I do *here*, on *this* object, with
   *my* role, in this project's *current state*.
2. Actions are typed and schema-driven from `anaToolFamilies` on the registry
   entry — not free-text prompts.
3. Advisory and mutating actions are visually distinct. Mutating actions carry the
   governed-action confirmation pattern from `regulatory-compliance-ux`:
   consequence stated, reason-for-change captured where required, receipt shown on
   completion.
4. An action the user's role cannot perform shows as unavailable **with the reason
   and the owning role** — never hidden silently, never enabled and then rejected.
5. Every executed action returns a visible receipt, or an honest failure.

### Gate
- A representative task is completed without typing a tool name.
- No mutating action executes without confirmation and a receipt.
- Permission denials are explained, not silent.
- **Stop and wait.**

---

## UX-02 — Enforcement, blocked-state and failure vocabulary

**Dependency:** WO-02 contract. **Class:** cross-cutting hardening.

### Objective
WO-02 makes safety controls fail closed. Failing closed is only usable if the user
understands *what* blocked, *why*, and *what to do*. This work order designs that
vocabulary once, for the whole product.

### Required implementation
1. A single blocked-state pattern used everywhere: what was attempted, what
   control blocked it, why, who can resolve it, and the next action.
2. Cover every blocking class WO-02 introduces: tenant/authorization denial,
   insufficient grounding, injection-tainted content, audit-integrity failure,
   missing signature, unmet review state, absent gateway credential, failed
   validation.
3. Distinguish **blocked** (a control refused) from **failed** (something broke)
   from **pending** (in flight) from **empty** (nothing there yet). Four different
   patterns, never conflated.
4. Grounding and abstention: when the system declines to produce output because
   evidence is insufficient, that is a **first-class honest answer**, presented as
   a legitimate result with what evidence would unblock it — not an error, and
   never a fallback to an ungrounded guess.
5. Audit-integrity alerting: a visible, non-dismissible state when the audit chain
   fails verification, with affected scope.

### Gate
- Every WO-02 blocking class has a designed state with a resolution path.
- Abstention reads as an answer, not a failure.
- No blocked state is a dead end.
- **Stop and wait.**

---

## UX-03 — Submission Proof Packet viewer

**Dependency:** WO-03 contract. **Host:** existing dossier / release / report-governance surfaces. **No new top-level app.**

### Objective
Make the program's flagship commercial deliverable inspectable: how a dossier was
built, checked, approved, released and transmitted.

### Required implementation
1. A packet view rendering the canonical JSON — identity, readiness snapshot,
   source coverage and claim traces, artifact versions and hashes, assumptions and
   supersession chains, decisions and approvals, contradictions and overlay
   effects, correction receipts, signatures and seal status, model provenance,
   validator findings, transmittal and ACK.
2. **Incompleteness is content, not omission.** Missing proof renders explicitly as
   missing, with what is absent and why. A packet with gaps must never look
   complete.
3. Verification affordance: a user can verify the packet and see per-component
   pass/fail, including tamper detection. Verification status is backend truth,
   rendered — never computed client-side.
4. Drill-through from any packet line to its source object, respecting existing
   permissions.
5. Export to JSON and to the human-readable PDF, with the PDF visibly a rendering
   of the JSON, not a second source of truth.
6. One-click entry from existing dossier/release/report-governance surfaces.
7. AnA explains packet contents read-only. AnA cannot alter a proof record, and
   the UI must make that boundary legible.

### Gate
- A packet with open blockers is visibly incomplete.
- A tampered artifact/signature/receipt renders as failed verification.
- No client-side computation of any verification result.
- Journeys A and B produce a viewable, exportable packet.
- **Stop and wait.**

---

## UX-04 — Live co-editing in the authoring canvas

**Dependency:** WO-04. **Host:** `document-authoring`. **Read §0.1 first — the June brief on this exact surface was wrong.**

### Objective
Bind the existing authoring canvas to the **already-running** Hocuspocus CRDT
server. This is a wiring and semantics task, not an infrastructure build.

### What already exists — verified by reading the code at `2a5b46d`, not by any brief
- `server/services/hocuspocus-server.ts` — real Y.js server, JWT-verified, mounted at **`/collab`**.
- `@hocuspocus/provider` 4.1.0, `@tiptap/extension-collaboration` 3.23.4,
  `@tiptap/extension-collaboration-cursor` 2.26.2, `@tiptap/y-tiptap` 3.0.2,
  `y-prosemirror` 1.3.7, `yjs` 13.6.30 — all already dependencies.
- REST presence, section locks and awareness heartbeat in `AuthoringCollab.tsx`.

### What is missing
- **No client ever connects.** No `HocuspocusProvider` is instantiated anywhere in
  `client/src/`. `AuthoringCollab.tsx` references y-websocket only in a comment.
- **Path mismatch.** `realtime-collab.ts:372` advertises `/ws/collab/:roomKey`;
  the server listens on `/collab`. Backend resolves this in WO-04; do not
  hardcode either path — read it from the contract.

### Required implementation
1. Live cursors, selections and presence **inside the existing authoring canvas
   only**. No new editor framework. No Google-Docs redesign.
2. Distinguish **presence** from **authority**. Someone being in the document is
   not permission to edit it. Section locks are governance controls and must read
   as such — not as a soft social signal.
3. Design the honest states for: offline, reconnecting, converged-after-reconnect,
   duplicate tab, stale client, and **freeze arriving while you are typing**.
4. Freeze is absolute. Once frozen, the canvas is not editable — including for a
   stale offline client whose buffer has not yet synced. The user must be told
   their unsynced work's disposition truthfully.
5. Make the revision boundary legible: which activity is ambient collaboration and
   which created a durable, audited revision. Do not present every keystroke as a
   regulated event.

### Gate
- Two users edit one section concurrently with no data loss.
- Freeze stops mutation for all clients, including stale ones, honestly.
- Reconnect converges and the revision trail is legible.
- Lock state never reads as mere presence.
- **Stop and wait.**

---

## UX-05 — eCTD lifecycle, sequence and package UI

**Dependency:** WO-05. **Host:** `ectd-compile` and existing dossier/release flow.

### Required implementation
1. Lifecycle operations — new, replace, append, delete — as reviewable intent
   **before** package creation, never as a silent consequence of compiling.
2. Sequence and submission-unit history, legible as a lineage.
3. Operation preview and diff: exactly what this sequence changes relative to what
   was previously submitted.
4. Regional branch selection with the divergence made visible.
5. Validation findings triaged by blocking severity, each traceable to the leaf or
   element that caused it, each with a resolution path.
6. Package composition and manifest inspectable before release.
7. Promotion blocked when dossier, signature, proof or validator gates fail — with
   UX-02's blocked pattern, naming the specific failed gate.

### Gate
- A user can review and understand lifecycle operations before creating a package.
- Known-bad packages render their blocking findings clearly.
- No agency-parity claim appears anywhere in the UI copy.
- **Stop and wait.**

---

## UX-06 — Gateway release operations and ACK lineage

**Dependency:** WO-06. **Host:** `gateway-transmittals`.

### Required implementation
1. Transmission as a governed release: what package, what hash, which signer,
   which decision, which environment — confirmed before send, with reauthentication
   where the backend requires it.
2. **Environment is unmissable.** Sandbox/test versus production must be
   impossible to confuse, at every step, including in the receipt.
3. Full state lineage: prepared → transmitted → polling → acknowledged, or the
   honest failure at any stage.
4. ACK correlation to the sent package, visible as a verified link.
5. Designed states for every failure WO-06 covers: timeout, retry, duplicate
   transmission, partial failure, agency unavailable, invalid credential,
   rollback.
6. Credentials never rendered, never logged to a surface, never partially echoed.
7. A duplicate or stale release attempt is blocked with an explanation of what was
   already sent and when.

### Gate
- Environment is unambiguous at every step.
- Every failure mode is honest and offers recovery.
- Package-to-ACK lineage is traceable in the UI.
- **Stop and wait.**

---

## UX-07 — Regulator doctrine review experience

**Dependency:** WO-07. **Host:** existing regulatory-intelligence/governance surface. **No new app.**

### Required implementation
1. A doctrine rule renders with its full provenance: regulator, jurisdiction,
   citation, source version, effective/review/retirement dates, author, reviewer,
   approval state, confidence.
2. Review workflow for promoting a rule to active — with the qualified-reviewer
   boundary visible.
3. Version history and replay: which doctrine version applied to a historical
   finding.
4. Precedence when multiple rules match, shown explicitly. Never an unexplained
   "first match wins."
5. Unsourced or expired rules are visibly inert — they cannot appear to block
   promotion.
6. AnA may propose a draft rule; the UI must make it unmistakable that AnA cannot
   approve one.

### Gate
- Every active rule shows source and approval.
- Historical replay shows the historical version.
- Proposal and approval are visually distinct acts.
- **Stop and wait.**

---

## UX-08 — Digital Reviewer Room

**Dependency:** WO-08. **Host:** extend `submission-twin`. **This is the category moat — design it as the flagship.**

### Required implementation
1. Extend the existing Submission Twin surface into a review workspace with
   configurable reviewer lenses: clinical, statistical, CMC, safety, labeling,
   operations, regulator/jurisdiction.
2. A challenge renders with: question and rationale, affected
   artifacts/sections/claims/assumptions/decisions, evidence and source spans,
   confidence and source classification, doctrine applied, authority state, owner.
3. The full chain must be traversable in the UI: challenge → evidence → doctrine →
   decision → correction → review → proof.
4. **Proposed bundle items are shown before execution**, with what will be
   executed automatically, what is prepared for a human, and what is blocked.
5. A correction that fails halfway renders as **visibly partial** — executed steps,
   blocked steps, and what that means for the artifacts. Never as a clean success
   or a total failure.
6. Low-confidence or unsupported challenges are visibly advisory and cannot be
   actioned as if authoritative.
7. Structured truth outranks LLM explanation, and the UI must show which is which.

### Gate
- A challenge is traceable end-to-end to proof.
- Advisory and authoritative challenges are never confusable.
- Partial correction is honestly represented.
- Journeys B and C run through this surface.
- **Stop and wait.**

---

## UX-09 — Protocol compiler and impact view

**Dependency:** WO-09. **Host:** existing protocol/study-design/document surfaces.

### Required implementation
1. Structured protocol objects as editable data with the human-readable protocol
   as a rendered view — the relationship must be legible.
2. A field-level impact view: change one protocol field, see the deterministic
   downstream set (SAP/estimands, schedule of activities, CRF shell, Study Twin
   inputs, CSR structure, CTD sections).
3. On amendment, impact renders as **governed review tasks**, never as silent
   downstream edits. Approved artifacts are never auto-rewritten, and the UI must
   make that guarantee visible.
4. Protocol-SAP consistency findings surface inline where the author is working.
5. Versioning and tenancy legible throughout.

### Gate
- One field change produces a visible, deterministic impact set.
- No approved artifact appears auto-edited.
- Journey A begins here.
- **Stop and wait.**

---

## UX-10 — Claim coverage in the document canvas

**Dependency:** WO-10. **Host:** `document-authoring` and dossier surfaces — inline, not a separate dashboard.

### Required implementation
1. A material claim opens to its exact evidence spans and hashes from where the
   author is working.
2. Coverage metrics **always** render their denominator and inclusion rules.
   An unexplained percentage is prohibited (§1 rule 3).
3. Visibly distinguish unsupported, overbroad, stale, contradictory and
   jurisdictionally divergent claims — five different problems, not one warning.
4. An unsupported claim cannot render as complete.
5. Claim changes propagate to affected sections and regional branches as review
   tasks, visible to the owner.

### Gate
- Every material claim opens to exact evidence.
- No coverage number appears without its denominator.
- **Stop and wait.**

---

## UX-12 — AI context-of-use disclosure

**Dependency:** WO-12. **Class:** cross-cutting, AnA surfaces.

### Required implementation
1. When AnA performs a validated task, the user can see which context of use
   applies, its boundary, and its human-review requirement.
2. Generated material carries model/prompt/tool/retrieval/context provenance,
   inspectable without leaving the work.
3. A task attempted outside an enabled context is refused visibly, with the reason.
4. **No generic "AI validated" claim may appear anywhere in the product.**
5. Study Twin language must distinguish an estimate from a guarantee, and
   "history exists" from "structured evidence was actually used" — four distinct
   states, never collapsed into one confident number.

### Gate
- Provenance is reachable from any AI-generated artifact.
- No generic validation claim in any string.
- **Stop and wait.**

---

## UX-05/06/11/13/14/15/16 — later orders

Full briefs are issued at their dependency's Step 1. Standing constraints:

- **UX-11** (evidence graph): traversal from a design choice to CSR evidence and
  regulatory lessons, source-grounded and tenant-scoped. Host in existing
  precedent/evidence surfaces.
- **UX-13** (branching/commitments): global-core versus regional divergence made
  visible; a merge must never silently overwrite an approved regional decision.
  Commitments render with evidence, owner, date, patch and transmission status.
- **UX-14** (device): deferred until the biotech journeys pass consistently.
  `DeviceSubmission` shows only live honest state; the old no-op approval/submit
  action must remain non-executable.
- **UX-15** (calibration): model/prior version and evidence basis attached to every
  recommendation or probability. Study Twin must produce **honest no-number
  behavior** when inputs are insufficient — design that state as a legitimate,
  well-formed result.
- **UX-16** (pilot evidence): instrumented views for approved journeys only;
  never render a reference framework as a self-certified compliance score.

---

## 6. Required test hierarchy for UI work

Before any UI work order is accepted:

1. Component render tests for **all four states** — live, empty, pending, error.
2. Blocked-state tests for every governed action on the surface.
3. Permission tests — the surface renders correctly for each role, and denied
   actions are explained rather than hidden.
4. Accessibility audit per `accessibility-enforcement` (WCAG 2.2 AA).
5. Microcopy review per `microcopy-tone`.
6. Motion audit per `motion-discipline` where animation exists.
7. Part 11 pattern review per `regulatory-compliance-ux` where the surface is
   Part 11-gated (31 of 49 surfaces are).
8. Contribution to the relevant end-to-end journey test.

Negative behavior must be proven, not only the happy path.

---

## 7. Stop conditions

Stop and report rather than improvising when:

- a contract is absent, ambiguous, or contradicts the surface's registry entry;
- a state has no honest representation available from the backend;
- a design would require the UI to compute, infer, or soften a governed value;
- a surface would need to render a number the backend does not supply with a denominator;
- a workflow seems to need a new top-level destination;
- two surfaces appear to own the same workflow;
- a compliance rail conflicts with a usability goal;
- any document — brief, audit, comment, or this work order — contradicts the code.
  The code wins; the document gets retracted (§0.1). Never resolve the conflict by
  building what the document said.

---

## 8. Definition of done

This UI program is complete when:

- the three golden journeys are navigable by a first-time user without training;
- every user-visible state is live, honest empty, honest pending, or honest error —
  with no fifth state anywhere in the product;
- every governed action carries confirmation, reason capture where required, and a receipt;
- blocked states explain what blocked, why, and who resolves it;
- the Submission Proof Packet is inspectable, verifiable, and honest about gaps;
- collaborative authoring is live and freeze-safe;
- reviewer challenges are traceable end-to-end to governed corrections;
- AI output is always labeled, provenanced, and bounded by a visible context of use;
- no metric appears without its denominator;
- the default product reads as one operating system, not a catalog of services;
- every Part 11-gated surface has passed its compliance rails.

---

## 9. Evidence provenance for this document

Per §0.1, this work order does not get to exempt itself. Every factual claim below
is labeled by how it was obtained. Anything not listed here is not established.

### Verified by reading code at `2a5b46d` (re-runnable)

| Claim | Source |
|---|---|
| 97 renderable surfaces registered | parsed `client/src/concept2cure/v2/surfaceViews.ts` |
| 99 registry entries; 5 contract-ready / 79 routes-ready / 9 kit-only / 1 planned | parsed both `ui-surface-registry*.ts` |
| 27 `sharedContract`, 3 `discoveryCatalog`, 68 Part 11-gated | same |
| 244 mounted `/api` prefixes; 92 with no `client/src` reference | parsed `server/bootstrap/register-*.ts` vs. `client/src/**` |
| 410 unique advisory tool names | `server/services/ana/AnaToolDefinitions.ts` |
| `COMMAND_REGISTRY` 76 entries / `COMMAND_HANDLERS` 70 keys | `server/services/ana-ri/command-executor.ts` |
| Hocuspocus Y.js server exists, mounted, JWT-verified, path `/collab` | `server/services/hocuspocus-server.ts`, `server/startup/services.ts:284` |
| `realtime-collab.ts` has no `yjs` import; advertises `/ws/collab/:roomKey` | `server/routes/realtime-collab.ts:372` |
| No `HocuspocusProvider` anywhere in `client/src` | repo-wide grep |
| CRDT client deps already installed | `package.json:153,198,199,223,345,347` |
| 23 v2 stylesheets | `client/src/concept2cure/v2/styles/` |
| 7 `HANDOFF_TO_DESIGN_*.md` files | `git ls-files` |

### Inherited from the backend master work order — NOT independently verified

The UX-01 … UX-16 **structure, numbering, and scope** mirror WO-01 … WO-16 in
`Concept2Cure_v2_Claude_Code_Master_Work_Order_20260724.md`. That document is a
plan, not evidence. Its premises about what exists, what is missing, and what is
"terminal" have **not** been confirmed against code except where listed above —
and the one place they were checked closely (WO-04 / collaborative editing) the
plan was materially wrong about the current state.

Consequence for Design: **treat the UX-01 … UX-16 briefs as provisional scope,
not as findings.** Each becomes real only when its contract lands under §3.2
Step 1, and a contract may reveal that the work order's premise was wrong. UX-00
and UX-A rest only on the verified table above, which is why they are the only two
authorized to start.

### Known unverified, deliberately excluded

Claims that appear in prior repo documents and are **not** carried into this work
order because they could not be confirmed from code in this pass: per-surface
honest-state behavior (no component was audited — that is UX-00's job), test-suite
pass rates, endpoint totals, and any figure describing customer, validation, or
deployment status.

---

## 10. First instruction to Claude Design

Start with **UX-00 and UX-A only.**

UX-00 is an audit — produce the three `_sync/` documents and change no component
code. UX-A is subtractive and may proceed in parallel because it reorganizes
existing surfaces rather than binding new contracts.

Do not begin UX-01 through UX-16. Their contracts do not exist yet; Claude Code is
executing WO-00 now and will publish each contract per §3.2 Step 1. Building
against a route handler before its contract lands is the specific failure this
document exists to prevent.

Report back with the UX-00 findings and the UX-A restructure proposal, then stop.
