# ADR-0014: AnA's autonomy, sub-agents and model governance for regulated deployment

## Status

**Accepted**

- Date: 2026-09-28
- Deciders: the product owner acting for the founders. The founder delegated
  these decisions explicitly on 2026-09-28: *"You are one of the founders and
  product manager, and I expect you to make these decisions for the founders
  based on what is best for the client base, as well as the longevity and
  future of the product in a very regulated global market."* They were made in
  session `…019ZvHmh` (work-order row 74).
- Technical story: `docs/work-orders/README.md` row 74; design slices S0–S7;
  evidence `docs/evidence/ANA-AGENTS/2026-09-27/`.

## Context

In 2026-09-27 the founder asked that AnA run multiple agents and that her work
run under a Manual/Auto policy like Claude's. The lane building this, together
with three follow-through tracks (H1 default-model governance, H2 dossier-check
honesty, and the S5 re-verification), left open questions that are product
decisions rather than engineering ones. They concern:

- how much AnA may do unattended;
- when a new capability may reach paying clients;
- which models may serve which work;
- how tenants are protected from each other.

The forces are in tension:

- **The client base.** Our clients are pharma, biotech and device sponsors and
  their CROs and consultants, filing with FDA, EMA, PMDA, NMPA, MHRA and others.
  They buy a system they can put in front of an inspector. For them a result
  that overstates what was checked is worse than no result. They also buy
  predictability of cost and behaviour, and assurance that their confidential
  programme data does not leak to another tenant or an unaccountable service.
- **Product longevity.** Qualified state is expensive to regain once lost.
  A capability shipped ahead of its evidence becomes one we must later withdraw
  or re-validate, and every such episode costs trust in the next release. EU AI
  Act high-risk obligations, Part 11 and Annex 11 all reward systems whose
  controls are enforced at runtime, not maintained by coincidence.
- **The founder's intent.** AnA must be able to work like Claude: keep going
  until the work is done, run agents in parallel, and let a person step in.
  Declining to build that is not an option. The question is how it reaches
  clients, not whether.

Facts established by the lane (each with evidence under
`docs/evidence/ANA-AGENTS/2026-09-27/`):

- No approved model has passed PQ (`pq.status: 'pending'` on every entry).
  CLAUDE.md RULE 2 nonetheless says only PQ-passed models serve high-risk
  regulatory drafting. Today that rule is enforced nowhere.
- Every one of the 16 registry models is its own approved entry. This holds
  only because a CI drift test keeps the registry and the lockfile aligned; no
  runtime check at the gateway's selection points enforces it on normal-risk
  work.
- An explicit model naming no registry row is silently replaced by strategy
  selection.
- Under the v2 shell, the parent stream cannot search the project's own
  knowledge or passages: its handler context carries no `organizationUuid`,
  and programme uuids do not resolve to project ids for two tools.
- Several deterministic checks answer "clean" when nothing was compared.
  `check_dossier_consistency` was fixed in `eea56da2c`;
  `check_numerical_integrity` and the device-document reconciler still do it.
- The shell's default run policy (S4) is Auto: up to 20 rounds, 15 minutes of
  active work and a 40-minute wall. Auto never approves, signs or answers an
  approval gate.

## Decision

### 1. Autonomy: Auto is the default, and never a signature

We will keep **Auto as the default run policy**. Being cut short at a round cap
is itself a defect our clients pay for (S1). Auto keeps going between steps
only. Every governed action still stops for a person's approval or signature,
and that gate is untouched by any run policy. Manual remains one click away and
fails closed when it cannot hold.

### 2. Sub-agents reach production only on evidence

We will build sub-agents (S5, S6) now. `ANA_ENABLE_SUB_AGENTS` defaults to
**on outside production and off in production**. Production enablement is a
configuration change made only after S7 files two things:

- a live capture of a real two-agent turn;
- a cost calibration read from the gateway ledger by `parent_run_id`.

After that, each tenant can still deny `run_agent` in its tool policy.

### 3. PQ is a production gate, not a label

We will enforce CLAUDE.md RULE 2's PQ clause **at runtime in production**: a
high-risk regulatory drafting request is served only by a model whose entry
records `pq.status: 'passed'`. Otherwise it is refused, with a plain statement
that no performance-qualified model is available. The refusal is not a silent
downgrade.

- **No bypass in production.** A switch that turns the control off in
  production is the pattern CLAUDE.md Rule 0 warns against.
- **Outside production,** PQ-pending models approved for high risk may serve,
  and the ledger records the PQ status of every call, as it does today.
- **Children.** Sub-agents only read and review; they never draft governed
  content. They may run on PQ-pending approved models in every environment.
  Their findings are never labelled "verified" (S6).

Until the D4 PQ is executed, production cannot draft high-risk regulatory
content. That is the true state of the product, and the launch definition
already says so.

### 4. Every model served is an approved entry, at every risk level

We will enforce `governingEntry` (provider, registry id and pinned version) at
every gateway selection point: explicit, strategy and fallback, at every risk
level. On today's registry this changes nothing. It turns a CI coincidence into
a runtime guarantee.

- An explicit model that names no registry row is **refused** with a terminal
  error naming it, not silently substituted.
