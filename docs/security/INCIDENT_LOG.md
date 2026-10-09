# Incident log

Opened 2026-09-26 under POLICY-IR-004 §3 (an incident record is opened at triage) and §4 (the log). One entry per
security incident as §1 defines it, in the order opened. Nothing is deleted from this file: a closed entry is marked
closed. The entry is the record an inspector or a tenant asks for; the issue tagged `incident` holds the working
timeline.

**No incidents recorded to date.**

## Entry format

| Field | What goes here |
|---|---|
| Id | `INC-<yyyy>-<nnn>` |
| Detected | date and time (UTC) and how (which control of IR-004 §2, or who reported it) |
| Severity | S1–S4 per IR-004 §1, and any reclassification with its reason |
| Summary | what happened, in one paragraph, without speculation |
| Tenants affected | by organisation id; "none" when no tenant data was involved |
| Data affected | categories and approximate numbers of data subjects and records; whether PHI, GDPR personal data or APPI sensitive personal information was involved |
| Notifications | one line per notification made under IR-004 §3a: to whom, when (UTC), what was sent; and, for a tenant, the tenant's own reports as they inform us of them |
| Containment | what was rotated, disabled, snapshotted, and when |
| Root cause | the finding, with the file, configuration or process at fault |
| Corrective actions | the changes landed under POLICY-CM-003, each with the test that would have caught the incident |
| Closed | date, and the post-incident review reference (≤ 10 business days after containment) |

## Entries

_None._
