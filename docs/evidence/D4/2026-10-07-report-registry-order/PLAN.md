# W3 / D4 — exact registry equality independent of presentation order

Base: `db89074184a2b59e228fb311babf23e0a7c6cbeb`, only `concept2cure-v2`.

The earlier native artifact 11511776693 contains one failed report registry
comparison: 61 database IDs versus 61 expected IDs. The query orders by the
database comparator, while the expectation uses JavaScript sorting. The
membership/metadata contract does not require database presentation order.
Collation is a plausible explanation for the original failure; the artifact
does not include the complete diff, so the exact native cause is not claimed.

Change only the actual-side comparison to sort its fresh ID array using the
same comparator as the expected copy. Retain exact list equality, duplicate
detection, every metadata assertion, the query, seed arrays, generator,
migration, operator disable behavior, routes and all other native cases.

Before editing, execute the actual first native test callback against an
isolated PGlite registry seeded by the real migration applier, returning its
complete unchanged rows in controlled alternate order. Record the false RED.
After editing, execute that same callback, with omissions, duplicates,
replacement IDs and each metadata field corrupted as negative controls; also
verify seed replay preserves an operator disable. PGlite is local SQL evidence,
not native PostgreSQL/RLS or deployed route qualification. Keep the existing
generator contracts, database isolation, source scope and lint checks.

No full local compiler on the 8-GiB host. Run normal commit checks and all
unchanged pre-push gates before the required exact-source remote compiler.
Publish this one-assertion correction without waiting for the broad CI suite.
