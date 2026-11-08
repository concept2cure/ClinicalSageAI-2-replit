# P-87: retire the IND sequence diff and package manifest (re-plan step 35, `Plan: R1`)

Designer `p87-ind-routes`, read-only, 2026-11-01; revised the same night after critique (§11). Measured against:
- local HEAD `609ef94c7`;
- `origin/concept2cure-v2` at `a2bad27e1`, fetched 2026-11-01 23:45 UTC. The first draft measured `5f30fdda0`, which
  predates the decision record.

`git diff --name-only 609ef94c7 a2bad27e1` over every file this design reads or edits names three files:
- `docs/LAUNCH_DEFINITION_OF_DONE.md` (the P-86 to P-90 records);
- `.design/claude-convergence/COORDINATION.md` (§9);
- `docs/design/one-design-plan.json`, where R1 is still `open` with paths `["**"]`.

No `ind-lifecycle` file, no client file and not `docs/IND_LIFECYCLE_MODULE.md` changed.

Nothing in the repository was edited, staged, stashed or checked out. The RULE 3 map this builds on is
`/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided/p87-ind-routes.map.md`.
Every claim below was re-checked against the tree, and a few line numbers differ from the map. The map's item 4 says
`submission_leaves.checksum` "is never the package's checksum". That is wrong for the governed path, and §10 item 5
replaces it.

**One commit. It deletes, it adds nothing, and it waits for the coordinator's turn** (§9). The decision record has
landed (§1).

---

## 1. The founder's decision

The record, word for word (`docs/LAUNCH_DEFINITION_OF_DONE.md:1706-1722` on `origin/concept2cure-v2` `a2bad27e1`):

> ### P-87 — The unreached IND diff and manifest routes are retired (R1)
>
> The founder, 2026-11-01, on the RIM session's question. These have no caller in any screen, in AnA or in any test:
> - `GET /sequence/:currentId/diff` and `/diff/pdf`;
> - `GET /sequence/:seqId/manifest` and `/manifest/pdf`;
> - the manifest embedded in `POST /sequence/:seqId/dispatch-gate`.
>
> They read the mutable `submission_leaves` table. They are retired with their two services,
> `ind-sequence-diff.ts` and `ind-package-manifest.ts`. Their outcome is delivered today by:
> - "On file at the agency" (`client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`);
> - the compile's lifecycle view (`EctdCompile.tsx`).
>
> The deletion commit names the `git log --all --diff-filter=D` search and those replacements by path (the working
> agreement). This was checked with the R1 inventory first. CLAUDE.md RULE 3 cites these routes as an example of "reach,
> don't rebuild". This decision closes that example by retirement, because their outcome is now reached through the
> filed-state and compile views.

**The record has landed.** It is `5e3652dbf` (2026-11-01 21:21:54 UTC, "P-86, P-87, P-88: the founder answers RIM's
three questions"), an ancestor of `origin/concept2cure-v2` (`git merge-base --is-ancestor 5e3652dbf a2bad27e1`).
The first draft measured `5f30fdda0`, committed nine minutes earlier and not a descendant of it. The commit cites
`5e3652dbf`.

**One sentence of the record is not quite true, and the commit does not repeat it.** The record says these routes have
no caller "in any test". The IND routes' contract test does call them:
- `server/routes/ind-lifecycle/__tests__/routes.contract.integration.test.ts:542-547` calls
  `GET /sequence/:id/manifest`;
- the same file at `:560` asserts `toHaveProperty('manifest')` on the dispatch-gate response.

No screen, AnA tool, MCP tool or OQ/PQ script calls any of them (§5). This commit turns those cases into refusals
(§7.3), so the record's "or in any test" becomes true when the commit lands. The commit body says so, and the line
appended under P-87 says so too (§7.1 item 10).

**Four facts the decision text does not state.** Each is verified at HEAD, and none widens the decision.
1. **The service paths.** The record names the services by bare file name. They live in
   `server/services/ind-lifecycle/`:
   - `server/services/ind-lifecycle/ind-sequence-diff.ts` (102 lines);
   - `server/services/ind-lifecycle/ind-package-manifest.ts` (111 lines).

   The workflow's summary of the record placed them at `server/services/ind-sequence-diff.ts` and
   `server/services/ind-package-manifest.ts`. Nothing exists there, and the record itself never gives those paths.
2. **The snapshot response carries the manifest too.** The embedded manifest is built once, in
   `computeGateForSequence` (`server/routes/ind-lifecycle/sequence.routes.ts:66-91`). Two routes return it:
   - `POST /sequence/:seqId/dispatch-gate` returns it at `:131-132`;
   - `POST /sequence/:seqId/dispatch-gate/snapshot` returns it through `...result` at `:150`.

   Removing it at the builder removes it from both. This is forced, since P-87 deletes the builder's module. The
   snapshot *row* never stored the manifest: `createDispatchSnapshot` is handed the verdict only (`:146-149`).
3. **The PDF renderers go too.** The two PDF routes render through `renderSequenceDiffPdf` and
   `renderPackageManifestPdf` (`server/services/ind-lifecycle/ind-document-renderer.ts:112-161`). Nothing else calls
   them, so they go with the routes.
4. **The replacements are the two the record names, and nothing else.** They are `EctdFiledState.tsx` and
   `EctdCompile.tsx`. The manifest's question, a sequence's leaves with checksums before it is sent, is answered inside
   that same named file, by `CompiledPackageView` (§4.3). The deletion record names no third replacement. AnA's
   `compute_lifecycle_operations` is not one (§4.3, "Not named as a replacement").

## 2. The rules that bind this commit

| Rule | What it requires here |
|---|---|
| RULE 0 | Work on `concept2cure-v2` only, and push only there. |
| RULE 1 | **No migration.** No table, column or constraint is touched. The snapshot table `ind_dispatch_snapshots` is unchanged. |
| RULE 3 | The "What already exists" section is §4. The deletion record names the history search and the replacement for each outcome by path (§8). |
| RULE 4 | No card, panel, screen or editor. No client file changes. The outcomes already live in the one Submission Center → Compile path. |
| RULE 5/6 | `Plan: R1` (open, ledger paths `**`). `Completes: server/routes/ind-lifecycle/sequence.routes.ts`, which exists before and after. Nothing new: no route file, service, table, mount, AnA tool or surface. The gate skips deleted files (`scripts/ci/check-one-design-plan.mjs:163`, `if (f.status === 'D') continue`). The only added files are under `docs/evidence/**`, which is always allowed. |
| Part 11 | No signed act and no audit row changes. The `EXPORT_GENERATED` rows the two PDFs wrote through `sendPdf` → `sendRecordedFile` stay in the append-only trail as they are. The dispatch snapshot and its `IND_DISPATCH_SNAPSHOT_CREATED` audit are unchanged. |
| Fail closed | A retired path answers 404 (the `/api` JSON catch-all, `server/index.ts:231-233`). In production it is refused 403 before routing, exactly as today, because nothing claims it (`moduleEntitlementGate.ts:157`). It never answers an empty 200. |
| Decision citation | The body cites P-87 and its record, `5e3652dbf`, in prose. `Founder-Decision:` is a `Plan: PLAN` trailer only. |

## 3. The R1 inventory: does it list these, and what caller did it find

`docs/evidence/DESIGN/R1/2026-11-01-inventory/` (`df6d18838`, `73ff95ac3`, measured at `18261a908`).
`inventory.json:24895-24991` lists every route in scope, each `prod: "unmapped"`, `claimedBy: []`, `packages: ["S5"]`.

| Route | Inventory caller | Checked |
|---|---|---|
| `GET /api/ind-lifecycle/sequence/:currentId/diff` | `null`, confidence `none` | No caller. |
| `GET …/sequence/:currentId/diff/pdf` | `IndLifecycle.tsx`, `probable` | **False positive.** The second pass (`method/match2.py`) matched the mount root plus the segment `pdf`, from `/api/ind-lifecycle/loa/pdf` (`IndLifecycle.tsx:1050`) and the cover-letter, right-of-reference and annual-report PDFs (:871, :1072, :1094). Grep finds no `sequence/`, `/diff`, `manifest` or `priorId` in that file other than a comment at :120. |
| `GET …/sequence/:seqId/manifest` | `null`, `none` | No caller. |
| `GET …/sequence/:seqId/manifest/pdf` | `IndLifecycle.tsx`, `probable` | The same false positive. |
| `POST …/sequence/:seqId/dispatch-gate` (kept) | `null`, `none` | No caller. `/dispatch-gate` in `SubmissionSeqWorkspaces.tsx:1711`, `:2363` is the `verdictSource` of `POST /api/submissions/:id/dispatch-qc`, a different gate. |
| `POST …/dispatch-gate/snapshot`, `GET …/snapshots` (kept) | `null`, `none` | No caller. |

**What the inventory does not cover.**
- **Services.** It lists routes only, so it says nothing about the two services or the renderers. §5 covers them.
- **A false negative on the replacement.** `GET /api/ectd-compile/:projectIdent/filed-state` (`inventory.json:19645`)
  reads `caller: null`. `EctdFiledState.tsx:107` does call it: the URL ends in `${seqQuery}`, which the matcher
  does not resolve. It is `prod: launch`, claimed by `ectd-compile`. So the record proves the replacement is
  reachable from the code and its tests, not from the inventory.
- **No file is deleted without a founder decision.** That is the inventory README §3's own condition, and P-87 meets
  it.

## 4. What already exists (by path)

### 4.1 What P-87 deletes (verified at HEAD)

| Piece | Path:line | What it does | Why it is not kept |
|---|---|---|---|
| Diff route | `server/routes/ind-lifecycle/sequence.routes.ts:169-187` | `GET /sequence/:currentId/diff?priorId=`. Loads two sequences' **working** `submission_leaves` through `sequenceForDiff` (:44-51) and returns `diffSequences` | It does not check that the two sequences share a submission, nor that the prior one was filed. It reads no sent record. |
| Diff PDF | `:189-204` | The same diff, rendered and delivered by `sendPdf` (`ind-sequence-diff.pdf`) | — |
| Manifest route | `:206-217` | `GET /sequence/:seqId/manifest`. `buildPackageManifest` over working leaves, through `manifestForSequence` (:34-42) | It reads no package bytes and no compile. |
| Manifest PDF | `:219-230` | The manifest, rendered (`ind-package-manifest.pdf`) | — |
| Embedded manifest | `:74-78`, returned at `:90` | `computeGateForSequence` puts `manifest` beside the verdict "for display" (doc :60-64) | It never changes the verdict (P-33). No reader exists (§5). |
| Diff service | `server/services/ind-lifecycle/ind-sequence-diff.ts:1-102` | `diffSequences`: keys leaves by normalised section code and classifies each section as added, replaced, unchanged or deleted, by checksum | **Wrong for eCTD.** "Present in prior only → deleted" (:84-89). In eCTD a leaf that a continuing sequence does not carry stays on file; only a declared `delete` withdraws it. A missing checksum reads as "replaced" (:80). |
| Manifest service | `server/services/ind-lifecycle/ind-package-manifest.ts:1-111` | `buildPackageManifest`: groups leaves by module with its own `moduleOf`. Each leaf has its section, title, operation (default `new`) and `submission_leaves.checksum`, and the service counts `missingChecksums` | **Its "missing checksums" said nothing true about the package.** It counted leaves whose `submission_leaves.checksum` is null. That column holds the rendered PDF's md5 where a placement records it (the IND `*/file` routes, `docs/IND_LIFECYCLE_MODULE.md:53`), and is null for other placements. The packager computes every shipped file's md5 from its bytes (`056cb849f`), so a null never meant that a file would ship unhashed. The column itself stays: it is part of the signed sequence content (§10 item 5). |
| Renderers | `server/services/ind-lifecycle/ind-document-renderer.ts:112-161` (`renderSequenceDiffPdf`, `renderPackageManifestPdf`); type imports `:33-34`; the `getSubmissionTypeLabel` import `:19-21` | Render the two PDFs | `getSubmissionTypeLabel` is used only at `:140`. |
| Barrel | `server/services/ind-lifecycle/index.ts:36`, `:39` | `export *` of both modules | The barrel has no importer. It is listed in `scripts/ci/unreferenced-modules-baseline.json:56`, and stays there. |
| Unit tests | `server/services/ind-lifecycle/__tests__/ind-sequence-diff.test.ts` (60 lines), `__tests__/ind-package-manifest.test.ts` (54 lines) | Pin the two pure functions | Their subject is deleted. The diff test pins the defect ("absence reads as deleted"). |
| OpenAPI summaries | `server/routes/ind-lifecycle/openapi.ts:83-86`; the comment at `:87-89` names "manifest" | Human summaries. The spec itself is introspected from the routers (`:28-47`) | Stale once the routes go. |
| Module doc rows | `docs/IND_LIFECYCLE_MODULE.md:55`, `:59`; `:56` ("shapes only the returned `sequenceValidation`, `manifest` and `actionItems`") | The current-state catalogue | It must stay true. |
| Router header | `server/routes/ind-lifecycle.routes.ts:12-13`; `sequence.routes.ts:1-6` | Name "manifest, diff" | — |

### 4.2 What stays in `sequence.routes.ts`

- `GET /sequence/:seqId/validate` (:93-115).
- `POST /sequence/:seqId/dispatch-gate` (:117-136).
- `POST …/dispatch-gate/snapshot` (:138-154).
- `GET …/snapshots` (:156-167).
- `computeGateForSequence`, without `manifest`.
- `seqIdOf` and `Ctx`.

`tests/schema-contract/one-dispatch-verdict.contract.test.ts` requires this file to call
`assessSequenceDispatchReadiness`. It still does (:70).

### 4.3 The replacement for each outcome (exists, reached, tested)

**What a sequence does to what is on file** (the diff's question):
- **Compile's lifecycle view.** `LifecycleView` (`client/src/concept2cure/v2/surfaces/EctdCompile.tsx:720-769`,
  function at :725) shows, for a follow-up sequence:
  - every declared act (operation, section, file, `modified-file`), bound to what is on file;
  - the prior sequence it was bound through;
  - what assembly left out, with the reason;
  - `RehearsalStatement` (:700), for a rehearsal.

  It is computed by the lifecycle operator (`server/services/ectd/lifecycle-operator.ts`) against the one fold.
- **On file at the agency.** `EctdFiledState.tsx` lists every document on file by module, with:
  - its section, holding sequence and act (`ModuleTable`, :78);
  - its filed history (`historyLine`, :73);
  - the sequences folded and those not folded, with the reason (`sequencesLine`, :64).

  It reads `GET /api/ectd-compile/:ident/filed-state` (:107), which is the fold
  `server/services/ectd/prior-sequence-loader.ts`. It is mounted inside Compile at `EctdCompile.tsx:1603`.

**Not named as a replacement: AnA's `compute_lifecycle_operations`.** The first draft listed it as a third replacement
"over the same fold". The handler shows why that overstates it:
- It builds the prior state from the model's `prior_leaves` (`server/services/ana/AnaToolExecutor.ts:9690`, :9693).
  It loads the fold only when that list is empty (`if (prior.length === 0 && priorSeq)`, :9723).
- `desired_leaves` always comes from the model, and the tool definition offers hand-listed prior leaves as its option
  (a) (`server/services/ana/submission-center-tool-defs.ts:28-33`). So the prior state it diffs against can be one the
  model wrote, not the filed record.
- When it does load the fold, `loadPriorSequenceManifest` finds the submission through an `ectd_compilations` row
  (`prior-sequence-loader.ts:87-104`). After F1 slice 1 it therefore refuses a sequence sent with no compile on record,
  which the fold itself reads from its transmit. Its own header says "reading it is owed" (:66-68).

The record names two replacements, and the deletion record names those two only. The tool is untouched.

**A sequence's leaves by module, with checksums, before it is sent** (the manifest's question):
- **The compiled package.** `CompiledPackageView` (`EctdCompile.tsx:771-820`, function at :772) shows:
  - the leaf hierarchy of `index.xml` and the regional Module 1 (`BackboneView`, :447);
  - every file in the package;
  - "Download index-md5.txt", the md5 of each file computed from its bytes (:801-802);
  - the package SHA-256 (`PackageDtdValidation`).
