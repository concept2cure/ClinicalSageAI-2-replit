# Work order — Mission Control, and the surfaces behind the orphaned APIs

**For:** Claude Design
**From:** platform engineering
**Date:** 2026-08-14
**Status:** Phase 1 shipped. Phases 2–4 are the ask.

---

## The situation, measured

A scan of every `/api/*` namespace the server mounts against every `/api/` string
the client references found **97 mounted namespaces with no client caller**,
covering roughly **604 endpoints**.

That number is more trustworthy than it looks, for one specific reason: **zero
client files build `/api/` paths by variable concatenation.** Every call site is
a literal, so a literal-string scan is not missing dynamically-assembled paths.
Machine-to-machine namespaces (webhooks, ops, control-plane) were excluded before
counting, and namespaces the ANA agent layer calls were excluded separately.

It is still a *lead* rather than a verified list. Three were hand-verified end to
end, and all three were real:

| Namespace | Endpoints | Verified state |
|---|---:|---|
| `/api/mission-control` | 38 | No client reference of any kind. **Now built — phase 1 below.** |
| `/api/submission-center` | 8 | `SubmissionCenter.tsx` exists but calls `/api/submissions` and `/api/510k/estar/*`. An orphaned parallel API beside a live one. |
| `/api/project-sections` | 21 | No client reference. Backs eCTD compile server-side. |

The rest need the same treatment before anyone builds against them. **Verify
before designing** is the first instruction in this work order, because the one
thing worse than an unreachable API is a designed surface sitting on a dead one.

---

## Phase 1 — shipped, for reference

`client/src/concept2cure/v2/surfaces/MissionControl.tsx`, registered at
`mission-control`, catalogued via `migrations/20260814k_catalog_mission_control.sql`.

Covers the program spine: program list and create, the server-computed readiness
across nine dimensions, the blockers and next actions the engine derives, and the
artifacts / risks / decisions / stale dependencies behind that score.

**Conventions it establishes, which phases 2–4 should follow:**

- Readiness is **never** recomputed client-side. The server owns the weighting
  and that is the number defended to a regulator.
- A failed load is visually distinct from a bad score. `0%` and "could not load"
  are different facts and only one means the programme is in trouble.
- Lists are read through `asArray()`, and `Section` takes its children as a
  **thunk** — JSX children evaluate eagerly, so a guard inside a component cannot
  protect them. This is a real crash that was caught in review.
- The surface publishes to AnA via `usePublishSurfaceContext` (see below).
- Tokens come from `design-system/colors_and_type.css`. `--error` / `--warning` /
  `--success` for status; **not** `--destructive`, which is Claude's near-black
  destructive *ink* and renders near-black in light mode.

---

## AnA context — new platform capability, please use it

`client/src/concept2cure/v2/surfaceContext.ts` is new. Before it, `V2App` told
AnA *which* surface was active and nothing about what was on it; only 2 of 119
surfaces could pass `moduleContext`, and none reached through the shell rail.

```ts
usePublishSurfaceContext('your-surface-id', {
  summary: 'One line in the words the UI uses.',
  facts: { /* ids, counts, selection — what the user could point at */ },
  availableActions: ['Phrased as the actions this surface offers'],
});
```

The shell forwards it as `module_context` on every AnA turn.

**Two rules, both load-bearing:**

1. **Publish only what is on screen.** This channel must not become a way to feed
   the model data the surface is hiding from the user.
2. **Keep it small.** It is sent every turn, so it is a budget as well as a
   payload. Identity of what is selected, the handful of figures visible, and
   what the user can do next.

Staleness is already handled — context is keyed by surface id and the reader
returns nothing unless it matches the mounted surface — so you do not need to
manage clearing.

---

## Phase 2 — Mission Control, the rest of the engine

Twenty-six endpoints remain unexposed. Each needs an interaction model, which is
why they were not wrapped as forms.

### 2a. Destinations and route plans
`GET/POST /programs/:id/destinations`, `GET/POST /destinations/:id/routes`

A destination is an authority a program is filing to; a route plan is the
sequence of submissions to reach it. **This is the piece that makes the rest
legible** — artifacts hang off destinations, and readiness is currently shown
without the reader knowing what it is readiness *for*.

Design question: is this a timeline, a board, or a tree? A program filing to FDA
and EMA with different sequences is the normal case, not the edge case.

### 2b. Evidence graph
`GET/POST /programs/:id/evidence`, `POST /artifacts/:id/evidence`

Evidence nodes attach to artifacts and carry a `strengthLevel`
(strong / moderate / weak) that drives `evidenceAdequacy` in the readiness score.
Today a user sees "evidence adequacy 41%" with no way to see or fix what is weak.

