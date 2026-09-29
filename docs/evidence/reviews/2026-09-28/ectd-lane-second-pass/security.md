# Security lens — eCTD / Submission Center lane, 2026-09-28

Head reviewed: `c1cd656b27a4fa898747f2477d23b7e00bb414e0` (`concept2cure-v2`).
Read-only: no file edited, no gate run with `--write-baseline`.
Lens: `.claude/agents/security-auditor.md`, invoked by name.

Prior runs read first: `docs/evidence/reviews/2026-09-24/security.md`,
`docs/evidence/reviews/2026-09-26/security.md`. Treated as leads, not ground
truth; every citation re-read at head.

**The lens found no new findings and verified one open finding closed.** The
reviewing session's follow-through then found two the lens could not have —
they were invisible to it because the gate itself was blind (DP-41, DP-40, both
below).

---

## 1. DP-37 — CLOSED

Was: `LEAF_PROGRAM_READS.vault_documents` in `submission-service.ts` ran
`SELECT program_id::text … FROM vault.documents WHERE id = $1::uuid` with no
tenant predicate, unlike its siblings. The one red tenant-isolation gate at the
2026-09-26 review.

Fixed at `submission-service.ts:1847-1853`:

```
vault_documents: (ref, organizationId) =>
  ref.documentUuid
    ? sql`
    SELECT d.program_id::text AS program_id
      FROM vault.documents d JOIN regulatory_programs rp ON rp.id = d.program_id
     WHERE d.id = ${ref.documentUuid}::uuid AND rp.organization_id = ${organizationId}`
    : null,
```

Landed by `39dfd9b7b` (2026-09-26 05:11 UTC, "PF-11 (D2) … LX-11"). The safety
no longer depends on call ordering — the predicate is in the query.

**Verified independently by the reviewing session**, not taken on report: the
predicate is present at the cited lines, and the gate that failed on it on
2026-09-26 now passes. The 8 remaining candidates are all outside this lane
(`module-access-requests.ts`, `advancedRAGPipeline.ts`,
`deep-research-orchestrator.ts`, `kernel-adaptive-policy.ts`,
`kernel-observability.ts`).

This is a real closure, not a re-baselining: a source-level predicate change,
with no reviewed-exception entry added.

**Is it the only one of its kind?** Every raw-SQL site in the lane was checked —
`submission-service.ts` (11 sites), `submission-spine.ts` (4),
`submission-package-orchestrator.ts` (6), `leaf-source-resolver.ts:583-596` (the
render-time twin of the same vault lookup — already carries `rp.organization_id`),
`assemble-from-core.ts` (no raw SQL; Drizzle reads all filter on
`organizationId`). No other unscoped read of this class. `getRun` / `getRunAudit`
collapse "not found" and "wrong org" to the same result, so a cross-tenant probe
cannot be distinguished from a 404.

## 2. Second doors — none found

- `submissions.ts` (`/api/submissions`) and `regulatorySubmissions.ts`
  (`/api/regulatory-submissions`) coexist but are **not** two doors onto the same
  tables: the latter reads its own legacy `regulatorySubmissions` / `stageGates` /
  `regulatoryTasks`, keys on `getSecureOrgId(req)` (session-derived, not body or
  path), and sits behind the global default-deny `/api` boundary
  (`authBoundary.ts`, mounted `startup/middleware.ts:153-166`) plus
  `requireFeature('UNIFIED_REGULATORY_SUBMISSIONS')`.
- `ectd-export.ts`'s `POST /api/ectd/export/:submissionId` and
  `submissions.ts`'s `/sequences/:seqId/assemble` call the same
  `assembleSubmissionEctd`, not a duplicate implementation.
- No new socket namespace, no `/api/v1` duplicate, no AnA tool bypassing the
  org-scoped leaf verifiers (`place_into_sequence` still resolves through
  `getSequence(id, ctx)`).

## 3. Governed writes

`submissions.ts:1680-1746` — `freeze`, `dispatch`, `transmit` all require
`signatureActionId` (zod `.min(1)`) and pass it to `governedSignatureVerdict`
(`:493-583`), which requires an executed `sign` action by the calling user,
matching declared intent, not already spent on a prior transition, a live
(non-superseded, non-revoked) `electronic_signatures` row on the correct
`binding_basis`, and a leaf-manifest digest that still matches what was signed.
`lockSequenceForLeafWrite` (`:1926-1943`) takes `FOR UPDATE` before any leaf
write.

