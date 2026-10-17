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