- **The working leaves.** The Builder's leaf table (`SubmissionSeqWorkspaces.tsx`, `BuilderWorkspace`) lists each
  leaf's section, title, operation and source document.

**Once a sequence is sent, what it filed is On file at the agency** (`EctdFiledState.tsx`). That screen shows each
document's section, holding sequence, act and history. It does not show the md5 (its `md5` field, :32 at HEAD and :42 in today's working tree, is not rendered),
and no read-only screen shows a sent sequence's per-file md5 today:
- the compilation history shows only "manifest recorded" (`EctdCompile.tsx:656`);
- `CompiledPackageView` renders only the compile just returned.

The planned read is reopening a recorded compile (re-plan steps 32–33). **Compiling a sent sequence again is not a way to
look at it.** It writes a compile row that the fold reads as filed (§7.5, §10 item 6). The retired manifest was never
an answer for a sent sequence either: it read the working leaves.

**Reach.** In Submission Center, the Dispatch tab's "Validate and compile this sequence"
(`SubmissionSeqWorkspaces.tsx:2279-2287`) opens `ectd-compile` on that sequence. The surface is:
- registered in `client/src/concept2cure/v2/surfaceViews.ts:458`;
- part of the Submission Center app in `shared/constants/launch-scope.ts:183-184`.

**Tests that pin the replacement.** 5 files and 50 tests are green on today's working tree, run here with
`vitest.config.ts`. That tree carries another build's uncommitted F1 slice 1 edits; the map measured 42 + 8 at
HEAD.
- `client/src/concept2cure/v2/__tests__/ectdCompile.test.tsx`:
  - "shows what the agency holds now, across the filed sequences (gap 6.1)" (:58);
  - "opens both backbones as a navigable leaf hierarchy" (:176);
  - "lists every file in the package and offers the regional backbone and the MD5 index" (:193);
  - "a follow-up sequence shows every act against the filed state, and what was left out" (:270).
- `client/src/concept2cure/v2/__tests__/ectdFiledState.test.tsx` (five cases, :48-91).
- `client/src/concept2cure/v2/__tests__/ectdCompileCarriesSequence.test.tsx`: '"Validate and compile this
  sequence" carries the sequence to the compile screen' (:73).
- `server/services/ectd/__tests__/filed-state-history.test.ts`.
- `tests/routes/ectd-compile-lifecycle.test.ts`: "names the filed sequence it was diffed against, every act with its
  modified-file, and what was left out" (:107).
- On real PostgreSQL, not run here: `tests/db/ectd-filed-state-view.dbtest.ts`.

### 4.4 Lineage

Read over the branch's whole history (the full-history scratch clone of §6). The first draft read this through
`gh api …/commits?path=` and dated the lifecycle operator wrongly.
- **The canonical diff engine came first, and the IND diff was built beside it.**
  - The lifecycle operator, `27448f992` (2026-06-04, "lifecycle-operator diff engine (new/replace/append/delete)").
  - `ind-package-manifest.ts`: created by `5d6d5bbff` (2026-06-10, "submission package manifest (QC review
    artifact) + PDF") and changed by `373d29632` (2026-06-24).
  - `ind-sequence-diff.ts`: created by `01ae9b7f1` (2026-06-12, "eCTD sequence diff (amendment review) + PDF"),
    eight days after the operator. It never called the operator.
  - Both routes first sat in `server/routes/ind-lifecycle/analysis.routes.ts`. `86774630b` (2026-06-12) split that
    file into the compute, sequence and submission routers, which moved them into `sequence.routes.ts`. That was a
    move, not a deleted copy.
