# Incoming current-role and held-helper integration

Verified merged source on Node v22.23.3, starting HEAD d58e7944ddd0265de07dc3861c7937a24ec3652b.

Test Files  6 passed (6)  
Tests  145 passed (145)  
Duration  20.18s (transform 3.50s, setup 125ms, import 3.02s, tests 16.28s, environment 0ms)

21 selected test/source bindings remained unchanged during this scoped run; 0 changed. Exact SHA-256 hashes and HEAD observations are in incoming-current-role-held-helper.json.

The clean program-access merge adds the shared normalized read-only role predicate and delegates program creation to it. The existing forShare option and the two fixed literal live/include-deleted FOR SHARE queries remain present. No resolution edit was necessary.

The six suites cover new current-role authorization, document access, canonical program access including held-live/deleted/missing/failure controls, actual processing recovery and catalog governance integrity. Existing broad 138-suite and 107-case incoming provider/submission runs were not repeated.

PGlite and unit fixtures do not establish native PostgreSQL lock/concurrency/RLS or live API qualification. Bindings are selected, not a complete transitive import graph. No application, runner, baseline, staging, branch or push changes were made by this task.
