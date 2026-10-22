# Completed scanner and Tier 5 verification

Both workflows completed successfully against implementation **`de61922a9351080fdcd76a231c5abd8182054831`**, tree **`ae8a1ae9e50b346021b9979a14f7f0ee948f10cd`**, sole parent `2c9a4a5fefc639d6d5ccf3dda139f3d64d6b2115`, on `concept2cure-v2`. These are fresh implementation results, separate from the earlier 88fa evidence and any later documentation commit.

| Workflow | Completed result | Actual evidence |
| --- | --- | --- |
| [Semgrep 38031251350](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251350), job 114152480400 | Success; updated 2026-10-10T06:47:19Z | Blocking step 5: **0 new findings**, exit 0, 492 rules / 3,039 targets. Full step 6: exit 0, **680 findings**, 647 rules / 21,215 targets. Both uploads also succeeded. |
| [Tier 5 Browser Smoke 38031251300](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251300), job 114152480276 | Success; updated 2026-10-10T06:35:03Z | All four named steps passed: migration ordering, fresh PostgreSQL provisioning, authenticated browser smoke and governed golden journey. |

The scanner used the unchanged workflow's Semgrep **1.177.0** image pinned by digest, with `p/default` and `p/ci`. Its existing successful-ancestor baseline was **`661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19`**, selected from successful run **37735466781**. The current changed-file phase reported 59 findings before baseline filtering; the retained delta was zero. The baseline comparison scanned 31 targets with 12 rules; no separate whole-baseline finding total is reported. The original case-zero message confirms the blocking invocation exited zero.

The full scan deliberately omits `--error` under the existing workflow, so its 680 findings remain advisory even though the CLI summary labels them “blocking.” Its successful nonzero-exit guard and SARIF `executionSuccessful: true` confirm completion. Downloaded artifact **11662291649** matches GitHub's ZIP checksum. The SARIF contains **721 results: 680 unsuppressed and 41 existing `inSource` suppressions**. None of the eight changed source, test or fixture paths appears in any result or warning notification. All eight published source blobs match the frozen final local-green pins, and none contains a `nosemgrep` / `nosem` marker.

The scanner result has concrete coverage limits. Blocking analysis emitted three timeouts on `shared/schema.ts` for Express SSRF, path-join traversal and React unsanitized-method rules, then stopped rules on that file at the timeout threshold. Full SARIF records **651 warning notifications: 624 Syntax error, 24 Other syntax error and 3 Timeout**. Neither scan is exhaustive: each reports approximately 99.9% parsed lines; the blocking scan skips 7 files over 1 MB and 100 ignore matches, while the full scan skips 81 files over 1 MB and 978 ignore matches. The remote workflow fetches live registry packs without archiving their YAML bytes; the separately pinned local pack archives do not establish a bit-for-bit remote-config bridge. No workflow, baseline, dependency, configuration or suppression changed in this repair.

Tier 5's original log confirms **4 migration-order tests**, including missing-parent and failed-parent negative controls, **2 Chromium smoke tests**, including the unauthenticated protected-route redirect control, and **1 governed golden journey**. Fresh PostgreSQL provisioning reported 808 public tables, 1,004 RLS policies, all required capabilities and the AnA parent migration before the child overlay. Both browser commands first run the out-of-band deploy migration. The actual governed sequence returned **export 403 before review → recorded review submit 200 → export 200 after review**.

Downloaded Tier 5 artifact **11661669420** matches GitHub's checksum. It contains the migration regression log and the final golden-journey JSON with one expected, zero unexpected and zero flaky tests. The earlier authenticated smoke uses the same JSON output path, so its two tests are evidenced by the completed step and original job log rather than attributed to that final JSON.

| Original fetched object | SHA-256 |
| --- | --- |
| Semgrep completed job log | `bd8261eecc6542f83af12e473561d5d39b95b8f300710bbb23eafeab951c169f` |
| Semgrep artifact ZIP | `e704f445592e98e2449ea3d609b2d49ebdf4740bc00bc1c4ac7ba401b9dc8cf1` |
| Semgrep SARIF | `80705993b9f698aa24717054baf1f0c827cfccd60da0715bc44a6de4ae614617` |
| Tier 5 completed job log | `946a95eaf275693f81571374df30a52fda08fc2f87279f0562618104d6777923` |
| Tier 5 artifact ZIP | `e9e7f56e11a73b727adf747636395e4cc9c42e530005e1464d2b7a0f66240951` |

The metadata files record exact API capture times, source blobs, completed step outcomes, original log hashes, selected 1-based inclusive ranges and artifact entry hashes. The raw excerpt files concatenate those original ranges in order, preserving timestamps and ANSI bytes without inserted headings. The two digest manifests pin their metadata and excerpt bytes.

To reproduce: fetch the two run IDs, their jobs and completed job logs through the GitHub connector; check both head SHAs and complete-log hashes. Download each named artifact and verify its ZIP digest, then inspect the SARIF or browser JSON. Concatenate the metadata's original log ranges to reproduce each excerpt. Check published source pins with `git show de61922a9351080fdcd76a231c5abd8182054831:<path>` and `git rev-parse de61922a9351080fdcd76a231c5abd8182054831:<path>`. Each evidence JSON uses `schema_version: 1`; each digest entry provides a relative `path`, `bytes` and `sha256`.

These results close the configured scanner blocker repair and preserve the existing database/browser journey. They do not clear separate broader CI failures or establish scientific source qualification, reviewer-observed version binding, seal admission, initial IND applicability or overall release readiness. Tier 5 connects as the owner/postgres role and does not certify production non-owner RLS boot. This inspection invoked no live model or local database, reran no workflow and changed no source files.
