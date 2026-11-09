# Rule 2 · S7: `assess_benefit_risk` is retired onto `assess_benefit_risk_balance`

**Rule:** CLAUDE.md working agreement, "zero duplication", and RULE 3, item 5 (a second implementation is migrated
onto the first and deleted in the same change).
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1**. The slice is the Rule 2 design's S7
(`../design.md`, "S7. Retire `assess_benefit_risk` onto `assess_benefit_risk_balance`"), whose finding 8 is that
`regulatory/benefit-risk.ts` has one caller, this tool.
**Date:** 2026-11-09.

## The duplicate

Two AnA tools answered the same question, whether a product's benefit-risk balance is favourable:
- **`assess_benefit_risk`** (`server/services/ana/deepeningTools.ts`), handled in `AnaToolExecutor.ts` by its own
  `try`/`catch` rather than `runStatsTool`, over `server/services/regulatory/benefit-risk.ts` (`assessBenefitRisk`).
  It took benefits and risks, each with a caller weight and a 0–100 score, normalised the weights within each side,
  and called the net favourable, unfavourable or borderline against a threshold (default 10).
- **`assess_benefit_risk_balance`** (`server/services/ana/benefitRiskTools.ts`), handled through `runStatsTool`,
  over `server/services/benefit-risk/benefit-risk-knowledge.ts` (`assessBenefitRiskBalance`). It integrates key
  benefits (endpoint-hierarchy weight, discounted for uncertainty) and key risks (severity × reversibility ×
  frequency, with mitigation credit), adds the bounded condition-severity and unmet-need credit, and returns one of
  four verdicts with its drivers, grounded in ICH M4E(R2) §2.5.6, CIOMS IV, the FDA framework and EMA methodology.

Each was offered for the same requests. For "run a structured benefit-risk assessment weighing the benefits against
the risks" the selector ranked the old tool 21st and the balance 20th; for "BRAT weighted benefit risk score with an
importance weight for each benefit and risk", 20th and 21st.

## What already exists (RULE 3)

- **The one that stays:** `assess_benefit_risk_balance`, above, with the rest of its family in `benefitRiskTools.ts`:
  `structure_benefit_risk_framework`, `build_effects_table`, `design_value_tree` (PrOACT-URL / BRAT value tree, and
  deterministic MCDA swing weights from importance ranks), `assess_br_uncertainty` and `plan_br_communication`. The
  safety skill (`server/services/ana/skills/library/safety.ts`, step 6) already names the balance tool, and nothing
  names the old one.
- **What reached the old tool:** its definition in `deepeningTools.ts` (`ASSESS_BENEFIT_RISK`, its item schema and
  header line 8), its handler in `AnaToolExecutor.ts`, its `ana-launch-scope.inventory.json` and
  `tool-authorization.register.json` entries, and two cases in `deepening-tools.test.ts`.
- **What reached the old engine:** only that handler, and `regulatory/__tests__/benefit-risk.test.ts`.
- **No client caller.** Nothing in v2's UI called the old tool: `git grep` for `assess_benefit_risk` (not
  `_balance`), `assessBenefitRisk` and `regulatory/benefit-risk` finds nothing in `client/` or `shared/`. It was
  reached only through AnA, by the model choosing it.
- **A comment that named the old tool as a replacement:** the CSR builder's retired `POST /analyze-benefit-risk`
  (`server/routes/csr-builder-routes.ts:14–16`, and the same note in
  `server/routes/__tests__/csr-builder-retired-endpoints.test.ts`) named `regulatory/benefit-risk.ts` as one of the
  deterministic engines that replaced it. Both notes now name the balance tool.
- **Searches run:** `git grep` for `assess_benefit_risk` (not `_balance`), `assessBenefitRisk`,
  `ASSESS_BENEFIT_RISK`, `regulatory/benefit-risk` and `benefit-risk.js` across server, shared, client, scripts and
  tests; `git log --all --diff-filter=D --name-only` for `*benefit-risk*`, `*benefitRisk*` and `*benefit_risk*`
  (`git log --all --diff-filter=D -- '*benefit-risk*'` finds no deletion before this one; the clone is shallow, so
  local history only); `git log` on both files (both arrived in `182fed957`,
  2026-10-15).

