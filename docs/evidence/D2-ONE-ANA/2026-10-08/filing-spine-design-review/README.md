# The filing spine's design review, and its fixes

Launch row **D2**. This is Phase 7 of the design flow (`.claude/skills/design-review`) run over the filing-spine UI this session built on 2026-10-08:

| Slice | What | Commit |
|---|---|---|
| F2 | Project home's five tabs | `113056e4` |
| F16 | No dead ends | `77d95ef2` |
| F17 | Placement states the copy's status | `e796ae9c` |
| F19 | Each market's support | `a3dd2889` |
| F20 | New submission from the project | `97ab887d` |
| F21 | The Cross-region verdict retired | `afca3546` |

The review itself is `.design/filing-spine/DESIGN_REVIEW.md`. It covers:
- every finding, by lens;
- what was fixed;
- where the lenses disagreed;
- what is open, and why.

The screenshots are in `.design/filing-spine/screenshots/` (before) and `.design/filing-spine/screenshots/after/`. They were taken in Chromium against the local server after `deploy-migrate`.

## How it ran

- **Seven read-only agents, in parallel, with the same scope and brief:**
  - `design-reviewer`;
  - `a11y-auditor`;
  - `part11-ux-auditor`;
  - `microcopy-reviewer`;
  - `motion-auditor`;
  - `design-system-auditor`;
  - `honest-state-auditor`, because F19 and F20 are about a failed read versus an empty one.
- **Screenshots were not delegated.** One browser session took them, as the skill requires.
- **Findings were checked against the code before acting.** Where two lenses disagreed, the code decided, and the review says which way and why.

## What was wrong

**Claims the screen made that were not true:**
- A 510(k) was told it gets an FDA eCTD build ("Structured Module 1. Transmit not proven…", buildable).
- "Refused at creation" was said of markets nothing refuses: the submission row exists.
- "Filed as approved: this document carries its approval signature" was shown before anything was filed, from the status as loaded.
- A re-placement's ledger row could not show draft → approved. The text and pin were unchanged, so `documentChanged:false`, and it reused the first placement's reason from a locked field.
- Every IND preselected Biotech.
- "No project conversations yet" was shown when the server lists only the reader's own conversations.
- An empty rule-pack read was shown as "No outline" on every market.
- The Vault header read "IND · 21 CFR 312" on an NDA project.
- "Not offered. Not offered: …" repeated itself.
- "Assemble eCTD, validate & transmit" overclaimed the Submit stage.

**Defects of form:**
- Two exits rendered as grey text (bare `.btn`).
- A `role="tablist"` with no tabs in it.
- The start box was squashed to about 225px by a dead `.pj-convo` row rule.
- The New submission placeholder moved the page twice, unannounced.
- The drawer notice was an alert competing with the dialog name, and it flipped the half fields' gap.

## Red, then green

Each fix has a test that fails on the code before it. Every red run below was taken with the fix stashed and the new test in place (`red/`):

