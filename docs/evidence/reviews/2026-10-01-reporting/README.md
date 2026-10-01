# Launch-catalog review: Reporting & analytics, 2026-10-01 (five lenses)

Reporting & analytics joined the launch catalog on 2026-09-26 by founder decision
(`shared/constants/launch-scope.ts`), and reached every organisation's rail in `beea5f91`. This is the
first review of it under the weekly cadence in `docs/LAUNCH_DEFINITION_OF_DONE.md`. It covers:

- the Insights canvas (`client/src/concept2cure/v2/surfaces/Insights.tsx`, `/api/insights-canvas`);
- Report-OS (`/api/report-os`, `/api/insights`, `server/services/report-os/**`);
- the audit and compliance reports (`ComplianceReports*.tsx`, `server/services/audit/compliance-reports/**`).

- **Workflow:** `wf_527b6067-e34`, 46 agents, all completed.
- **Head reviewed:** `concept2cure-v2` between about 06:00 and 07:50 UTC. The verifiers cite `08ed96a9`.
  The remediation below was landing at the same time, so some verdicts read "not real" because the defect
  was already fixed when the verifier looked. Each such case is marked.
- **Lenses:** provenance, honest state, Part 11 UX, security and tenant isolation, and design (design
  system, accessibility, microcopy). The reports are `provenance.md`, `honest-state.md`, `part11.md`,
  `security.md` and `design.md` in this directory. They were generated from the workflow's own output,
  each finding with the refuting verifier's reasoning.
- **Verification:** every blocker, high and medium went to a separate agent told to refute it. Lows were
  not independently verified.
- **Rows informed:** D2 (the Reporting app), D5 (governed path), D6 (audit). None turns green from this
  review alone.

## Result

| Lens | Findings | Sent to a verifier | Confirmed real | Not real at the head it read |
|---|---|---|---|---|
| provenance | 15 | 9 | 6 | 3 (the fixes below) |
| honest state | 16 | 11 | 11 | 0 |
| Part 11 UX | 15 | 10 | 7 | 3 (the fixes below) |
| security | 12 | 6 | 6 | 0 |
| design | 15 | 5 | 5 | 0 |

The lenses overlap: the readiness heuristic, the gaps verdict, the prediction types and L189 were each
found by two lenses. Counted once, the review found **three blockers** and **about nine distinct highs**.

## A note on finding numbers

The security lens gave its new findings provisional numbers: IAM-20, IAM-21, and DP-58 to DP-64. Each
of those numbers already names a different finding in `docs/security/SECURITY_AUDIT_2026-09-24.md`.
For example, the register's DP-63 is the open IRB/IACUC/IBC second-doors finding. This README cites
the lens's own headings instead: SECURITY-1 to SECURITY-12 in `security.md`, and the other lenses' report
sections.

Two commits pushed before this was noticed use the provisional numbers as finding ids:
- `40fecf04`'s "DP-64" means SECURITY-12 here, and its "IAM-21" means SECURITY-5.
- `48618e7d`'s "DP-63" means SECURITY-11 here, and its "DP-59" means SECURITY-7.

A few code comments and test names in the reporting and audit-trail files use them in the same sense.
None of them closes the register entry with the same number.

## Fixed, each test shown failing first

