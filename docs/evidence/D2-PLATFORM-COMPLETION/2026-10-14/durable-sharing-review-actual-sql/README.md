# Sharing/review: actual creator and applier SQL qualification

This separate 2026-10-14 phase executed the byte-exact amended full two creator
files through the actual canonical applier **twice**, followed each time by
the unchanged final integer tenant-isolation sweep. Both legacy BEGIN/COMMIT
handling and the ordinary outer transaction path passed. The other two tail
files are pinned by unchanged static ordering; they were not executed in this
bounded four-public-store fixture. The whole application set is pending the
separate strict blank-provisioning window.

The fixture is one newly created retained owned QA database with minimal
declared FK parent prerequisites. It is SQL migration qualification, not a
fully provisioned platform or runtime API/RLS-access claim. Fresh synthetic
parent/reviewer records were seeded there; no existing database, PostgreSQL
role, platform grant or historical client record was changed.

A deliberately incomplete sharing store caused P0001 reconciliation refusal.
A deliberately duplicated artifact/reviewer/round store caused 23505 refusal.
The exact actual full creator SQL refused; each before/after row count and
content digest matched. The negative fixture transactions were never committed
and were rolled back whole, with no DELETE, DROP or history repair.

A retained synthetic decision created under the exact old creator had no
updated_at column. After both actual replays its prior JSON content and
2020 fixture created_at remained unchanged, and updated_at remained **NULL**.
A subsequent new decision received the actual insertion-time NOW default.
No old record was timestamped with migration time or inferred from created_at.

Physical columns, keys/checks/index definitions and all four stores' ENABLED/
FORCED RLS state matched across the two replays. The actual journal records
the exact three applied-file hashes and apply_count=2. Positive fixture data,
new schema and migration history remain intact in the named QA database.

The plain-pg process exited 0 and closed all its pools. No installer, TypeScript
graph, provider call, native API, compiler or publication claim belongs to this
phase. Raw observations, exact production/runner source pins and original logs
are preserved. Earlier static/golden/fresh-provisioning phases remain unchanged;
strict full blank provisioning is prepared but still pending.
