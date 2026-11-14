# Classify the current full-history scanner findings

Plan: F1. Keep the existing secret scanner and its failure conditions.

## What already exists

- `.github/workflows/ci.yml` runs pinned Gitleaks 8.28.0 against every commit on the branch, using `.gitleaks.toml` and the existing `.gitleaksignore`.
- `.gitleaksignore` explicitly permits an exact historical fingerprint only for a commit already on trunk, with a reviewed reason. Its existing entries distinguish credentials requiring revocation from reviewed non-secret metadata/test vectors. No history rewrite is used.
- Current CI at `b0300fe5c` reported two findings without identifying their file/rule in non-verbose output. One is reproduced as a 40-character Git commit identifier in an already-published evidence manifest; the value resolves to an existing Git commit. It is provenance, not a credential.
- The other occurrence is a repeating placeholder in an AWS `mock_provider` Terraform test, with `command = plan` and no apply. Private exact-value search at the integrated canonical HEAD finds five Terraform test files and one historical evidence harness, with no production default or production import of that harness.
- The local checkout is partial. A broad scanner traversal attempted to fetch historical blobs and exhausted this validation host's disk. That scanner was stopped; disposable image-export scratch was removed, and source/workspace state was retained. Further scans must disable lazy fetching and use bounded cached history, recording any omissions rather than calling missing evidence a pass.

## Completion contract

Identify both findings by file/rule/commit/line without disclosing matched values. Confirm each claimed Git identifier against an actual Git object. For proven non-secret occurrences already on trunk, add only their exact reviewed fingerprints under the existing policy. Change no scanner rule, regex, workflow enforcement or real-credential status. Retain red/green metadata and prove an unrelated synthetic secret-shaped canary still fails the existing scanner. If a finding is a credential or cannot be classified, do not suppress it.

## Reviewed findings

| Introducing commit | File and line | Rule | Classification |
|---|---|---|---|
| `4b2ed1cbae64bff187b8a5594fc41ca5e2ecb4dd` | `docs/evidence/F1/2026-11-13-codespaces-demo-continuation/source-and-artifact-hashes.json:3` | `generic-api-key` | Published Git provenance identifier; resolves to a commit object |
| `7310d3083ad2057f61e36646a9baefe7b9914616` | `terraform/modules/alb/tests/alb_timeouts.tftest.hcl:30` | `generic-api-key` | Mock-provider, plan-only test placeholder; no production-default use found |

The second finding predates the initial `35af13338` baseline; the first arrived in the subsequent canonical integration. Neither is a credential introduced by the document-runtime or portfolio implementation. The exact two historical fingerprints are appended to the existing ignore ledger with reviewed reasons. No matched value, source line, secret status, scanner configuration or enforcement change is included.

## Scope of verification

GitHub CI run `43504538006`, job `132158612227`, scanned 14,404 commits and reported two findings. Its non-verbose log contains no finding identities. The pinned Gitleaks 8.28.0 release binary was checksum-verified and used to recover only metadata locally. A scan of the 15 commits after the initial baseline reproduced the provenance finding. A bounded scan after the last ignore-ledger update recovered the older Terraform finding, but missing historical objects produced errors and only 535 commits were scanned. That is partial evidence, not a clean full-history result. Further checks disable lazy fetching.

Exact-commit red/green checks, the existing secret-history contract suite and an unrelated in-memory secret-shaped canary are recorded in `verification.json`. The canary is generated at runtime, is never written into the source tree, and its plaintext must remain absent from scanner output. Full-history confirmation remains the blocking CI job's responsibility.
