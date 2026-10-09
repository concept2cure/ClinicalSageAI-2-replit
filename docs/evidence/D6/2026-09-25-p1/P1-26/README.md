# P1-26 — the time source declared, one clock rule for audit timestamps (DP-25, Low)

**Row:** D4 (the validation master plan), moved from the D6 lane. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md`
DP-25. **Plan item:** P1-26.

## What was wrong

The audit trail was stamped by two clocks (the API task's for `audit_logs`, signatures and the tamper-proof log; the
database's for `audit_events`) and no document declared the time source either was disciplined by. 21 CFR 11.10(e)
asks for computer-generated, time-stamped audit trails; an inspector asks where the time comes from.

## What is true now

`docs/validation/VMP-001-VALIDATION-MASTER-PLAN.md` v0.2 §7a declares the source (Amazon Time Sync, through the
Fargate platform and RDS), states the rule (the writer generates the timestamp at the write, in UTC; never a client's
time; never altered), lists which clock each store uses, and records that the chained trail's order is `chain_seq`,
so a skew between clocks cannot reorder or fork it.

## Evidence

`writers.txt`: the four writers and the two client-recording routes read at this commit; a grep of them for a
body- or header-supplied time finds none. No code changed. The VMP's approval block remains the founder's.
