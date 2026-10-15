# D6 — Audit and compliance reports an organisation can run for its auditors and regulators

**Row:** D6 (security posture), with D5 (Part 11) content. **Lane:** `session_0194UQPxy9Er2ibRAjog8Ven`.
**Date:** 2026-09-30 to 2026-10-01 UTC, on `concept2cure-v2` after `a5baf5b0`.
**Asked by the founder (2026-09-26):** "work on security audit reports clients may ask for in an audit or if a
regulator asks for such reports … make sure … these reports are available for clients to run." The surface lives in
Reporting & analytics, which joined the launch catalog in the same change
(`docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/`).

## What exists now

A catalog of eight reports, run from **Reporting & analytics → Audit & compliance reports** (also reached from the
audit trail). Each is drawn by SQL from the organisation's own records, inside a read-only, tenant-stamped snapshot;
no figure or verdict comes from a model.

| Report | Period | Sections | Regulatory basis (as the report states it) |
|---|---|---|---|
| User access review | as of a date | Members; Privileged accounts | 21 CFR 11.10(d),(g); EU GMP Annex 11 §12; HIPAA 164.308(a)(4); SOC 2 CC6.2–CC6.3; POLICY-AC-002 §4a |
| Sign-in and session events | range | Events; Summary by event and outcome | 21 CFR 11.10(d),(e), 11.300(d); HIPAA 164.312(b),(d); Annex 11 §12 |
| Administrative and privileged changes | range | Changes | 21 CFR 11.10(d),(e),(g); SOC 2 CC6.2, CC8.1; Annex 11 §12 |
| Electronic signature register | range | Signatures | 21 CFR 11.50, 11.70, 11.100, 11.200; Annex 11 §14 |
| Audit trail integrity attestation | range | Audit stores; Integrity checks | 21 CFR 11.10(e); Annex 11 §9; PMDA ER/ES (authenticity) |
| Retention and legal holds | range | Policies in use; Holds in force; Dispositions | 21 CFR 11.10(c); Annex 11 §17; GDPR Art. 5(1)(e), 17(3); POLICY-DR-007 |
| Controlled document register | as of a date | Documents; Change controls | 21 CFR 11.10(k); 21 CFR 820 (QMSR, ISO 13485:2016 by reference); ISO 13485 §4.2.4; Annex 11 §10 |
| Full audit trail | range | Both audit stores | 21 CFR 11.10(b),(e); Annex 11 §9 — the existing signed export, not a second implementation |

**Who may run them:** organisation owners, admins and managers, and platform administrators — the same predicate as
the audit trail export (`server/services/audit/audit-api-authority.ts`). Every member sees the catalog, each report's
purpose and basis, and what the platform does not record.

**Every run is recorded and sealed.** The run is written to the organisation's audit chain (`compliance.report_run`,
with the export id, period, format and data hash) **before** anything is sent, through the canonical
`sendAuditedExport` (`server/services/audit/audited-export.ts`); when that row cannot be written the answer is 503 and
nothing leaves. The package is sealed with HMAC-SHA256 under the audit export key (key id in the manifest), by the one
signer the signed audit export uses (`sealManifestV2`, `server/services/audit/signedAuditExport.ts`).

**How it is verified.** A signed-in member sends `{ data, manifest, signature }` to the platform's verification
endpoint, or uses **Verify a saved report** on the surface (a JSON bundle, or a CSV with its `.manifest.json`). The
seal is the platform's tamper evidence under a platform-held key: it is not an electronic signature, and an inspector
verifies through the organisation. A seal an inspector verifies offline with a published key is DP-11's open half.

**Honest by construction.** Each report lists what the platform does not record (for example: a member's role change
and removal, session idle ends, tenant configuration changes). Only the integrity attestation verifies the audit
chain; the other reports say they do not. A check that ran over no rows is "not verified", never "intact".

Server: `server/services/audit/compliance-reports/**`, `server/routes/audit-compliance-reports.ts`
(`server/README.md` here). Client: `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx` and
its four siblings (`client/README.md` here).

## Evidence

| Part | Folder | Red | Green |
|---|---|---|---|
| Server, round 0 | `server/` | unit and route files absent; dbtest red three ways (route absent; vault binding removed → silently empty; send without recording → no chain row) | 134 unit/route tests; dbtest 16/16 as `app_service` with `RLS_ENFORCE=on`, organisation B's identifiers absent from every report of organisation A |
| Server, review round 1 | `server/review-1/` | 26 of 112 unit/route and 12 of 16 dbtest cases | 199 tests in 19 files; dbtest 16/16 |
| Client, round 0 | `client/` | 20 of 20 against a stub | 21/21; every-surface suites |
| Client, review round 1 | `client/review-round-1/` | 27 of 43 | 43/43; every-surface suites 514/514 (the `pending/` outputs predate the registry row and are resolved) |

