# Step 2 — no all-clear the product has not checked

Launch row **D2**, 2026-10-08. Step 2 of `docs/SURFACE_DECISIONS_2026-10-08.md`. Each item below is a launch screen stating a finding that nothing had assessed.

## What was wrong, and what changed

| Screen | It said | Why that was untrue | Now |
|---|---|---|---|
| Projects, every card | "✓ No open blockers" | The list query returns `blocker` as a literal NULL (`server/routes/c2c/projects.ts`). No blocker was ever looked for. | The card says nothing about blockers unless one came back. |
| Projects, summary | "Blocked: 0" | It counted `status === 'blocked'`. Programs are written active, and archived on close-out. Nothing writes blocked. | The figure is gone. AnA is told blockers are not assessed on this list. |
| Projects, summary | "Filing < 60 days: 0" | It matched `/days/` against a date printed as "Mon DD, YYYY", so it could never count anything. | The read carries `due_date` (YYYY-MM-DD). The figure counts programs whose target filing date falls within the next 60 days. |
| Projects, filter | Blocked · Complete | No program can have either status, so both always showed an empty list. | It offers the statuses the portfolio holds, and only when there are two or more. |
| Artifacts Center | the "E-signed (21 CFR Part 11)" shield | It showed whenever any signature existed. The server says which version the signature covers (`sigVersion`, `sigStale`), and the client dropped that. | The shield shows only when the signature covers the current version. Otherwise it says "Signed v2 only", or "Signed · version unknown", in words. The CSV and AnA's summary say the same. |
| Vault banner | "Works alongside Veeva Vault, SharePoint & OneDrive … import with approval" | No route imports from a connector into the Vault. The button only typed the request to AnA. | It offers what exists: AnA searches connected repositories, and importing is a later release. |
| Audit trail | "Export produces a signed PDF" | The export downloads a signed JSON bundle. | It says what downloads: data, manifest and an HMAC-SHA256 signature. |

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `projectsHonestCounts.test.tsx` (new) | 4 failed | 4 passed |
| `artifactsCenterStaleSignature.test.tsx` (new) | 3 failed | 3 passed |
| `projects-list.test.ts`: the read carries the date | 1 failed, 7 passed | 8 passed |
| Projects, Admin, Artifacts, Vault and audit suites, plus `server/routes/c2c` | — | 600 passed (80 files) |

`projectsPortfolioEmptyMean.test.tsx` asserted the Blocked figure (0 on an empty portfolio, 1 for a fixture row whose status nothing can write). It now asserts that the figure is absent, and says why.

## Not done here

Project-level blockers are not computed for the list. The deterministic readiness verdict is per submission sequence, in Submission Center. A per-project "needs attention" line belongs in the project workspace (decision record, step 6), not as a constant on a card.