| Finding | Commit | What changed |
|---|---|---|
| Prediction types sealed `final`: `forbidFinal` and `requireDisclosure` were declared and enforced nowhere (blocker, provenance + Part 11) | `f6d2c089` | The truthfulness gate enforces both rules. An advisory type is never final, and is held at draft without its disclosure. |
| "No gaps detected" printed when no gap check ran, so `requireExplicitGaps` was vacuous (high, provenance + honest state) | `f6d2c089`, `68067377` | Three distinct sentences: the gaps found, "No gaps detected" after an evaluation, or "Gaps were not evaluated for this scope". |
| Readiness was a blocker count clamped to [25, 95], so an empty program read "25% ready" (high, provenance + honest state) | `798bb6ef` | Readiness is the evaluated readiness, or null, shown as "not computed". Averages are over computed values only. |
| `POST /api/report-os/correspondence/capture`: a second correspondence write door with no audit row and no role gate (blocker, Part 11; SECURITY-1 part) | `e14fa01d` | Removed. The canonical intake, `POST /api/regulatory-correspondence/correspondence/intake`, delivers the same outcome. |
| Only finalize was role-gated; a viewer could write every other reporting record (high, Part 11; SECURITY-1 part) | `e14fa01d` | `requireEditorAccessForWrites` is mounted on both reporting routers. The canvas shows a viewer "View only". |
| Finalize was a side effect of "Export report": no reason, no meaning, no re-authentication (blocker, Part 11; SECURITY-3) | `5540554e` | Finalize is an electronic signature through the platform's one ceremony (`services/part11/governed-signature-ceremony.ts`), and Export only reads. |
| Every canvas refusal read "Couldn't reach the report engine" (medium, honest state) | `5540554e` | Refusals are read off the thrown error. A plan refusal (`requiredTier`), a role refusal and a missing type each say what they are. |
| Prediction tiles ran the generic readiness run under a prediction's title (high, provenance + honest state) | `40fecf04` | A prediction is not a run: both generic doors refuse the family (`PREDICTION_NOT_A_RUN`). The canvas no longer offers it. |
| SECURITY-12: the prediction run read the readiness twin for a body program id | `40fecf04` | The forecast is refused before anything is read (`FORECAST_NOT_SCOPED`). The pre-mortem verifies its project and submission ids first. |
| SECURITY-5: the insights surface claimed all of `/api/report-os` and `/api/insights` | `40fecf04` | It claims only what its screens call. Production refuses the rest as unmapped. |
| L189: canvas reports ran over a program-group id that is really a project id (high) | `a112263e` | The canvas runs its reports over the project its opener names. |
| The canvas claimed every value was provenance-linked; the plan preview read as the organisation's plan; AnA in the first person (medium, design + honest state) | `686a1b88` | The copy says only what is true. A plan preview says it is one. |
| Lineage confidence counted AnA output (low) | `1c768e44` | Only a person's decisions count toward sealing. A recorded confidence names its basis. |
| The access review labelled SSO members' second factor "emailed_code"; retention showed today's documents under a past period (medium, compliance reports) | `cbed5f9d` | Each says what the platform cannot see. |
| SECURITY-2 and SECURITY-4, DP-18 second doors: `POST /api/part11/audit-trail`, `GET /api/mdx/audit`, `/api/mdx/search?type=audit` | `4f74b0f1` | The same recorder and reader gates as `/api/audit/*`. |
| Dark mode: the severity tag and status chips fell to 2–3.6:1 (medium, design) | `d66d1c66` | Status, severity and lock colours are theme tokens. |
| Sealed state not manifested; the seal could not be re-verified (high and medium, Part 11) | `5540554e`, `82450092`, `1f04bed7` | Finalize stores the sealed document beside its seal. `GET /runs/:id/seal` reads the act back and re-verifies it against the audit chain row, which must hold a chain position and a valid HMAC seal where the key is configured. The electronic signature must have signed the same seal hash. `GET /runs/:id/rendered` shows the verified sealed document, or refuses with 409. Three adversarial rounds: `fixes/seal-reverification/`. |
| PDF exports were not marked copies: silent truncation, no watermark below final, no seal or signer (medium, Part 11) | `ca360a24` | The whole report, paginated. A final run's PDF carries the signature, the reason and the seal verdict; any other run is marked NOT FINAL on every page. Every page carries the export id and time. `fixes/run-pdf/`. |
| The bundle PDF listed each report's status as of bundling, under "Generated:", and cut off silently at the page end (medium, Part 11) | this commit | `services/report-os/pdf/bundle-pdf.ts`: every report, paginated, with its status at export beside its bundled status, how many are final, "Bundled:" for the bundle's own time, and the export id on every page and on the chain row. The run and bundle PDFs share one writer (`pdf/writer.ts`). |
| SECURITY-6: an explicit `LAUNCH_SCOPE_ENFORCE=off` was honoured silently in production | `471e5a4c` | The deploy preflight refuses it, and so does a secret-sourced value. Production logs it once. `fixes/SECURITY-6-launch-scope-off/`. |
| SECURITY-7: subscriptions took their creator from the body; three writes stored an unchecked workspace id | `48618e7d`, `df7a6aeb` | The creator comes from the session. One ownership check (`services/report-os/ownership.ts`) guards all three writes. |
| SECURITY-8: the ledger and record history returned the raw chain break and `ok: true` over no rows | `0c83df59` | One `tenantChainVerdict` for every reader. Vault, the Part 11 console and the Audit trail render "not verified" as its own state. `fixes/SECURITY-8-ledger-chain-verdict/`. |
| SECURITY-9: the older audit export accepted organisation 0 and dropped its filter for a falsy id | `837c7eec` | The audit-trail routes refuse a non-positive organisation. The export refuses before any read, and its filters are unconditional. |
| SECURITY-10: a run committed before its chain row was tried | `2a0d3f33` | The run, the snapshot, the dependencies and the row are one transaction. |
| SECURITY-11: a failed batch audit insert returned the database's text | `48618e7d` | The response carries a fixed `insert_failed`. The detail goes to the server log. |
| Deliveries recorded "sent" with no audit row (P1-44) | `2fd87d3a` (another session) | Recorded on the chain. |

## Open

| Finding | Severity (verifier) | Note |
|---|---|---|
| Canvas: no retry after a load failure; the provenance hover and table are not keyboard- or screen-reader-complete | medium (design) | |
| `ci:server-error-leaks` does not follow text pushed into a response array (the SECURITY-11 shape) | gate | Wait for the gate selftest rebuild before teaching the gate. |
| The rest of the lows (explain_blockers on an empty list, a fabricated chart series, a future as-of date accepted, a signed export reading "intact" with an unlinked row) | low | Listed in each lens report. |

## What this review did not cover

Each lens report ends with its own list. In common across them:

- no browser or assistive-technology pass;
- no live delivery channel (email, SFTP);
- the legacy `report-engine` surface was noted (design, convergence advisory) but not reviewed.
