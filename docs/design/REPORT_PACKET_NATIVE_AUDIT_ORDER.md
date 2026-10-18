# Native report packet audit ordering

The published `baffbeac2` native artifact from run 38535578465 failed the
contention case's second-export assertion. Its helper orders audit rows by
`id`, which is a UUID. UUID ordering does not describe when the exports landed
on the tenant's retained chain; the assertion can select the earlier packet
as the later one even when finalization and both exports succeeded.

Order this fixture's retained export rows by the actual `chain_seq`, and
select that value so the contention control explicitly verifies increasing
chain order. Preserve every status, seal, lock, scope, PDF and audit assertion.
Do not modify production behavior or any retained audit row. The original
hosted failure remains a distinct evidence phase; a current real PostgreSQL
replay is required before describing this correction as verified.
