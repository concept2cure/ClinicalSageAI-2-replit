# A3 — AnA prompt keys use their existing core owners

D2 client journey; canonical branch `concept2cure-v2`; discovery base `ef8d6e8b`.
Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-27/slice-A3/README.md`.

## What already exists

- `server/services/module-intelligence.ts` owns five reusable intelligence bodies
  (medical device, eCTD, CMC, document editor, Vault). `detectActiveModule` selects
  legacy names for recorded projects/sessions. `getModuleIntelligence` recognizes
  those names but almost none of their canonical launch owners. Extend this
  selector; retain the bodies, references, document types and separate workflows.
- `server/services/lumen-instruction-engine.ts` owns the existing instruction,
  dossier workflow/manager, editor, data-room, narrative and regional blocks.
  Four lists recognize mostly retired subscription keys. Add canonical owners
  while preserving exact nonempty legacy-only outputs. Empty/unread inputs
  must receive generic instructions only when retained blocks become visible.
- `server/services/lumen-context-builder.ts` assembles these existing blocks;
  `ana-context-builder.ts` reexports it and the mounted `/api/cortex/chat`
  handler calls it. Its nominal 12,000-character global trim is smaller than
  the real base prompt alone, so it silently discards the entire middle,
  including selected intelligence/instructions. This must be qualified using
  the real base, not a mocked short base. Cortex already budgets conversation
  history against the assembled prompt and a 128k-token model allowance.
- Today's V2 `useAnaChat` uses `/api/ana-ri/stream`, whose own context builder
  calls only the shared lightweight intelligence prefix, not this assembler.
  A3 does not add a parallel prompt injector there or claim a new streaming
  capability. This corrects an assumption in the historical placement plan.
- `shared/regulatory/app-registry.ts` owns discipline-to-module metadata;
  `workspace-config-enrichment.ts` uses it to project accessible/locked features
  from the existing license read. Six entries still require retired keys even
  when a canonical module is enabled. It is a configuration projection, not
  the API/tool/composition authorization gate. Those gates remain authoritative.
- Existing tests cover missing project facts, FDA review-clock wording,
  unestimated figures, regional limits, registry/config behavior and mounted
  Cortex context. Extend these; no model call, new module/service, database
  migration, subscription deletion or launch admission is required.
- Searches included every A3 legacy key, declarations, imports, selectors,
  routes, registry consumers, tests and deleted paths. The checkout is shallow;
  no deletion of these owners was found in available history. This is not a
  claim about unobserved history. The remaining four A2.10 folds have separate
  data/function gates and are not reopened or retired here.

## Owner contract

| Legacy key / recorded context | Canonical owner | Existing intelligence body |
| --- | --- | --- |
| ind-filing / IND | ind-checklist | eCTD |
| nda-bla, ectd-coauthor / NDA, BLA, eCTD | submission-center | eCTD |
| 510k-submission / 510(k), De Novo | device-510k | medical device (recorded type retained) |
| pma-submission / PMA | device-pma | medical device |
| ce-marking / CER | device-cer | medical device |
| cmc-wizard / CMC session | cmc | CMC knowledge; composition scope unchanged |
| doc-canvas, csr-author, cer-generator / document creation | document-authoring | shared editor |
| protocol-designer / recorded ICH_PROTOCOL | protocol-dev | shared editor |
| recorded ICH_CSR | document-authoring | shared editor |
| known non-US medicinal filing | submission-center | eCTD; no FDA application framing |
| known foreign device filing | device-submission | medical device; no assumed US pathway |

The old CER keys describe different roles: ce-marking is medical-device
intelligence, while cer-generator returns the same generic editor body as
CSR/protocol/canvas. Preserve those roles through their actual owners instead
of merging two workflows into a fictitious combined standard process. Keep
explicit legacy callers compatible; canonical calls report their canonical ID.
PMA must select device-pma rather than inheriting the historical 510(k) key.
Unknown/missing facts must not acquire a recorded pathway from this remap.

Canonical instruction ownership retains the old functions: ind-checklist has
workflow/manager/regional awareness; device-510k and device-pma have manager
awareness; device-cer carries the union of its prior workflow/manager/regional
roles; submission-center inherits the full eCTD block set; document-authoring,
protocol-dev and cmc inherit workflow/editor blocks. A canonical launch-only
organization therefore receives the existing editor/dossier blocks. An unrelated
nonempty module set must not acquire these blocks through a new fallback.

Preserve base policy, unread-source notice, selected module/instruction blocks
and final tool/instruction guidance as required content. Apply the existing
12k allowance to optional dynamic context instead of promising an impossible
12k bound on a much larger immutable base. Preserve whole blocks and describe
any omitted optional context explicitly. Keep custom prompt passthrough and the
existing downstream model/history budget. Test required blocks with the real
base. No new model capability or API authorization follows from prompt knowledge.
The previous empty-list fallback enabled every domain block, including when
organization module reads were unavailable. Because the blocks now survive
trimming, empty/unread lists must retain only generic core instructions.
Legacy nonempty outputs remain unchanged; tests for all-block safety use explicit
module lists instead of treating unknown modules as a grant.

Repoint the six registry metadata entries to cmc, protocol-dev,
document-authoring, device-cer, submission-center and device-510k respectively.
Retain explicit legacy keys for the pre-existing configuration projection,
using only the license reader's enabled (unexpired) list; this is not an alias
inside executable access gates. Do not mutate grants, collapse disabled/expired
records or substitute config
metadata for an effective access verdict. Retired subscriptions stay historical;
explicit compatibility in prompt selection is not a commercial grant.

Confirm the 510(k) performance-matrix parity against real code. An SE comparison,
performance-testing summary/template or eSTAR section is not proof of a new
standalone performance-testing matrix; leave any unimplemented claim explicit.

## Qualification

Write focused behavioral reds before changes. Compare old/new body and legacy
instruction outputs, test canonical and unrelated/no-fact inputs, qualify the
actual assembler with its real base and the mounted Cortex handler without a
provider call, exercise workspace-config accessible/locked projection, and keep
missing-read behavior intact. Run appropriate regressions, build, zero-error
TypeScript and normal publication gates. Record exact scope and limitations;
no formal OQ execution or production deployment is claimed.