- **The rest of the canonical path came later, and the copies were never converged onto it:**
  - the per-sequence `leaf_manifest`, `f64b218d2` (2026-08-28);
  - md5 from the bytes, `056cb849f` (2026-08-28, "manifest md5 must come from file bytes, never a DB checksum");
  - `LifecycleView`, `50ecbb688` (2026-09-23);
  - the package opened as a reviewer would, `20bafbe7a` (2026-09-23);
  - each document's filed history, `cd5fd2281` (2026-10-29).

  P-87 finishes that convergence (zero duplication). It removes nothing a person used.

**The closest precedent** is `5ab665f63` (2026-10-30, the IND briefing book). It deleted routes, the openapi
entries, the service and its test, the renderer and the barrel export, and appended a "deleted" line under its
decision in `docs/LAUNCH_DEFINITION_OF_DONE.md`.

## 5. Every caller, by every name (searches run today at HEAD)

| Name | Found (definitions excluded) |
|---|---|
| `diffSequences`, `DiffLeafLike`, `DiffChangeKind`, `SequenceDiffEntry`, `SequenceDiff` | `sequence.routes.ts:17,183,200`; `ind-document-renderer.ts:34,113`; `index.ts:39`; `ind-sequence-diff.test.ts`. Nothing else. |
| `buildPackageManifest` (IND), `ManifestLeafLike`, `ManifestLeaf`, `ManifestModule`, `PackageManifest` (IND), the IND `moduleOf` | `sequence.routes.ts:11,37,74`; `ind-document-renderer.ts:33,136`; `index.ts:36`; `ind-package-manifest.test.ts:6`. The same-named `buildPackageManifest` and `PackageManifest` in `server/services/regulatory/submissionPackageBuilder.ts` (AnA's `submission-package-tool.ts`) and in `server/services/irb/package-manifest.ts` (`irbPackage.test.tsx`) are different modules and are untouched. |
| `renderSequenceDiffPdf`, `renderPackageManifestPdf` | `sequence.routes.ts:19,200,226` only. The renderer mock in `documents-recorded.test.ts:30-40` does not list them. |
| Download names `ind-sequence-diff.pdf`, `ind-package-manifest.pdf` | `sequence.routes.ts:200,226` only. |
| Route strings: `sequence/:seqId/manifest`, `sequence/:currentId/diff`, the `{…}` forms, `/manifest/pdf`, `/diff/pdf`, `priorId` | **Client and `shared/`: none.** Server: `openapi.ts:83-86`, and the header comments of `ind-lifecycle.routes.ts:12` and `sequence.routes.ts:3`. Tests: `routes.contract.integration.test.ts:542-547` (manifest). Docs: §4.1 and the dated records in §10. |
| Client fetches (`client/src/**`) | **None.** |
| AnA tools (`server/services/ana/**`: `ind-lifecycle`, `sequence_diff`, `package_manifest`, `diff_sequences`) | **None.** |
| MCP (`server/mcp/**`) | **None.** |
| OQ/PQ and e2e (`tests/validation/**`, `tests/e2e/**`, `server/eval/**`, `docs/validation/**`) | **None.** `VSR-001` names "manifest" only for a demo evidence file. |
| The dispatch-gate response's `manifest` field | Only `routes.contract.integration.test.ts:560` (`toHaveProperty('manifest')`). It is not read by `ind-cockpit.ts`, the drift digest (which compares verdicts), `ind-dispatch-snapshot-service.ts`, `dispatch-verdict-parity.pglite.test.ts`, `ind-audit-outcomes.dbtest.ts` (`toMatchObject`, no `manifest`), any client, AnA or MCP. |
| CI gates and registries (`scripts/ci/*.json`, `*.mjs`, `.typecheck-baseline.json`, `ui-surface-registry*.ts`, the launch-scope prefix map, the route-ownership matrix) | `unreferenced-modules-baseline.json:56` (the barrel, unchanged). `duplicate-exported-types-baseline.json:129` (`PackageManifest`). That name stays declared twice, irb and regulatory, and the gate compares names and a count (`check-duplicate-exported-types.mjs:108-130`), so it is unchanged. Nothing else names these paths. The ownership matrix is prefix-level (`/api/ind`). `recorded-downloads.contract.test.ts:38` admits `sendRecordedFile` as a helper and lists no IND handler. The `ind-launch-claim.test.ts` and `launch-scope-api-gate.test.ts` cases name only `/sequence/7/dispatch-gate`, which is kept. |
| Pinned evidence file lists | `docs/evidence/W5/2026-10-23-market-identity-resolution/verification/source-inputs.json` lists the four deleted files with their SHA-256 at head `8a4893fe…`. It is historical: no script reads `source-inputs.json` (grep over `scripts`, `server`, `tests`, `.husky`, `package.json`). Never edited. |

## 6. History search (over the branch's whole history)

**Why the first draft's search was not enough.** The working clone is shallow: `.git/shallow` has 15 boundary lines,
and its oldest commit is from 2026-10-05. Every `--diff-filter=D` search in the first draft ran on that clone, and
before the boundary only the two exact service paths were read through the GitHub API. A path-specific read cannot find
a copy deleted under another name. June to August 2026 is the window in which the working agreement records five
deleted editor generations, and it is when these services were created. So the first draft's "no copy was ever
deleted" was unproven for exactly the window that matters.

**How the whole history was read, without touching the repository.** The search ran in a scratch clone under the
scratchpad's `decided/`, never in the shared `.git`:
```
git clone --bare --filter=blob:none --shallow-since=2026-04-20 --single-branch --branch concept2cure-v2 \
  https://github.com/concept2cure/ClinicalSageAI-2-replit decided/p87-deep.git
git -C decided/p87-deep.git fetch --unshallow --filter=blob:none origin concept2cure-v2
# not shallow; root 3e1dcf8f0 (2025-11-20); 17,240 commits; tip a2bad27e1; one branch (RULE 0)
```
The full output is
`/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided/p87-deep-history.txt`.
Each deleted file it names was read with `git show <commit>^:<path>` into `decided/p87-deep-blobs/`.

```
$ git log --all --full-history --diff-filter=D --format='%h %ad %s' --date=short --name-only -- \
    '*ind-sequence-diff*' '*ind-package-manifest*' '*sequence-diff*' '*package-manifest*' \
    '*SequenceDiff*' '*PackageManifest*' '*ind-document-renderer*' '*ind-lifecycle/sequence.routes*'
(empty, over the whole history)

$ git log --all --full-history --diff-filter=D --name-only -- 'server/**/*Diff*' 'server/**/*diff*' \
    'server/**/*Manifest*' 'server/**/*manifest*' 'shared/**/*diff*' 'shared/**/*manifest*' \
    'client/**/*Diff*' 'client/**/*diff*' 'client/**/*Manifest*' 'client/**/*manifest*'
46044c426 2026-06-05  client/src/lib/diff.ts
e5a74a4df 2026-06-02  client/src/concept2cure/components/editor/DocumentDiff.tsx
ac5018cc3 2026-05-08  server/services/__tests__/citation-engine-diff.test.ts, citation-engine-project-diff.test.ts
7a144fd1e 2026-05-01  client/src/components/DocumentDiffViewer.tsx
b79f020e1 2026-04-05  server/routes/versionDiff.ts
fc9a7943b 2026-04-04  client/src/components/DocumentDiffViewer.tsx
e1dca6e3d 2026-04-04  server/services/componentDiff.js
b6e991501 2026-04-04  server/services/diffChecker.js
36f997067 2026-03-30  client/src/components/DocumentDiffDialog.tsx, VersionDiff.tsx

$ git log --all --full-history --diff-filter=D --format='%h %ad %s' --date=short --name-only -- '*ind-lifecycle*'
5ab665f63 2026-10-30  ind-briefing-book-service.ts (+ test)
0a047fbcf 2026-10-15  ind-dispatch-gate.ts (+ test)
86774630b 2026-06-12  server/routes/ind-lifecycle/analysis.routes.ts   # the split that moved these routes (§4.4)

$ git log --all --full-history --diff-filter=D -- '*export-lifecycle*' '*ind_sequence*' '*[Ss]equence*'
51e047988 2026-08-13  server/services/ectd/export-lifecycle.ts (+ test)
813a632ac 2026-06-10  server/models/ind_sequence.js
b79f020e1 2026-04-05  shadow_service/shadow_service/ectd_sequence_builder.py, agent/tools/sequence_tools.py
a2a62debf 2026-04-04  server/routes/indSequenceRoutes.mjs
87d13d7cd 2026-03-25  server/routes/ind_sequence_create.py, ind_sequence_validate.py, sequence_create_region.py,
                      server/models/sequence.py, cer_sequence.py, server/api/cer/sequence_create.py
b49e7495f 2026-02-21  client/src/pages/IndSequenceManager.jsx, IndSequenceDetail.jsx, SequenceDetail.jsx, CERSequenceManager.jsx
4a87d39a4 2026-01-26  server/routes/_deprecated/ind_sequence_routes.js
  (and unrelated: docs/proof/…, client/…/workspace/*, the _archive copies, vendored .claude/skills/gstack/*)

$ git log --all --full-history --diff-filter=D --format=%h -- '*dispatch-gate*'    # a639c5c4f's template search
0a047fbcf

# Run on the local shallow clone only (from 2026-10-05). It needs every blob, so it was not run over the whole history.
$ git log --all --full-history --format=%h -S<name> -- client shared server/services/ana server/mcp
  diffSequences, renderSequenceDiffPdf, renderPackageManifestPdf, '/manifest/pdf', '/diff/pdf', 'priorId=': (empty)
  buildPackageManifest: a811b0d83 fb80c5d10 bba77ef21 f304c87d9 8e2d0bd98
      # each hit is a comment in client/src/concept2cure/v2/__tests__/irbPackage.test.tsx
      # about the IRB module's builder, not the IND one
```

**What each deleted file was.** Every one was read, except the vendored `.claude/skills/gstack/*` files and the
`_archive/` duplicates of the legacy pages. None compares two sequences' leaves, and none lists a package's leaves by
module with a checksum count. Each file named below was grepped for `leaf`, `manifest`, `md5` and `checksum`.

| Deleted file | What it was |
|---|---|
| `client/src/lib/diff.ts`; `…/editor/DocumentDiff.tsx`; `DocumentDiffViewer.tsx`, `DocumentDiffDialog.tsx`, `VersionDiff.tsx`; `server/routes/versionDiff.ts`; `diffChecker.js`; `componentDiff.js` | Text, document-version and component-version diffs |
| `citation-engine-diff.test.ts`, `citation-engine-project-diff.test.ts` | The citation engine's tests |
| `server/services/ectd/export-lifecycle.ts` (`51e047988`) | The retired exporter's sequence delta. It calls the canonical `computeLifecycleOperations` "so the diff logic has one implementation". It was not a copy. |
| `server/models/ind_sequence.js` (`813a632ac`, "retire legacy stubs") | A legacy `ind_sequences` model. Its `getSequenceDocuments` listed a legacy sequence's documents with `document_lifecycle.md5_hash`, with no module grouping, no checksum count and no diff. |
| `server/routes/ind-lifecycle/analysis.routes.ts` (`86774630b`) | The router these same routes lived in before the split. They were moved, not copied. |
| The legacy sequence pages, the Python create and validate routes, `indSequenceRoutes.mjs`, `_deprecated/ind_sequence_routes.js`, `ectd_sequence_builder.py`, `sequence_tools.py` | Sequence planning, creation, validation and XML building. The planner set new or replace from a document's `last_submitted_version`. None diffs two sequences' leaves or builds a QC manifest. |

**Result.**
- Over the branch's whole history, no file named for either service, the renderer or `sequence.routes.ts` was ever
  deleted. No deleted file under any diff, manifest, sequence or `ind-lifecycle` name was a copy of either service.
  By file name, these two are the only copies there have been.
- **The one limit:** a copy inside a file whose name carries none of those words could escape this search. Reading
  for it means a pickaxe over every blob, and that pickaxe ran only from 2026-10-05. The deletion record states this
  limit; it does not claim more.
- `--full-history` is kept. On the shallow working clone, the search without it reads empty for `*dispatch-gate*`
  (history simplification at the boundary hides `0a047fbcf`). Over the whole history, both forms find it. The flag
  makes the result independent of the clone's depth.
- **At build time:** re-run these searches the same way, in a scratch clone and never by deepening the shared `.git`
  that other builds use. Save the output as `history-search.txt` in the evidence folder.

## 7. The commit

**Order and blocks.** Re-plan step 35. It comes after step 24 (F1-7, RIM's repair C), which edits the same
`routes.contract.integration.test.ts` and `shared.ts`. Rebase onto it, and re-read the file. The P-87 record is on
trunk (`5e3652dbf`, §1), so that is no longer a block. The commit is blocked until:
1. step 24 has landed;
2. the coordinator has been sent the package, step and file list, and has recorded RIM working under R1 for this step
   (§9).

It has no code dependency on steps 25–34. The exception is step 33, which may move `LifecycleView` and
`CompiledPackageView` into `EctdCompiledPackage.tsx`. The record then names whichever path holds them at build time
(`grep -n "function LifecycleView\|function CompiledPackageView" client/src/concept2cure/v2/surfaces/*.tsx`).

**The commit at a glance.**
- **Plan:** R1 (open, `["**"]`).
- **Completes:** `server/routes/ind-lifecycle/sequence.routes.ts`.
- **Migration:** none.
- **Size:** about 330 lines deleted, about 30 changed or added. No client file changes.

### 7.1 Files and hunks

1. **`server/routes/ind-lifecycle/sequence.routes.ts`** (232 lines → about 150)
   - **The header, `:1-6`, becomes:**
     ```
     /**
      * IND lifecycle — sequence-scoped routes (load a specific eCTD sequence's
      * leaves): structural validation, dispatch gate + snapshot, snapshot history.
      * Merged under /api/ind-lifecycle (auth applied at mount).
      *
      * The sequence diff and package manifest were retired by founder decision
      * P-87 (2026-11-01). What a sequence does to what is on file is Compile's
      * lifecycle view and On file at the agency. Before it is sent, a sequence's
      * leaves and checksums are the compiled package (EctdCompile.tsx); once
      * sent, what it filed is On file at the agency (EctdFiledState.tsx).
      */
     ```
     The last two sentences are the trail the next RULE 3 search finds. They are bounded to an unsent sequence on
     purpose. Compiling a sent sequence again writes a compile that the fold reads as filed (§7.5, §10 item 6), so the
     text must not send a person to Compile to look at one.
   - **Imports.**
     - Delete `:11` (`buildPackageManifest`), `:17` (`diffSequences`) and `:19` (both renderers).
     - At `:22`, drop `sendPdf` from the `./shared` import. `documents.routes.ts` still uses it, so `shared.ts` is not
       edited.
     - Every other import stays used: `listLeaves` and `getSequence` by validate and the gate; `limiter`, `ctxOf`,
       `body`, `fail`, `noAuth`, `readinessFrom`, `filingTypeParam` and `FILING_TYPE_VALUES` by the kept handlers.
   - **Helpers.** Delete `manifestForSequence` (:34-42) and `sequenceForDiff` (:44-51).
   - **The doc comment, `:60-64`, ends:** "…The structural validation and action items are returned beside it for
     display; the body's `filingType` and readiness / clock / timeline inputs shape those, and never the verdict."
   - **The gate.** Delete `:74-78`. Line `:90` becomes:
     `return { sequence, verdict, result: { verdict, assessment, sequenceValidation, actionItems } };`
   - **The handlers.** Delete `:169-230`: `/diff`, `/diff/pdf`, `/manifest` and `/manifest/pdf`, with their doc
     comments. `export default router;` stays.
2. **Delete** `server/services/ind-lifecycle/ind-sequence-diff.ts`.
3. **Delete** `server/services/ind-lifecycle/ind-package-manifest.ts`.
4. **Delete** `server/services/ind-lifecycle/__tests__/ind-sequence-diff.test.ts` and
   `__tests__/ind-package-manifest.test.ts` (§7.3).
5. **`server/services/ind-lifecycle/ind-document-renderer.ts`** (168 → about 113):
   - delete `:19-21` (the `getSubmissionTypeLabel` import, whose only use is `:140`);
   - delete `:33-34` (the `PackageManifest` and `SequenceDiff` type imports);
   - delete `:112-161` (both renderers, with their doc comments) and one of the two blank lines left around them.

   `renderStructuredLeafPdf`, `renderLeafPdf` and `LeafSection` stay used (`:100-110`, `:163-168`). The header
   (`:1-16`) names neither function.
6. **`server/services/ind-lifecycle/index.ts`**: delete `:36` and `:39`.
7. **`server/routes/ind-lifecycle/openapi.ts`**:
   - delete the `SUMMARIES` keys `:83-86`;
   - in the comment at `:89`, "shapes only the displayed validation, manifest and action items" becomes "shapes
     only the displayed validation and action items".

   The paths leave the spec by themselves, because the spec is introspected. 66 registrations become 62:
   documents 20, filing 3, compute 7, sequence 8 → 4, submission 7, registers 21.
8. **`server/routes/ind-lifecycle.routes.ts:12-13`** becomes
   `*  - sequence.routes   : sequence-scoped — validation, dispatch gate + snapshot, snapshot history`.
   Line 7's stale "briefing book" is not P-87's (§10).
9. **`docs/IND_LIFECYCLE_MODULE.md`**:
   - delete rows `:55` and `:59`;
   - in `:56`, "shapes only the returned `sequenceValidation`, `manifest` and `actionItems`" becomes "shapes only
     the returned `sequenceValidation` and `actionItems`";
   - under the table, add one line: "*Retired 2026-11-0x (P-87):* the IND package manifest and sequence diff
     (`GET /api/ind-lifecycle/sequence/:seqId/manifest[/pdf]`, `/sequence/:currentId/diff[/pdf]`). Before it is sent,
     a sequence's leaves and checksums are the compiled package in eCTD Compile (leaf hierarchy, files, and
     `index-md5.txt` computed from the bytes that ship). Once sent, what it filed is On file at the agency. What a
     sequence does to what is on file is Compile's lifecycle view and On file at the agency."
   - **Leave row `:53` as it is.** It says the `*/file` routes attach the rendered PDF's md5 to the leaf
     (`submission_leaves.checksum`) "for the eCTD index-md5". That is true: the column is the rendered bytes' md5,
     and it is recorded and signed with the sequence (§10 item 5). The new line does not contradict it. It says only
     that the package's `index-md5.txt` is computed from the shipped bytes, which is what `056cb849f` made true.
10. **`docs/LAUNCH_DEFINITION_OF_DONE.md`**: lines appended under the P-87 entry (`:1706-1722` on `a2bad27e1`), as
    `5ab665f63` did under P-54:
    "*2026-11-0x:* deleted. Compile's lifecycle view and On file at the agency answer both questions
    (`docs/evidence/DESIGN/R1/2026-11-0x-p87-ind-diff-manifest-retired/`). The one test that called a retired route,
    the IND routes' contract test, now asserts that all four answer 404 and that neither gate response carries
    `manifest`."
    - The last sentence corrects the record's "or in any test" (§1) without rewriting the record.
    - This is not a plan file (`one-design-plan.json` `planFiles`), and it is inside R1's `**`.
    - If the coordinator holds the file at build time, leave it out of this commit and send the lines to the
      coordinator.
11. **Evidence (new, always allowed):** `docs/evidence/DESIGN/R1/2026-11-0x-p87-ind-diff-manifest-retired/`. It holds:
    - `README.md`, with sections: What already exists (§4), the inventory check (§3), the searches and their
      output (§5, §6), what changed (§7.1), the deletion record (§8), and the gates;
    - `history-search.txt`, the whole-history output of §6, re-run at build time in a scratch clone;
    - `red.txt`, `green.txt`, `mutation-route-back.txt`, `mutation-parent-route-back.txt`,
      `mutation-gate-manifest.txt`, `mutation-reach-dispatch.txt`, `mutation-reach-filed-state.txt`.

**Not touched:**
- `shared.ts`, and every client file (`EctdCompile.tsx`, `EctdFiledState.tsx`, `SubmissionSeqWorkspaces.tsx`);
- every migration and schema, and `migration-set.mjs`;
- `CLAUDE.md`, a plan file (its `:271` is RULE 3's dated, past-tense narrative);
- the dated design records (§10);
- `docs/evidence/**` other than the new folder, including the R1 inventory, a dated measurement;
- every `scripts/ci/*baseline*.json`.

### 7.2 Response contract change (the dispatch gate is kept)

| | Before (HEAD) | After |
|---|---|---|
| `POST /api/ind-lifecycle/sequence/:seqId/dispatch-gate`, 200 | `{ verdict, assessment, sequenceValidation, manifest, actionItems }` | `{ verdict, assessment, sequenceValidation, actionItems }` |
| `POST …/dispatch-gate/snapshot`, 201 | `{ snapshot, verdict, assessment, sequenceValidation, manifest, actionItems, meta: { auditTrail } }` | the same without `manifest` |
| The four GETs | 200 with JSON or a recorded PDF (outside production); 403 `LAUNCH_SCOPE` in production | 404 JSON from the `/api` catch-all (outside production); 403 in production, unchanged |
| Verdict, `canDispatch`, `source: 'assess-dispatch-readiness'`, the snapshot row, `IND_DISPATCH_SNAPSHOT_CREATED`, cockpit, drift | — | **unchanged** (P-33) |
| OpenAPI | Uniform response schema; the four paths are present | The four paths are absent; only the summary comment changes |

`manifest` is **removed**, not set to `null`. A `null` would read as "this sequence has no manifest", which is a
statement the server cannot make. No consumer exists (§5), so this narrows a contract nobody reads.

### 7.3 Tests: deleted, changed, added (each with why)

| Test | Action | Why |
|---|---|---|
| `server/services/ind-lifecycle/__tests__/ind-sequence-diff.test.ts` | **Delete** | Pins only `diffSequences`, which is deleted. Its contract (absence reads as deleted) is the defect. |
| `server/services/ind-lifecycle/__tests__/ind-package-manifest.test.ts` | **Delete** | Pins only `buildPackageManifest` and the IND `moduleOf`, both deleted. The canonical module helper is `moduleOfSectionKey` (`server/services/ectd/required-sections.ts:101`), with its own tests. |
| `server/routes/ind-lifecycle/__tests__/routes.contract.integration.test.ts:542-547` | **Change** "GET /sequence/:id/manifest → 200 with the filed leaf" into **R2**, "the retired IND diff and manifest answer 404 (P-87)" (code below) | It proves all four are gone from the mounted router, including a re-registration on the parent `ind-lifecycle.routes.ts`, which introspection does not see. |
| Same file, `:558-561` (the dispatch-gate case) | **Change**: `:560` becomes `expect(res.body).not.toHaveProperty('manifest');` (**R3**). The `:558` comment becomes "The display parts are the validation and the action items (the package manifest was retired, P-87)." `:559` and `:561` stay | Pins §7.2. |
| Same file, `:564-574` (the snapshot case) | **Add** after `:568`: `expect(snap.body).not.toHaveProperty('manifest');` (**R4**) | The snapshot shares `computeGateForSequence`. |
| `server/routes/ind-lifecycle/__tests__/openapi.test.ts` | **Add** one case, **R1** (code below) | A pure, DB-free refusal of the way back, read from the routers' own introspection and from the generated spec. The parameter name is ignored, so `/sequence/:id/manifest` cannot slip past. |
| `tests/schema-contract/one-dispatch-verdict.contract.test.ts`, `server/services/entitlements/__tests__/ind-launch-claim.test.ts`, `server/middleware/__tests__/launch-scope-api-gate.test.ts`, `documents-recorded.test.ts`, `ind-document-renderer.test.ts`, `recorded-downloads.contract.test.ts`, `dispatch-verdict-parity.pglite.test.ts`, `tests/db/ind-audit-outcomes.dbtest.ts` | Unchanged | None names a removed piece (§5). The launch tests enumerate routes by introspection. None of the four is a safety route or a claimed one, and `SAFETY_TOP ≥ 9` / `SAFETY_REGISTER ≥ 5` are unaffected. |

**R2**, in the `DB-write + program surface` describe, at the position of the deleted case. `filedSequenceId` is
set by that describe's first case.
```ts
  it('the retired IND sequence diff and package manifest answer 404 (P-87)', async () => {
    for (const path of [
      `/api/ind-lifecycle/sequence/${filedSequenceId}/manifest`,
      `/api/ind-lifecycle/sequence/${filedSequenceId}/manifest/pdf`,
      `/api/ind-lifecycle/sequence/${filedSequenceId}/diff?priorId=${filedSequenceId}`,
      `/api/ind-lifecycle/sequence/${filedSequenceId}/diff/pdf?priorId=${filedSequenceId}`,
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
    }
  });
```

**R1**, in `openapi.test.ts`:
```ts
  it('the retired sequence diff and package manifest are not registered or documented (P-87)', () => {
    const shape = (p: string) => p.replace(/\{[^}]+\}/g, '{}');
    const registered = new Set(routes.map((r) => `${r.method} ${shape(r.path)}`));
    const documented = new Set(
      Object.entries<any>(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${shape(p)}`)),
    );
    for (const key of [
      'GET /api/ind-lifecycle/sequence/{}/diff',
      'GET /api/ind-lifecycle/sequence/{}/diff/pdf',
      'GET /api/ind-lifecycle/sequence/{}/manifest',
      'GET /api/ind-lifecycle/sequence/{}/manifest/pdf',
    ]) {
      expect(registered.has(key), key).toBe(false);
      expect(documented.has(key), key).toBe(false);
    }
    // The dispatch gate it sat beside stays (P-33).
    expect(registered.has('POST /api/ind-lifecycle/sequence/{}/dispatch-gate')).toBe(true);
  });
