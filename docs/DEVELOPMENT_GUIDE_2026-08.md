# Development guide and build plan — 2026-08

**What this document owns: sequence, dependency order, and the gate that ends each
phase.** Nothing else. The doctrine for this codebase is *there is never more than one of
anything*, and that applies to planning documents as much as to tables — so this file
restates no item, no finding and no blocker.

| Document | Owns |
|---|---|
| `docs/GA_COMPLETION_LEDGER_2026-08.md` | **What is open.** One row per item, its owner, and the command that proves it done. |
| `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md` | **Procurement detail.** Blockers B1–B21, the prose, the field-map procedure. |
| `scripts/ops/ga-readiness-report.mjs` | **Observed state.** What is actually on disk and in the environment. |
| `docs/AUDIT_SUBSTRATE_DECISION_2026-08.md` | The audit-store decision and its staging. |
| `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` | The identity contract, slices C1/C2. |
| **This file** | **In what order, and what has to be true before the next thing starts.** |

Every figure below names the command that produced it. If a figure and a command
disagree, the command is right and this file is stale.

---

## 1. Where the work stands

Measured 2026-08-14 on `concept2cure-v2`:

```bash
node scripts/ops/ledger-check.mjs          # 44 rows: 19 done, 20 open, 4 in-flight, 1 blocked
node scripts/ops/ga-readiness-report.mjs   # 3/40 ready · 18 blockers · 19 advisories
npm run ci:surface-discoverability         # 119 renderable: 93 catalogued, 26 contextual
```

**The shape of the remaining work is not construction.** In case after case the mechanism
is built correctly and the call site is missing — a tamper check with no production
caller, provenance tables with no writers, `linkDomainHistory` with zero call sites, an
extraction pipeline behind a route that returned 500 unconditionally. That is why the
plan below is ordered by *dependency* rather than by size: most items are small once the
thing they depend on is settled, and actively harmful if done before it.

The corollary matters for estimating. Work that looks like a week of building is often a
day of connecting plus a week of deciding what it should connect to. Budget the decision.

---

## 2. Four tracks, and only one of them is compressible

| Track | Owner tag | What it is | Compressible by adding engineers? |
|---|---|---|---|
| Engineering | `eng` | Code, tests, gates, migrations | Yes, within dependency order |
| Procurement | `proc` | Licences, credentials, vendored datasets | **No.** A purchase order has a lead time |
| Quality | `qual` | Protocols executed and signed by a competent person | **No.** A signature is not a script |
| Product | `prod` | Pricing, packaging, channel, tier assignment | **No.** These are decisions, not tasks |

One workstream sits outside this frame: **§5a, AnA as a surface-aware operator.** It is
not on the filing critical path and it is the most visible thing in a demo, which is
exactly why it needs a stated order rather than opportunistic attention.

The critical path to a first real filing runs through procurement and qualification, not
through engineering. **Sequence engineering to be ready when those land, not to finish
first.** Specifically: B1–B7 (eSTAR templates, eCTD DTDs, LORENZ licence, gateway
credentials, MedDRA) should be started now, in parallel with Phase 0, because their lead
time exceeds the engineering that consumes them.

---

## 3. Doctrines that constrain how work is done

These are not style preferences. Each one is enforced somewhere, and each exists because
its absence caused a defect that reached the ledger.

1. **One of anything.** One writer per table, one signing entry point per substrate, one
   source of truth per fact. Open violations: `cerv2_section_versions` has four writers
   (L39), `electronic_signatures` has two conforming INSERT sites (L37).
2. **Verify operation, not intent.** A docstring says what a module is *for*; it does not
   say whether anything calls it. A row moves to `done` when a command proves it, and the
   command goes in the Evidence column.
3. **Refuse rather than approximate.** `not_evaluated`, `unverifiable`, `claimStoreUnavailable`
   and honest 422s are first-class outcomes. Journey tests assert refusals as passing.
4. **Fail closed at boot, non-blocking in flight.** The platform refuses to start if the
   provenance ledger is unreachable; the per-call writer stays non-blocking so an
   audit-store outage cannot take inference down.
5. **An unexplained exclusion is the omission written down.** Every CI gate that allows an
   exception requires a reason string, and the reason is checked. See
   `scripts/ci/check-surface-discoverability.mjs` for the pattern to copy.
6. **No unqualified compliance claims.** `npm run check:compliance-claims` polices the
   product's own language. Hold documents to the same standard.

