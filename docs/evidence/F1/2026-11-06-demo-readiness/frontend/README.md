# Current-source frontend demo checks

The existing project/task/editor entry suites and CSR controls were rerun on
`c50f8782ad8ef622872578ae4fae41e14d18caa1`, after the upstream integration.
No production source was edited by this worker.

Result: **256/256 tests across 20 files passed in 51.45 seconds**. This includes
the 11 prior entry suites and eight CSR control suites plus navigation
reachability. The exact command and selected test list are in
`qualification-status.json`; the bounded 37-path hash list is unchanged before
and after the run. These are component/fixture checks, not browser observations
or evidence of a configured or successful AI provider.

Known excluded drift: `shellNav.test.tsx` previously failed four stale
expectations after intentional global Vault access and the Biostatistics rail
entry. It was excluded, and is **not claimed fixed or passing**.

The run made no application API/provider calls, started no database or app, and
ran no gates, full typecheck or build. The raw bounded test log is retained as
`current-client-tests.txt.gz`. All worker-owned test processes have exited.

Root subsequently walked the actual local browser after all packs were seeded.
`browser-navigation.json` records the seven central rail destinations loading
with project context, zero JavaScript exceptions and zero API 5xx responses.
On the CSR project, Author → Open leads to the shared document list; selecting
the saved CSR title opens its editable ICH structure and the study-data build
action. No draft, save, signature or provider request was made in this walk.
