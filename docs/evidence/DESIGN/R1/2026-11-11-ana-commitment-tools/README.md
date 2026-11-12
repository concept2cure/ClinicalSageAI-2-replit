# R1: AnA's three agency-commitment tools are offered in production (2026-11-11)

Launch row D2, package R1 (reach). From the reach map of the locked screens
(`docs/evidence/DESIGN/P-122/reach-map/README.md`, section 4, rank 7): "AnA works commitments in conversation".

## What a person had

In production AnA could not record an agency commitment, mark a meeting commitment fulfilled, or say how many
commitments are overdue. Asked to, it answered `LAUNCH_SCOPE`. The same person could do all three by hand in
Communication, under Meetings & commitments.

## What already exists (RULE 3)

Nothing was added. No tool, route, table or screen.

| Path | What it does |
|---|---|
| `server/services/ana/AnaToolExecutor.ts` `create_regulatory_commitment`, `fulfill_regulatory_commitment`, `review_commitment_portfolio` | Write and read `regulatory_commitments` through `services/ha-interactions/ha-service.ts`, in the tenant's context, each write a governed action with the person's stated reason |
| `server/routes/ha-interactions.ts`, `routes/commitment-fulfil-route.ts` | Communication's own routes: the same `createCommitmentTx`, `listCommitments`, `fulfillCommitmentTx` |
| `shared/constants/ui-surface-registry.ui-v2.ts` `communication-center` | Claims `/api/ha-interactions`; a launch screen since `327bc9fb6` |
| `server/services/ana/tool-authorization.register.json` | create and fulfil are class `confirm` (a person confirms the write); review is `read` |
| `server/services/ana/ana-launch-scope.inventory.json` | Filed the three under `lifecycle-mgmt`, a locked screen, so the scope gate withheld and refused them |

The inventory's own rule: "a tool that touches both a launch and a hidden surface is inScope". Its note of 2026-10-30
kept the three hidden because they "already named" `lifecycle-mgmt`. That was the file's filing, not what the
handlers touch.

## What changed

- `ana-launch-scope.inventory.json`: the three names move from `hiddenApp` to `inScope`, with a dated note
  (`amended20261111`) saying why. The file's formatting and every other entry are unchanged.
- `ana-launch-scope-execution.test.ts` used `create_regulatory_commitment` as its hidden write probe. The probe is now
  `create_lifecycle_obligation` (renewals: no launch screen, no deployed table), which is still hidden.

## What did not change, on purpose

- **A PMR, PMC or REMS is still fulfilled only by a person's signature (P-41).** The handler reads the type from the
  record, writes nothing, and names the screen. `ana-cannot-sign.test.ts` pins it and passes.
- **The other three `lifecycle-mgmt` tools stay withheld** (`create_lifecycle_obligation`, `regulatory_deadline_radar`,
  `review_lifecycle_calendar`).
- **`simulate_study_design` stays withheld.** The reach map lists it as a small re-file to protocol development. It
  predicts a probability of success for a "digital twin" of a study. RULE 2 gives digital-twin work no sessions, and
  a figure from that tool is not an engine result a protocol should carry. Left for a founder decision.
  `evaluate_endpoint` and `recommend_endpoints`, named beside it, were never withheld.

## Verified

- Red first: with the inventory as it was, three cases fail (`create_regulatory_commitment: expected false to be
  true` in the production toolset; the tool still in the hidden set; `LAUNCH_SCOPE` returned in production).
- After: `ana-launch-scope.test.ts` and `ana-launch-scope-execution.test.ts`, 18 pass. The production toolset
  offers the three; a hidden write is still refused before a person is asked to confirm it.
- `ana-cannot-sign.test.ts`, `ha-tools.test.ts`, `tool-selection-routing.test.ts`, `addons-tools.test.ts`: 115 pass.
- `npm run ci:launch-scope` passes.

**Not verified:** AnA calling the tools in a conversation. That needs a model key, and no environment a session can
reach has one (GA ledger `GA-D4-03`).