```

**ESLint headroom.** The `DB-write + program surface` describe counts 79 of the 100 lines that
`max-lines-per-function` allows today (skipping blank and comment lines). R2 and R4 add about 6 net. ESLint on all
seven edited files today reports three warnings, all in the contract test (`:254`, `:602` max-lines, `:1038`), and
none in that describe. `ci:pushed-lint-warnings` refuses only net growth. If step 24 has grown the describe past
about 94 lines by build time, move R2 into its own `describe('P-87: retired IND routes')` with the same `beforeAll`
seed, rather than growing the block.

**Red first.** Write R1–R4 before the deletion. Run:
```
npx vitest run --config vitest.config.ts server/routes/ind-lifecycle/__tests__/openapi.test.ts \
  server/routes/ind-lifecycle/__tests__/routes.contract.integration.test.ts
```
Save the output as `red.txt`. Expect four failures, each on its own assertion:
- R1 finds `GET …/sequence/{}/diff` registered;
- R2 receives 200 for `…/manifest`;
- R3 finds `manifest` present;
- R4 finds `manifest` present.

The contract test runs in-process on PGlite with the `pg` mock from `tests/setup.ts`, with no external database.

**Green.** After the deletion, run these and save the output as `green.txt`:
- `openapi.test.ts` and `routes.contract.integration.test.ts`;
- `ind-launch-claim.test.ts`, `launch-scope-api-gate.test.ts` and `one-dispatch-verdict.contract.test.ts`;
- `documents-recorded.test.ts`, `ind-document-renderer.test.ts` and `recorded-downloads.contract.test.ts`;
- the replacement suites of §4.3.

Baseline at HEAD, run here: openapi, the diff, the manifest, the launch claim and the one-verdict contract, 5 files
and 83 tests, green. After the change the two deleted files leave that set.

### 7.4 Mutations (each shown failing on its own assertion, then restored byte for byte)

| # | Mutation | Expected red |
|---|---|---|
| M1 `mutation-route-back.txt` | Add `router.get('/sequence/:id/manifest', (_req, res) => res.json({}));` to `sequence.routes.ts` (note the renamed parameter) | R1 (registered and documented) and R2 (`…/manifest` 200) |
| M2 `mutation-parent-route-back.txt` | Add `router.get('/sequence/:currentId/diff', (_req, res) => res.json({}));` to `ind-lifecycle.routes.ts`, before the `router.use` lines | R2 only. R1 stays green, which shows why both cases exist. |
| M3 `mutation-gate-manifest.txt` | In `computeGateForSequence`, return `{ …, manifest: null, actionItems }` | R3 and R4 |
| M4 `mutation-reach-dispatch.txt` | In the Dispatch tab's push bar, replace `available('ectd-compile')` with `false`. Find it at build time with `grep -n "onNav && available('ectd-compile')" client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`; it is `:2279` at HEAD, and step 20 (D7-A2) may move it | `ectdCompileCarriesSequence.test.tsx` ('"Validate and compile this sequence" carries the sequence…', `:73` at HEAD) fails. This proves the replacement's reach test is not vacuous. |
| M5 `mutation-reach-filed-state.txt` | Replace the `<EctdFiledState …/>` element with `null`, wherever it is mounted after step 33. Find it with `grep -n "<EctdFiledState" client/src/concept2cure/v2/surfaces/Ectd*.tsx`; it is `EctdCompile.tsx:1603` at HEAD, and steps 21 (D7-A3) and 33 (the `EctdCompiledPackage.tsx` split) may move it | `ectdCompile.test.tsx` ('shows what the agency holds now…', `:58` at HEAD) fails |

**M4 and M5 run in the one working tree, and only when all three of these hold.** There is no other worktree. RULE 0
names alternate worktrees as forbidden, so the first draft's "or in the builder's own clean worktree of trunk" is
withdrawn.
1. **F1 slices 1 and 2 have both landed on trunk.** Slice 2 holds the copy in `SubmissionSeqWorkspaces.tsx`
   (`COORDINATION.md:32` on `a2bad27e1`). Slice 1's uncommitted edits are in the working tree today, including
   `ectdCompile.test.tsx`, the very test M5 relies on.
2. **`git status --short` is clean for the targets.** It must show no edit by another build to
   `SubmissionSeqWorkspaces.tsx`, `EctdCompile.tsx` (and `EctdCompiledPackage.tsx` once step 33 has landed),
   `ectdCompileCarriesSequence.test.tsx` or `ectdCompile.test.tsx`.
3. **The coordinator has given the turn on those files.** `SubmissionSeqWorkspaces.tsx` is lane L9's step 20 (D7-A2)
   and F1 slice 2's copy hold. `EctdCompile.tsx` is lane L9's step 21 (D7-A3), and step 33 splits
   `EctdCompiledPackage.tsx` out of it.

Each mutation is a working-tree edit only, never staged. It is undone by the reverse edit, never by a checkout, and
`git diff --quiet -- <file>` must then pass. Because condition 2 required the file to match HEAD beforehand, that check
proves the restore was byte for byte. If any condition fails at build time, the commit waits. M4 and M5 are not skipped,
and they are not run anywhere else.

### 7.5 Words on screen, and what a person sees in each state

**Words on screen: none change.** No client file is edited, and no screen ever called the retired routes.

| Who, and in what state | What they see |
|---|---|
| A person in Submission Center, on a sequence's Dispatch tab | Unchanged. "Validate and compile this sequence" opens eCTD Compile on that sequence. |
| The same person, compiling an original sequence (0000) | Unchanged. The compiled package: the leaf hierarchy of `index.xml` and the regional Module 1, "Files in this package (N)", "Download index-md5.txt", the package SHA-256, and On file at the agency. There is no Lifecycle section, because an original has nothing on file to act on. |
| The same person, compiling a follow-up | Unchanged. "Lifecycle", saying which sequence the acts are bound through, then the acts table (Operation, Section, File, modified-file) and "Left out of the package: …", above the leaf hierarchy and files. |
| The same person, with nothing filed for the submission | Unchanged. The Lifecycle section says no filed sequence is on record, so nothing is on file to act on. |
| The same person, when On file at the agency cannot be read | Unchanged. It says the read failed, never an empty dossier (`ectdFiledState.test.tsx:81`). After F1 slice 1 its lead says the record is read from what each sequence sent, which is that slice's copy, not this commit's. |
| The same person, on a sequence that has been **sent** | Unchanged, and not what the new header and module-doc line send them to. What it filed is On file at the agency: each document's section, holding sequence, act and history, with no md5. "Validate and compile this sequence" is still offered, because the button has no status condition (`SubmissionSeqWorkspaces.tsx:2279`). Pressing it writes a new compile row; the hazard is §10 item 6. No screen shows a sent sequence's per-file md5 today (§4.3). The retired manifest never did either: it read the working leaves. |
| An API client calling a retired GET (none is known) | Outside production: 404 JSON. In production: 403 `LAUNCH_SCOPE`, as before. |
| An API client calling the dispatch gate or snapshot (none is known) | The same verdict, validation, action items and snapshot, with no `manifest` key. |

### 7.6 Gates and baselines (none shrinks by hand, none grows)

- **`node scripts/ci/check-one-design-plan.mjs --range origin/concept2cure-v2..HEAD`.** It passes with `Plan: R1` and
  `Completes:` an existing path. Deletions are skipped and no addition is counted.
- **`ci:one-product`, `ci:check-client-reachability`.** No surface and no client change.
- **`ci:unreferenced-modules`.** The barrel stays listed, and no module becomes newly unreferenced: the deleted
  modules' only import, `shared/regulatory/submission-type-bridge.js`, has 63 other importers.
- **`ci:duplicate-exported-types`.** `PackageManifest` is still declared twice, so the names and the count are
  unchanged. Do not regenerate the baseline. If the gate is already red on a dirty tree, re-measure on clean
  trunk.
- **`ci:typecheck:no-regression`.** The baseline is 0, and stays 0, because every importer is edited in the same
  commit.
- **`ci:pushed-lint-warnings`.** No net growth (§7.3). The unused `sendPdf` and `getSubmissionTypeLabel` imports are
  removed.
- **`ci:launch-scope-api`, `ci:governed-export-routes`, `ci:route-ownership-matrix --check`.** Unaffected. The matrix
  is prefix-level.
- **`audit:repo-health:ceiling`.** It only goes down.
- **OpenAPI.** Generated (`openapi.test.ts`, no drift), 66 → 62 registrations.
- **Not needed:** `ci:migration-drop-safety` and `ci:migration-set-order`. There is no migration.

## 8. The deletion record (the commit message)

```
R1: the IND sequence diff and package manifest are retired; Compile answers both (P-87)

