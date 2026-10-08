# Weekly periodic review: launch catalog, 2026-10-08

The weekly review that `docs/LAUNCH_DEFINITION_OF_DONE.md` (operating cadence) requires. The last full review was 2026-09-28, so this one was overdue by three days. It covers the seven launch apps: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents, and Reporting & analytics.

- **Head reviewed:** `373c9af51`. That is 2,206 commits after the previous review's `aff7eae16`.
- **Lenses:** the four the cadence names, invoked by name and read-only: `part11-ux-auditor`, `honest-state-auditor`, `design-system-auditor`, `security-auditor`. `a11y-auditor` and `microcopy-reviewer` were not run this week; the 2026-09-28 review ran them.
- **Charge:** first re-verify every finding each lens left open on 2026-09-28. Then sweep what changed since, with Reporting & analytics first (it joined the catalog on 2026-09-26 and has had one review).
- **Verification:** every blocker, high or medium finding that is new or still open went to a separate agent told to refute it, defaulting to refuted. Each report quotes that verdict. Low findings were not independently verified.
- **Run:** workflow `weekly-launch-review-2026-10-08`, 7 agents. The design-system lens ran its gates in check mode, all seven green; `git status` was clean afterwards.

## Verdicts

| ID | Lens | App | Verified | Owner | What |
|---|---|---|---|---|---|
| SEC-1008-1 | security | Submission Center | **confirmed, high** | → QA lane `…01DiJJAk` | `POST /api/mdx/gateways/:region/:gateway/transmit` sends to the agency with no signing-authority check; the e-signature row is written after the send |
| INF-05 | security | platform | confirmed, high | → D1 / W2 (infrastructure) | no detective controls in Terraform (GuardDuty, Config, Security Hub, flow logs, alarms, ALB access logs) |
| DP-05 | security | platform | confirmed, high | → D1 / W2 (infrastructure) | the API task holds the database owner credential beside every audit key |
| SEC-1008-2 | security | Authoring / filing outline | confirmed, **medium** (lowered: no client calls it) | → QA lane `…01DiJJAk` | `POST /api/c2c/documents/:id/lock` (and its twin `/api/c2c/actions/lock`) lets any member lock with a password: no role gate, no signing authority, no signature row |
| DP-49 | security | Projects / admin | confirmed, medium | → QA lane `…01DiJJAk` | creating a member writes no chained audit row |
| HS-1008-1 | honest state | Reporting | confirmed, medium | → QA lane `…01DiJJAk` | Insights reads "BX-204 is 100% ready" while the same figure carries a critical gap; the critical-blocker count is fetched and never shown |
| HS-1008-2 | honest state | Reporting | confirmed, medium | → QA lane `…01DiJJAk` | a project report prints "No gaps detected" beside blockers that list the readiness check's own critical gaps, and can be sealed so |
| P11-1 | Part 11 UX | Reporting (Report Governance) | partly confirmed, **low** | → whoever retires legacy report governance | seal, revoke and supersede take no role, re-authentication or ledger row; production refuses the whole namespace (`LAUNCH_SCOPE`), so it is latent |
| HS-1008-3 … -8, DS-1, DS-2, SEC-1008-3 … -5 | various | various | low, not verified | in the lens reports | |

**Fixed since 2026-09-28:**
- all three Part 11 UX items (Q-0928-1, -2, -3);
- all three security items (IAM-19, SEC-0928-1, SEC-0928-2) and the Reporting security fixes of 2026-10-01;
- the raw-hex module palette (G2).

## Why nothing was fixed in this lane

The lane claim (`docs/work-orders/README.md`) took fixes only in files outside another lane's live window. Every confirmed launch-code finding is in files the QA lane (`…01DiJJAk`) changed today:

| Finding | Files | Changed today by |
|---|---|---|
| SEC-1008-1 | `mdx-submission-gateway.ts`, `governed-transmit.ts` | `d5176f241` 10:59, `0e50993c5` 05:31 |
| SEC-1008-2 | `c2c/actions.ts`, which holds the signing-authority rule both lock doors share | `cf950eeb9` 05:27 (`documents.ts` itself last changed 10-04) |
| DP-49 | `tenant-users.ts` | `ddc8c0db5` 06:37 |
| HS-1008-1 / -2 | `Insights.tsx`, `render.ts`, `orchestrator.ts` | `4ac15bdd1` 06:41, `aac603a1b` 11:04 |

Fixing them here would put two sessions in the same code on the same day. That is the collision the board exists to prevent.

For SEC-1008-2 in particular: patching only `documents.ts` would leave its twin door open and split one policy across two files. The fix belongs in `SIGNATURE_COMMANDS` / `signingAuthorityRefusal` in `actions.ts`, the place that lane just extended.

The infrastructure items need the AWS account (D1).
