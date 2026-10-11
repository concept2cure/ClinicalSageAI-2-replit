# design-system lens — weekly launch-catalog review, 2026-10-08

Head reviewed: `373c9af51`. Auditor run read-only. Every blocker, high and medium finding that is new or still open went to a separate verifier told to refute it; its verdict follows each finding. Low findings were not independently verified.

## Coverage, as the auditor reported it

Ran all seven gates in check mode at HEAD. Every gate passes. git status was clean afterward, so no baseline needed restoring. Gate output:
- ci:design-system: "OK — no icon-library, spring/bounce or inline <style> violations".
- ci:token-contrast: "131 pairs checked", 15 documented exceptions held. Last week it checked 67 pairs.
- ci:check-phantom-tokens: "9 phantom token(s) across 53 site(s) (baseline 9). OK". Delta 0.
- ci:check-chip-tones: "155 literal tone use(s), all 28 resolve". Last week it was 139.
- ci:token-cascade: "PASS — all 39 stylesheets resolve cleanly".
- ci:check-css-selector-shadowing: "42 stylesheets, 19 known shadowed selector(s), 0 new". The gate also says 2 baseline entries are no longer shadowed and should be deleted (finding DS-1).
- ci:check-orphaned-stylesheets: "46 imported / 0 orphaned (baseline 0)". Delta 0.

Re-verification of the 2026-09-28 open item, G2 (raw-hex module palette), which is fixed. TB_MOD in client/src/concept2cure/v2/fixtures/task-board-data.ts:90-110 now uses var(--module-*) tokens, with a header comment citing G2. token-contrast covers the module tokens as chip text. CL_MOD in fixtures/collab-data.ts:109 spreads TB_MOD, so the CollabLayer extension of G2 is closed as well. CollabLayer is still mounted at V2App.tsx:1275. I did not re-read the CL_MOD extra entries (Submission, Quality, Labeling and the rest) to confirm they are tokenized.

Sweep of aff7eae16..HEAD under client/src/concept2cure:
- No new raw hex colors. The only added-line matches are explanatory comments and one var(--text-300,#6b6963) fallback.
- No Tailwind arbitrary-value utilities were added.
- About 245 inline style={{ lines were added. The largest additions are in the Reporting surfaces: ComplianceReportResult (27), ComplianceReviewRecords (14), ComplianceReportsVerify (11), ComplianceReports (10). Part11Console adds 15 and DocumentDisposition 14. All reference tokens. Reporting has no dedicated stylesheet, which is advisory only. See DS-2.

Not covered:
- check-shell-css-collisions and ci:surface-text-ramp were not run, because they are outside the charge.
- I did not do a per-file dark-mode foreground/background audit of the new surfaces. I relied on ci:token-cascade and ci:token-contrast.
- I did not open the new Reporting surfaces to compare them against existing primitives for duplication.
- No finding in this report is a user-visible or record-integrity defect, so I did not map any to a launch row.

## Findings

### G2 — Raw-hex module palette (TB_MOD / CL_MOD) now tokenized

- **Status:** fixed-since-2026-09-28 · **Severity (auditor):** n/a · **App:** Authoring / all shell surfaces (TaskBoard, CollabLayer)
- **Where:** `client/src/concept2cure/v2/fixtures/task-board-data.ts:90-110; client/src/concept2cure/v2/fixtures/collab-data.ts:109`
- **What:** TB_MOD now maps to var(--module-*) tokens, with light and dark values held to AA by check-token-contrast. CL_MOD spreads TB_MOD. The previously open finding is closed.
- **Fix:** None.

### DS-1 — Shadowing baseline carries 2 stale entries

- **Status:** new · **Severity (auditor):** low · **App:** Shell CSS (gate hygiene)
- **Where:** `scripts/ci/check-css-selector-shadowing baseline: app-v2.css::.c2c-v2 .ana-composer and app-v2.css::.c2c-v2 .pj-convo-t`
- **What:** The gate passes with 0 new entries but prints that these two baseline entries are no longer shadowed. Stale entries would let a future regression on those selectors pass silently. There is no user-visible consequence today. Observed at HEAD in check mode.
- **Fix:** Delete the two baseline lines. This is a baseline edit, so I did not do it.

### DS-2 — Reporting surfaces add about 70 inline style objects with no dedicated stylesheet

- **Status:** new · **Severity (auditor):** low · **App:** Reporting & analytics
- **Where:** `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx; ComplianceReportsVerify.tsx; ComplianceReports.tsx; ComplianceReviewRecords.tsx`
- **What:** These files added about 27, 11, 10 and 14 inline style={{ }} objects since aff7eae16. All of them use var(--*) tokens and none uses raw hex or rgba, so no gate trips. Inline styles bypass the shadowing, orphan and cascade gates and cannot respond to dark-mode selectors. This adds to the standing v2 inline-style count and is a maintainability cost only. Advisory, not a gate failure.
- **Fix:** On the next touch, move the repeated style objects into a reporting stylesheet, such as styles/compliance-reports-v2.css, and let the cascade gates cover it.
