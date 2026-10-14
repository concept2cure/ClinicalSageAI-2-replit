# CI current request-context fixture repair

The original deterministic AnA stream fixture failed because its post-middleware helper omitted the required request SQL client. It now attaches the same declared fake executor used by its existing database mock; the original `done` assertion is unchanged. The secondary native access fixture now accepts the exact disposable hosted CI database in the declared CI/test context as well as the existing isolated local QA target, while requiring matching owner/runtime endpoints and the `app_service` runtime identity.

Only these two test files and their fixture contract changed in this scope. No production fallback, policy, role, grant, source assertion, schema or scanner baseline changed.

| Phase | Result | Qualification |
| --- | --- | --- |
| Published AnA job `115722968401`, run `38522415630` | 1 failed / 302 passed | Bounded sanitized failure excerpt; original published source `10f4e4557`. |
| Original local deterministic-stream case | 1 failed / 6 deselected, 20.59 s | Captured before patch. Stderr reports “Request-scoped database context is required”; source-pinned `MissingRequestDbContextError.code` is `REQUEST_DB_CONTEXT_REQUIRED`. |
| First package-script wrapper | Exit 127; no tests executed | `bash -lc` reset this execution environment's Vitest PATH. Retained as a wrapper failure. |
| Exact `npm run test:ana` | 303/303; 4 files; zero skips; 30.86 s | Node 22, heap 4096 MiB; process-local `BASH_ENV` restores Node/Vitest PATH only. Same package script and assertions. |
| Native secondary access suite | 18/18; 1 file; zero skips; 12.53 s | Actual restricted runtime, tenant middleware/request client and SQL on recorded `platform_ci_native_recheck_20261013`. |
| Extracted actual selector | 12/12 | Pure selector execution: local/CI positives and ten refusal cases; no SQL or access-policy mock. |
| Scoped lint | Zero errors; one unchanged warning | Actual before/after lint verifies the same existing health `mockCommonDeps` size warning; native fixture has zero warnings. |

The native cases retain actual `app_service`, `NOSUPERUSER`, `NOBYPASSRLS`, forced RLS and HTTP tenant-enforcement assertions, canonical current membership/project anchors, private/unbound/global source controls, citation/hash preservation and reader/source withholding. No actor/sharing allow decision is mocked in that proof. The hosted native artifact failed this file's setup selector with **zero executed assertions**; the new local native run is separate positive evidence, not a hosted rerun.

The AnA fixture intentionally mocks database/orchestration/provider dependencies after middleware admission. Its fake `req.dbClient` qualifies deterministic core delivery only. It does not prove authentication, parent admission, native RLS, live provider behavior, source-byte performance, or regulatory acceptance.

The approved selection permits `/concept2cure-ri_dbtest` only with `CI=true` and `NODE_ENV=test`. It still rejects missing runtime selection, other database names, endpoint/database disagreement, incorrect runtime username and use of the CI name outside that context. URL checks do not substitute for the actual native role/RLS assertions. No original application database was used for fixture writes. The native runner derives private connection configuration from the recorded owned launcher without plaintext output or credential fallback.

`source-manifest.json` records exact current source pins, the earlier local red snapshot, bounded normalized logs and preserved private raw files. New copied text removes ANSI/URLs/token-shaped text and trailing whitespace; raw `/tmp` byte digests are retained unchanged. Full raw lint JSON and the original fixture snapshot remain private; summaries suffice here. Earlier sealed citation, golden, schema and native evidence is untouched.

Current canonical sharing/review deployment reconciliation is a separate schema-owner increment. Its creator paths remain the existing paths declared by the goldens; this phase does not run or qualify that migration replay. No compiler, whole proof tier, Docker image, whole native census, final CI outcome, live provider or concurrent-authorization-through-COMMIT claim is made.

Fixture contract: [CI_CURRENT_REQUEST_CONTEXT_FIXTURES.md](../../../../design/CI_CURRENT_REQUEST_CONTEXT_FIXTURES.md).
