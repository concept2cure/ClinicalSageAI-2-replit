# Selected filing reference and build facts

## What already exists

`client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` owns RegistryPicker and its
existing bounded-by-catalog offer reads. It already retains each filing's exact
market row, offer scope, grouping, retry and selected-offer note. Descriptions
were only tooltips and were absent from search. The selected note stated the
offer, but did not expose the outline/Module 1/channel facts already returned by
`server/services/regulatory/market-support.ts`.

`v2/MarketSupportLine.tsx` is the existing client read model and presentation
helper for that response. `shared/regulatory/filing-catalog.ts` supplies the
canonical catalog, including descriptions. The shared Ask AnA question is now
`filingAskPrompt`, moved from the existing FilingsCatalog by the companion work.
The parent inventory records code, caller and deleted-history searches.

## Result

- The selected note retains its existing offer and refusal wording, then shows
  the description as **Catalog reference**. The authored catalog text is shown
  verbatim, including any authored timing facts; it is not a calculated deadline
  or a readiness finding.
- **How you’ll build it** uses only the selected row's recorded outline pack
  label/version and the server's Module 1/channel details. A device's lack of
  Module 1 and transmission stays visible. No generic workflow/validation claim
  from the catalog is copied into this note.
- `marketBuildText` extends the existing MarketSupportLine module. Rich fields
  are optional for older responses, but malformed/missing facts yield no build
  text and the selected note says that the details could not be read. The
  existing offer verdict is not replaced by a fabricated support decision.
- An unclaimed filing alias such as a Pre-IND meeting has no filing-specific
  offer. Its note still states the scope of the parent IND offer and now says
  no build details are stated for this filing. It never presents that parent
  application's outline/Module 1/channel as a meeting-package promise.
- Description search uses the same rule for offered and refused filings; a
  refused match retains the server's reason. The existing offer filtering,
  pending/failure behavior, Retry focus and full/rest grouping are unchanged.
- Optional `RegistryPicker.onAsk` invokes `filingAskPrompt` for the selected
  catalog name. No callback means no Ask AnA button. Asking changes no selected
  filing and adds no market-support request. The current wizard supplies the
  callback in the parent work; this adds no provider or conversation channel.

The chosen row is reused. No extra market query, commercial-policy calculation,
catalog entry, external API call or write path is introduced.

## Verification

| Check | Result | Artifact |
| --- | --- | --- |
| Eight selected-note/description-search checks against previous behavior | 7 failed; the no-callback case already passed; 16 existing cases skipped | `picker-red.txt.gz` |
| Final selected-note, offers and market helper checks | 2 suites, 36 passed | `picker-green.txt.gz` |
| Full affected picker/market/offer/catalog and cross-lane/refusal wizard checks | 7 suites, 148 passed | `picker-related.txt.gz` |
| Existing source at HEAD lint, via stdin with its real filename | 0 errors; 2 existing RegistryPicker warnings | `picker-lint-base.txt.gz` |
| Current owned source/tests lint | 0 errors; the same 2 warnings, no new warning | `picker-lint.txt.gz` |

The green runs overlap and must not be added. The seven-suite run is:

```
client/src/concept2cure/v2/__tests__/registryPickerOffers.test.tsx
client/src/concept2cure/v2/__tests__/marketSupportLine.test.tsx
client/src/concept2cure/v2/__tests__/newProjectWizardCrossLaneSearch.test.tsx
client/src/concept2cure/v2/__tests__/newProjectWizardNotOffered.test.tsx
server/services/regulatory/__tests__/market-support.test.ts
server/services/regulatory/__tests__/market-support-offer.test.ts
shared/regulatory/__tests__/filing-catalog-unification.test.ts
```

Picker tests use the real catalog and the deterministic server market-support
function behind the request boundary. They verify pack/detail identity, preserved
author-only/unclaimed limits, missing fields, the exact callback question and
unchanged request/selection counts. Helper checks refuse malformed details,
contradictory missing packs and unknown Module 1 state. Existing all-catalog offer
parity and retry tests also pass. These are component/contract checks, not native
RLS or model-tool-selection proof; parent evidence records browser/build checks.

Read-only review of the companion prompt and Projects callback/context changes
found no blocker: parent remains the single surface-context publisher; child
state reports only wizard step and selected catalog facts through a stable state
setter. Typed project/person input is not published by that context.