## 4. Migrations — RULE 1, including the new constraint-replay corollary

**`migrations/20260925b_submissions_program_anchor.sql`** — additive only
(`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD CONSTRAINT` only
inside an `IF NOT EXISTS (SELECT … pg_constraint)` guard). No DROP.
`submissions_program_same_org_fk` is `NOT VALID` and composite on
`(program_id, organization_id)` referencing `regulatory_programs(id, organization_id)`,
so a submission can only anchor to a project of its own org — enforced at the DB
layer. Backfill touches only `program_id IS NULL` rows with an unambiguous
one-to-one link; ambiguous history is left NULL rather than guessed. Compliant.

**`db/migrations/20260725_submission_orchestrator_store_port.sql`** — the file
the new corollary was written about. Its header (`:38-50`) documents in place
that its status-CHECK replacement is now conditional: it drops and re-adds
`submission_orchestrator_runs_status_check` only when
`pg_get_constraintdef(oid)` does not already contain `'awaiting-async'`
(`:358-374`), so it never re-narrows the CHECK that
`20260725_esig_gate_columns_port.sql` widens downstream. Exactly the corollary's
required shape, with the dated amendment note RULE 1 requires.
`ci:migration-drop-safety` confirms: *"4 constraint replacement(s) a later file
redefines, all conditional, 2 reviewed exception(s)"*. Compliant.

## 5. Gates — 19 of 19 pass

| Gate | Result | Baseline / direction |
|---|---|---|
| `ci:committed-secrets` | pass | — |
| `ci:no-dev-auth-in-prod` | pass | — |
| `ci:unauthenticated-fetch` | pass | 70 scanned, 0 baselined (unchanged) |
| `ci:path-containment` | pass | 3 files, 3 baselined (unchanged) |
| `ci:org-path-param-guards` | pass | 43 routes, 43 guarded, 0 unguarded |
| `ci:jwt-verify-pinned` | pass | — |
| `ci:client-ip-single-source` | pass | — |
| `ci:server-error-leaks` | pass | 119 sites / 76 files (was 145/89 — shrink, unbanked) |
| `ci:discarded-audit-write` | pass | 125 / 56 (unchanged) |
| `ci:sign-ceremony` | pass | 23 sites as baselined (DP-02 still open, not re-read) |
| `ci:regulated-delete-audit` | pass | unchanged |
| `ci:gateway-bypass` | pass | 8 baselined sites (unchanged) |
| `ci:dead-audit-catch` | pass | 0 / 0 (unchanged) |
| `ci:session-scoped-rls-bypass` | pass | 34 in 7 unmounted services (unchanged) |
| `ci:drizzle-tenant-scope` | pass | 125 all baselined; 26 fixed and unbanked |
| `ci:tenant-entry-points` | pass | 14 entry points, 9 without entitlement (unchanged) |
| `ci:tenant-isolation:no-regression` | **pass** (was FAIL on 09-26) | 8 current / 9 baseline — DP-37 resolved |
| `check:security-patterns` | pass | 0 violations / 2863 files |
| `check:compliance-claims` | pass | 863 files, no unsupported claim |
| `ci:ai-tenant-binding` | pass | every AnA gateway call binds its tenant |
| `ci:column-reachability` | pass | 3194 unqueried columns on no applier, 0 queried by the server |

The one gate red at the 2026-09-26 lens is green, by a fix, verified by the same
gate that caught it.

## 6. Carried unchanged, NOT re-verified

DP-36, DP-38, DP-39 and IAM-19 were **not** re-checked this session — none of
their files (`governed-tool-gate.ts`, `AnaToolExecutor.ts`,
`audit-trail-routes.ts`, `server/utils/logger.ts`, `ana-realtime.ts`) is in this
lane. They are carried from 2026-09-26 and must not be read as re-confirmed.

## 7. Not covered

- No live database, so the two migrations were read against the corollary, not
  executed. `ci:migration-drop-safety`'s static `pg_get_constraintdef` analysis
  did run.
- No branch protection, CI history or deployed environment (no network).
- The ~40 AnA write tools outside this lane; DP-36's broader claim about the
  propose-only partition was not re-tested.
- `ci:migration-set-order` was not separately re-run.

---

## Follow-through by the reviewing session

The lens correctly did not do any of this — it was instructed read-only. All of
it was done afterwards, deliberately, with the probes recorded.

