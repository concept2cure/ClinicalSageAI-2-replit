# F19: each market states what the platform can carry

Launch row **D2**. Slice F19 of `docs/design/FILING_SPINE.md` §7.2 and §3 ("What is real today, per region", "How the UI says so"). Claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`. The read-only map was made by a research subagent; it is summarised in the commit.

## What was wrong

- **Four sources, none read together.** What the platform can do for a market was decided in four places that never met:
  - the rule pack;
  - the regional backbone;
  - the region profile;
  - the channel, with its adapter's refusal.
- **The resolver called EMA and PMDA buildable.** `submission-resolver.ts:237` set `buildSupported = AGENCY_MODULE1[agency] != null`. That asks whether a backbone file *name* exists, so EMA and PMDA read "buildable" while their Module 1 leaves are filed flat (`regional-backbone-readiness.ts` `FLAT_MODULE1_GAP`).
- **The resolver called PMDA submittable.** It read "submit-supported" although its adapter refuses every transmit (`pmda-gateway.ts`).
- **Health Canada read submittable everywhere.** The channel code called Health Canada `submittable`, although its adapter posts to an endpoint written from no agency source.
- **Nothing on screen said what a market cannot do.** Not the project's submission rows, and not the New project wizard.

## What changed

### Server

- **`server/services/regulatory/market-support.ts` (new).** `marketSupport({applicationType, market}, packs, asOf)` composes one statement from deterministic sources only. No model writes any part of it.
  - **Outline:** the agency's own active rule pack, never a neighbour's. It is unmapped when `document-class.ts` maps no agency. MHRA "IND" is not offered (the UK has no IND).
  - **Module 1:** `module1ShapeOf(region)` (new, `regional-backbone-readiness.ts`), from the same three sets the backbone classification reads. Its values are `structured`, `flat` and `placeholder`.
  - **Region profile:** `getSubmissionRegionProfile`.
  - **Channel:** `submissionChannelFor`, judged against the adapters' refusals in `channelSupportFor`.
    - FDA ESG: wired, not proven.
    - PMDA: refused.
    - EMA centralised: applicant uploads.
    - CTA: CTIS portal only.
    - Health Canada and the generic adapters: no channel, because each adapter was written from no agency source.
    - `submissionChannelFor` itself is unchanged. Its tests still pin `CA_NDS` as registry-submittable, and the judgement sits on top of it.
  - **PMDA new applications:** "New applications blocked: eCTD v4.0 required" is dated by the same currency fact the readiness finding reads (`pmdaEctdV4Fact`, now exported from `dispatch-readiness.ts`).
  - **Result shape:** `summary` (e.g. "Flat Module 1, no channel"), `line` (the "Market row says" sentence), `buildable` and `offered`.
- **`readMarketSupport(client, inputs, asOf)`** reads the active packs once (`listActiveRulePacks`).
- **`server/services/c2c/rule-pack-lookup.ts` (new).** The one "active rule pack" rule: not superseded, latest first. The scaffolder now looks up through it (`findActiveRulePack`), so the scaffolder and the market line cannot disagree about which pack is live.
- **`server/services/submission-gateways/transport-refusals.ts` (new).** The refusal sentences: PMDA's (moved from `pmda-gateway.ts`, which imports it), the FDA ESG gap, and the unsourced-adapter sentence. They live in one place, so a transmit refusal and a market line are the same text.
- **`server/routes/submissions.ts`: `GET /api/submissions/market-support?applicationType=&market=`.** Without `market`, it returns all 12 regions the platform names. A failed pack read is a failure, never a market with no outline. The route sits under `/api/submissions`, a prefix the launch scope already claims (`ci:launch-scope-api` green).
- **`submission-resolver.ts`:**
  - `buildSupported` is now "Module 1 built to the agency's own headings".
  - A refused adapter is not submit-supported.
  - Both read `market-support.ts`.
  - Its notes say why, for example "Build not region-correct for EMA: Module 1 leaves are filed flat …" and "Not sent: PMDA's electronic submission channel …".
- **`AnaToolExecutor.ts` `resolve_submission_plan`:**
  - The instruction no longer tells AnA "the build and submit stacks for FDA/EMA/PMDA already exist".
  - It tells AnA to read the plan's support verbatim and not to call a region buildable or submittable where the plan says it is not.

### Client

- **`MarketSupportLine.tsx` (new).** The server's statement in the server's words.
  - A pending read claims nothing.
  - A failed read says so (`role="alert"`) and offers Retry.
  - `useMarketSupport` will serve F20's region options too.
- **`surfaces/ProjectHome.tsx`.** Each submission row on the Submit tab shows its market's line.
- **`surfaces/Projects.tsx`.** The New project wizard's Configure step shows the line for the chosen filing type's market, i.e. the program type and agency the project will be created with.

### Tests

| File | Cases |
|---|---|
| `server/services/regulatory/__tests__/market-support.test.ts` (new) | The design's table:<br>• `('maa','EMA')` gives Flat Module 1, no channel<br>• `('nda','FDA')` gives Structured Module 1<br>• `('nds','Health_Canada')` gives No outline, no channel<br>• `('nda','ANVISA')` gives Unmapped<br>Also: every alias of a market; FDA, EMA MAA, EMA CTA, PMDA, Health Canada, NMPA/MFDS/TGA, MHRA, the unmapped agencies; no borrowed pack; one pack read; and the resolver agreeing. |
| `server/routes/__tests__/submissions-market-support.test.ts` (new) | 12 regions, one pack read; one market; a missing application type is refused; a failed read is a 5xx with no markets. |
| `client/…/__tests__/marketSupportLine.test.tsx` (new) | The rows show the server's line; a failed read says so and retries; pending says nothing; no doubled text. |
| `tests/services/regulatory/submission-resolver.test.ts` | Amended with a dated note, as on 2026-10-05. It pinned EU and JP as region-correct and JP as submit-supported. Both were wrong answers. Only US is fully covered (4/12). |

### Not done here

- **The New project picker's 234 entries** get the line on the chosen filing, not as a chip on every entry. A per-entry tier would need either 234 statements on the picker, or the client's `programTypeFor` mapping moved to the server. That is a follow-up, not in this commit.
- **Market rows grouped one per market** (one verdict per market) are F9's (claimed by `…01T2wooCZu46W7msw4TJuuzr`). Its rows reuse `MarketSupportLine`.

## Runs

| File | Result |
|---|---|
| `red/vitest-module-absent.txt` | The F19 test before `market-support.ts` existed: the module is not found. |
| `red/vitest-resolver-unchanged.txt` | With `market-support.ts` written and the resolver unchanged: **4 failed, 15 passed**. These are the 3 resolver cases (EU and JP buildable, JP submit-supported), plus "Health Canada" spelled with a space, which was then fixed. |
| `red/vitest-client-rows-without-line.txt` | The client test with `ProjectHome.tsx` at HEAD: **2 failed, 3 passed**. No row shows a line. |
| `green/vitest.txt` | The four F19 files, the amended resolver test and the re-pointed wizard test: all green. |

- Server: `server/services/{regulatory,c2c,ectd,submission-gateways,region-profiles}`, `server/routes/__tests__`, `tests/{services/regulatory,regulatory}` and the AnA submission-tool tests: **8598 passed, 2 failed**. Both failures are `transmit-guard-reports-checks.test.ts`, which is red on trunk without this change (re-run on a clean stash: the same two, `[tenant-rls] FAIL-CLOSED`; the board records it red since `b7bf25037`).
- Client: `client/src/concept2cure/v2`, `tests/ui` and `shared`: **5618 passed, 3 failed**. All 3 were `newProjectWizardName.test.tsx`, which took the first API call as the project create. The Configure step now reads the market line first. It was re-pointed to find the create by method and path, and passes 16/16 with its sibling.
- `tsc --noEmit -p tsconfig.json`: **0 errors**, after one fix (a type imported from the wrong module).
- Lint: every changed file is at its HEAD count. The new files add none, after `marketSupport` was split into helpers to stay under the complexity limit.
- `ci:launch-scope` and `ci:launch-scope-api` (277 paths, none refused): green.

A design-system audit subagent ran 9 design gates, all green. It raised two should-fix items, both fixed before commit:
- a hard-coded Retry button style that stretched the row (now `nda-open`);
- a `sec-sub` class that overrode the wizard's 11.5px `--text-300` with the 4.5:1 `--text-400` (removed, so the caller's type applies).

Its two notes were also taken: a failed read is announced, and the docblock now says F20's use is still to come.
