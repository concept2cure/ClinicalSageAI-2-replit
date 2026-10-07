# Adoption audit fixture verification

W3/D4; contract and observed failure: [AUDIT-FIXTURE-PLAN.md](AUDIT-FIXTURE-PLAN.md).

After adding the four missing nullable columns, the unchanged
`ci:audit-logs-fixture` guard passed: 21 fixtures checked against all 17
canonical audit-writer columns. The actual SQL adoption suite also passed:
14 tests / 1 file, exit 0, 8.07 seconds.

No gate, production code, baseline, or audit seam was bypassed or changed.
The adoption suite still exercises actual eligibility SQL and rollback while
filesystem bytes, source persistence and HMAC sealing remain explicit seams.
