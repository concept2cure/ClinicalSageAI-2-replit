# Keep each market on its own filing

Plan: F1. W1 / D2 document and filing continuity. Base inspected: `f9631c065af8760d8b879232385fb94663d19a24`.

## What already exists

- `server/services/c2c/add-project-market.ts` already adds a market's governed regional document, target agency, canonical submission and audit entry in one caller-owned transaction. Its duplicate-submission check uses organization, program and application type but omits region, although the document check includes agency.
- `server/routes/c2c/project-intake.ts` owns `ensureSubmissionSpine`, reused by intake and Add a market. Its reuse query also omits region. Therefore fixing only Add a market would still let the second market silently reuse the first market's submission.
- `shared/regulatory/region-identity.ts` reconciles agency, country, gateway and rule-region aliases. `server/services/regulatory/market-support.ts` already decides which markets are offered; its held scope is read-only here.
- `server/services/submission-service/submission-service.ts` owns the canonical insert and validates the program on the same client. That held file is unchanged; this repair corrects its caller's reuse identity.
- `server/services/c2c/__tests__/add-project-market.pglite.test.ts` exercises real outlines, regional sections, submission rows and audit rollback. Existing route suites exercise intake and market offer/refusal.

Discovery used `rg` across intake, market, submission-spine callers, region identity, migrations and tests. `git log --all --diff-filter=D` over the existing market aliases returned no deleted replacement. No new screen, route, service or table is required.

## Repair contract

The submission identity is organization + program + application type + canonical region. A filing in another region cannot suppress or replace the requested region's filing. Equivalent existing region aliases resolve to the same region; deleted or unbound submissions cannot be adopted. The current market-offer restrictions, governed document home binding and transactional audit remain authoritative. This does not qualify new jurisdictions, transport adapters, dossier applicability or regulatory standards.

## Validation

Fresh red run: 6 behavioral failures and 37 passes. Repaired focused/adjacent run: 77 passes across 4 suites (`green.log`), including actual SQL rows for independent EU/UK spines, region aliases, offered-market creation, duplicate refusal and preserved home binding. The first fixture attempt omitted created_by; it was corrected before the recorded behavioral red run. The existing audit assertion now measures the increment without deleting retained audit rows. These are PGlite and route checks, not multi-region filing or transmission qualification.

Independent review identified unknown historical region labels as ambiguous rather than different. Two additional negative controls reproduced the unwanted create; both entry points now refuse unknown candidate regions without writes (`unknown-region-red.log`). The final 77-case run includes this guard. Direct helper concurrency remains unqualified; Add a market retains its existing program lock.

## Compiler follow-up: unresolved requested region

A supplemental full-context TypeScript diagnostic found `TS2322` at the submission writer: `submissionRegionFor` can return `undefined`, while the canonical writer requires a string region. Two new negative controls confirmed a runtime consequence: an unresolved requested market reached the database and failed its non-null region constraint. Two positive controls confirmed the existing application-type fallback remained usable.

`ensureSubmissionSpine` now refuses an unresolved requested region with `VALIDATION` before any filing query or mutation. It preserves the existing recognized agency aliases and application-type region fallback. No assertion cast, invented default region or broader filing support was introduced.

`requested-region-red.log` records **2 failed, 2 passed and 45 intentionally skipped** before the repair. `requested-region-green.log` records **81 passing cases in four files** after it, including 49 in the market PGlite suite. `requested-region-lint.log` records the scoped lint result. The initial supplemental type diagnostic covered only 20 changed files and stopped on the first error; it is not full compiler completion.
