# Exact-implementation remote verification snapshot

Captured: **2026-10-10T05:59:56.450Z**. Repository: `concept2cure/ClinicalSageAI-2-replit`, canonical branch `concept2cure-v2`.

Subject implementation: **88fa1606c5b50daf1cb50686d743fe26e041b441**. Its GitHub commit tree is **f96f37cb70e1dfbe4ca87938d4b0556d6fd6a845**, matching the checked local tree. The later repo-health bot commit `96cea301fd1d98d80f40cb76653858137da33a9c` has this implementation as its sole parent and changes only the two repo-health reports. These runs directly tested the implementation commit.

## Completed Tier 5 result

[Tier 5 run 38028595047](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595047), job `114144600079`, completed **success** at `2026-10-10T05:48:46Z`.

| Named check | Result | Observed evidence |
| --- | --- | --- |
| Check AnA fresh-install migration ordering | Success | 4 regression tests passed |
| Provision the application schema from scratch | Success | Installer verified application schema and completed |
| Run the authenticated browser smoke | Success | 2 Chromium tests passed, including unauthenticated negative control |
| Run the WO-06 governed golden journey | Success | 1 journey passed; export 403 before recorded review and 200 afterward |

`remote-tier5.json` pins the run, subject, checks, artifact digest and exact source-line selections. `remote-tier5-excerpts.txt` preserves original timestamped/ANSI log lines; SHA256 `251cb4c36ae471b4f7ce37211f97aaf707e4aa61881bfcaf59ea0e8110592a7f`. The independently downloaded artifact ZIP digest matched GitHub's `5e7e9e82f2e23cbf983f0927595488e75521ec8ad1be04f1de4cd00b7d374f29`.

## Completed fresh Semgrep failure

[Semgrep run 38028595000](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595000), job `114144600069`, completed **failure** at `2026-10-10T05:57:52Z` against the subject SHA. Blocking step 5 completed **failure**, scanner exit **1**, with **7 fresh delta findings** over baseline `661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19` (passing baseline run `37735466781`). It ran 492 rules over 2,994 files; the fresh log reports 66 findings before the baseline filter.

| Fresh blocking location | Rule family |
| --- | --- |
| `docs/evidence/QA-2026-10-08/walk2-majors/walk-2/h.mjs:97` | Dynamic RegExp |
| `server/services/__tests__/artifact-approval-review-integrity.pglite.test.ts:112` | Dynamic RegExp |
| `server/services/__tests__/fixtures/artifact-signed-target-harness.cjs:101` | Dynamic RegExp |
| `server/services/ana/__tests__/package-ectd-for-region-recorded-identity.test.ts:67` | Path join/resolve traversal |
| `server/services/clinical-regulatory-evidence/dataset-profile.ts:140` | Dynamic RegExp |
| `server/services/part11/__tests__/one-signing-authority-policy.test.ts:96` | Dynamic RegExp |
| `server/services/tasking/__tests__/task-project.pglite.test.ts:38` | Path join/resolve traversal |

All seven rows were derived from the fresh archived job log. Their locations coincide with the historical list, but the historical receipt was not used as this run's evidence. **None belongs to the implementation's changed-file set.** None of the seven changed source/test/fixture paths—including pharmacology leaf drafting, guidance, requirements resolver and the in-text reference test/comment files—appears in any result of the fresh full SARIF either.

The full advisory scan (step 6) completed **success** while reporting **687 findings**, 647 rules over 21,170 files. The independently downloaded artifact `11661590806` matched GitHub ZIP SHA256 `105c7fc95fc7d541c49dfe9d42897c68a68a6e5827303ff1bb98cee96a68ec0c`; its full SARIF contains 728 entries including 41 in-source suppressed entries, leaving 687 unsuppressed. Its success does not override the failed blocking delta gate. The logs report skipped files and three rule timeouts in `shared/schema.ts`; no exhaustive clean-security claim is made.

`remote-semgrep.json` binds the fresh run/job/steps, exact rule IDs/locations, source-line selections, digest, changed-path comparison and SARIF counts. `remote-semgrep-excerpts.txt` preserves the original checkout/baseline/findings/exit/summary lines. Full fetched log text SHA256: `2de4929d0066acbc137f410b9c7f1aa7f29c19bcdbdcd4d4523a2fe571b3b727`.

## Broader CI snapshot

[CI run 38028595001](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001) remains **in_progress**, with no whole-run conclusion.

| Job | Exact job ID | Result at snapshot |
| --- | --- | --- |
| Secret scan (full history) | 114144600022 | Completed/success |
| Security Scan | 114144600174 | Completed/success |
| Security Contract Tests | 114144600266 | Completed/success |
| Lint | 114144600131 | In progress; ESLint step 123 is running |
| Nightly Governance Strict | 114144601109 | Skipped |
| AnA Readiness Tests | Not yet listed | No fresh result claimed |

Five failed gates are now independently reported for this implementation in the still-running Lint job:

| Step | Fresh failed gate | Result |
| --- | --- | --- |
| 33 | Proof tier — schema contracts + golden journeys + export contracts | Completed/failure |
| 51 | No hand-rolled error-envelope reads | Completed/failure |
| 58 | Guardrails — every in-scope AnA tool reads from its register entry (with selftest) | Completed/failure |
| 74 | Guardrails — tenant-isolation in raw SQL (no regressions) | Completed/failure |
| 84 | Guardrails — requestDb (RLS) adoption (no regressions) | Completed/failure |

The Lint archive still returned `404 BlobNotFound` at `2026-10-10T05:59:56.3960634Z`. The exact current-head causes are therefore not inferred from prior-head logs. `broader-ci-observed.json` pins these fresh failed step facts and timed limits. Downstream results remain unverified, and the overall release is **not cleared**.

The Tier 5 browser tests use the existing development smoke posture and the provisioning owner/postgres role. This receipt does not grant scientific source qualification, initial-IND applicability, production RLS qualification, live-model validation, or release clearance. No checks were suppressed or waived.