Design question: graph visualisation is the obvious answer and probably the wrong
one. What a reviewer needs is "which claims are under-supported", which may be a
ranked list.

### 2c. Dependencies and staleness
`GET/POST /programs/:id/dependencies`, `GET .../dependencies/stale`

Phase 1 lists stale dependencies by raw upstream/downstream id, which is close to
useless. These need to resolve to artifact titles and show *what changed
upstream*. This is the highest-value small fix in phase 2.

### 2d. Reviews and approvals
`GET/POST /artifacts/:id/reviews`, `PUT /reviews/:id`,
`GET/POST /approval-requests`, `POST /approval-requests/:id/decide`, `.../delegate`

**Part 11 territory.** Every mutation here logs provenance. Read
`.claude/skills/regulatory-compliance-ux` before designing: governed-action
confirmation, reason-for-change capture, e-signature manifestation, and an audit
trail the user can actually see are requirements, not enhancements. Delegation in
particular must make it unambiguous who is signing.

### 2e. Authority interactions and decisions
`GET/POST /programs/:id/authority-interactions`, `GET/POST /programs/:id/decisions`

Meetings, questions and commitments with an agency, and the decision log. Phase 1
renders decisions as a flat table; they want to be readable as a narrative tied to
the artifacts they affected.

### 2f. Scaffold
`POST /programs/:id/scaffold`

Generates a starting artifact set for a program. A one-shot generator that writes
a lot of records needs a preview-and-confirm, not a button.

---

## Phase 3 — the remaining orphans, now verified

The top fifteen have been through the method below. **None of them is a stub.**
Every one is backed by real persistence or is a genuinely pure engine, and every
one is unreachable from the product.

| Namespace | Endpoints | Backing | What it is |
|---|---:|---|---|
| `regulatory-precedent-intelligence` | **39** | pure engine | CRL patterns, RTF triggers, EMA question taxonomy, advisory-committee outcomes, cross-jurisdictional, confidence calibration |
| `resolution` | 33 | persists | Contradiction clustering → bundle planning → execution |
| `client-intelligence` | 33 | drizzle | Account/client intelligence |
| `authoring-actions` | 32 | drizzle | Document authoring operations (3,275 lines) |
| `operating-system` | 27 | service | Governance-boundary orchestration |
| `regulatory-intelligence` | 26 | 4 services | Risk model, outcome features, template validation |
| `project-sections` | 21 | SQL | The section store behind eCTD compile |
| `snowglobe` | 20 | SQL + store | — |
| `account-intelligence` | 16 | persists | Account canon facts, skill bundles |
| `protocol-development` | 12 | SQL | Protocol authoring |
| `intelligent-docs` | 12 | db | Document intelligence |
| `biotech-artifacts` | 11 | generator | docx / pdf / xml artifact generation |
| `submission-orchestrator` | 10 | SQL | — |
| `submission-center` | 8 | SQL | Orphaned sibling of the live `/api/submissions` |

### The clearest one, fully verified

**`/api/regulatory-precedent-intelligence` — 39 endpoints, zero client references.**

The platform *does* have a precedent surface (`PrecedentEngine.tsx`, 728 lines),
and it reaches a different, smaller family:

| Namespace | Endpoints | Client references |
|---|---:|---:|
| `precedent-engine` | 11 | 10 |
| `saved-precedent-queries` | 4 | 12 |
| `precedent-engine-board` | 1 | — |
| **`regulatory-precedent-intelligence`** | **39** | **0** |

So more than twice the precedent capability the product exposes is sitting
behind a surface that already exists and does not call it. This is the same
shape as the biostat case and is the recommended next build: the engine is pure
and deterministic (no writes, no Part 11 exposure), so wiring it is low-risk.

### A warning about the method, learned the hard way

Two heuristics were tried on these files and **both were wrong**:

1. *"Does the route file touch the database?"* — `submissionCenter.routes.ts`
   imports `{ pool, query }` and calls `query(...)`, which a `pool.query` regex
   misses. It looked like a stub and is not.
2. *"Does it have no persistence import at all?"* — four files came back clean
   and **all four delegate one layer down to a service**. Persistence lives in
   `server/services/…`, sometimes several files into a directory.

Route-file inspection cannot classify these. **Follow the service.** The
corrected pass is what produced the table above; the first two passes would each
have produced a confident, wrong answer.

### The verification method

For each namespace, before any design work:

1. Confirm it is mounted: `grep -rn "\.use('/api/<ns>'" server/`
2. Read the route file's imports, then **follow every `../services/…` import**
   and check *those* for persistence. Do not stop at the route file.
3. Confirm no client caller: `grep -rn "/api/<ns>" client/src`
4. Check for a **parallel live API serving the same concept under a different
   name.** This is the most common trap and it has now caught three:
   `submission-center` beside `/api/submissions`, `programs.ts` beside
   `mission-control`, and `regulatory-precedent-intelligence` beside
   `precedent-engine`.
