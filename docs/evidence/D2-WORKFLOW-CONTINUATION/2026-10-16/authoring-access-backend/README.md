# Merged Authoring access backend qualification

Base: `990a687c6eb31adb1becfa58d91fc9d2932f23ed` on `concept2cure-v2`.
Sources remain uncommitted pending root integration and release gates.

Two sequential Node22 runs passed with heap 4096 and the repository's single-worker
configuration:

| Packet | Result | Time |
| --- | --- | --- |
| Focused Authoring READ and snapshot integration/compatibility | 156 passed, 10 suites, zero skips | 81.50s |
| Upstream role/ACL/read compatibility and founder snapshot caller |144 passed, 6 suites, zero skips | 58.26s |

The first includes the earlier 49-case READ scope and 107 snapshot/current-source
cases. These counts were observed on the merged sources; old unobserved final-run
claims are not used. The second is a separate set of six suites. Raw output and
exact command/file lists are retained beside `source-records.json`.

## Resulting behavior

The existing list, detail and sections GETs require current request-owned program/
project sharing and exact document or section admission before metadata, counts, 
source facts or saved prose. Exact section-only access stays reachable while whole-
document provenance and sibling facts are withheld. Late observed authority changes
refuse the combined response.

Taking a filing copy uses the request-bound executor and transaction, current active
actor/regulatory-author authority, and whole-source document ACL and project sharing.
It preserves the canonical source assembler, seals, pins, aliases, replaced versions,
audit reason and workflow/source-reference holds. A late refusal after writes throws
through the transaction so the copy, alias, version and audit changes roll back.

The source assertions include positive create and unchanged retake, private project
and object ACL independently, section-only denial before assembly, stale admin claims
versus current viewer, removed/inactive standing, expired/revoked grants, foreign
source, NULL-program historical scope, policy faults, missing request context, and late
withdrawal/anchor changes. Existing seal/order/pin/seed compatibility also passed.

## Upstream reconciliation

Resolved `authoring.router.ts` by retaining its extracted request-owned compositor.
Moved the upstream `organization-read-only` refusal explanation from its removed
router projector into the canonical moved helper. Preserved upstream upload API
option removals. The auto-merged `authoringDocAccess` suite retains both current-role
fixture/expectations and mandatory current-read privacy refusals.

The restored legacy seal fixture grants a Viewer only when the actual source row
and requested seal tenant equal the intended fixture organization. Its previously
unobserved legacy ordering positives now pass; no further blanket grants or
assertion changes were needed in this reconciliation.

`source-records.json` pins 20 owned source/test files and verifies six upstream
policy/dependency files equal HEAD. No schema, role, permission policy, provider, model
approval or application configuration was changed. No staging, commit or push was
performed. Root must stage the resolved router working file to clear its index
conflict marker.

## Qualification limits

This packet records current merged GREEN. Earlier retained RED phases belong to
their exact source snapshots; this packet makes no new RED-on-original-writer claim.
PGlite tests use canonical SQL but do not establish native restricted-role/FORCE-RLS
behavior. The founder walk stubs external object storage/rendering/provider/agency
dependencies as its suite documents. Development audit/RLS initialization warnings
in test output are retained and are not a production validation result.

Native37 was statically reviewed only: its unchanged fixture checks the exact
approved isolated target, actual app_service NOSUPERUSER/NOBYPASSRLS/RLS-on, 12 FORCE-RLS
stores,canonical tenant constraints and unique section index before fixture writes;
it uses actual auth and LazyRequestDbClient, records backend PID/tenant, and awaits
independent owner mutations for late-read witnesses. Root owns its actual execution.
That native suite covers the three READs; it does not qualify the snapshot writer.

Compiler/build/global gates, browser/deployment, provider qualification, selected-
project AnA grounding and the complete demo acceptance run remain separate gates.
No full-platform privacy or demo-readiness signoff follows from these results.