---

## 4. The build

```bash
npm ci                       # also installs husky; without it the pre-push hook is inert
npm run dev                  # local server + client
npm run check                # tsc, 6GB heap
npm run build                # vite build + scripts/build-server.mjs
```

Before pushing anything that touches governed paths:

```bash
npm run check:ledger                  # rows parse, cited paths exist, done rows cite evidence
npm run ci:gateway-bypass             # no model call outside the AI gateway
npm run ci:lineage-save-gate          # the editor cannot save content without provenance
npm run ci:migration-reachability     # every migration is in a durable applier set
npm run ci:surface-discoverability    # every renderable surface is findable or justified
npm run check:compliance-claims       # no unqualified regulatory claims in product copy
```

**Migrations.** A migration that is not in `C2C_MIGRATION_FILES`
(`scripts/db/migration-set.mjs`) does not run on a migration-provisioned database, only on
a drizzle-push one. That divergence is the L30/L38 defect class: latent on exactly the
deployments that matter. `ci:migration-reachability` and
`ci:journey-migration-reachability` exist to catch it — run both.

**Branch.** `concept2cure-v2` is the only branch of truth. The pre-push hook enforces it
and is silently inert in any environment that has not run `npm ci`.

---

## 5. The phased plan

Each phase states the gate that ends it. **A gate is a command or an observation, never a
judgement call.** Do not start the next phase because the current one feels done.

### Phase 0 — Settle the audit substrate (weeks 1–4)

Everything in the consolidation track is queued behind one decision that has already been
made but not executed. `audit_events` is the reference substrate because its chain is
enforced by a `BEFORE INSERT` trigger and cannot be bypassed; `audit_logs` skips NULL
links and has already lost rows in production.

- **L11** — Stage 1 (bridge) then Stage 2 (flip the readers; needs approval).
- **L12** — unblocks the moment Stage 2 lands. `linkDomainHistory` has zero call sites and
  23 domain-history tables are chain-orphaned. Do **not** wire them into `audit_logs` first.
- **L13** — execute the written delete list for 43 dead audit tables.
- **L14** — 11 write-only tables; needs `prod` sign-off before deletion, so raise it now
  rather than at the end.