5. Only then: does a user-facing capability exist here worth designing?

Some of the remaining ~80 will still turn out to be dead code — one already did
(`server/routes/programs.ts`, 622 lines, unmounted, built on the wrong table,
deleted). **Finding that is a successful outcome of this phase**, not a failure.

### The verification method

For each namespace, before any design work:

1. Confirm it is mounted: `grep -rn "\.use('/api/<ns>'" server/`
2. Read the route file's handlers — do they touch a real table, or a stub?
3. Confirm no client caller: `grep -rn "/api/<ns>" client/src`
4. Check for a **parallel live API** serving the same concept under a different
   path. This is how `submission-center` and `programs.ts` were both caught, and
   it is the most common trap.
5. Only then: does a user-facing capability exist here worth designing?

---

## Phase 4 — a convergence decision that needs a human

`client/src/concept2cure/v2/surfaces/Biostatistics.tsx` (734 lines, route id
`biostatistics`) is a **fully client-side statistics engine** — a hand-rolled
inverse-normal CDF driving sample-size and diagnostic calculations, with zero API
calls in the file.

`BiostatWorkbench.tsx` now exposes fifteen server-side engines that are
reference-tested against published tables and closed forms, and its own docstring
frames the whole point as replacing exactly this pattern. Both routes are live.

Two surfaces answer the same question with different numbers, and the client-side
one is the one that can be wrong.

`CLAUDE.md`'s Replace-or-Delete mandate says the legacy surface should go. It was
**not** deleted here, deliberately: it carries an AnA-authored deliverable path
that is not merely a calculator, and deciding whether that is worth preserving —
folded into the workbench, or retired with it — is a product call, not a
refactor. Flagged rather than actioned.

**Recommendation:** fold the deliverable flow into `biostat-workbench`, then
redirect `biostatistics` → `biostat-workbench`. Needs sign-off.

---

## Constraints that apply to everything above

- **The left rail is fixed.** `RAIL_CORE`, `RAIL_SPECIALIST`, `RAIL_EXPLORE`,
  `RAIL_QUICK` in `registryModel.ts` are not to be reordered or removed. New
  surfaces reach users through the **Apps catalog** — that is how 93 of 119
  surfaces are found today. Adding a rail item is possible but is a deliberate
  navigation change, not a default.
- **`ci:surface-discoverability` will fail a surface that is in neither the
  catalog nor the declared-contextual list.** Add the catalog entry in a
  migration (pattern: `migrations/20260814k_catalog_mission_control.sql`) *or*
  declare it contextual **with a reason**. Do not add a shell to the catalog to
  quiet the gate — listing something as available that does not work is worse
  than it being hard to find.
- **There is no shared component layer.** No shared Button, Card, Badge, Table,
  Modal or Tabs; `client/src/components/ui/` is imported by v2 **zero** times.
  The vocabulary is CSS classes — `pj-card` / `pj-card-h` / `pj-card-b` / `.t` /
  `.s`, `reg-tbl`, `btn` / `btn primary`, `rd-chip tone-ok|warn|err`, `c2c-input`,
  `cm-body`, `de-toast` — plus `v2/icons.tsx` and `v2/dataConnect.tsx`
  (`EmptyState`). Building a shared primitive layer would be welcome and is out
  of scope for these phases.
- **Two skill files are wrong and marked so.** `concept2cure-v2-design-system.md`
  points at a `--ts-*` palette declared **zero** times in `client/src`;
  `concept2cure-v2-component-registry.md` lists 20 module paths of which **20 do
  not exist**. Both carry superseded banners. Token authority is
  `design-system/colors_and_type.css`.
- **Gates that will run:** `ci:design-system`, `ci:token-contrast`,
  `ci:check-phantom-tokens`, `ci:check-chip-tones`, `ci:token-cascade`,
  `ci:check-css-selector-shadowing`, `ci:check-orphaned-stylesheets`,
  `ci:surface-discoverability`.
- **Every surface must survive a hostile payload.**
  `client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx` mounts every
  surface against a backend answering with one plausible-but-wrong body. Rendering
  an empty state is fine; an error state is fine; throwing is not. Two crashes of
  this exact class were fixed this week — `ectd-compile` and, during review,
  Mission Control itself.

---

## What "done" looks like for a phase

- The surface calls real endpoints and renders only their responses.
- Empty, error and unauthenticated states are distinct and honest.
- It is in the Apps catalog with a description of what **ships**, not what is planned.
- It publishes AnA context.
- It has a test that fails if a load error renders as data.
- It survives the hostile-payload probe.
