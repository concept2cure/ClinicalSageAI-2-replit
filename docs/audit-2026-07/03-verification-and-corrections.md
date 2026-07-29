# Chapter 03 — Verification of this audit's own claims

Before publication, all ten headline claims were handed to independent verifiers instructed
to **refute** them, each with a specific refutation method. **Four survived intact. Six were
overstated and are corrected below.** Three of those six were materially wrong, not merely
imprecise.

This chapter exists because an audit that does not audit itself is worth little. Every
correction here was found by this process, not by the vendor.

| Claim | Verdict |
|---|---|
| C1 · The typecheck gate is vacuous | ✅ **Holds** |
| C2 · A from-scratch install omits 15 schemas | ⚠️ **Overstated — materially** |
| C3 · `/readyz` green over a DB with no auth tables | ⚠️ Overstated in mechanism; finding holds |
| C4 · Every RLS policy is compiled and inert | ✅ **Holds** |
| C5 · Live cross-tenant write path in Schedule-of-Events | ✅ **Holds** |
| C6 · The attach button discards every file | ✅ **Holds** |
| C7 · Reachable XSS fed by model output | ⚠️ **Wrong mechanism — the sink is real, the source is not** |
| C8 · `ensureCoreTables` creates tables at boot | ⚠️ Overstated in wording; finding holds |
| C9 · `SECURITY.md` makes two unsupported claims | ⚠️ Overstated in wording; finding holds |
| C10 · Authorization is single-layer for most of the API | ⚠️ **Wrong — off by ~3× and structurally mistaken** |

---

## C10 — the most important correction. My number was wrong by roughly 3×.

**What I published:** only 589 of 4,077 endpoints (14.4%) carry a route-level guard;
authorization is single-layer for most of the API; the boundary runs in `warn` mode outside
production.

**What is true:**

My sweep (`evidence/sweep.mjs:169-171`) counted only middleware **named on the route
declaration line**. It therefore missed module-level `router.use(guard)` and mount-level
`app.use(path, guard, router)`. Re-measured:

| Measure | Endpoints | Share |
|---|---:|---:|
| Inline guard on the declaration (what I counted) | 589 | 14.4% |
| …plus module-level `router.use()` | 1,318 | 32.3% |
| …plus mount-level `app.use(path, guard, …)` | **2,028** | **49.7%** |

And 49.7% is still a **floor**, because guards outside my 13-name list (`requireMetricsAuth`,
`requireTier`, `requireOrganizationContext`) and in-handler token checks
(`server/routes/users.ts:93-101`) go uncounted.

**The API is also not single-layer.** There are **two** global `/api` gates:

1. `server/middleware/authBoundary.ts`, mounted at `server/index.ts:123` before any route
   registers — mode is `enforce` in production, `warn` elsewhere.
2. An **older, unconditional gate** at `server/bootstrap/register-platform-routes.ts:232-264`
   applying `authMiddleware` to every `/api` path outside a 19-entry open list, **with no mode
   switch — it enforces in every `NODE_ENV`.**

Because `registerPlatformRoutes` runs first (`startup/routes.ts:90`) and that gate sits at its
end, every route family registered afterwards sits behind **both**.

**This also explains the tension I flagged and could not resolve.** I observed 401s on
unauthenticated dev probes despite describing the boundary as permissive in development, and
said so rather than hiding it. The answer: `warn` mode genuinely does **not** reject — it runs
the authenticator against a stub `res` that swallows the 401 and calls `next()`
(`authBoundary.ts:174-193`, asserted by its own test). The 401s I measured came from the
*unconditional legacy gate*, from router-level guards, from guards my sweep did not recognise,
and from hand-rolled in-handler checks.

**The residual risk is real but far narrower than I stated:** it is the routes mounted inside
`register-platform-routes.ts` *before* line 232 — `/api/users`, `/api/user`, `/api/admin`,
health — which sit **ahead** of the legacy gate. For those, in any non-production `NODE_ENV`,
`authBoundary` is log-only and the only effective control is whatever the route hand-rolls.

> **Corrected finding.** Authorization coverage is ~50%+ at route level with two global gates,
> one of which enforces unconditionally. The defect is not "single-layer everywhere" — it is a
> specific ordering hazard affecting `/api/users`, `/api/user` and `/api/admin` in non-production
> environments. **Severity drops from P1 to P2, and the scope narrows from the whole API to
> four prefixes.**

## C7 — the XSS sink is real. My failure scenario was fiction.