**Gate:** one reader path, one writer path, `audit_events` chain verified end to end, and
the 23 domain-history tables linked. `docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.3 goes to
zero orphans.

**Why first:** four ledger rows are blocked or fenced by it, and every later integrity
claim rests on which substrate is authoritative.

---

### Phase 1 — Isolation proven in production (weeks 2–8, parallel with Phase 0)

The least-privilege role exists and grants are applied each deploy. What has never been
demonstrated is production *running under it* with a cross-tenant read returning zero rows.

- **B8** — `RLS_ENFORCE=on`, respecting the ordering hazard documented in **B20**.
- **B17 / B18** — provision `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY`, or record an
  explicit accepted risk with an owner.
- **B11** — a real `pg_dump` and restore into a scratch branch, RPO/RTO recorded, runbook
  committed with the rehearsal date. Currently `scripts/backup.sh` archives source code
  only, not the database. This is the readiness probe's one hard BLOCKER outside
  procurement.

**Gate:** production observed running under the least-privilege role; a cross-tenant read
returns zero rows; a restore has actually been performed and dated.

**Why parallel:** it shares no files with Phase 0 and it gates every multi-tenant pilot,
so it must not queue behind consolidation.

---

### Phase 2 — Close lineage at the ingest end (weeks 4–12)

The draft-to-filing half of the chain now holds. The ingest half does not, and it is the
half a regulator asks about first: *what did this fact come from, and has that thing
changed since?*

Order within the phase is forced by one open decision:

1. **L22 first — decide, then build.** Either populate `evidence_sources` / `evidence_claims`,
   or converge them onto the live `cre_evidence_sources` spine and delete them. Building
   writers before deciding creates the second substrate the doctrine forbids. This is a
   half-day decision that unblocks weeks of work; do not let it sit.
2. **L21** — source-document versioning: `previous_version_id`, `is_current`, an update
   path. Today a revised protocol becomes an unlinked second row.
3. **L25** — nothing ever checks a stored hash against source bytes. Add the sweep, and
   have `verifyIntegrityChain` cover the originating document, not only the extracted text.
4. **L23 remainder** — the IND path supplies no document pointer, so its leaves pin
   nothing. Truthful today, but it is the one filing path that cannot answer the question.

**Gate:** a source document revised after a fact was drafted from it causes that fact to
report it rests on superseded content — asserted by a test, not observed by hand.

---

### Phase 3 — One writer, one signer (weeks 6–14, parallel with Phase 2)

Pure consolidation debt. Nothing here is unsafe today; all of it is safe *by convention
rather than by construction*, which is the state that decays silently.

| Item | The work |
|---|---|
| **L39** | Re-point three inline inserts in `routes/cerv2-sections.ts` onto the shared writer. They have no tests, so write those first — that is why this was not a rider on L31. |
| **L37** | Consolidate two conforming `electronic_signatures` INSERT sites onto one. |
| **L28** | `validateElectronicSignature` still has no production caller; consolidate the two verifiers. |
| **L17** | Org-scope the §11.50 signer lookup — **through the org-membership table**. Scoping on `users.default_organization_id` is the obvious fix and it is wrong: it breaks a legitimate signature by a user acting outside their default org. |
| **L38** | `artifactVersionStore` writes `updated_at`, which no migration creates. Either the column joins the migration set or the writer stops naming it. |
| **L10** | D8 C2 — attribute-free alias map plus the CI gate enforcing the invariant. |

**Gate:** one INSERT site per substrate, one verifier, and a CI gate for each — so the
next writer cannot reintroduce the second one.

---

### Phase 4 — Make one journey actually complete (weeks 10–22)

This is the phase that converts a capable platform into a demonstrable one. It cannot
start earlier: it consumes Phases 0–3, and it consumes procurement.

- **L1** — re-point `mdx-command-handlers.ts` off the not-implemented
  `ESGSubmissionService.transmitToESG` onto the real AS2 in `fda-esg.ts`, through the
  canonical governed transmit so preconditions travel with it (**B16**).
- **L3** — E2E golden journeys for 510(k), CER and NDA, asserting honest refusals as
  first-class outcomes.
- **L32 / L33 remainder** — the c2c path still records accepted AnA text as human-authored,
  and the SSE draft path reports the generator to the client without persisting it at
  accept. Until both close, the platform cannot say which model produced a given sentence.
- **L34 remainder** — `cerv2-sections.ts` hardcodes `'Section updated'`; `doc_revisions`
  has no reason column at all.
- **B14 / B15** — vendor the eCTD v4.0 RPS message schema; add the PDF/A toolchain to the
  deployment image. Both are absent, and both are silent until the moment a package is built.
- **B4** — LORENZ eValidator licence. Structural validation evidence is *required* by the
  transmit path; missing evidence is treated as unknown, and unknown blocks. No licence, no
  filing.

**Gate:** an automated golden journey that assembles a sequence, **reopens the package**,
validates it against the licensed validator, and transmits it through the real gateway to a
test endpoint. Reopening is the part that catches the defects a build-only test misses.

---

### Phase 5 — Qualification, and the moat (procurement-paced)

- **L7** — the IQ/OQ pack's engineering half is delivered: 11 Part 11 controls mapped to
  the tests that exercise them, all executed and passing, verdict failing closed on any
  control lacking evidence. What remains is a protocol executed and signed by a competent
  person. Schedule the person now; the pack is their input, not a substitute.
- **L15** — B1–B21 close on procurement's clock, not engineering's.
- **L8 — outcome-data capture.** (submission content → agency response) pairs. This is the
  only advantage in the competitive benchmark that no competitor can purchase, and nothing
  captures it today. It is cheap to build and worthless until real submissions flow, which
  is exactly why it must be built *before* the first one — a pair not captured at the time
  is not recoverable later.
- **L9** — template-chase ingestion. The substrate is right; the ingestion is unbuilt.
- **L5** — PMS complaint / PMCF enrolment backends.
- **L16** — consultant / CRO channel: multi-client workspaces, per-submission pricing.
  A `prod` decision, unstarted.

**Gate:** a signed qualification, and one real submission whose outcome pair is captured.

---

## 5a. Workstream: AnA as a surface-aware operator

**The requirement.** AnA is context-aware to the work the current screen needs, is the
expert on everything behind it, and can drive the screens herself — including through MCP
— when the work or the client asks for it.

This is a product direction, not a ledger row, so it is stated here in full. Three
separable capabilities sit inside it, at three different distances from shipping.

### What exists today, verified

| Capability | State on `concept2cure-v2` |
|---|---|
| Navigation contract | **Locked.** `shared/navigation/` — `NAVIGATION_TARGETS`, `resolveNavigation()` returning a typed `NavigationDirective` or a typed error, `parseNavigationSignals()` for ` ```ana-navigate ` blocks. UI-agnostic, importable by both halves. |
| Navigation tools | **Registered and reachable.** `list_app_screens` discovers valid destinations; `navigate_to` validates and returns `{ status: 'navigation_ready', directive }`. Refuses unknown targets rather than emitting a broken jump. |
| Client half | **Exists.** An action carrying a `path` flows through streamed `executedActions` → `Ana.tsx` `handleActionClick` → `onNavigate` → ZenApp's navigate handler → `layoutMode`. |
| **The join between them** | **Missing.** `server/routes/ana-ri/post-processing.ts` never pushes the directive into `executedActions`. AnA can decide to navigate and cannot navigate. |
| Surface awareness | **8 of 118 surfaces**, one workstream. `mdx-context-resolver.ts` fires only when `module_context.workstream === 'mdx'`, composing surface purpose, common questions, relevant tools, onboarding milestone and proactive alerts from `mdx-knowledge-pack.ts`. |
| Surface mutation | **Three domains.** `mutation-surface-tool-defs.ts` covers the MDX kit data domain, the beta authoring surface, and IVD — tenant-scoped, audit-logged through the global mutation-audit middleware. |
| MCP | **Absent.** No dependency, no server, no client. One aspirational comment in `AnaToolExecutor.ts:11`. The 359 tools are an internal registry invoked through the AI gateway. |

