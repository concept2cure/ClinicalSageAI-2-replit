# Unified task creation repair

This F1 repair continues canonical `concept2cure-v2` from
`29a1b5ddb11941df199de9a0c155333d50ab99b1`. The Rule 3 inventory and preservation
contract were published in README.md before test or production edits.

The actual existing unified router reproduced all four initial defects: a
private-project outsider, a stale claimed write role and a foreign unfiled
workspace each returned 201 with one task and one action/audit pair; an admitted
project task omitted its actual workspace. Native RED logs, exact source bytes
and hashes are retained under `native/`.

The repair reuses the existing current actor, project edit and workspace checks
on the request transaction. A selected project's actual workspace wins over
payload values. Valid workspace-only and unfiled intake, module defaults,
source/assignee metadata, HTTP201, RR1 and the existing service writer remain.
An uncertain actual COMMIT discards the request lease and returns
`OUTCOME_UNKNOWN`. Sibling link, sync and status handlers keep their error path.

An independent read-only review found no blocking issue in those boundaries.
The first fixed native run passed 169 cases: all 100 prior creation cases and
69 unified cases. It includes actual workspace SELECT failure and recovery,
atomic audit rollback, same-transaction lineage and committed-but-unacknowledged
outcomes. The final aggregate runs below qualify subsequent formatting cleanup
as well. Earlier native snapshots remain historical evidence of that first run.

Native authentication is an explicit test identity. Actual admission, tenant
scope, FORCE RLS, the restricted runtime role, tasks and canonical audit records
use PostgreSQL. This is not a deployed authentication, full migration database,
browser reach or notification transport qualification. No production caller,
screen, service, route file, mount, table or dependency is added.

Final aggregate verification passed 428 unit/route/PGlite/client cases in 30
files and 188 native cases in two files. Both runs captured identical before
and after hashes for 10,520 source/configuration files. The final route's
3,240-node TypeScript AST matches the first fixed native snapshot after excluding
source locations, trivia and formatting. Final aggregate evidence is under green/.

Five concurrent project-page commits advanced canonical to 965084590. They
fast-forwarded without conflicts and preserved all nine changed source/test
hashes. The focused native-fixture typecheck then passed with zero errors
across 3,195 inputs. Its first configuration omitted existing Express and
external-library declarations; only the focused configuration was corrected
to include the canonical declarations. Compiler rules and production code
were not relaxed or altered for that correction. The initial configuration
and diagnostics remain under red/. The required push hook separately checks
the complete canonical source tree.

Scoped ESLint passed with zero errors and unchanged warning counts: two on
the route, one in its unit suite, and zero in the other changed files. No
plan, ledger, dependency or production schema was changed by this repair.

The client, server and audit-chain verifier builds passed on the synchronized
tree. Every final aggregate check records unchanged source hashes. This is a
pre-commit verification snapshot; canonical Git history records publication.
Publication uses a direct commit/push to concept2cure-v2 with hooks enabled.

For this workspace, extract reproduce.py.gz to /tmp/check-unified-admission.py
and copy native-typecheck-config.json to /tmp/c2c-unified-native-types.json.
The driver accepts unit, native, typecheck, lint and build; its native command
requires the disposable PostgreSQL owner URL shown in native/README.md. Adjust
absolute checkout/Node/config paths when reproducing on another machine. The
actual push supplies the canonical whole-source typecheck and publication gates.

The first full push typecheck caught two accesses on an unknown PGlite test
query result. The test now requests Record<string, unknown> explicitly. Its
emitted JavaScript is identical (type-only-test-equivalence.json); application
and native test code did not change. The broader 428 cases passed again, and
the focused typecheck now includes every changed test graph and passes with
zero errors. The failed publication log and exact type-only patch are retained.
The final frozen-source-sha256.json includes this corrected test annotation.

Before retrying publication, six concurrent editor-repair commits advanced
canonical to c5baa0089. They did not overlap any of the nine repair paths.
The unpublished repair rebased without conflicts and every final repair hash
remained identical. The integrated client/server/verifier build passed again
on that tree. Required publication gates run again against the amended commit.
