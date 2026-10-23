# Native recorded-identity locking proof

The existing isolated PostgreSQL fixture container was restarted on loopback
port 55439. Each Vitest run creates and drops its own synthetic schema. No live
application or agency is contacted. The test imports the canonical identity
locks and governed binder; it uses the existing shared database fixture DDL.
The public-only applicant migration is represented by its column in the isolated
schema; this is a locking test, not migration qualification.

`red-organization-lock.txt` records an initial harness failure (the actual
migration targets public, leaving the disposable schema without its column).
After correcting that fixture, `red-organization-lock-corrected-fixture.txt`
records one intended failure and three passes: the organization rename succeeded
while captured identity locks were held. `green-organization-lock.txt` records
four passes after the organization-first lock extension. The tests observe real
PostgreSQL lock timeouts for same-tenant organization name, market number,
program facts and sponsor edits, allow unrelated tenant work, and show a later
number edit moves the digest without changing the earlier captured object.

The exact native replay/source hashes and existing real freeze/leaf serialization
cohort are indexed by the root verification packet. Human witnessing and live
signature ceremony/transmission are unexecuted here.