The pattern is the familiar one: the mechanism is built and the call site is missing. That
is good news for cost and bad news for anyone reading the tool list as evidence of
behaviour.

### The order to build it in

**Step 1 — Close the navigation loop (days, not weeks).** Push `navigate_to` results whose
`status === 'navigation_ready'` into the streamed `executedActions` in
`post-processing.ts`, mapping each directive to `{ label, path, actionType: 'navigate', ...params }`.
The README offers tool-driven and signal-driven options; **take tool-driven**. A tool call
is a governed, logged, schema-validated decision, whereas parsing fenced blocks out of
prose means model text can steer the UI — a prompt-injection path straight through an
ingested document. Add the reconciliation check the README asks for, so
`NAVIGATION_TARGETS` cannot drift from the real `LayoutMode` constants.

*Done when:* an E2E test asserts that asking AnA to open a named surface moves the client
to it, and that asking for a surface that does not exist produces a refusal rather than a
jump.

**Step 2 — Generalize surface awareness (weeks) — but consolidate the surfaces first.**
L42 records that the surface layer never had the consolidation pass the services, routes
and tables got: **118 registry ids over 86 modules**, still carrying clusters the backend
shed. Writing 118 knowledge entries against a set about to be merged means writing entries
twice and deleting the difference. Run the consolidation, then generalize against the
number that survives.

L44 is the paired warning, and it is larger than it looks. 72 surfaces call
`useLive`/`liveGet`, which reports whether what is on screen is the tenant's data or a
fixture standing in after a failed fetch; four render the pill that says so. **A surface
knowledge entry must carry that same verdict**, or AnA will describe fixture state as the
customer's own — the assistant version of the defect L41 closed on one screen. Audit for
backing before writing knowledge, on the evidence standard used for the eight L40
additions: a mounted route and real API calls.

The MDX resolver is the right shape; its limit is that it is keyed to one workstream and
hand-written for eight surfaces. Generalize it:

- Make the surface context resolver workstream-agnostic, selected by the surface id the
  client already knows, not by a `workstream` string.
- **Have the client send the active surface id with every turn.** Nothing carries it today
  — grep `layoutMode` in the AnA routes and you get nothing. Until it does, "context aware
  to the screen she is on" is inference, not knowledge.
- Derive the per-surface entry from the same registry the discoverability gate reads, so a
  new surface arrives with a knowledge entry or fails CI. Extend
  `check-surface-discoverability.mjs` rather than writing a second gate: it already knows
  every renderable surface and already demands a reason for every exclusion.
- Populate purpose and common questions per surface; let tools and alerts resolve
  dynamically from the surface's domain rather than being enumerated by hand.

*Done when:* the CI gate fails on a renderable surface with no knowledge entry, and the
count in the paper reads 118/118 rather than 8.