**What I published:** `BatchDraft.tsx:490` renders streamed model output as raw HTML, tainted
at `:226` / `:231`.

**What is true:** lines `:226` and `:231` are **unreachable dead code**, gated at `:216` on
`window.C2C_AUTHORING`, which is assigned nowhere in the repository and is *pinned as such by a
passing CI test* (`tests/ci/no-ghost-globals.contract.test.ts:143-150`). `run()` always takes
the offline branch.

The sink is still real and still reachable — but the taint is different, and arguably worse:
the only value reaching `c.html` is `bdSample()` output (`:101-110`), which interpolates the
server-supplied `title` and `preview` into HTML **with no escaping**. Those come from
`coauthor_documents` via `server/routes/batch-draft-routes.ts:170-177`, where `derivePreview`
(`:104-111`) strips tags and then **HTML-entity-decodes** `&lt;`, `&gt;`, `&quot;`, `&#39;` —
**re-animating markup the editor had correctly escaped on the way in.**

> **Corrected finding.** This is **stored** XSS via a persisted document title/preview, not
> XSS on streamed model output. Severity is unchanged (P1) and the fix is now two-part:
> sanitize at `:490` **and** stop the entity-decoding in `derivePreview`. The second half I
> would have missed entirely.

## C2 — 15 schemas missing is what a buyer sees. Only 5 have no path at all.

**What I published:** the installer never creates 15 Postgres schemas that server code queries.

**What is true:** `install-fresh.mjs` does exit 0 while leaving 10 migrations unapplied and
creating **none** of the 15 — verified live. But the script's own closing output, and CI
(`ci.yml:296, 354, 494`), prescribe a **follow-on `db/migrations/*_gcc_*.sql` psql loop** that
applies cleanly (43/43) and creates **9** of them (`innovation`, `cortex`, `signing`,
`manufacturing`, `compliance`, `labeling`, `site_intel`, `ectd`, `core`). `clinical_ops`
self-provisions at runtime (`clinical-operations-routes.ts:113-214`).

**Schemas with no provisioning path anywhere in the repository: 5** — `intelligence`,
`intelligent_docs`, `regulatory_intel`, `regulatory_harmonization`, `predicate`.

Two things sharpen rather than soften:

- **The route-family impact stands and was understated.** Even after the *full* documented
  install, at least four mounted route families still cannot serve a request:
  `/api/intelligent-docs`, `/api/regulatory-precedent-intelligence`, `/api/harmonize`, and
  `/api/precedent-engine` + `/api/predicate-intelligence`.
- **The operator hazard is real:** `install-fresh.mjs` does not run the gcc loop itself. A
  buyer following the script's advertised "one supported path" gets **all 15** missing.

> **Corrected finding.** Five schemas have no provisioning path; ten more depend on a manual
> follow-on step the installer names but does not perform. Four mounted route families are
> permanently broken either way.

## C3, C8, C9 — findings hold, wording tightened

- **C3** — verified live and holds. The mechanism is *two* paths, not one: those six tables sit
  in `IMPORTANT_TABLES` (`ensureCoreTables.ts:37-74`) rather than `CRITICAL_TABLES` (`:32`,
  only `organizations` and `users`), and `missingImportant` feeds neither `result.success` nor
  any readiness verdict — *in addition to* the three branches that never call
  `setSchemaReadiness`.
- **C8** — holds. `ensureCoreTables` does run on the normal ungated boot path and does contain
  exactly 7 `CREATE TABLE IF NOT EXISTS` statements executed in a loop at `:460-473`, against a
  docstring saying it validates instead of creating.
- **C9** — holds, at `SECURITY.md:51` and `:54` (I cited `:41`/`:52`). Strengthened by evidence
  I had not found: **the platform's own API reports Part 11 `overallStatus: "not_assessed"`**
  and *"No system validation (IQ/OQ/PQ) records are tracked in the platform."*

## What this exercise cost, and why it was worth it

Six of ten headline claims needed correction; three were materially wrong. Had this audit
shipped without the verification pass, a buyer would have been told the API is 14% guarded
when it is at least 50%, and would have chased an XSS in dead code while the real stored-XSS
path — including a server-side entity-decode that re-animates escaped markup — went unfixed.

**The findings that decide the verdict all survived**: the vacuous typecheck gate (C1), inert
RLS (C4), the live cross-tenant write path (C5), and the file-discarding attach button (C6).
The verdict in Chapter 14 is unchanged. The precision behind it is materially better.
