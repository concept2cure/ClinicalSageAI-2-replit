# Platform role upsert arbiter: lightweight actual SQL follow-up

This separate 2026-10-14 phase extends the preserved earlier read-only 42P10
defect and static correction proof. It ran plain pg through the private owned
environment launcher against `platform_ci_fresh_verify_20261014_beb73055`,
with no installer, TypeScript graph, Vitest/native API or compiler execution.

A transient nonunique wrong-key index under the canonical name caused the
actual migration to refuse with P0001. The whole transaction rolled back;
the prior physical state matched exactly, without DROP or row mutation.
The actual canonical migration then applied and replayed twice. Both exact
ON CONFLICT statements planned, without ANALYZE, using the named arbiter.
The index OID and definition were identical after the two replays.

Existing row count/content digest, sequence state, constraints, trigger
definitions, RLS posture and every policy matched before/after. This fresh
database had **zero role-grant rows**; no historical-row coverage beyond that
empty preserved state is claimed. No SQL row DML, role grant, history deletion
or permission change was executed. The only committed change was the
canonical unique index from the actual migration.

Existing duplicate groups are zero. A manufactured duplicate-row negative
was not run because this lightweight slot explicitly prohibited row/grant
mutation. That control and actual authenticated grant/audit behavior remain
pending their own native fixture authorization. This is local QA proof;
the hosted CI database was not inspected.

Raw observations, exact unchanged source pins and bounded results are filed
alongside this README. Original /tmp outputs and all prior phases remain.