**Step 3 — Extend governed mutation past three domains (weeks, per domain).** Screen
control means writing, and every write is governed. Reuse the existing shape — tenant-scoped
via `ToolContext.organizationId`, audit-logged through the mutation-audit middleware,
two-phase where the mutation is consequential. Do not invent a second mutation path for
UI-driven actions; that is the one-of-anything rule, and a second path is how the second
signing surface came to exist.

**Step 4 — Decide MCP as client, server, or both (a decision before a build).** These are
different products with different risk surfaces:

- **AnA as MCP client** — she consumes external MCP servers, gaining reach beyond this
  codebase. Every connected server is a new source of untrusted tool output entering the
  loop, and the gateway's injection scanning already covers non-user content precisely
  because ingested material re-entering as context is the realistic attack path. Extend the
  same scanning to MCP tool results; do not exempt them because they arrive over a protocol.
- **The platform as MCP server** — external agents drive Concept2Cure. This is the
  interesting commercial direction (a sponsor's own agent working the dossier) and the
  larger security surface: every exposed tool is a new path into governed, tenant-scoped
  data, reached by a caller the platform did not authenticate through its own UI. It needs
  its own authorization story, not a reuse of the session's.

Whichever ships, **it goes through the AI gateway chokepoint and the CI bypass gate**
(`npm run ci:gateway-bypass`), and the placement rules apply unchanged: an air-gapped
tenant cannot reach a hosted MCP server any more than it can reach a hosted model.

*Recommended:* client first, scoped to a named allowlist of servers, because it is additive
and reversible. Server second, after the first real customer asks — it is an API surface,
and an API surface is forever.

### The constraint that makes this hard, and the one that makes it safe

Hard: "expert on everything" is not a prompt. AnA is grounded because retrieval is
grounded, and the honest limits already stated in the paper apply here too — citations are
per-claim, retrieval failure is reported rather than hidden, and binding retrieval-verified
citations into the document is still Phase 4 work. Surface awareness widens *what she knows
about where she is*; it does not widen what she is allowed to assert.

Safe: navigation refuses unknown targets, mutations are tenant-scoped and audited, and the
gateway is a single chokepoint with a CI gate against bypass. Screen control inherits all
three the moment it is built on the existing contract — and inherits none of them if
someone ships a shortcut that writes to the client directly.

---

## 6. Sequencing rules — what must *not* be done first

These are the traps. Each would look like progress.

- **Do not populate the provenance tables before deciding L22.** Writing to
  `evidence_sources` / `evidence_claims` while `cre_evidence_sources` is live creates two
  substrates for one fact — the exact condition the audit-store consolidation exists to undo.
- **Do not link the 23 domain-history tables into `audit_logs` (L12).** That wires 23
  tables into the substrate Phase 0 retires. It is blocked for a reason; the block is not
  a scheduling artifact.
- **Do not repair an entry point without repairing what it feeds.** L18 and L19 landed
  together deliberately: fixing the 500-ing route alone would have started writing invented
  content as governed evidence. Ask, for every "just unblock this route" task, what begins
  flowing when it works.
- **Do not assign surface tiers to satisfy a checklist.** The eight newly-catalogued
  surfaces carry no tier or industry metadata because guessing would silently withhold a
  capability from customers entitled to it. That is a `prod` decision with a revenue
  consequence.
- **Do not add a catalog entry for a shell.** A catalog entry asserts a capability is
  available. Listing an unbacked surface to quiet the discoverability gate is worse than the
  invisibility it fixes — and L41 showed it had already happened once: `authoring-engine`
  was catalogued and rendering inline fixture data with nothing on screen saying so, with a
  catalog description asserting validation that "runs as intended 100% of the time". Closed
  by labelling the surface and correcting the description. L44 is the same shape at scale:
  72 surfaces consume `useLive`, which reports whether the data is real, and four render
  the pill that says.
- **Do not wire navigation signal-driven.** Parsing ` ```ana-navigate ` blocks out of model
  prose lets any text that reaches the context window steer the client — including text
  from an ingested document. Take the tool-driven path: a tool call is schema-validated,
  logged, and refuses unknown targets.
- **Do not build a second mutation path for UI-driven actions.** Screen control reuses the
  governed mutation tools or it is not governed. A second path is exactly how a second live
  signing surface came to exist (L26, closed by deletion rather than repair).
- **Do not raise coverage thresholds before raising coverage.** The CI coverage job
  currently overrides all four thresholds to 0 and runs `continue-on-error` (**B12**). Flip
  it only when real coverage clears the `vitest.config.ts` target, or CI goes permanently
  red and gets ignored — which costs more than the gate is worth.

---

## 7. Definition of done

A row moves to `done` when **a command proves it**, and that command goes in the Evidence
column of the ledger. Not when an agent reports success — agents have reported success for
work that wrote nothing at all.

For any change to a governed path, done means all of:

1. A test that fails against the previous code and passes against the new.
2. A CI gate if the defect class can recur. Prefer *making the shape of the mistake fail
   loudly* over fixing each occurrence — that is the pattern behind the strongest assets in
   the repository.
3. The migration in `C2C_MIGRATION_FILES` if it creates schema.
4. A ledger row updated with the proving command.
5. `npm run check:ledger` passing.

**Not done:** a mechanism with no call site. That is the single most common defect shape
here, and it passes review every time because the code is correct.

---

## 8. What I would build next, ranked

If only one thing moves this week, make it the first row.

| # | Item | Why it is first | Cost |
|--:|---|---|---|
| 1 | **L22 decision** — populate or converge | A half-day decision fencing weeks of Phase 2 work, and the wrong build order creates permanent substrate debt | Decision only |
| 2 | **L11 Stage 1 → 2** — audit substrate bridge and flip | Unblocks L12, L13, L14; every integrity claim rests on it | Weeks |
| 3 | **B11** — backup / restore rehearsal | The one non-procurement hard blocker on the readiness probe, and unprovable retroactively after a loss | Days |
| 3= | **§5a Step 1** — close the AnA navigation loop | One file. The contract, the tools and the client handler all ship today and are joined by nothing; the highest capability-per-hour item on this list | Days |
| 4 | **B8 + B20** — RLS enforced in production | Gates every multi-tenant pilot; the code is ready and the flag is not flipped | Days |
| 4= | **L42** — surface consolidation pass | 118 ids over 86 modules; every surface-layer investment after this one is cheaper once it lands, and §5a Step 2 is wasted work before it | Weeks |
| 5 | **L8** — outcome-data capture | Cheap now, impossible to backfill, and the only unpurchasable advantage in the benchmark | Weeks |
| 6 | **L21 + L25** — source versioning and hash checking | Closes the half of the lineage chain a regulator asks about first | Weeks |
| 7 | **L39 + L37 + L28** — writer and signer consolidation | Safe by convention today; convention decays and this is the substrate under Part 11 | Weeks |
| 8 | **B1–B7** — start procurement now | Lead time exceeds the engineering that consumes it; starting late here delays everything downstream | Money and time |

Note what is *not* on this list: new capability. The platform's breadth is not the
constraint. Nothing in the next two quarters is improved by another module.

---

## 9. Risks to this plan

| Risk | Consequence | Early signal |
|---|---|---|
| Procurement starts late | Phase 4's gate cannot be met at any engineering pace | B1–B7 still `open` after week 4 |
| L22 is deferred rather than decided | Phase 2 either stalls or builds the wrong substrate | Any PR writing to `evidence_sources` |
| Phase 4 begins before Phase 0 lands | Journey tests assert against a substrate being retired | Golden-journey work referencing `audit_logs` |
| Coverage gate flipped early | CI goes red permanently and is then ignored | `continue-on-error` removed with coverage below target |
| The moat is deferred to "after first filing" | The first outcome pairs are lost and unrecoverable | L8 still `open` when a real submission is scheduled |
| Ledger rot | The plan silently describes a product that no longer exists | `npm run check:ledger` not run in a week |
| MCP shipped before the navigation loop | A new protocol surface added while the existing one still does not reach the client — reach without control | Any MCP dependency landing while `post-processing.ts` is unwired |
| Surface knowledge hand-written per screen | 118 entries drift the moment a surface changes; the gate becomes the thing people route around | Knowledge entries added without extending `ci:surface-discoverability` |

---

## 10. Cadence

- **Daily:** `npm run check:ledger`. It is fast and it is the only thing standing between
  this plan and fiction.
- **Weekly:** `node scripts/ops/ga-readiness-report.mjs`, and move every row it flips.
  Re-rank §8 against what actually landed rather than what was planned.
- **Per phase:** the gate, executed as written. A phase is over when its command passes,
  not when its work feels finished.
- **Per change to §5:** update this file, not a side document. One of anything.
