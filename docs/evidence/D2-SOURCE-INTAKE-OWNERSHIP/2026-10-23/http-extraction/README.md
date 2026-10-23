# Private HTTP recovery fixture extraction

The original source-import integration test is now **484 lines**. Its new
75-line `_source-import-recovery-qualification.ts` helper owns only the stable
fault-injection pool wrapper and registration of the existing two lost-COMMIT /
post-commit readback cases. The parent test retains all explicit migrations,
physical source setup, request `dbClient` binding, `projects.status` fixture fix
and the original describes/test ordering. No production or intake transport edit.

`source-http-pre-extraction.test.ts.gz` is the exact pre-extraction source qualified
by root's preceding `source-http-v3.json` (20 passed). `pre-extraction.json` gives
its raw hash; `preservation.json` proves the migration literal, setup and both
case bodies remain identical except the explicit lazy fixture dependency bindings.

`source-http.json`: **20 passed / 1 suite**, exit 0, no 15-input drift, Node
22.23.3 / 4096 MB. This is the complete existing file through actual HTTP/JWT,
canonical migrations, physical Vault source bytes and PGlite, including the two
unchanged 503 exact-record readback cases. It does not prove native PostgreSQL
concurrency/RLS or live model behavior. `strict-lint.json`: exit 0, **0 errors /
0 warnings** for the parent test and private helper.

All declared input pins, exact owned test/helper archives and original raw gzip
logs are retained. The declared 15 inputs are a bounded replay map, not exhaustive
import closure. No compiler/build/dependency/Git changes or deployment by this
owner. Human checks: **Not run**. Root owns later integration and canonical push.
