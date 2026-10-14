# Actual browser proof: accessible sources, citations and Vault context

Chromium used the actual development server on port 5000 with the existing private QA session for user 25 / organization 2. The named isolated programme is `Synthetic QA Source Access 20261014-014535` (`3a27db9b-c7de-4e93-8b34-ac4438fec36d`). Its files, source citation and relationship are explicitly synthetic QA records, not clinical evidence or approvals.

The browser read existing seeded records only. AnA remained manual. A guard refused any mutation API request, and **no write request or provider turn occurred**. No source code, database record, signature, export or preserved workflow fixture was changed. The previous workflow browser script was inspected for auth-storage conventions and never imported or executed.

| Verified UI behavior | Light 1440px | Dark 1440px | Mobile 390px |
| --- | --- | --- | --- |
| Project Home alpha source: 1 accessible section / 1 accessible document | Pass | Pass | Pass |
| Project Home beta source: No accessible citations | Pass | Pass | Pass |
| Library: 2 matches in projects the viewer can access | Pass | Pass | Pass |
| Actual References relationship to the synthetic beta version | Pass | Pass | Pass |
| Existing relationship history, with verified audit-chain verdict | Pass | Pass | Pass |
| Version usage: no submission placements available to this viewer | Pass | Pass | Pass |
| Source Tracer: 1 accessible section / 1 recorded citation, matching stored source identity | Pass | Pass | Pass |
| Four captured surfaces fit the viewport without horizontal overflow | Pass | Pass | Pass |
| Page errors / console errors / API failures / blocked writes / provider turns | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |

The actual sources response supplies `usageScope: accessible-citations`; the actual library response supplies `scope: verified-accessible-programs`; Source Tracer supplies `scope: verified-accessible-authoring-sections`. Each variant's bounded JSON summary retains those response facts and the displayed QA record context. The source records have pending text extraction, so the Data room correctly shows them as not processed and does not offer them as readable grounding; recorded citation usage and stored checksum identity are separate facts.

This is **positive proof against the real server**. It contains no synthetic response substitution. Missing/malformed scope, denied-read and private-counterpart behavior belong to the separately recorded client and backend regressions; these screenshots establish neither a global citation inventory nor an ACL-revocation result.

The historical seeded authored-document row displays the literal module value `null`. The root session traced this to the existing create-document writer stringifying an explicit null and is fixing that writer separately. This proof preserves the old row and includes its crop; no cosmetic client suppression or database rewrite was used. Capture followed the authorized server restart (launcher PID 106276), before any subsequent nullable-module create fix is loaded; the manifest records the branch head at capture, and the root session owns final source/restart mapping.

Each variant folder holds actual screenshots, its sanitized `summary.json` and the final browser log. `source-tracer-accessible-counts.png` shows the count statement; `source-tracer-recorded-citation.png` scrolls the same actual surface to the selected source detail. `manifest.json` records artifact sizes and SHA-256 values. The helper reads the private session from `/tmp/platform-browser-session.json`; the session and its credentials are not copied into this evidence.
