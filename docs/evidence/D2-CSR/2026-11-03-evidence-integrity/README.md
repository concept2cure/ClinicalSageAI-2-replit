# Core CSR evidence-integrity repairs — 2026-11-03

**Canonical repository:** `concept2cure/ClinicalSageAI-2-replit`, only `concept2cure-v2`. **Plan:** F1 (repairs), completing existing S2–S4 functionality and the original CSR authoring path. No new screen, route, table, production model, filing writer or external integration.

## What already exists (read before changes)

| Existing owner | What it does | What this repair addresses |
|---|---|---|
| `server/services/csr/vault-source-input.ts` | Loads exact current approved Vault version, verifies checksum, captures digest under tenant-scoped locks; loads ADaM bundle components | Reused unchanged; no new ingestion service |
| `server/services/csr/adam-dataset-reader.ts` and `adam-bundle-load.ts` | Reads Dataset-JSON, NDJSON and XPT observations and derives a CSR source with no invented data | The NDJSON row reader formerly split and materialized every blank line; invalid UTF-8 could be silently replaced |
| `server/services/csr/cortex-authoring-context.ts`, `cortex-authoring-reader.ts` | Maps retained, receipt-checked source tables to section-specific evidence packs | Reused unchanged; exact source digest remains authoritative |
| `server/services/csr/unsupplied-statistics.ts` | Validates model-generated numerical claims against retained cells | Planned sample-size and study-metadata figures could be mistaken for actual outcomes; qualitative success/absence conclusions could escape numerical checks |
| `server/services/csr/csr-job-runner.ts` | Asynchronous per-section CSR drafting, SHA-256 output integrity, current actor/source checks and completion | A legacy job with no requester could enter optional-actor authorization; raw SDK/SQL exceptions could be logged and persisted |
| `server/services/csr/csr-claim-receipts.ts` and `server/services/ana/csr-saved-evidence.ts` | Binds outputs to imported Authoring sections and rechecks saved documents against current retained tables | Import and saved re-review could exempt observed-result figures merely because their digits appeared in study metadata; uncoded added sections could contain unclaimed numbers without blocking |
| `server/services/csr/csr-assembly-run.ts`, `csr-narrative-run.ts`, `server/services/csr-builder.ts` | Governed assembly, patient narratives and section drafting | Raw worker/provider exception objects could expose clinical or credential details in logs |

Existing constraints retained: tenant/member authorization; immutable source-version and run receipts; model-approval and PQ gates; Source Import and one Authoring editor; human medical/scientific review, signatures, Part 11 and eCTD dispatch gates.

## Repaired in this increment

1. **Observed outcome ≠ study plan.** For ICH E3 §§10–13, `acceptEvidenceBoundDraft` no longer admits an observed number merely because the metadata contains the same number. An exact retained-table claim is required. In the mixed planned/actual §2 synopsis, the acceptance gate additionally rechecks observed-event, enrollment and completion clauses separately. Planned sample-size statements remain distinct from actual outcomes, both at drafting and saved-document re-review.
2. **Numeric claims are not semantic approvals.** Explicit death/fatal-event counts require a matching death/fatal-event row *with the same number*, not an unrelated population count. This is intentionally narrow and does **not** mean all efficacy, AE severity, SAP estimands or medical judgments have been automatically validated.
3. **No unsupported categorical verdicts.** Model-authored claims such as “the primary endpoint was met,” “no serious adverse events,” “well tolerated,” or unsupported superiority/equivalence are refused for human source-backed review. Explicitly unknown/unestablished results remain expressible. This does not prevent a qualified clinician from recording supported conclusions in the governed editor.
4. **Stable identifiers remain identifiers.** The scanner exempts structured NCT, study and product identifiers such as `LMN-201` and `NCT05330182`, but not standalone counts, proportions, effect estimates or study outcomes.
5. **The rule survives import and editing.** New CSR imports do not grant study-metadata numerical exemptions for results §§10–13; previously imported sections are rechecked without honoring old exemptions. A new uncoded section with unclaimed numbers cannot pass as a harmless non-results section.
6. **User authority on queued work.** `runCSRBuildJob` rejects missing or invalid `requestedBy` before source/model work, retaining prior sections for explicit recovery.
7. **Private failures remain private.** The existing CSR worker now records only bounded typed refusal codes or a generic failure marker. The legacy CSR drafting path and narrative/assembly workers no longer log raw provider/database exceptions. No clinical observations or secret-bearing DSNs are returned in new generic job-error receipts.
8. **Bounded, strict observations ingestion.** The existing ADaM NDJSON reader scans row boundaries without copying every blank line into an array; JSON and NDJSON use fatal UTF-8 decoding so invalid source bytes fail instead of altering clinical text.

## Additional fixes: saved review integrity and assembly recovery

