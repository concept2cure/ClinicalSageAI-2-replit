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

## Fixed, each test shown failing first

| Finding | Commit | What changed |
|---|---|---|
| Prediction types sealed `final`: `forbidFinal` and `requireDisclosure` were declared and enforced nowhere (blocker, provenance + Part 11) | `f6d2c089` | The truthfulness gate enforces both rules. An advisory type is never final, and is held at draft without its disclosure. |
| "No gaps detected" printed when no gap check ran, so `requireExplicitGaps` was vacuous (high, provenance + honest state) | `f6d2c089`, `68067377` | Three distinct sentences: the gaps found, "No gaps detected" after an evaluation, or "Gaps were not evaluated for this scope". |
| Readiness was a blocker count clamped to [25, 95], so an empty program read "25% ready" (high, provenance + honest state) | `798bb6ef` | Readiness is the evaluated readiness, or null, shown as "not computed". Averages are over computed values only. |
| `POST /api/report-os/correspondence/capture`: a second correspondence write door with no audit row and no role gate (blocker, Part 11; IAM-20 part) | `e14fa01d` | Removed. The canonical intake, `POST /api/regulatory-correspondence/correspondence/intake`, delivers the same outcome. |
| Only finalize was role-gated; a viewer could write every other reporting record (high, Part 11; IAM-20 part) | `e14fa01d` | `requireEditorAccessForWrites` is mounted on both reporting routers. The canvas shows a viewer "View only". |
| Finalize was a side effect of "Export report": no reason, no meaning, no re-authentication (blocker, Part 11; DP-58) | `5540554e` | Finalize is an electronic signature through the platform's one ceremony (`services/part11/governed-signature-ceremony.ts`), and Export only reads. |
| Every canvas refusal read "Couldn't reach the report engine" (medium, honest state) | `5540554e` | Refusals are read off the thrown error. A plan refusal (`requiredTier`), a role refusal and a missing type each say what they are. |
| Sealed state not manifested (high, Part 11) | `5540554e`, **partial** | The canvas shows who signed, as what, when, and the seal, immediately after finalizing. Not yet shown after a reload or in the PDF: see open items. |

## Open, in the order they will be worked

| Finding | Severity (verifier) | Note |
|---|---|---|
| L189: canvas reports run over a program-group id that is really a project id; 14 of 28 standard-pack tiles are refused | high | `report-os.ts` around 1486. |
| Canvas "Predictive Regulatory Forecast" and "CRL/RTF Pre-Mortem" run the generic readiness run under a prediction title | high | Route to `POST /api/insights/predictions/run`, or remove the intents and the plan-lock copy. |
| Seal not re-verifiable: the sealed document is not stored, nothing reads the stored seal | medium | Store it, add a verify read, and bind the signature to the seal hash (`deriveGovernedTargetBinding` has no `report-run` case yet; it records the ledger basis, honestly). |
| PDF exports are not marked copies: no watermark below final, silent truncation | medium | |
| The canvas says every value is provenance-linked; the generic renderer attaches none and seals record 0 atoms | medium | Copy now, provenance after. |
| The plan override produces false portfolio text; the preview is shown as the organisation's plan | medium | |
| The access review labels SSO members' second factor "emailed_code" | medium | Compliance reports. |
| "Retention policies in use" shows today's documents under a past period | medium | Compliance reports. |
| DP-18 second door: `POST /api/part11/audit-trail` lets any member write `regulatory_significant` audit events | medium | Security. |
| Dark mode: the severity tag and status chips fall to 2–3.6:1 | medium | Design. |
| The reporting pane still speaks as AnA in the first person in places | medium | Design. |
| Deliveries record "sent" with no audit row (P1-44); bundles, program groups and snapshots unaudited; subscriptions take their creator from the body (DP-59) | low (verifier) | |
| DP-64: `POST /api/insights/predictions/run` passes a body program id to the readiness twin with no organisation predicate | low, unverified | To be checked for cross-tenant reach before anything else at this severity. |
| Lineage confidence counts AnA output | low (verifier) | |
| The rest of the lows | low | Listed in each lens report. |

## What this review did not cover

Each lens report ends with its own list. In common across them:

- no browser or assistive-technology pass;
- no live delivery channel (email, SFTP);
- the legacy `report-engine` surface was noted (design, convergence advisory) but not reviewed.
