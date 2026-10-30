# A3 prompt and workspace-owner convergence

D2 client journey. Started 2026-10-27 at `ef8d6e8b`; synchronized with the
2026-10-30 shared tree `438287ed1` before integrated verification. Existing
in-flight A3 work was preserved when the user redirected attention to IND
expertise. The separate D4 review records that newer request.

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


## Implemented boundary

Canonical core IDs now select the existing domain objects and instruction
blocks. US objects match eleven pre-change full-object digest controls; explicit
legacy callers retain their objects and all thirteen nonempty legacy instruction
outputs remain exact. Generic CER editor knowledge lives with document-authoring;
medical CER knowledge stays with device-cer. Workflows are not concatenated.
Recorded CSR/protocol contexts choose their editor/protocol owners, PMA retains
its own owner, and known foreign filings do not inherit a US application label.
The shared deficiency bridge itself is unchanged.

The existing Cortex assembler now preserves base policy, recorded project and
filing qualifiers, selected knowledge/types/stages, selected instructions,
unread notice and final tool/instruction guidance. Its 12k allowance bounds
optional whole blocks. The existing gateway still decides actual model context
admission. Empty/unread module lists receive generic instructions only, rather
than activating all domain blocks now that they survive trimming. Prompt
knowledge is not an effective license verdict or tool authorization.

Six existing configuration entries name their core module. Explicit historical
keys retain the prior projection for an enabled unexpired legacy grant; grants,
revocations, subscription rows and effective route/tool controls are unchanged.
An unavailable license manufactures no accessible/locked projection.

This qualifies the mounted `/api/cortex/chat` owner and workspace configuration.
The current V2 streaming assistant uses a different builder and is unchanged.
No new surface, module, provider call, CMC composition scope, database schema or
formal OQ execution is included.

## Engineering evidence

- Module reds: 60 failures/49 controls, then additional recorded-context reds;
  final module selection/body controls pass 129/129 across five suites.
- Instruction/real-base reds: 19 failures/29 controls; mounted Cortex capture
  adds one intended failure/three existing controls. Focused final group passes
  53/53 and existing context regressions 59/59. The route uses mocked I/O,
  orchestration and gateway boundaries; no live provider or native DB is claimed.
- Workspace mapping: 18 intended failures/seven controls (after correcting a
  test cleanup callback), then 113/113 across six suites.
- Integrated 2026-10-30 regression on `438287ed1`: 450/450 across 27 suites,
  34.57s, including real gateway-context admission, grant expiry, license-read
  failure, CMC scope and tenant-header regressions.
- A final generic foreign-device instruction case exposed one missing manager
  owner (one red/25 pass). The canonical device-submission key now gets that
  existing manager block. Affected prompt/route plus separate oncology checks
  pass 51/51 across five suites; this overlaps the earlier regression and must
  not be summed into a distinct-case total.
- Rebuilt client/server/audit verifier passes (Vite 24.28s). Scoped lint reports
  zero errors/18 existing warnings. Full TypeScript ran with zero errors;
  normal publication gates recheck final committed sources.

`source-sha256.json` pins the source. Logs and scoped file lists are retained
here. Formal/model/clinical qualification and production deployment are not
established by these engineering checks. The four legacy fold prerequisites
and all unrelated source/approval/signature/dispatch safeguards remain in force.
Publication receipt follows normal hooks; no baseline expansion is authorized.


## Publication

Source commits `84520c3f1` (A3) and `e5fc8fc20` (IND review/oncology correction)
were accepted on `origin/concept2cure-v2` in merge
`fc1ece8d9` at 16:24 UTC on 2026-10-30. All normal push gates passed,
including full TypeScript with zero errors and no added lint warnings.
`publication-gates.log.gz` and `publication.json` retain the receipt. The two
later incoming changes were documentation only; qualified source hashes match.
No hook or baseline was bypassed. This is source publication and engineering
verification, not deployment or formal/model/scientific qualification.