## Reviews

Three read-only lenses reviewed the uncommitted change (security-auditor; honest-state-auditor; part11-ux-auditor).
Security: **holds with residuals** — tenant boundary, role gate, record-before-send, key handling, injection and 5xx
bodies held. Honest state: **not honest enough yet**. Part 11 UX: **server sound, screen not ready**. Every must-fix
was answered in review round 1 (server, client and Report-OS helpers, red then green) except where marked open.

| Finding | Disposition |
|---|---|
| "intact" over zero chained rows (DP-45; honest M1) — also in the signed export and the other audited exports | **Fixed at the source** (`walkTenantChain`, `auditLogsChainVerdict`, the integrity report); the client never shows 0 rows as verified |
| Headline verdict covered one store and read as all (honest M2; Part 11 M3) | **Fixed**: only the integrity attestation checks the chain and its headline is derived from every check; the others say they do not check; the full trail shows one line per store |
| Whole-chain walk on every run, no throttle (DP-46) | **Fixed**: only the integrity attestation walks; one run at a time per organisation (429); 12 runs a minute per person. Residual: the event-chain linkage count still reads rows in the application (a follow-up in `snapshotChainIntegrity`) |
| Report finalize newly reachable without a role gate, overwrite or atomic record (DP-47) | **Fixed** (`docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/report-os/review-1/`) |
| "Independent verification" overclaimed (DP-48; Part 11 M5) | **Fixed**: wording, seal panel, Verify control, instruction names the endpoint and body |
| As-of reports showed today's roles and status as of a past date (DP-51; honest M3; Part 11 M9.1) | **Fixed by disclosure**: notes, not-recorded lines and the result header say so; a past role cannot be reported while role changes go unrecorded (DP-49) |
| Settings "not recorded" line wrong in both directions (honest M4) | **Fixed**: exact for each route |
| Canvas showed "No program readiness yet" for a failed read (DP-56; honest M5) | **Fixed**: 503 `PORTFOLIO_UNAVAILABLE`, rendered as an error with a path to the reports |
| Malformed section rendered as empty (honest M6) | **Fixed**: "This section could not be read." |
| CSV is a second run; footnote overclaimed (honest M7; Part 11 M6) | **Fixed**: note names the second run's export id; footnote corrected |
| CSV without context (DP-52) | **Fixed**: a `#` header block with period, verdict, row counts, notes and the not-recorded list |
| Signature meaning fell back to the type (Part 11 M2a) | **Fixed**: meaning as stored; purpose and signed version as columns |
| Controlled-document register showed revoked signatures as current (Part 11 M4, M11) | **Fixed**: the latest standing signature, its signer and meaning, revoked count, supersession, every change control by the date |
| Timestamps without a stated zone (Part 11 M8) | **Fixed**: UTC text built in SQL; assumption for unzoned columns stated in the notes |
| Full trail actor blank for ledger rows (Part 11 M7) | **UI fixed** (User id column). Open: name actors in the signed export itself |
| Usable-organisation guard (security residual) | **Fixed** |
| 21 CFR 820.40 cited after the QMSR replaced it (Part 11 A6) | **Fixed** |
| Member role change and removal write no audit row (DP-49; Part 11 M1) | **Open** — `server/routes/tenant-users.ts`, inside another lane's window until 2026-10-01 23:49 UTC; plan P1-41 |
| Tenant configuration writes (MFA requirement, session timeout, IP restrictions, audit retention) write no audit row (DP-57) | **Open** — plan P1-41 |
| `POST /api/esignature/sign` accepts a signature with no meaning (DP-55; Part 11 M2b) | **Open** — plan P1-42 |
| AnA `audit.explain` has no minimum role (DP-53, latent) | **Open** — plan P1-42 |
| Deliveries report "sent" whatever the correspondence write did (DP-50, second half) | **Open** — plan P1-44 |
| No governed record of an access review's decisions and sign-off (Part 11 M9) | **Founder decision** — a new capability under Rule 2; plan P1-43. The report says it is not the review record |
| `generatedBy` is the display name; no `Cache-Control: no-store`; retention dispositions cast defeats an index; report definitions written without an audit row; members can read the not-recorded lists | Residuals, recorded here |

The reviewers' full reports are summarised above; the verdicts and every must-fix item are reproduced in this table
with their disposition.
