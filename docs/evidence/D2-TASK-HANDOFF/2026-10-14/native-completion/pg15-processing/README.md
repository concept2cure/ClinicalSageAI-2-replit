# PostgreSQL 15 processing recovery

The canonical query used PostgreSQL 16's `pg_input_is_valid`, while CI and the
beta stack run PostgreSQL 15. The real restricted-runtime processing replay
failed two of eight cases with undefined function 42883. The existing time
expression now uses PostgreSQL 15's silent JSONPath calendar parser, bounded
ASCII date/time fields, a nonzero year, and an exact UTC round trip before
returning the timestamp. Nested CASE expressions protect every raw cast.

The retained [summary](summary.json) records 9/9 native cases, zero failures or
skips, including one added dry-run case covering 41 timestamp-stage variants.
The eight original cases and their assertions remain. The broader parser probe
covered 526 inputs under three DateStyle/timezone configurations: 189 accepted
and 337 rejected per configuration, with zero mismatches. Early probes exposed
JSONPath normalization of zero year/month values; the lexical guards retain
those findings rather than trusting the parser alone.

See the raw processing [before](processing-before.json) and
[after](processing-after.json) results and [final source pins](source-pins-after.json).
This is local PostgreSQL/app_service/RLS proof. The resumed final merged source
requires a fresh combined run; interrupted whole-run output is not a pass.

## Informational output normalization — 2026-10-17

The normal pre-push warning ratchet identified four `console.log` calls in the
retained probe scripts. Only those calls were changed to `console.info`, which
also writes to stdout in Node. Probe SQL, inputs, calendar guards, error behavior
and execution order are unchanged. No probe was rerun, and the historical source
pins and observed results above remain unmodified.

The original scripts are retained at Git commit
`a48ce1e97f8a96b96a092961037b048cd0e54128`, with original Git references
`a48ce1e97:docs/evidence/D2-TASK-HANDOFF/2026-10-14/native-completion/pg15-processing/timestamp-range-probe.mjs`
and
`a48ce1e97:docs/evidence/D2-TASK-HANDOFF/2026-10-14/native-completion/pg15-processing/unsafe-jsonpath-probe.mjs`.
Reversing only `console.info` to `console.log` reproduces those exact bytes.

| Script | Original SHA-256 | Normalized SHA-256 |
|---|---|---|
| [timestamp-range-probe.mjs](timestamp-range-probe.mjs) | `e80b1e65441b23e45c1780f15a4f9895341cbd09eb9ccb29f1337d59083bddd3` | `cb5ca1b611ee03e89c3d194c6a55519363b9e23d24e35991a289be18d26b1968` |
| [unsafe-jsonpath-probe.mjs](unsafe-jsonpath-probe.mjs) | `07e7355b6084b7de1100bc39bb6848cee773939222f010e4e13055a43df46bb1` | `83299380f1192b8a7b8e0ebea0d0e900b254d6b79260b419ad0bb9b4d1e46451` |
