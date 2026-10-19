# Governed reporting schedules

Reporting & analytics schedules use the same `computeRunForType` dispatcher and
`persistReportRun` service as interactive reports. A successful platform delivery
means an immutable initial run snapshot exists, the recipients have saved-report
notifications, a chained delivery event exists, and the subscription cursor has
advanced. Those effects commit in one tenant transaction. Computation completion
alone is not delivery. Scheduled output remains non-final until reviewed and
signed through the existing finalization ceremony.

The worker starts on the existing application startup path and needs PostgreSQL,
not Redis. `REPORT_SWEEP_INTERVAL_MS` defaults to 600000; values under 10000 fall
back to that default. A session advisory lock coordinates application processes,
and each occurrence has a deterministic run UUID. A compare-and-swap on the
subscription's cursor and configuration refuses edits or disablement during
computation. Legacy PostgreSQL timestamps with microseconds are compared at the
JavaScript date's millisecond precision, with configuration equality checked too.

Creation, enablement and firing validate the creator's current writing role,
active organization, scope ownership, optional active client workspace, actual
engine and declared scope, client applicability, current subscription and report
entitlements, and recipient membership. Plan resolution errors fail closed using
the canonical scheduled-report entitlement service. Unsupported regional report
types do not receive a readiness digest in their place. Supported regional types
read their deployed registry declaration when the caller supplies none.

Organization membership alone does not grant access to private projects. The
creator and each platform recipient must be able to use every project referenced
by the report scope, through the canonical project-sharing policy used by the
workspace and saved-report reads. This includes document/submission parent
projects and every project in a program group. Explicit project members and
pending reviewers retain their existing access; revocation takes effect on the
next delivery validation. A denied recipient prevents computation and persistence,
rather than receiving a report notification that grants new access. Registers
with genuine organization-only data retain their existing organization policy.

The schedule register returns only scopes the current caller can use. Both
enablement and disablement require that same caller's scope access before the
lifecycle transaction; the stored creator's permissions cannot authorize another
member to manage a private project's schedule. The existing authenticator's
current organization role takes precedence over a stale token role.

Schedules store `timeZone` as an IANA timezone. Local calendar recurrence follows
daylight saving: a nonexistent spring-forward time moves forward by the gap, and
an ambiguous fall-back time uses its earlier occurrence once. Legacy
`timeZoneOffsetMinutes` remains supported as minutes east of UTC; `timeZone`
takes precedence. Stored `nextRunAt` is authoritative; legacy rows without it
use their last run or creation time as the anchor. A late worker delivers one
occurrence and advances to the next future occurrence, rather than flooding the
inbox with every missed interval.

Platform notifications open `/concept2cure/insights?reportRunId=<saved-run-id>`.
The `pdf` format makes the saved report's existing export available after opening
it; it does not claim an attachment was sent. External scheduled delivery returns
`REPORT_EXTERNAL_TRANSPORT_UNAVAILABLE` until an actual transport is implemented.
Failed generation, notification insertion, audit recording or cursor comparison
does not advance a schedule or retain a partial delivery.

Focused regression evidence is in `__tests__`: timezone boundaries, entitlement
refusals, foreign scopes and recipients, dispatcher selection, worker leadership,
delivery rollback and real PostgreSQL semantics through PGlite. Production
configuration and regional Module 1 coverage are separate from these code checks.
