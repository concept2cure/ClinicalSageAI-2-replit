# Runbook: ClinicalTrials.gov corpus ingestion

**Purpose:** Populate the trial/CSR corpus the intelligence features query
(precedent benchmarking, design-rule evaluation, success-prior calibration).
The ingestion pipeline is built and tested; this runbook is how an operator
actually runs it to fill the corpus — the GA-blocking step is *data*, not code
(see `GA_GAP_AUDIT_2026-06-10.md`, Tier-1 #2).

## What it does

`scripts/ingest-corpus.ts` runs the pipeline end to end:

1. **Fetch** raw studies from ClinicalTrials.gov API v2 (`LiveCtgovFetcher`).
2. **Normalize** each study to the CSR shape (`normalizeCtgovStudy`) — pure,
   no network.
3. **Upsert** into `csr_reports` + `csr_details`, keyed by NCT id
   (`DrizzleCorpusWriter`).

It prints an honest summary: `fetched / normalized / inserted / updated /
skipped / errors`, with the NCT ids of any write failures.

**Idempotent:** re-running the same query updates existing rows instead of
duplicating, so snapshot + incremental runs are safe.

## Prerequisites

1. **Outbound network access to `clinicaltrials.gov`.** In sandboxed/CI
   environments this host must be on the egress allowlist; without it the run
   fails closed with `ClinicalTrials.gov returned 403 Forbidden` (it does not
   fabricate data). Verify:
   ```
   curl -s -o /dev/null -w '%{http_code}\n' \
     "https://clinicaltrials.gov/api/v2/studies?query.cond=melanoma&pageSize=1"
   ```
   Expect `200`.
2. **`DATABASE_URL`** pointing at the target Postgres (the same DB the app
   uses). Required only for a write run; `--dry-run` needs neither the DB nor
   write access.
3. Dependencies installed (`npm ci`) and `tsx` available (it is a devDependency).

## Commands

Dry run — fetch + normalize, no DB write (use to validate connectivity and a
query before committing rows):
```
tsx scripts/ingest-corpus.ts --dry-run --indication "melanoma" --phase 3 --limit 5
# → { "mode": "dry-run", "fetched": 5, "normalized": 5 }
```

Write run:
```
DATABASE_URL=postgres://… tsx scripts/ingest-corpus.ts \
  --indication "melanoma" --phase 3 --limit 200
# → { "mode": "write", "fetched": 200, "normalized": 198, "inserted": 198,
#     "updated": 0, "skipped": 2, "errors": 0, "failures": [] }
```

Other query dimensions (combine freely; at least one is required):
```
tsx scripts/ingest-corpus.ts --intervention pembrolizumab --sponsor Merck --limit 100
tsx scripts/ingest-corpus.ts --indication "non-small cell lung cancer" --org 1
```

| Flag | Meaning |
| --- | --- |
| `--indication <cond>` | CT.gov `query.cond` |
| `--intervention <x>` | CT.gov `query.intr` |
| `--sponsor <s>` | CT.gov `query.spons` |
| `--phase 1\|2\|3\|4` | Phase filter |
| `--limit N` | Page size (max 1000) |
| `--org ID` | Owning organization id (default 1) |
| `--dry-run` | Fetch + normalize only; no DB |

Exit codes: `0` success · `1` every fetched study failed to write (or fatal
error) · `2` bad arguments / missing `DATABASE_URL` on a write run.

## Recommended initial load

Ingest by indication across the therapeutic areas the platform serves, Phase 2
and Phase 3, completed + terminated (the success-hint signal needs both
outcomes). Example sweep:
```
for cond in "melanoma" "non-small cell lung cancer" "breast cancer" \
            "multiple myeloma" "rheumatoid arthritis"; do
  for ph in 2 3; do
    tsx scripts/ingest-corpus.ts --indication "$cond" --phase $ph --limit 500
  done
done
```

## Verify the load

```
psql "$DATABASE_URL" -c "SELECT count(*) FROM csr_reports;"
psql "$DATABASE_URL" -c \
  "SELECT phase, count(*) FROM csr_details GROUP BY phase ORDER BY 2 DESC;"
```
Then exercise the read path: `GET /api/corpus/benchmark` should return
evidence-grounded benchmarks rather than empty results.

## Scheduling / refresh

Re-run the same sweep on a cadence (e.g. monthly). Because upserts are keyed by
NCT id, refreshes update status/outcomes for trials that have progressed
(e.g. ACTIVE → COMPLETED) without creating duplicates, keeping the success-hint
signal current.

## Verification of the pipeline itself

`server/services/corpus/__tests__/ingest-e2e.test.ts` runs the real
orchestrator + normalizer over real trial data (KEYNOTE-006 / LEAP-003) with an
in-memory writer, asserting the summary, idempotency, and per-record error
isolation — so a green test suite means the runner's logic is sound and only
credentials/network/DB remain environmental.
