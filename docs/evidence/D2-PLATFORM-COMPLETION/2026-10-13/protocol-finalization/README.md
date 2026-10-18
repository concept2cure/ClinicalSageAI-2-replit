# Original protocol finalization: native baseline evidence

W1 / D2 evidence, 2026-10-13, `concept2cure-v2`. This is an intentionally red,
explicitly invoked native probe, outside the canonical test include patterns.
No production or canonical test suite changed in this workstream.

The recorded native run has **two failed safety invariants and one passing
signed baseline control**, with zero skipped tests. The runtime is the actual
restricted `app_service` role, neither superuser nor BYPASSRLS, on isolated
`platform_ci_native_recheck_20261013`. The exercised public protocol, version,
signature and action stores have enabled and forced RLS. Application transactions
and queries run with `RLS_ENFORCE=on`; the owner connection is used for new
isolated fixture identities and observations. No shared QA organization 2 or
user 25, cluster role, schema or unrelated record was modified.

## Observed behavior

| Case | Actual result |
| --- | --- |
| Clean canonical protocol control | The control finalized at version 1.0, with one retained version and real electronic signature; canonical current content digest matches the signature. |
| Same signing-client structural regression | The fixture signed/finalized with returned completeness 100%, although its required synopsis was made draft on that same transaction. The retained final snapshot contains that draft status and current completeness is false. The signing client and independent pool read use different backend pids. |
| Finalizer-first queued content edit | Native parent wait ordering was observed before releasing the blocker. Actual authenticated finalize and section edit both returned 201. The document remains finalized, but the queued prose committed and canonical current content digest differs from the immutable signed digest. |

The same-client case exercises the canonical service transaction contract inside
the actual signing ceremony. It is not a claim that the public finalize route
currently offers a combined edit-and-finalize request. The second defect uses
the actual public finalize and section-edit routes, real JWT authentication,
membership permissions, password reauthentication, governed actions, lineage,
signature persistence and PostgreSQL locks. No production behavior was mocked.

The case assertions require refusal before release effects or preservation of
signed content, so they fail against the present code. The observations are
recorded **before** those failing assertions. A status-only structural defect is
not claimed to cause digest drift: the current signature recipe intentionally
excludes workflow statuses. The actual queued prose edit does cause digest drift.

## Files and reproduction

- `native-baseline.probe.ts`: actual canonical services/routes with new isolated
  synthetic QA protocols. Construction uses real mutations and governed actions;
  no source history or signature is fabricated or relabelled.
- `vitest.probe.config.ts`: explicit opt-in derived from the real database config;
  it does not load the mocked PostgreSQL setup.
- `native-baseline-red.txt`: raw final native run, one green control and two
  objective invariant failures.
- `native-observations.json`: backend identities, actual states/counts and digest
  comparisons. It contains no passwords or JWTs.
- `native-source-digests.json`: branch/HEAD, runtime boundary and source/probe
  hashes used for the baseline.
- `scoped-lint.txt`: probe/config lint has zero errors and zero warnings.

Run with Node 22, owner `TEST_DATABASE_URL` and restricted `APP_DATABASE_URL`
pointing to the named isolated database, `RLS_ENFORCE=on`, `NODE_ENV=test` and
a synthetic test-only `AUDIT_HMAC_SECRET`:

```sh
npx vitest run --config \
  docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/protocol-finalization/vitest.probe.config.ts
```

All fixture sources, actual signatures and audit history are retained. Only the
probe process's own connections are closed. No provider call, model qualification,
scientific approval, agency acceptance or production qualification is claimed.

An initial harness observation query referred to a nonexistent action timestamp
column. That fixture query was corrected before the recorded final baseline run;
its errors are not counted as product safety failures. Earlier unique fixture
source/signature rows were also retained.

The remaining cases in
`docs/design/PROTOCOL_FINALIZATION_CONCURRENCY_2026-10-13.md` remain proposed
tests. This evidence does not claim that every protected writer or isolation
level has been reproduced or repaired.
