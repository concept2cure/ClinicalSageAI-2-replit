# Release evidence manifest

The v1 manifest binds primary evidence to one Git commit and tree. It is an engineering evidence index, **not** a validation summary report or an automated compliance, production-readiness, or agency-readiness conclusion. IQ/OQ/PQ/VSR documents remain governed records reviewed under their applicable procedures.

## Inventory and evidence sources

The repository currently provides readiness material under `docs/audits/`, `docs/reports/`, and `docs/operations/`; qualification templates under `docs/beta/validation/` and `docs/validation/`; workflow definitions under `.github/workflows/`; audit generators under `scripts/audits/` and `scripts/ops/`; canonical migration inputs under `db/migrations/` and `migrations/`; JSON schemas under `schemas/`; the `npm run sbom` CycloneDX output; Playwright configuration and the Tier 5 browser workflow; and Node/npm build metadata in `package.json` and `package-lock.json`. Historical reports are discoverable inputs only and are never treated as current green results.

## Generate and validate

Create `release-evidence-input.json` from primary artifacts produced for the checked-out SHA. Each artifact entry supplies `id`, the policy-defined evidence `kind`, a repository-relative `path`, `commit`, `tree`, and optionally its expected `sha256`. Absolute paths, traversal outside the checkout, and symlink escapes are rejected. Supply GitHub API job records in `workflowJobs`, including exact workflow/job names, conclusions, head SHA, and run ID. Required jobs come only from the reviewed, versioned `config/release-evidence-policy.v1.json`; the input cannot weaken that list. Supply all six `automatedEvidence` results with a verified artifact of the corresponding policy-defined kind and an honest summary containing total, passed, failed, skipped, and unknown counts. A `passed` result cannot contain failures, skips, or unknown results.

Run `npm run release:evidence` from a clean checkout. The input and explicitly listed primary evidence files may be untracked CI downloads; tracked modifications and unrelated untracked files are prohibited. Output goes to ignored `release-evidence/manifest.json` and `release-evidence/index.md`. The generator refuses source dirtiness, cross-commit input, and duplicate workflow records; computes lock/migration/schema and artifact SHA-256 values; emits missing jobs as `missing`; and preserves skipped/cancelled/neutral/unknown conclusions. Validation re-reads and re-hashes every primary artifact, and fails unless every required automated result is `passed`, every required job succeeded for the exact SHA, every artifact is present/current, and repository fingerprints still match.

The manifest has no generation timestamp, and ordered inputs yield byte-identical output. It embeds the reviewed policy's SHA-256 so changing required proof invalidates existing manifests. `index.md` records the manifest hash and clearly separates automated evidence from human decisions. CI should download primary artifacts and GitHub job metadata into the input file, run the command at the workflow SHA, and attach both output files to the release review.

## Qualified review

Engineering, security, regulatory QA, operations, and legal reviewers inspect the indexed source artifacts within their authority, resolve or formally track deviations, and make any approval only through the governed signature system. Generated approval slots are always `unapproved` with blank identity, date, signature, and authorization evidence. The generator does not accept names or signatures from its input. A downstream governed process may create a separately signed record; it must not rewrite automated evidence or claim a conclusion that the evidence alone cannot support.