The founder's decision P-87 (2026-11-01), recorded in
docs/LAUNCH_DEFINITION_OF_DONE.md by 5e3652dbf, retires the IND lifecycle's
sequence diff and package manifest.

Deleted:
- GET /api/ind-lifecycle/sequence/:currentId/diff and /diff/pdf;
- GET /api/ind-lifecycle/sequence/:seqId/manifest and /manifest/pdf;
- the `manifest` field of POST /sequence/:seqId/dispatch-gate, and of
  /dispatch-gate/snapshot, which shares its builder;
- server/services/ind-lifecycle/ind-sequence-diff.ts and
  ind-package-manifest.ts, with their unit tests;
- renderSequenceDiffPdf and renderPackageManifestPdf;
- the two index.ts exports and the four openapi summaries.
The dispatch gate's verdict, validation, action items and snapshots are
unchanged (P-33). No migration; no table, mount, route file, service,
surface or AnA tool is added. submission_leaves.checksum is untouched: it
is part of every signed sequence's content (part11/ectd-sequence-binding.ts).

Why:
- No caller. No screen, AnA tool, MCP tool or OQ/PQ script called any of
  them. One test did: the IND routes' contract test called the manifest
  GET and asserted the gate's `manifest`. Those cases are now refusals, so
  the record's "no caller ... in any test" holds from this commit. The R1
  inventory (docs/evidence/DESIGN/R1/2026-11-01-inventory/) lists all four
  GETs and the gate as unmapped, which production refuses. Its two
  "probable" callers (IndLifecycle.tsx) are false positives: that file
  calls /loa/pdf and the other document PDFs.