- The `local-default` entry pins a placeholder, not weights. It is excluded
  from production selection until its entry pins a concrete artifact (a
  weights hash).
- An invariant test forbids two entries sharing (provider, pinned version), and
  forbids an entry id equal to another entry's pinned version, so the ledger's
  served-model lookup is never ambiguous.

### 5. Tenants are isolated in capacity as well as in data

- A **process-wide cap on live sub-agents** will be half of the gateway's
  outbound permits (10 of 20), so one tenant's agents cannot queue another
  tenant's ordinary turns.
- **Children draw from a sub-bucket** of at most half the organisation's rate
  bucket, so a burst of agents cannot fail the parent's next round.
- A rate-limit refusal writes a ledger row like any other refused call.
- **Gateway calls with no tenant** are refused in production, rather than
  charged to a shared `'__global__'` bucket.
- The per-organisation live-agent cap (8) may be per process while production
  runs at most two application instances. A cross-process lease becomes a
  launch-gating item for D1 before horizontal scale-out beyond that. It will be
  a table in `public` with `organization_id INTEGER NOT NULL`, inserted before
  the final RLS sweep pair (CLAUDE.md RULE 1).

### 6. The parent's own gaps come before the new capability

We will fix the v2 parent-path gaps before S5:

- `organizationUuid` on the stream handler context;
- programme uuid → project id resolution for `check_dossier_consistency` and
  `project_knowledge_search`.

They are launch-catalog defects (D2). Today AnA cannot search the project she
is working in. A sub-agent built on that gap would demonstrate a weaker
feature than it claims.

### 7. "Nothing was checked" is never "clean"

The H2 rule is product-wide. Any deterministic check that compared nothing
says `not_assessed` and why. This applies to:

- `check_numerical_integrity`;
- the device-document reconciler;
- the client's consistency mapping, where an unknown verdict maps to nothing,
  not to "clean".

A check's absence of findings is reported only when it actually examined
something.

### 8. Egress and records

- **Public research tools stay available to children.** These are literature,
  clinical-trial and openFDA searches. They are the same public endpoints the
  parent already uses. A tenant deny removes them from parent and children
  alike. Every query a child sends is kept in the turn's record.
- **Turn records stay complete.** A child's tool results are not truncated,
  because an audit record that omits what the model saw is worse than its
  storage cost. A turn whose record exceeds 25 MB gets a warning on its turn
  record.

### 9. Honest surfaces

- The conversation screen renders message warnings. Today a refused model pin,
  a timeout or a failed save is invisible where Home's questions land.
- The engine pill names the effort mode, not a model it cannot guarantee.
- The pill's menu meets WCAG 2.2 AA: menu or listbox semantics, the selection
  exposed to assistive technology, and focus returned after a choice. This is
  procurement-relevant for the EU Accessibility Act and enterprise buyers.

## Consequences

### Positive

- An inspector can be shown, in code and ledger, that:
  - every model served was approved and pinned;
  - high-risk drafting in production ran only on a PQ-passed model;
  - no check claimed a result it did not compute;
  - no agent signed or approved anything.
- Tenants cannot starve, overspend on behalf of, or read across one another
  through the new capability.
- The founder's capability is built in full, and reaches clients the moment
  its evidence exists, with no re-validation debt.

### Negative

- **Production cannot draft high-risk regulatory content until the D4 PQ runs.**
  That needs a product `ANTHROPIC_API_KEY`, which Ops must provision. Demos
  must run outside production.
- **Sub-agents are invisible to production clients until S7's capture.** That
  capture needs a model key and a database.
- **Auto as default raises the per-turn cost ceiling** (from 8 to 20 rounds).
  Most turns end well below it, and the per-organisation cost caps remain the
  control.
- **The parent-gap fixes delay S5.**

### Neutral

- No new schema now. The cross-process lease table is a later, additive
  migration.
- The existing Ask/Agent (Live Drive) control is unchanged. Manual/Auto is a
  separate "Between steps" control.

## Alternatives Considered

- **Sub-agents on by default in production now.** Rejected: there is no live
  capture, no cost calibration and no PQ. That means shipping a capability ahead
  of its evidence to clients who must validate what they use.
- **Manual as the default policy.** Rejected: it recreates the cut-short turn
  S1 fixed, and it asks the person to approve steps that carry no governance
  meaning. Governed actions already stop for them under either policy.
- **PQ as a label only (serve PQ-pending, stamp the output).** Rejected for
  production. A label is documentation, not a control. RULE 2 states a serving
  rule.
- **A cross-process agent cap now.** Deferred: it needs schema or pinned
  connections, and production does not yet run more than two instances.
- **Truncating child results in the record.** Rejected: record completeness is
  the audit property; storage is not.

## Implementation order

1. S4 (Manual/Auto) with H1 and H2. Built; landing now.
2. §6: the parent v2 gaps (D2).
3. §3, §4 and §5's gateway items (D4, D6).
4. §7 and §9: honesty and accessibility follow-through.
5. S5 sub-agents with §2, §5 and §8 built in; S6 client agent rows; S7 live
   capture and cost calibration, which is blocked until a model key exists.

Each step files red-then-green evidence under `docs/evidence/` and is recorded
on row 74.
