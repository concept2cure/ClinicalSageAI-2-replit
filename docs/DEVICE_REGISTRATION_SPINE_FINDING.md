# Device registrations: the platform has two product spines, and neither models a device registration

**Status:** finding, not a fix. The change this implies is a schema change and
belongs in its own PR (it trips the Part 11 review gate in the PR template).

**Date:** 2026-07-26

## Why this note exists

The platform review lists global registrations as the clearest area where the
closest competitor is ahead, and asks for a "canonical device product record"
carrying registrations, certificates, UDI, renewal dates and selling status.

Before building that, I checked what already exists — twice in this same review
a rich backend turned out to be present and simply unconsumed (`/api/capa-mdr`,
the IVDR performance service). Registrations are not that case. The relevant
tables exist, but they cannot represent a device registration, and connecting
them would produce something confidently wrong rather than incomplete.

## What is actually there

```
rim_products ──< rim_registrations
             └─< rim_labels
```

`rim_registrations` (`shared/schema/rim.ts`) is a reasonable registration core:

| Column | Purpose |
| --- | --- |
| `country` | ISO 3166-1 alpha-2, or a region code like `EU` |
| `market_status` | commercial selling status |
| `registration_number` | the approval/licence number |
| `marketing_auth_holder` | MAH |
| `approval_date`, `renewal_due_date` | lifecycle dates |

A `Registrations` surface consumes it — but in the **v2** shell
(`client/src/concept2cure/v2/surfaces/Registrations.tsx`), not in the MDX device
shell.

## The two problems

### 1. `rim_products` is a pharmaceutical model

Its identifying fields are `inn`, `dosage_form`, `atc_code` — International
Nonproprietary Name, dosage form, ATC classification.

A medical device has none of these. Registering a device on this table would
mean leaving the columns that identify the product empty, and would have nowhere
to put the fields that actually identify a device registration:

- UDI-DI and issuing agency
- device class and, for IVDs, IVDR class + Annex VIII rule
- notified body identifier and certificate number/expiry
- EU authorised representative, and per-market local representative
- the specific models/configurations covered by the registration
- conditions attached to the approval

### 2. There is no link between the two spines

`rim_products` has **no** `program_id` column and no reference to
`regulatory_programs`. They are also different id spaces — `rim_products.id` is
`serial`, `regulatory_programs.id` is `uuid`.

So the platform has two disjoint notions of "the product":

| | MDX device shell | RIM |
| --- | --- | --- |
| Spine | `regulatory_programs` (uuid) | `rim_products` (serial) |
| Domain | device / IVD programmes | pharmaceutical products |
| Carries registrations | no | yes |
| Carries UDI | `udi_records.program_id` | no |

This is the review's "no clearly canonical product identity" finding in its
concrete form: the identity is not missing, it is **duplicated**, and the half
that owns registrations is the half that cannot describe a device.

## What this rules out

Wiring an MDX registrations panel onto `rim_registrations` as it stands. It
would show a country, a number and a renewal date with no way to say which
device configuration, which certificate, or which notified body they belong to —
and no way to trace back to the programme that produced the submission. That is
the failure mode this review has been removing everywhere else: a surface that
looks authoritative and cannot support the claim.

## Options, in preference order

1. **Extend the RIM spine to cover devices.** Add device identity to
   `rim_products` (or a `rim_device_products` sibling), add the device-specific
   registration fields above to `rim_registrations`, and add a nullable
   `program_id uuid` linking a RIM product to the `regulatory_programs` record
   that produced it. Keeps one registration lifecycle for both domains.

2. **A device-specific registration table** keyed on `regulatory_programs.id`,
   left disjoint from RIM. Faster and lower-risk in isolation; guarantees two
   registration lifecycles to reconcile later.

3. **Do nothing yet** and keep registrations out of the MDX shell, rather than
   showing a partial view that reads as complete.

Option 1 is the one that matches what the review is asking for. It is a
migration plus a backfill decision (which existing `rim_products` rows, if any,
are devices), so it wants its own PR, its own review, and the security checklist
the PR template requires for schema changes.

## Related

- `migrations/20260508_ivd_diagnostic_surfaces.sql`, `001_create_ivdr_tables.sql`
  and `20260524_ivdr_cdx.sql` each declare `CREATE TABLE IF NOT EXISTS
  ivdr_classifications` with **incompatible** shapes. Whichever migration runs
  first wins and the others silently no-op. It is currently benign because
  `20260524` reconciles idempotently with `ADD COLUMN IF NOT EXISTS`, but a
  deployment that skipped `001` would break the IVDR read routes. Same class of
  defect as the one the data-room review found on `file_uploads`.
