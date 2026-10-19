# Regional filing applicability — bounded implementation evidence

The Reporting catalog now offers an existing regional assessment only when the
selected project’s recorded filing matches that report’s market and filing kind.
Overview and execution share one pure validator. Execution rereads current
metadata and refuses conflicting or changed filings before metric and retained
report writes. Client notes and Availability filters explain the refusal using
the existing reporting UI.

Approved scope: [design contract](../../../../design/REGIONAL_REPORT_APPLICABILITY.md).
The six production files add no report engine, jurisdiction or clinical/CTD
computation. Applicability means the supported computation applies; it supplies
no readiness, completeness, signature or regulatory approval verdict.

## Results

| Check | Actual result |
| --- | --- |
| Current original source, external behavioral red | 38 failures / 14 passes, four files / 52 cases, 9.91s |
| Final scoped regional / overview / catalog checks | 146 passes, nine files, zero skips, 12.02s |
| Existing and new Insights UI regression | 169 passes, 18 files, zero skips, 35.11s |
| Forced scoped source/test lint | Zero errors; seven existing Insights warnings before and after; no new file/rule/severity counts |

The red included a passing actual POST/run positive control. Conflicting filing
metadata then incorrectly returned 201 and wrote retention/audit doubles. Its
three route cases now refuse with 422 before run/snapshot/audit/signing writes.
Seven actual engine conflict controls refuse before metric reads. The original
catalog offered wrong-market reports and lacked the three filter values. All
corresponding scoped cases now pass. The earlier 22-case overview red (21
failures / one no-lead pass) and its exact test source are retained separately.

Tests cover US IND, NDA, BLA and ANDA; EU MAA; Japan marketing approval; known
unsupported device filing; absent, malformed, conflicting and unknown context;
storage failure; deployed market drift; exact requester/org/parent parameters;
canonical typed denials and observed final scope withdrawal; preserved
unregistered/disabled/scope precedence; and independent entitlement. Existing
real-resolver plan cases and all current Insights plan/session/export controls
remain green.

## Scope and source integrity

The route mints the canonical current program scope on the actual request SQL
client, verifies the unique non-deleted anchor matches the selected lead, and
reads metadata once with exact project/org/program parameters. Before JSON
submission it awaits the canonical fresh recheck on that same executor and
requester. Missing filing asks the client to record its filing type and states
that no assessment ran. Storage and malformed data retain distinct closed
states. Validated recorded labels and agency can be supplied; PDUFA stays null.

The final route-private validated-label extraction removed one newly introduced
complexity warning. No lint baseline or suppression changed. The seven retained
warnings belong to the pre-existing Insights monolith; typed metadata additions
change its measured line totals, while complexity and warning counts stay the
same.

`manifest.json` pins 16 exact production/test/design source files at regional
freeze and every raw evidence artifact. Source-byte snapshots are also retained
under `/tmp/c2c-regional-catalog-prep/final-qualified-source/`. Insights at this
phase is SHA-256
`73dff8e364d28848afceec3353d0912d6ada5abe57d9f03679161d88c16639a5`;
overview is
`8ff460812a12fe664751c54a6df07ba1ca42e9e7b9c76245a270d1561b358c24`.

These pins qualify this phase before any subsequent Free-plan revision. Later
changes need their own source pins and checks; this record is preserved rather
than rewritten to claim a later source.

## Practical limits

The focused route suites use explicit auth/SQL/policy-edge doubles to establish
consumer ordering and refusal. They do not prove native RLS, real sharing
permissions, durable database absence, or regulatory readiness. The separate
auth-owned native test is placed and awaits the root’s execution slot. Its
outcome belongs to separate native evidence. Whole-platform compiler and
publication are root-owned and not claimed here.

The observed final permission recheck does not serialize every independent
sharing writer through COMMIT. No provider calls, migrations, role grants,
trigger changes, fixture deletion, Git/index or compiler actions were performed
by this workstream.
