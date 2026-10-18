# Source-first assembly / current-read merge successor

W1 / D2 local UI successor to the historical 719-case packet. Reconciles the
lead's `cc1607c3a` implementation with incoming `e62320e0a`; no new capability
was introduced by this delegate. Historical 719-case logs and pins stay unchanged.

The three textual UI conflicts retain both source-target/manifest handling and
the canonical current-session, exact-program and partial-read guards. The new
canonical navigation helper also retains status filtering through the existing
Save / Cancel / Leave decision. No alternate helper or permission grant was added.

One meaningful integration defect was repaired: the new source target chooser
offered explicit section-only list rows as whole-document build targets. Initial
and fresh target lists now exclude those rows. Two controls proved the defect
before repair. Additional actual-editor controls show that partial detail or
sections responses block source-first structure actions without starting preview,
commit or generation. Full/template and explicit-source assembly paths remain.

| Proof | Actual result |
| --- | --- |
| `chooser-red.txt.gz` | Both new partial-target controls failed before the repair; 29 unrelated cases name-filtered. |
| `integration-first.txt.gz` | Finite ten-file run: nine suites passed, one failed; 157 passed / two failed cases, zero skips (67.06s). |
| `source-entry-green.txt.gz` | Only the affected chooser suite reran after fixture repair: all 31 cases passed, zero skips/failures (4.55s). |

The two primary-run failures were ProjectHome fixture mounts without an
AuthProvider, exposed by its canonical guarded document list. The fixture now
uses a narrow partial module mock whose user is the actual authService's current
user; session/account/project guards and all assertions remain. Incoming assembly
fixtures also dispatch pathname for project-qualified GETs. No production
fallback, fake role, removed negative or weakened assertion was used.

Final coverage is all **159 unique cases / ten affected suites**: 128 cases in
the nine unaffected suites plus the final 31-case chooser suite. This is combined
coverage across those retained runs, not a single all-green ten-file invocation.
The scope includes source entry/build/review, selected-source receipts, current
read refusals, unsaved filtering, exact deep links and Project files. The full
52-file regression was not repeated for this bounded successor.

Node 22.22.0, existing `vitest.config.ts`, heap 4096, one worker and no parallel
files. Scoped production ESLint has zero errors / 12 warnings versus 13 incoming
warnings over the four integrated production files; modified tests have zero
errors/warnings, including the final fixture successor. No thresholds,
suppressions, dependencies or baseline files changed.

`regression-files.json`, `result.json` and `source-pins.json` identify exact
coverage and frozen inputs. The root's full compiler/build/release checks remain
separate. `archives.json` pins decoded bytes and archive SHA-256 for deterministic
gzip (`mtime=0`); raw proof bytes were preserved exactly. React act warnings remain
in the logs. These mocked-HTTP checks establish no native RLS, live browser,
provider, deployment or snapshot-writer qualification. No staging, commit or push
was performed by this UI delegate.