### DP-41 — CONFIRMED, High — this gate did not cover the submission lane at all. FIXED.

Found by a **failed probe**, not by looking. Setting out to prove the baseline's
free slot (below), the session injected an unscoped
`SELECT program_id FROM submissions WHERE id = $1` into
`server/services/cmc/submission-spine.ts` and expected the gate to tolerate it
as the 9th finding. It did not report it **at all** — same 8 candidates, exit 0.

Cause: `TENANT_SCOPED_TABLES` (`check-tenant-isolation.mjs:88`) contained **no
submission-lane table**. Not `submissions`, `ectd_sequences`,
`submission_leaves`, `submission_orchestrator_runs` or `electronic_signatures`.
DP-37 was caught only because it happened to read `vault.documents`, and
`documents` was in the set.

So the lane carrying §11.70 release signatures and the assembled content of a
regulatory filing — the highest-consequence cross-tenant read in the product —
had **no gate coverage**. What covered it was a manual sweep, weekly at best.
The §1 conclusion above ("no other unscoped read of this class") was reached by
one careful human-equivalent pass, and nothing would have caught the next one.

**Fixed:** the five tables added. Verified by re-running the same injection —
`FAIL — 1 NEW finding(s) above baseline`, naming the file and table, exit 1;
clean once removed. Before and after on the identical probe is the evidence.

Adding them surfaced three hits in
`server/services/submission-service/__tests__/_freeze-gate-fixture.ts` — a
pglite in-memory seed that creates its own schema and then reads back by primary
key inside a single-org fixture (`ORG = 7`). Allowlisted as a file, with the
reason written in place, in the same DDL category as the existing
`ensureCoreTables.ts` entries.

### DP-40 — CONFIRMED, Low — cross-tenant aggregate read behind an unguarded route. NOT FIXED.

`regulatory_programs` is the sixth table that belongs in the set, and adding it
immediately fails the gate on
`mdx-health.service.ts` `probePathwayCoverage` (`:238-243`):

```
SELECT regulatory_path AS pathway, COUNT(*)::int AS n
  FROM regulatory_programs WHERE regulatory_path IS NOT NULL GROUP BY 1
```

Its own docstring says "across the entire database". It is served by
`GET /api/mdx/health`, mounted at `register-inline-routes.ts:1180` with **no
`authMiddleware`** — unlike `/api/validation-kit` on the line directly above —
and `mdx` is **not** on `PUBLIC_API_ALLOWLIST`, so the global default-deny
boundary still requires a session. Net: any authenticated user of any tenant
learns the platform-wide count of regulatory programs by pathway. Aggregate
only — no content, no org attribution — hence Low.

**Not fixed, deliberately.** MDX is outside the launch catalog (RULE 2), and the
remedy is that lane's decision: admin-gate with `requirePlatformAdmin`, scope
the count to the caller's org, or record that aggregate volume is not sensitive.
It has no client caller — only `tests/regulatory-programs-routes.test.ts:383-462`,
which a guard would break and require updating.

`regulatory_programs` is therefore held out of `TENANT_SCOPED_TABLES`, with that
reason written at the point it would be added, so the next session adds the
table in the same change that closes DP-40 rather than rediscovering this.
Baselining it instead would have been the anti-pattern this lens exists to flag.

### The baseline ratchet, 9 → 8

`ci:tenant-isolation` printed, alongside its pass:

> `1 previously-flagged finding(s) resolved — consider re-running with --write-baseline to ratchet down.`

Baseline 9, current 8. **That gap is a free slot**: a newly introduced unscoped
read would take the count back to 9 and the gate would still pass.

Ratcheted, and evidenced rather than asserted — at the new baseline of 8 the
injected `ectd_sequences` read fails (`FAIL — 1 NEW finding(s) above baseline of
8`) and is clean once removed. `ci:tenant-isolation-justifications` then
required the freed row be dispositioned; it is retired in
`docs/reports/tenant-isolation-justifications.md` under Resolved.

**Correction to a detail.** The "1 previously-flagged finding resolved" is
`server/routes/admin/licensing-history.ts`, **not** DP-37 — closed by an inline
`// tenant-isolation-safe:` marker at `:522`. DP-37 was never in this baseline;
it was a finding *above* it, which is why the gate failed outright on
2026-09-26. Two closures in the same window by different changes; the lens's
report and an earlier draft of this file ran them together.
