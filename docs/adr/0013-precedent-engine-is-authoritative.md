# ADR 0013 — `precedent-engine` is authoritative for CRL, RTF, EMA and advisory-committee risk

**Status:** Accepted
**Date:** 2026-08-14

## Context

The platform carries two independent implementations of regulatory precedent
intelligence. They share no code.

| | `services/precedent-engine.ts` | `services/regulatory-precedent-intelligence/` |
|---|---|---|
| Size | 1,797 lines, one file | 2,722 lines, 7 services |
| Endpoints | 11 (`/api/precedent-engine`) | 39 (`/api/regulatory-precedent-intelligence`) |
| UI | `PrecedentEngine.tsx`, 728 lines | none until 2026-08-14 |
| Storage | 8 query sites **plus** inline curated knowledge | 11 `regulatory_intel.*` tables |

Both answer the same four questions — CRL triggers, RTF triggers, EMA question
patterns, advisory-committee risk — and they will not always agree. Two systems
producing different regulatory risk advice for the same submission, with the
choice of which one a user sees decided by which surface they happened to open,
is not a tolerable state for a product whose output goes into a filing.

The larger, better-factored implementation looked like the obvious winner. It
was the wrong answer.

## Decision

**`precedent-engine` is authoritative for CRL, RTF, EMA and advisory-committee
risk.** `regulatory-precedent-intelligence`'s versions of those four families
stay unwired from the product.

**`regulatory-precedent-intelligence` is repositioned as a tenant-owned
precedent library** — storage and query for a record each organisation builds —
and only its two non-overlapping families are surfaced: `cross-jurisdictional`
(8 endpoints) and `confidence` (6), through `filing-strategy`.

## Why

**1. `regulatory-precedent-intelligence` ships zero rows.**
`db/migrations/20260322_regulatory_precedent_intelligence.sql` creates eleven
tables and seeds none. The only `INSERT INTO regulatory_intel.*` statements
anywhere in the repository are that module's own write handlers — one per table.
Its services read tables and carry no built-in fallback. On any tenant that has
not populated it by hand, `POST /crl/search` returns `[]`.

**2. `precedent-engine` ships curated domain knowledge.**
Its CRL analysis carries patterns with category, applicable submission types,
severity, confidence, a mitigation, and a **historical rate** — efficacy
endpoint failure at 0.34, drug-induced liver injury at 0.18, and so on. It also
reads tenant tables. It is a hybrid: shipped knowledge plus the organisation's
own record.

**3. An empty result from a regulatory risk tool is not neutral — it is
misleading in the dangerous direction.** "No CRL triggers found" reads as "low
risk". A sponsor who takes that at face value files on an assumption the data
never made. This is the same failure the `filing-strategy` tests already pin for
agency divergence: an absence of evidence is not evidence of absence, and a
surface must not let the two look alike.

So the choice is not "well-architected versus monolithic". It is "an empty
vessel with good architecture" versus "a populated knowledge base in one file".
For the question a user is actually asking, the second one answers and the first
one cannot.

## Consequences

- The four overlapping RPI families remain mounted and unreferenced by the
  client. They are not deleted: they are the write-and-query half of the
  tenant-owned library, and the schema is the right shape for it.
- `filing-strategy` surfaces only `cross-jurisdictional` and `confidence`.
- **A correction was required to work already shipped.** The first version of
  `migrations/20260814l_catalog_filing_strategy.sql` verified that the tables
  *exist* and did not verify that they have *rows*, and described the surface as
  "where to file and in what order across agencies" — a shipped knowledge base.
  What exists is storage for a record the tenant builds. The catalog entry and
  the surface copy now say so, in the surface header and in every empty state.
- If the curated knowledge in `precedent-engine` should become data-driven —
  and it probably should, because today it can only be updated by a code deploy
  and carries no per-pattern citation — the migration path is to seed
  `regulatory_intel.crl_trigger_patterns` from it and cut `precedent-engine`
  over to read that table. **That is a real improvement and it is not this
  decision.** Doing it requires the seed to exist first; until then, switching
  would trade populated knowledge for an empty table.

## What would change this

Seed data. If `regulatory_intel.*` ships populated — with provenance per
pattern, which the schema supports and the inline arrays do not — then the
better-factored, updatable, citable implementation becomes the better answer on
every axis, and this ADR should be revisited.

## Update, same day — the reversal condition is now half met

Two migrations landed after this decision:

- `migrations/20260814m_regulatory_intel_platform_tier.sql` gives shipped
  knowledge somewhere to live. Every table was `organization_id UUID NOT NULL`,
  so platform knowledge had no representation at all; rows owned by the
  all-zeros sentinel are now platform-provided and readable by every tenant,
  with partial unique indexes so a pattern cannot be seeded twice. NULL was
  rejected as the marker because every tenant predicate in this codebase is
  `organization_id = $1`, which NULL silently fails rather than being excluded
  by — an invisible row is worse than a reserved one.
- `migrations/20260814n_seed_regulatory_intel_platform_knowledge.sql` seeds 24
  patterns — 9 CRL, 7 RTF, 8 advisory-committee — lifted verbatim from this
  file's inline arrays. Nothing invented. The category mappings from free text
  to each table's constrained vocabulary are recorded in that migration's
  header, including the two that map imperfectly because the CRL vocabulary has
  no bioequivalence and no device term.

`precedent-engine.analyzeCRLTriggers` now reads the store and falls back to its
inline arrays. **The fallback is the load-bearing part, and it is what allows
this to ship before every environment is seeded:** an empty result, a missing
table and a thrown query all fall back, and only a table with actual rows
overrides the curated knowledge. An empty store is indistinguishable from an
unseeded one, and treating either as "no CRL risk" is precisely the failure this
ADR exists to prevent. Pinned by
`server/services/__tests__/precedent-crl-store-fallback.test.ts`.

### Items (1) and (3), closed

**(1) RTF and advisory-committee are now cut over too**, on the identical
contract — store wins when it has rows, everything else falls back. All three
families are asserted together in the fallback test, so wiring a fourth without
the fallback fails rather than shipping an environment that silently reports no
regulatory risk.

**(3) Provenance could not be *added* — so it was made VISIBLE instead.** No
citation exists to copy, and inventing one for a regulatory risk table is worse
than having none. Every pattern now declares `evidenceBasis: 'curated' | 'cited'`:
`cited` when the row carries the regulatory language it was derived from
(`typical_fda_language`, or `typical_questions` for advisory committee),
`curated` otherwise. All 24 seeded and inline patterns are `curated` today, and
say so.

This is the achievable half of defensibility. A reviewer asking "on what basis?"
now gets an answer for every pattern, and a tenant that adds a cited pattern is
visibly distinguishable from the shipped judgement. The field is **required by
the type**, so a pattern cannot be added without declaring its basis, and it is
carried onto the OUTPUT type rather than only the internal one — a basis that
exists only internally answers nobody's question. That last point was caught by
a test, not by inspection: the field was originally dropped in the mapping to
the result and would have been decorative.

### Still outstanding

EMA question patterns are not seeded; that table keys on procedure phase and
type with their own constrained vocabularies and needs its own mapping pass.

**The decision still stands**, and now for a narrower reason than before: the
store and the inline arrays hold the same knowledge, so switching authority
would change nothing except which code path serves it. It becomes worth
revisiting when patterns arrive that are `cited` — at that point the store
carries something the arrays cannot express, and the better-factored
implementation wins on evidence rather than on architecture.
