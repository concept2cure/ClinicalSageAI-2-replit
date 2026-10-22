# Proof tier current membership fixture repair

The published `10f4e4557` Proof tier step failed because the CER EU MDR and device 510(k)/eSTAR fixtures supplied an admin request principal without a current `organization_users` record. The real project-create door correctly returned `403 PROJECT_ACTOR_ACCESS_DENIED`. The complete hosted Proof step had **two failed cases and 1,419 passed cases across 125 files**. Its later whole-job capture is partial; this evidence does not claim overall CI success.

The repair changes only those two existing golden fixture files. Each now supplies real current admin memberships for its existing primary and foreign-organisation actors. A separate actual viewer user 3 and viewer membership replaces three header-only viewer probes. Both fixture databases apply the canonical sharing/review migrations read by project admission, and both journey manifests record those additional migration inputs. No fake policy, broad project/source grant, changed refusal assertion, permission relaxation or scanner baseline was added.

The existing `makeRequestDbClient(jdb.pglite)` supplies the canonical request client. The separately owned production helper migration uses that pinned executor for project/Vault parameter admission; these fixtures require no fallback or new request interface. The source pin records include the helper and its current actor/parent policy dependencies.

## Verification

| Phase | Result | Duration |
| --- | --- | --- |
| Published Proof tier failure | 2 failed / 1,419 passed; 125 files | 682.09s |
| Local initial diagnostic | Deliberately interrupted; partial device failure reproduced | Incomplete |
| Two repaired golden journeys | 2 passed, zero skipped | 16.64s |
| One final full Proof tier run | **1,421 passed; 125 files; zero skipped; exit 0** | **1,183.24s** |
| Two-file fixture lint | 0 errors; same 9 warning occurrences as HEAD | — |

The canonical command was run once after the final source freeze:

```sh
PATH=/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 npm run test:proof-tier
```

The package script runs `vitest run --config vitest.config.ts tests/schema-contract tests/golden-journeys tests/export-contract`. All 139 recorded input files matched their byte counts and SHA-256 digests after completion. No source, compiler, index, commit or additional large runner was launched by this fixture agent during the gate.

Original viewer, foreign-tenant and ambiguous-parent refusal expectations retain their assertions. The two focused and final journey manifest/report packets are recorded separately. They describe their actual canonical schema inputs and declared limitations; existing ignored generated reports are runtime output, not previously sealed published artifacts.

## Evidence and limits

`source-manifest.json` contains explicit path/byte/SHA-256 records for every file in the three proof directories, the package/config/Proof guard inputs, the request and policy helper dependencies and the two canonical migration additions. This is a bounded input set rather than every transitively imported production source. The focused input snapshot and final frozen input snapshot are retained separately.

The private 2.1 MB hosted job snapshot remains in `/tmp` and is referenced only by its path, bytes and digest. New evidence files contain the bounded two-failure excerpt and the complete Proof step summary extracted from that snapshot. The interrupted local diagnostic is explicitly partial and must not be reported as a complete local two-failure census. Source evidence and the sealed citation167 folder were not rewritten.

New log/report copies normalize trailing whitespace and extra EOF blank lines. The hosted excerpt additionally removes ANSI display escapes. Every copy has an independent digest alongside its exact original raw file record. The lint comparison records zero new warning-rule/severity occurrences; the fixtures retain their existing large-file/function and unused-variable warnings without baseline changes.

These results qualify schema contracts, actual SQL inside PGlite journeys and export reopen contracts. The two repaired journeys retain their declared mocked verified-principal middleware and real authorisation SQL; the IND journey independently uses real signed JWTs. This phase does not qualify native RLS or independent-session stability through COMMIT, source/provider performance, production service startup, external-validator certification or regulatory acceptance. Each export proof retains its specific external qualification limits.