- The diff was wrong for eCTD. It read two sequences' working leaves and
  reported a section the next sequence did not carry as "deleted". In eCTD
  an absent leaf stays on file; only a declared delete withdraws it.
- The manifest's "missing checksums" said nothing true about the package.
  It counted leaves whose submission_leaves.checksum is null, and that
  column is set by some placements (the rendered PDF's md5) and left null by
  others. The packager computes every shipped file's md5 from its bytes
  (056cb849f), so a null never meant a file would ship unhashed.

History search, over the branch's whole history (a scratch clone, root
3e1dcf8f0 2025-11-20, 17,240 commits; output in history-search.txt):
- git log --all --full-history --diff-filter=D -- '*ind-sequence-diff*'
  '*ind-package-manifest*' '*sequence-diff*' '*package-manifest*'
  '*SequenceDiff*' '*PackageManifest*' '*ind-document-renderer*'
  '*ind-lifecycle/sequence.routes*' is empty.
- The same search over server/, shared/ and client/ for
  *Diff*/*diff*/*Manifest*/*manifest*, and over *ind-lifecycle*,
  *export-lifecycle*, *ind_sequence* and *[Ss]equence*, finds deleted
  files. Each was read (vendored gstack skills and _archive duplicates
  aside). None was a copy: they are text, document and
  component diffs; export-lifecycle.ts (51e047988), which called the
  canonical lifecycle operator; the legacy ind_sequence.js model
  (813a632ac); legacy sequence planners and creators; and analysis.routes.ts
  (86774630b), the router these routes were moved out of.
- --full-history is used so that the result does not depend on the
  clone's depth. On the shallow working clone, a639c5c4f's template search
  misses 0a047fbcf without it.
- The services were created by 5d6d5bbff (2026-06-10) and 01ae9b7f1
  (2026-06-12), after the lifecycle operator (27448f992, 2026-06-04). By
  file name, no copy of either was ever deleted. The pickaxe for
  diffSequences, renderSequenceDiffPdf, renderPackageManifestPdf,
  /manifest/pdf, /diff/pdf and priorId= (client, shared, AnA, MCP) ran
  from 2026-10-05 only, and is empty.

What now delivers each outcome (the two replacements P-87 names):
- What a sequence does to what is on file:
  client/src/concept2cure/v2/surfaces/EctdCompile.tsx (LifecycleView): every
  act with its modified-file, bound to what is on file, and what was left out;
  client/src/concept2cure/v2/surfaces/EctdFiledState.tsx: every document on
  file by module, with its holding sequence, act and history. Both read the
  one fold, server/services/ectd/prior-sequence-loader.ts.
- A sequence's leaves by module, with checksums, before it is sent:
  EctdCompile.tsx (CompiledPackageView): the leaf hierarchy of index.xml and
  the regional Module 1, every file, index-md5.txt computed from the bytes,
  and the package SHA-256; and the Builder's leaf table,
  SubmissionSeqWorkspaces.tsx (BuilderWorkspace). Once sent, what a sequence
  filed is On file at the agency (EctdFiledState.tsx).
Reached from Submission Center's Dispatch tab, "Validate and compile this
sequence" (SubmissionSeqWorkspaces.tsx), into the ectd-compile surface of the
Submission Center app (shared/constants/launch-scope.ts).

Proven reachable by:
- client/src/concept2cure/v2/__tests__/ectdCompileCarriesSequence.test.tsx
  ("Validate and compile this sequence" carries the sequence); it fails with
  the Dispatch tab's ectd-compile check forced false;
- ectdCompile.test.tsx (the filed state inside Compile, the leaf hierarchy,
  files and MD5 index, a follow-up's lifecycle); the filed-state case fails
  with EctdFiledState unmounted;
- ectdFiledState.test.tsx, server/services/ectd/__tests__/filed-state-history.test.ts,
  tests/routes/ectd-compile-lifecycle.test.ts, and
  tests/db/ectd-filed-state-view.dbtest.ts.

Refusing the way back: openapi.test.ts asserts the four routes are neither
registered nor documented, whatever their parameter is called.
routes.contract.integration.test.ts asserts they answer 404 through the
mounted router, and that neither gate response carries `manifest`. Each was
red before the change, and each fails again when its route or field is put
back (evidence: mutation-*.txt).

Red first: 4 cases. Green after: <files/tests>.
Evidence: docs/evidence/DESIGN/R1/2026-11-0x-p87-ind-diff-manifest-retired/

Plan: R1
Completes: server/routes/ind-lifecycle/sequence.routes.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e42DEAR2U6W51Mjvgfgbt
```

**Fill-ins at build time:**
- the green counts;
- the history-search counts, re-run in a scratch clone (§6), if trunk has grown;
- `EctdCompiledPackage.tsx` in place of `EctdCompile.tsx` for `LifecycleView` and `CompiledPackageView`, if step 33
  has landed;
- the test names as they then stand, if F1 slice 1 or steps 12–14 have renamed them;
- the date in the folder name.

## 9. Coordination before the first edit

Measured on `COORDINATION.md` at `a2bad27e1`. The first draft read it at `5f30fdda0`, and three of its facts have
changed since.

- **Coordinator `session_01JbQUvBxcGHdBgkgAydQKpx`.** Send the package (R1), step (35), the file list of §7.1, and
  that `docs/LAUNCH_DEFINITION_OF_DONE.md` takes the lines appended under P-87.
  - **Ask the coordinator to record RIM working under R1 for this step.** `:47` lists P-87 in RIM's queue, but RIM's
    packages are S5, F1, S10, S9 and D7. `:50` keeps R1 with `01QoxbL…`, "through the coordinator".
  - **One hold covers a file of this commit, and it is RIM's own.** `:38` holds `server/routes/ind-lifecycle/shared.ts`
    and its contract test for RIM, F1 repair C, "after slice 2". That is re-plan step 24 (F1-7). P-87 lands after it
    and edits only the contract test, not `shared.ts`.
  - Ask for the turn on `SubmissionSeqWorkspaces.tsx` and `EctdCompile.tsx` (and `EctdCompiledPackage.tsx` after step
    33) for the working-tree mutations M4 and M5 only (§7.4). The commit does not edit them.
- **R1 inventory `session_01QoxbLdKp1MgbXvCfgSkkJr`.** Send the same list, so its next run records the retirement.
  Also report:
  - the two false positives (`/diff/pdf`, `/manifest/pdf` → `IndLifecycle.tsx`);
  - the false negative on `GET /api/ectd-compile/:projectIdent/filed-state` (template suffix `${seqQuery}`).
- **Step 24.** RIM holds it (repair C, `:38`), not `014DhFkp…` as the first draft said. The re-plan names `014DhFkp…`
  (`350d1639d`) and `01E8btkB…` (`8d7faa5f0`) as sessions to coordinate with for that step, not as its holders.
- **Overlap, stated exactly.**
  - **The commit's file list** (§7.1) is under no hold but RIM's own repair C hold on the contract test. It touches
    no D0-locked file, nothing F1 slices 1 and 2 hold (`prior-sequence-loader.ts`, `submission-gateways/index.ts`, the
    filed-state route, `EctdFiledState.tsx` copy, `submission-service.ts`, `filed-dispatch.ts`, `fda-esg-receipts.ts`,
    and copy in `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `As2ReceiptUpload.tsx`), P-86 (steps 29–31)
    or P-88 (step 36).
  - **The mutations M4 and M5** touch two held files. `SubmissionSeqWorkspaces.tsx` is F1 slice 2's copy hold (`:32`)
    and lane L9's step 20. `EctdCompile.tsx` is lane L9's step 21, and step 33 splits it. They run only under §7.4's
    three conditions.

## 10. Owed and named (not done here)

1. **The other unreached IND sequence routes** have no screen caller (inventory, `prod: unmapped`):
   - `GET /sequence/:seqId/validate`;
   - `POST /sequence/:seqId/dispatch-gate`, `/dispatch-gate/snapshot`, `GET /snapshots`;
   - the cockpit and drift routes.

   P-87 keeps them. Reaching or retiring them is R1's next question for the founder, not this commit's.
2. **`server/routes/ind-lifecycle.routes.ts:2,7`.** The header still says "five" sub-routers (there are six) and
   lists "briefing book", which has been stale since `5ab665f63`. Owed to an F1 docs fix.
3. **Dated design records name the routes as they were:**
   - `docs/design/VEEVA_GAP_2026-10-22.md:170`;
   - `ECTD_FILED_STATE_VIEW_2026-10-22.md:21`;
   - `RIM_GAP_ANALYSIS_2026-10-18.md:21,58`;
   - `PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md:846,854` (G8, "IND diff").

   They are measurements of their dates and stay as they are. `CLAUDE.md:271` (RULE 3's "Why") is a plan file and
   past tense, so it is true as history and nothing is owed.
4. **Six other module-of-section helpers remain** (`EctdFiledState.tsx:50`, `EctdCoauthor.tsx:147`,
   `section-to-ctd.ts:188`, `AnaDocumentDraftingService.ts:270`, …). This commit removes one copy. The rest converge
   onto `moduleOfSectionKey` under their owners (the older design's D-12).
5. **`submission_leaves.checksum` stays exactly as it is, and it must not be dropped, rewritten or left unwritten.**
   The retired manifest was not its last reader that matters. Two governed readers remain:
   - **The signed sequence digest.** `sequenceLeaves` (`server/services/part11/ectd-sequence-binding.ts:12-25`) selects
     `checksum` with each leaf. Those leaves go into both `sequenceContentDigest` and the binding digest (:58-67), under
     `BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST`. They are reached through `deriveGovernedTargetBinding`
     (`signature-persistence.ts:649`) and re-derived at check time by `sequence-release-signature.ts`,
     `shadow-review-waiver.ts` and `protocol-signature-manifestation.ts`. `readEctdSequenceContent` feeds
     `shadow-review/shadow-review-coverage.ts`.
   - **Release-signature coverage (§11.70).** `readSequenceLeavesForComparison`
     (`server/services/ectd/signed-manifest-covers-sequence.ts:280-299`) selects `checksum` and compares it as "the
     eCTD index-md5 checksum" (:30-36). `release-signature-status.ts:400` reports "(N matched on their eCTD index-md5)".

   The schema's own contract is "MD5 of the leaf's RENDERED bytes — the eCTD index-md5 contract"
   (`shared/schema/submissions.ts:179`). If the column stopped being written, or were dropped or rewritten, every
   recorded sequence signature's re-derived digest would change, and so would Shadow Review coverage. Corroboration
   would fall to 0. Any change to it is a Part 11 change for S5, made under RULE 1: amend the creating migration in
   place, never append a DROP. P-87 neither reads nor writes it. The design's map (`p87-ind-routes.map.md` item 4)
   says the column "is never the package's checksum"; that is superseded here.
6. **Recompiling a sent sequence changes what the fold reads as filed.** Owed to S5. Not fixed here, and P-87's text
   does not point anyone at it (§7.1 items 1 and 9).
   - **The legacy branch.** After F1 slice 1, a sequence sent before the transmit guard stamped a `leafManifest` is read
     on the legacy `'compiles'` basis. That covers every sequence on file today. The branch
     (`prior-sequence-loader.ts:275`, working tree) folds every non-rehearsal compile of that sequence number, with no
     bound on `compiled_at` against the time it was sent. At HEAD (:222) the same is true for every sent sequence.
   - **The fold and the compile.** `foldManifestRows` (:379) applies every row in order, and `recordFiledAct` appends
     the act again for a key already held. The compile route checks no `dispatch_status`: it always INSERTs a
     non-rehearsal row with that sequence's `leaf_manifest` (`server/routes/ectd-compile.ts:1314`; "rehearsal" is
     derived from the prior's state at :1309, not from whether this sequence was sent). Dispatch's "Validate and
     compile this sequence" has no status condition (`SubmissionSeqWorkspaces.tsx:2279`).
   - **The effect.** Recompiling a sent legacy-basis sequence adds a row the fold reads as filed. Its filed history
     lines double, and its per-leaf md5 may drift from what was sent. A frozen sequence's leaves are immutable, and
     the lifecycle operator compares `sourceMd5 ?? md5`, so the next sequence's replace and delete may come out the
     same. That is not assured.
   - **Where it goes.** It belongs with the `ectd_compilations` record guard that F1 slice 1 names as owed
     (`f1-filed-is-what-was-sent.design.md:174-175`, re-plan step 14). As step 14 is written, its guard refuses an
     UPDATE of `leaf_manifest`. It does not refuse the INSERT of a new compile, so it does not close this gap by
     itself. The fix is one of two:
     - the compile route refuses a non-rehearsal compile of a sent sequence;
     - the legacy branch folds only compiles made at or before the send.

     The read-only way to look at a sent sequence's package is reopening a recorded compile (re-plan steps 32–33).

## 11. Critique and resolution (alternatives rejected)

| Alternative | Why rejected |
|---|---|
| **Reach the diff and manifest instead** (give them a caller in Compile or the Builder) | The founder decided to retire them. Both answer their question wrongly: absence reads as delete, and a nullable column's nulls are counted as missing checksums when the packager hashes every shipped file. Both duplicate what Compile already shows from the fold and the bytes, against RULE 3 and zero duplication. |
| **Converge the diff onto the fold** (rewrite `diffSequences` over `prior-sequence-loader`) | That is `LifecycleView` and the lifecycle operator, which already exist. A second implementation is allowed only when the first cannot be fixed (RULE 3, item 5). |
| **Keep `manifest` in the gate, rebuilt from the compile's `leaf_manifest`** | Something new, with no consumer, which P-87 removes by name. |
| **`manifest: null`, or a 410 Gone stub for each retired path** | No consumer exists. `null` asserts "no manifest", which the server cannot know. A 410 stub is four new registrations kept forever (RULE 6). 404, and 403 in production, is honest and fails closed. |
| **Retire the dispatch gate, snapshot and validate routes too** | Outside P-87. They are pinned by P-33 (`one-dispatch-verdict.contract.test.ts`) and by the launch tests. Owed in §10, item 1. |
| **Two commits** (routes first, then services) | The intermediate tree leaves the services and renderers with no importer: `ci:unreferenced-modules` turns red, or an orphan sits on trunk. One atomic commit. |
| **Only the openapi refusal, no HTTP 404 case** | It misses a re-registration on the parent router (M2 shows R1 green while R2 fails). It costs about 12 lines of test. |
| **A new "retired routes" registry or CI gate** | A new gate is a new thing (RULE 6). The two tests are the refusal. |
| **Shrink `duplicate-exported-types-baseline.json`, or regenerate any baseline** | `PackageManifest` still collides (irb, regulatory). No baseline counts these files. Hand edits would be unmeasured. |
| **Edit the dated design records and `CLAUDE.md:271`** | They are dated records, and `CLAUDE.md` is a plan file (`Plan: PLAN` only). The current-state doc (`IND_LIFECYCLE_MODULE.md`) and the decision record carry the retirement. |
| **Land before step 24** | Step 24 (RIM's repair C) shares the contract test, and the re-plan's order is binding. The P-87 record is on trunk (`5e3652dbf`), so it no longer blocks. |
| **Follow the workflow summary's literal service paths** (`server/services/ind-sequence-diff.ts`) | Nothing exists there. The record itself names the services by bare file name only. The real paths are under `server/services/ind-lifecycle/`, and §1 says so. |

### 11.1 Critique of 2026-11-01, and how each finding was resolved

Six findings survived verification. Each was checked again against HEAD `609ef94c7`, the working tree (which carries F1
slice 1's uncommitted edits) and `origin/concept2cure-v2` `a2bad27e1`. **All six are applied; none is rejected.** Where a
finding overstated a point, the row says so, and the fix was applied anyway because the rest of the finding stands.

| # | Finding (severity) | Resolution | Where |
|---|---|---|---|
| 1 | P-87 is said to remove the last reader of `submission_leaves.checksum`, but the column is inside the Part 11 §11.70 signed sequence digest (minor) | **Applied.** The two governed readers are named by path: `ectd-sequence-binding.ts:12-25` (the signed digest, through `deriveGovernedTargetBinding` and its re-derivers) and `signed-manifest-covers-sequence.ts:280-299` (release-signature coverage, `release-signature-status.ts:400`). The column must not be dropped, rewritten or left unwritten; any change is S5's, made under RULE 1 by in-place amendment. The commit's "Why" now says only what is true: the manifest counted nulls as "missing checksums" while the packager hashes the bytes. `IND_LIFECYCLE_MODULE.md:53` is kept, and the new module-doc line is worded so that it does not contradict it. The map's item 4 is superseded. Point (3) was overstated: the first draft's line was not strictly the opposite of :53. It was reworded all the same. | Header; §4.1 manifest row; §7.1 item 9; §8 "Why" and "Deleted"; §10 item 5 |
| 2 | The new pointer text sends a person to Compile for a sequence's leaves and checksums with no bound, and compiling a sent legacy-basis sequence rewrites On file at the agency (minor) | **Applied.** Both new texts are bounded: "Before it is sent … the compiled package (`EctdCompile.tsx`); once sent, what it filed is On file at the agency (`EctdFiledState.tsx`)". §4.3 says no read-only screen shows a sent sequence's per-file md5 today, and that steps 32–33 are the planned read. §7.5 gains a row for a sent sequence. §10 item 6 records the hazard and owes it to S5 with the `ectd_compilations` record guard. It adds one fact the critique left out: step 14's guard, as written, refuses an UPDATE and not the INSERT of a new compile. The critique's "the next sequence's replace/delete are computed against the altered state" is softened to "may come out the same; not assured", because frozen leaves are immutable and the operator compares `sourceMd5 ?? md5`. | §4.3; §7.1 items 1 and 9; §7.5; §8 "What now delivers"; §10 item 6 |
| 3 | AnA's `compute_lifecycle_operations` is named a replacement "over the same fold", but it takes model-supplied prior leaves, and it refuses a sequence sent without a compile (minor) | **Applied.** AnA is dropped from the replacements in §4.3 and in the commit message. §4.3 gains a "Not named as a replacement" paragraph with the handler's lines (`AnaToolExecutor.ts:9690`, :9693, :9723) and the loader's refusal (`prior-sequence-loader.ts:66-68`, :87-104). The record's two replacements are the only ones named (§1 fact 4). The critique's appeal to RULE 2 is a stretch, since the model supplies inputs to a deterministic operator, but that does not change the overstatement. | §1 fact 4; §4.3; §8 |
| 4 | "No copy of either was ever deleted" is unproven before 2026-10-05, because the clone is shallow (minor) | **Applied, by deepening the history, not by narrowing the claim.** A scratch clone under `decided/p87-deep.git`, trees only, was unshallowed to the root (`3e1dcf8f0`, 2025-11-20; 17,240 commits). The shared `.git` was not touched. Every §6 search was re-run over that clone, and every deleted file it found was read (`decided/p87-deep-history.txt`, `decided/p87-deep-blobs/`). None is a copy. The claim now stands "by file name, over the whole history". The one remaining limit, the pickaxe, which ran from 2026-10-05 only, is stated in §6 and in the commit. The re-run also corrected two facts. `--full-history` matters only on the shallow clone. The lifecycle operator (`27448f992`, 2026-06-04) predates the IND copies, so §4.4's "the canonical path was built later" was wrong for the operator. | §4.4; §6; §7.1 item 11 (`history-search.txt`); §8 |
| 5 | M4/M5 offer an alternate worktree (RULE 0) and mutate files that other holds cover, while §9 claims no overlap (major) | **Applied.** The worktree option is withdrawn. M4 and M5 run in the one working tree, and only when three things hold: F1 slices 1 and 2 have both landed; `git status --short` is clean for the targets and their two tests; and the coordinator has given the turn. Each is restored by the reverse edit and checked with `git diff --quiet`. If a condition fails, the commit waits. The hold attribution is corrected: M4's file is F1 slice 2's copy hold (`COORDINATION.md:32`) and L9 step 20; M5's file is L9 step 21, split by step 33. M5 finds the `<EctdFiledState>` mount by grep, wherever it stands after step 33. §9's "no overlap" now separates the commit's file list from the mutations. The critique's "major" is higher than the practical exposure, since step 35 already follows steps 20, 21 and 33 in the binding order, but RULE 0 makes the worktree option wrong regardless. | §7.4; §9 |
| 6 | The design was measured on a stale origin: the P-87 record has landed, and the hold facts have changed (minor) | **Applied.** Re-measured on `a2bad27e1`; the critique cites `4fc110a7c`, which is an ancestor of it. §1 quotes the record word for word (`LAUNCH_DEFINITION_OF_DONE.md:1706-1722`), states that it has landed as `5e3652dbf`, and notes that its "or in any test" is superseded by the converted contract test. That note also appears in the commit body and in the line appended under P-87. Blocker 1 is dropped, and the commit body cites `5e3652dbf` in place of the placeholder. §9 names RIM's repair C hold on the contract test (`:38`), asks the coordinator to record RIM under R1 (`:47`, `:50`), and corrects step 24's holder. The critique's point that R1 is `01QoxbL…`'s lane repeats what the first draft already said; it is kept as part of the request to the coordinator. | Header; §1; §7 "Order and blocks"; §7.1 item 10; §8; §9; §11 table |

**What did not change.** The decision's scope stays the same: the four GETs, the gate's embedded `manifest`, the two
services and their renderers. The file list is unchanged, apart from adding `history-search.txt` to the evidence
folder. So are the tests R1–R4, the red-first run, M1–M3 and the gates. No new file, route, service, table, mount, AnA
tool or migration is introduced. The commit still edits no client file.

## Coordinator rulings, 2026-11-02 01:19 (binding)

1. **The P-87 "deleted" note** is appended under P-87 in `docs/LAUNCH_DEFINITION_OF_DONE.md` in the deletion commit
   (as 5ab665f63 did under P-54), if `ci:one-design-plan` accepts it under `Plan: R1`. If the gate refuses it, tell the
   coordinator, who adds it.
2. **M4 and M5** byte-for-byte reverse-edits are fine. Ask for the turn first.
3. **Before the coordinator puts the founder the next R1 question** (GET /sequence/:seqId/validate, POST
   /dispatch-gate, /dispatch-gate/snapshot, GET /snapshots, the cockpit and drift routes), re-check each row against
   the corrected R1 inventory (d8f559377). It found 38 false "no caller" rows. Re-check P-87's own routes against it
   too.