9. **Review status must match actual saved bytes.** The existing
   `csr-section-review.ts` now owns one shared SHA-256 read verifier,
   `effectiveSavedCsrReviewState`. Both `csr-jobs.ts`'s bulk section read
   and `csr-headings.ts`'s ICH E3 review board use it. A saved body that is
   blank, missing or changed without updating its digest can no longer be
   represented as approved merely because `reviewed_content_hash` still
   matches `content_hash`. The client marks the record as damaged and
   blocks inspection, review and import. The original review-write integrity
   requirement remains unchanged. Regression cases were added to
   `server/routes/__tests__/csr-workflow-headings.test.ts`,
   `tests/unit/csr-jobs-routes.test.ts` and
   `client/src/concept2cure/v2/__tests__/csrBuildProgress.test.tsx`.

10. **Assembly retries cannot be overwritten by older workers.**
    `csr-assembly-run.ts` now treats the EXISTING `started_at` value as
    the claim identity. It rounds the new claim to milliseconds (matching
    JavaScript timestamp serialization) and predicates progress, success
    and failure writes on the same `id`, `organization_id`,
    `started_at` and `status='assembling'`. A late worker from before
    queue recovery receives `CSR_ASSEMBLY_SUPERSEDED` instead of changing
    the replacement worker's record. The new
    `csr-assembly-run.pglite.test.ts` scenario emulates an old worker
    paused while a newer worker claims the same row; the old update must
    not alter the new attempt's stage or outcome. No new queue column,
    table, migration, endpoint or storage was added.

11. **CSR job API operational logs are redacted.** The existing
    `server/routes/csr-jobs.ts` previously logged raw exception messages
    from the source-admission, enqueue, list, status, sections, headings,
    cancellation and review handlers. Those messages can carry SQL strings,
    upstream SDK errors or source-related details. The operational logs
    now identify the event using fixed `CSR_*_INTERNAL_ERROR` codes and
    organization/job identifiers; typed user-facing refusals and HTTP
    status semantics are preserved. This does not replace centralized
    security incident tracing and must be exercised with production logging
    sinks during acceptance.

**Limit:** The build-job worker (distinct from CSR assembly) still lacks
a database-enforced attempt fence for the narrow case of a live but
stalled second-instance worker. The narrative queue already has a
separate incrementing `attempt` token. A full multi-instance replay
test with the actual PostgreSQL app role and RLS remains required.

## Regression coverage authored

- `server/services/csr/__tests__/unsupplied-statistics.test.ts` — planned-vs-observed numeric collisions; categoric results refusals and nonassertive uncertainty; source-label checks for deaths; valid claimed counts and methods-plan allowance.
- `server/services/csr/__tests__/csr-results-claim-provenance.test.ts` — drafting → import → historical saved CSR review; excludes study identifiers from quantitative claims and blocks an actual completion count in §2 even when an older receipt exempts the same planned sample number.
- `server/services/ana/__tests__/saved-csr-evidence.pglite.test.ts` — unsourced numerical claim in an added uncoded section blocks saved-document verdict.
- `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts` — requester-less queued jobs do nothing; model/database exception details never persist; typed codes survive.
- `server/services/csr/__tests__/adam-dataset-reader.test.ts` — 200,000 synthetic blank NDJSON lines and malformed UTF-8 refusal.
- Neighboring pre-existing suites: `server/services/csr/__tests__/csr-job-runner.evidence.test.ts`, `server/services/ana/__tests__/saved-csr-evidence.pglite.test.ts`, `server/services/csr/__tests__/adam-source-derivation.test.ts`, CSR assembly and narrative suites.

### Requested local validation — still owed

```bash
npx vitest run \
  server/services/csr/__tests__/unsupplied-statistics.test.ts \
  server/services/csr/__tests__/csr-results-claim-provenance.test.ts \
  server/services/csr/__tests__/adam-dataset-reader.test.ts \
  server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts \
  server/services/csr/__tests__/csr-job-runner.evidence.test.ts \
  server/services/ana/__tests__/saved-csr-evidence.pglite.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

**Isolated logic checks performed after the source changes:** nine categorical-outcome classification examples and six planned-vs-actual synopsis examples were exercised in a JavaScript isolate (using a minimal numerical-scanner stand-in for the latter). This is supporting logic inspection, **not** Vitest, database or workflow acceptance. The definitive test verdict remains open.

**Qualification limits, explicitly recorded:** This connector session read and edited GitHub source and checked focused regular-expression behavior in a JS isolate; it did **not** execute native Vitest, the full TypeScript compiler, Git hooks, a Neon database, AnA live-model calls, or a browser/CSR export. GitHub Actions for the resulting commits were still queued when checked. Direct GitHub file writes do not execute the repository's local pre-push gate and some earlier connector-written commits lack the required `Plan: F1` and `Completes:` trailers. Future commits must carry those trailers; the historical findings are not erased by a new receipt.

**Still needed for real launch:** a qualified model/provider with active PQ, actual client-approved ADaM/SAP source admission, biostatistics-to-narrative results reconciliation across efficacy/safety domains, cross-section consistency, save/reopen of authored content, export integrity, independent medical/statistical review, e-signatures and end-to-end browser tests. No simulated or fabricated data is an acceptable substitute for these gates.