| File | Fails before the fix | What it holds |
|---|---|---|
| `start-box-css-red.txt` | 1 of 4 | One `.pj-convo` rule, and it does not centre the composer. |
| `client-type-red.txt` | 2 of 11 | A project opened from a link takes its client type from the record; an IVD product is an IVD client. |
| `market-support-red.txt` | 4 of 20 | No refusal is claimed for an unmapped market. No line names a rule pack, an adapter or a signature format. |
| `market-line-red.txt` | 4 of 6 | A line that opens with its summary is shown once. Row errors are a status, not an alert. Retry names its market. |
| `replace-red.txt` | 5 of 8 | Re-place states its effect, needs its own reason, is a primary button and sends the new reason. The copy-status line is a forecast. |
| `leaf-status-red.txt` | 1 of 10 | `LEAF_CREATED` and `LEAF_UPDATED` record the copy's `documentStatus`: draft, then approved. |
| `stage-nav-red.txt` | 2 of 13 | The lifecycle strip is a nav, with `aria-current="step"` on the open stage. |
| `drawer-red.txt` | 7 of 14 | The drawer opens at once while it reads, and the notice is a status that describes the dialog. Defaulted fields say where they came from. The product type decides the client type. |
| `market-support-honest-red.txt` | 13 of 29 | Device filings claim no eCTD build. A DMF has the ICH Module 3 outline. An empty pack read fails. |
| `conversations-red.txt` | 1 of 6 | "You have no conversations on this project yet.", in one line. A reply without `threads` is a failed read. |
| `no-dead-ends-red.txt` | 2 of 7 | The device-filings empty state does not send the reader to the locked 510(k) surface. "Go to Projects". |
| `gate-exit-button-red.txt` | 1 of 7 | "Back to Projects" is a styled button. |
| `canvas-callers-red.txt` | 1 of 9 | Every caller of Place into filing passes `docStatus` and `sectionCodes`. The canvas did not. |
| `vault-spine-label-red.txt` | 3 of 3 | The Vault header names the project's own filing type. These fail as "not a function": the label moved from the route into `vault-taxonomy.ts`, where the test can reach it. |

Two existing tests were amended in place, each with a dated note saying what changed and why:
- `market-support.test.ts`: the unmapped-market case;
- `placeIntoFilingApprovalState.test.tsx`: the copy-status forecasts.

`projectHomeReviewWork.test.tsx` gained a `threads` reply in its mock. A reply without one is now a failed read, which is the point of the guard.

## Runs

Results are in `green/`:
- `green/vitest.txt`: every test file behind a red run above, on the final tree. **101 passed** (11 files).
- `green/client-full-summary.txt`: `client/src/concept2cure/v2`, `tests/ui` and `shared`. **5642 passed, 0 failed** (528 files).
  - Two edits landed after that run began: the copy-status style's empty-string check, and the Submission Center lead line without an article.
  - Their test files were re-run on the final tree: **102 passed**.
- `green/server-summary.txt`: `server/services/{regulatory,submission-service,ana,c2c,vault}`, `server/routes/__tests__`, `server/routes/c2c` and `tests/services/regulatory`.
  - 744 files and **9637 tests passed, 0 failed**, then the run's own timeout stopped it.
  - The 196 files it had not reached ran next: **1300 passed, 0 failed** (2 files and 10 tests skipped, as on trunk).
- `green/tsc.txt`: `npm run typecheck` (the repo's 24 GB heap; at 6 GB tsc runs out of memory on this project, as `package.json` records). **0 errors.**

**Gates, all green on the final tree:**
- `ci:design-system`
- `ci:check-phantom-tokens`
- `ci:token-cascade`
- `check:microcopy`
- `ci:internals-in-copy`
- `ci:action-overclaim`
- `ci:launch-scope`
- `ci:launch-scope-api`
- `ci:surface-discoverability`
- `ci:canvas-path`
- `ci:check-css-selector-shadowing`
- `ci:undefined-css-classes`
- `ci:surface-text-ramp`
- `ci:check-shell-css-collisions`
- `ci:token-contrast`

**Lint:** every changed file is at or below its HEAD warning count.
- `DocumentCanvas.tsx` went 2 → 3 on a first pass (file length). It is back at 2.
- The pglite test went 0 → 1 (a `describe` over 100 lines). It is back at 0.

## Open

The review's "Open" section lists what was not fixed here, with the reason for each.

The two to raise with the founder are both pre-existing:
- **The copy write.** `POST /api/coauthor/documents`, the write that changes a filing copy under every leaf that points at it, takes no reason and checks no role (`server/routes/coauthor.ts:166`, `authMiddleware` only).
- **A model verdict.** The Validation tab's "Explain" panel prints a model's `blocking` flag as "Blocking." with no model label. That is a Rule 2 defect of the class F21 retired.
