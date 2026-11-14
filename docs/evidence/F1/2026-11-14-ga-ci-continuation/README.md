# GA CI continuation — 2026-11-14

Plan: F1. Finish existing CI proof on current canonical `4b82ba809`; no new
product capability or weakened gate is proposed.

## What already exists

- Published `08044016b` has successful Codespace, blank-database, production
  boot/image, lint, security-contract and AnA-readiness jobs. Its CI run
  `43543956605` also exposes a full-history secret-scan failure, one failed unit
  assertion and the three separately recorded native offboarding failures.
- `server/services/__tests__/vault-taxonomy-etmf.test.ts` verifies one shared
  TMF catalog and the product's artifact names. Its one failing assertion
  requires a direct `tmfArtifactName` import in `surfaces/Etmf.tsx`; it fails
  on current canonical source as it did in hosted shard 2 (21,348 passed,
  one failed, 64 pending). This stale assertion was already documented in
  `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-12-fda-filings-not-an-nda/`.
- `surfaces/Etmf.tsx` intentionally opens the project's trial master file
  through `VaultTrialMasterFile.tsx`. P-124 admission and existing behavioral
  tests own this convergence. Artifact labels now come from the canonical
  catalog in `vaultTmf.ts`, `VaultTmfPackage.tsx` and `vaultTmfAnaContext.ts`.
  Restoring the retired screen or adding an unused import would break that
  ownership rather than repair the proof. Deleted-history search confirms
  the earlier fixture's retirement in `3fa2b6feb`.
- The full-history job uses pinned Gitleaks 8.28 with redaction and exact
  historical fingerprints in `.gitleaksignore`. The failed job reports three
  findings but supplies no finding report. Bounded reproduction must retain
  missing-object/scanner failures as incomplete, never as zero findings.
  Only specifically identified immutable missing objects may be cached;
  no broad history fetch, suppression or credential action is proposed.
- Native job `132298589582` reports 3,266 passed and three failures, all in
  `tenant-purge-blocking-keys.dbtest.ts`: the owner-private profile is omitted
  by organization export, its project foreign key blocks purge, and rollback
  retains the tenant's rows. The policy choice in the coordination record
  is unchanged; no profile content or privacy boundary is altered here.

## Bounded completion contract

Repair only the existing test's placement assertion: preserve the redirect,
require the three actual Vault name readers to use `tmfArtifactName` from the
shared catalog, and retain the ban on fixture imports and `fixtures/etmf.ts`.
Run the real existing taxonomy suite and existing eTMF/Vault behavioral tests;
retain the actual baseline failing assertion. No product file, catalog model,
API, screen, service, table, provider or qualification rule changes.

Diagnose the secret-scan findings separately using redacted rule/path/commit
metadata. No matched credential value belongs in chat or Git. No scan is
accepted if any scanner error or missing-object gap remains. Any remediation
must follow the actual finding classification; no ignore entry is preapproved.

Implementation and verification are recorded below only after execution.

## Taxonomy proof completion

The existing test now follows the three actual Vault artifact-name readers,
requiring their canonical import and a real catalog call outside imports and
comments. The eTMF door's fixture prohibition and retired-fixture absence
assertions remain. No product source, catalog or redirect was changed.

The actual baseline assertion fails on current source before the repair.
The complete taxonomy suite and three existing eTMF/Vault behavioral suites
then pass **61/61**, no skips: taxonomy27, door2, restoredVault25 and
VaultAnAContext7. Scoped lint has zero errors and retains its one existing
warning. Independent review found no blocker. `test-verification.json` binds
the source/reader hashes, commands and actual red/green reports.

## Secret finding review

All three findings in the hosted job are single JSON file/digest pairs in
already-published Codespaces manifests. Worker, independent helper and root
each verify that every value equals the SHA-256 of the actual same-commit
`scripts/visual-qa/api-fixtures.d.mts` blob. The existing file-digest regex
omits `.mts`; these are source hashes, not credentials. The value-free
`secret-finding-review.json` records exact fingerprints, source blob identity
and equality verdicts.

Only those three exact historical fingerprints are added to the existing
reviewed ledger, with their reason. The scanner rules and blocking job are
unchanged, as are all earlier historical credential/revocation classifications.
No real credential is excluded or rotated on the strength of this finding.
Post-change scan, detector control and contract receipts follow separately.

## Workspace readiness observation

The existing `scripts/ops/ga-readiness-report.mjs --json` ran read-only without
loading a development env, network calls or database reads. Its process sees
8 ready rows and 18 outstanding blocker rows, plus 16 advisories. This is an
observation of this execution workspace, **not a production assessment**.
`workspace-readiness.json` records only labels, statuses, owners and summary;
it contains no secret values. Production acceptance must be established in
the intended deployment for licensed reference assets, current model
qualification, hosted enforcement/signing configuration and a proven restore.
The canonical design plan remains the authority; this packet is check evidence,
not a new roadmap. The separate private-profile offboarding choice and existing
historical live-credential revocation evidence remain unresolved here.

## Secret verification completion

The actual pinned scanner finds the three manifest hashes before the ledger
repair. With only the exact reviewed fingerprints added, the old published
range scans 60/60 non-merge commits clean, the newer range scans 28/28 clean,
and the combined `cef271edb..4b82ba809` range scans **88/88 non-merge commits**
(161 traversed commits), with zero findings and zero scanner errors. This is
bounded history acceptance, not a fresh full-branch history verdict.

The initial attempt with missing objects was explicitly rejected as incomplete.
Root cached only the 69 and 42 specifically identified immutable blob objects;
lazy fetching stayed disabled for the accepted scans. No broad history fetch
was used. The real Gitleaks 8.28 directory control still detects one generic
API-key-shaped assignment (expected exit1), with zero scanner errors and no
matched value in its retained report/log. The existing security contract suite
passes **11/11**. Rules, full-history blocking behavior and the earlier live
credential statuses are unchanged. `secret-verification.json` and adjacent
redacted artifacts bind commands, input hashes, range coverage and outcomes.

Only one existing test and the exact historical fingerprint ledger change in
this increment; production source is unchanged. A repeated product build is
not needed for these proof/ledger repairs. The normal push hook still checks
the combined whole program and repository gates before publication. The fresh
hosted full-history job is checked separately after the push; source and policy
acceptance are not inferred from a local scanner or a Codespace demonstration.