## The change

- **Deleted:** `server/services/regulatory/benefit-risk.ts` and
  `server/services/regulatory/__tests__/benefit-risk.test.ts`.
- **Removed:** the `ASSESS_BENEFIT_RISK` definition, its item schema and its header line from `deepeningTools.ts`; its
  handler from `AnaToolExecutor.ts`; its entries in `ana-launch-scope.inventory.json` and
  `tool-authorization.register.json`; its two cases and its registration entry in `deepening-tools.test.ts`.
- **Comments:** the CSR builder route and its retirement test name `assess_benefit_risk_balance` as the
  deterministic engine.
- **The manifest** (`docs/ana-capability-manifest.json`) is regenerated, and loses the one tool.
- **The design** moves S7 to done.

**What the replacement does differently, said rather than hidden.** It is a convergence, not a one-for-one copy:
- **Numeric scores map onto ordinal magnitudes.** The old tool took a raw 0–100 score per benefit and risk. The
  balance takes an ordinal magnitude per benefit (`negligible`, `low`, `moderate`, `high`, `very_high`) and a
  severity, reversibility and frequency per risk, and gives one of four verdicts: favourable, favourable with
  conditions, indeterminate or unfavourable.
- **Weights are endpoint-derived, or an explicit 0..1.** The old tool normalised any non-negative caller weight. The
  balance derives a benefit's weight from its endpoint type (mortality highest, biomarker lowest) and a risk's from
  its frequency, unless the caller states an explicit weight between 0 and 1.
- **MCDA swing weights belong to `design_value_tree`.** A weighting from importance ranks (rank 1 → 100 points,
  normalised) is that tool's, in the same family.

Nothing in the repo called the old engine with numbers of its own: its only caller was the model. A figure the model
supplies and the engine turns into a verdict is the shape RULE 2 forbids, which the coordinating session gave as a
second reason this lands under F1 rather than as a founder retirement (2026-11-09, under P-107).

**User-visible:** asked for a structured benefit-risk assessment, AnA has one tool for it, the balance, which names
its drivers and its basis.

## Proof

Run in this session on the working tree.
- `red/before.txt`: `assess-benefit-risk-retired-onto-the-balance.test.ts` on `96ae110e8`, before the change: 6 of 8
  fail, all on assertions. The 2 controls pass: the replacement is defined and registered, and computes a balance
  from stated benefits and risks.
- `green/after.txt`: 1,162 of 1,162 pass in 18 files: the retirement test (8), `deepening-tools.test.ts`,
  `csr-builder-retired-endpoints.test.ts`, the registry, launch-scope, tool-authorization and tool-selection suites,
  and every suite that reads `benefit-risk-knowledge.ts`.
- **The neighbourhood: 170 files, 4,190 tests, 4,179 pass.** It is the S5b neighbourhood (every `*unstated*` suite,
  the skills, tool-selection, registry, launch-scope and authorization suites, and the engines' own) with the green
  set above. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically
  on trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: no file changes its warning count; the new test has none;
  - `ci:step-presentation`: OK, 673 in-scope tools each with a `present` entry;
  - `manifest:ana`: regenerated; it loses the one tool (791 to 790), and nothing else changes.
- **Routing**, measured with `selectToolsForTurn` over the 50 offered, before and after: "run a structured
  benefit-risk assessment weighing the benefits against the risks" ranks the balance 20th before and after; "BRAT
  weighted benefit risk score with an importance weight for each benefit and risk", 21st and 20th; "compute the net
  benefit and favorability from weighted benefits and risks", 21st and 20th; "structured benefit-risk decision aid
  for the clinical overview 2.5.6", 22nd before and after. The retirement test pins all four.
