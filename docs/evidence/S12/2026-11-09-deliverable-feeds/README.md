# A work project's deliverables, read from the lineage that already records them

**Package:** S12 (work projects and their deliverables mapped downstream, P-83). **Date:** 2026-11-09.
**Completes:** `server/services/cmc/section-drift.ts`.
**Serves:** P-83 / S12 — "those projects have deliverables downstream, and that needs to be thought about and
mapped" (founder, 2026-11-01), mapped in `docs/design/THE_PROGRAM_2026-11-01.md` §7a.

## What already exists (RULE 3)

§7a's own "What is missing" list is **wrong for CMC on one of its four items**, and this slice is written on that
finding rather than around it.

| Path | What it does today | §7a's claim | Used here |
|---|---|---|---|
| `cmc_section_lineage` (`shared/schema/cmc-os.ts:35`, indexed by `migrations/0016_module3_workflow_convergence.sql`) | records, per compiled section, every source object it read and that source's hash at compile | — | the whole read; no new table |
| `services/cmc/section-drift.ts` `findSectionDrift` | which **sections** no longer match their sources, derived from that lineage rather than from a flag | *"the flag on a downstream section when a new version lands"* is **missing** — it is not; it exists and is stronger than a flag | extended, not duplicated |
| `services/cmc/section-drift.ts` `sectionsFedBy` | the write-through's own impact map (`impactedSectionsForSourceType` / `impactedSectionsForChangeControl`), applied to one source record | *"its 'feeds' links to the downstream sections"* is **missing** — the map exists; nothing read it by deliverable | the `feeds` list is this function's output, never a copy of it |
| `services/cmc/final-export-gate.ts`, `api/cmc/module3OperatingSystemRoutes.ts` | both consume `describeDrift` today | — | unchanged: `describeDrift`'s sentences are byte-identical |
| `services/ana/changePropagationTools.ts` | §7a's named change-propagation path | — | not touched; this is the CMC register's own lineage, which is finer |

What §7a says is missing and **genuinely is**, for CMC: the deliverable list itself (supplied here, derived — not
stored), the owner and due date per deliverable (not supplied: there is nowhere to record them, see below), and the
program's map across projects (not supplied).

Nothing new: no screen, route, service file, table or AnA tool. One interface, one exported function and two
helpers were added to the module that already owns these facts, and two SQL strings were lifted to constants so
both views read the same rows.

## The change

`projectDeliverableFeeds(q, orgId, projectId)` answers §7a's question in the other direction. `findSectionDrift`
asks *"is this section still current?"*; a work project's Feeds list asks *"what does this deliverable feed, and
what did it put out of date?"* Same two reads, same impact map, **attributed**.

| Field | Where it comes from |
|---|---|
| `sourceType` | the canonical register (`specification`, `batch`, `stability`, `method`, …) |
| `records` | how many of that type the project holds |
| `lastRecordedAt` | `GREATEST(created_at, updated_at)` over them |
| `feeds` | the union of `sectionsFedBy(record)` — the write-through's map, read, not restated |
| `drifted` | the sections whose drift reasons belong to **this** source type |
| `reasons` | the drift sentences `describeDrift` already writes, prefixed by section |

### The one structural change, and why it was necessary

A drift reason was a bare sentence. A section's reasons could therefore say *that* it had drifted but not *which*
deliverable drifted it. Read by section that is sufficient; read by deliverable it is a false statement waiting to
be made — a CMC user would be told their **specifications** are out of date because a **batch record** changed.
So `reasons` is now `DriftReason[]` (`{sourceType, text}`) internally, and `driftFrom` maps back to the text at the
boundary. `SectionDrift`, `describeDrift` and both existing callers are unchanged, byte for byte.

### A failed read is reported as one

`ProjectDeliverableFeeds.notEvaluated` carries the failure in its own words. A project whose registers could not
be read has **not** been shown to hold no deliverables, and the Feeds list must not draw itself empty over a
database error (working agreement: *"an error is never rendered as an empty result"*).

## Verified by making each check fail

| Case | Mutation | What it reported |
|---|---|---|
| `does not blame one deliverable for another's drift` | the per-source-type filter removed, so every deliverable claims every drifted section | *"expected [ '3.2.S.4' ] to deeply equal []"* |
| `reports the failure rather than an empty map` | the `catch` returns `{deliverables: []}` with no `notEvaluated` | *"a failed read was rendered as a project with nothing recorded: expected undefined to be truthy"* |
| `lists the sections from the write-through's own impact map, not a copy of it` | `feeds` hard-coded to the section the record's lineage happens to hold instead of `sectionsFedBy` | *"expected [ '3.2.S.4' ] to include '3.2.P.5'"* |

Full output in `03-mutation-drift-not-attributed.txt`, `04-mutation-failed-read-as-empty.txt`,
`05-mutation-feeds-not-the-impact-map.txt`; the green run in `02-green.txt`.

Tests: `services/cmc/__tests__/deliverable-feeds.test.ts` (new, 8 cases) — the deliverable list and its counts, a
deliverable the project holds that has composed nothing yet, attribution in both directions, a record added after
the compile, the reason wording, and the failed read.

### One fixture correction worth recording

My first fixture modelled "a source changed after compile" by mutating `source_hash` on the **sources** row. The
real query reads `o.source_hash` through the lineage join as `liveHash`, so the fixture was testing nothing; it now
sets `liveHash` on the lineage row. It also used `batch_record`, which is not a `CMC_SOURCE_TYPES` member — the
canonical type is `batch`. Both were the fixture's errors, not the code's.

## `ci:sql-interpolation` refused the first shape, and the fix was tighter than the baseline

Lifting the lineage query to a `const` and writing `q.query(`${LINEAGE_SQL} ${sectionFilter}`, …)` put **two**
values into SQL text where the baseline allows one:

```
• server/services/cmc/section-drift.ts: 2 value(s) interpolated into SQL text, baseline allows 1
```

The gate is right that a `const` of SQL text is indistinguishable, to it, from a caller's string. So the read is a
function instead — `lineageSql(sectionFilter: SectionFilter)`, where

```ts
type SectionFilter = '' | 'AND s.section_key = $3';
```

is the "fixed allowlist in code" the gate's own message asks for, now enforced by the compiler rather than by a
reader: before this change `sectionFilter` was an unconstrained `string`. The file went to **0** interpolations at
a `q.query` site, and the gate then refused the push a second time for the opposite reason:

```
• server/services/cmc/section-drift.ts: now 0 (baseline 1) — good news; lower the baseline to lock it in
```

So `scripts/ci/sql-interpolation-baseline.json` drops this file 1 → 0, in its own `Plan: F1` commit because that
file is outside S12's paths and only F1 may touch it. The gain is locked in: a value interpolated at a `q.query`
call in this file is now refused outright.

## Gates

`tsc --noEmit` 0 errors. ESLint: no file gained a warning (5,760 warnings, baseline 6,090).
`ci:sql-interpolation` OK at 0 for this file, see above. The three existing suites that consume this module —
`services/cmc/__tests__/section-signature-binding.pglite.test.ts`,
`api/cmc/__tests__/module3SectionApproveFourEyes.test.ts` (22 cases together) — pass unchanged, which is the point
of leaving `describeDrift` alone.

## Not in this slice

- **The owner and due date per deliverable.** §7a asks for both. There is no column anywhere for either: a CMC
  deliverable is not a row, it is *the set of records of one source type in one project*. Recording an owner and a
  due date against that set means a new table, which RULE 6 reserves for the founder. The honest intermediate is
  what this function returns — the records, when they were last touched, and what they feed.
- **The API handler and the "Feeds" list in the project page.** The handler lands with its caller, not before it
  (a route with no client caller is exactly what RULE 3's own worked example calls out). The project page is held
  by another session; the function is ready for it.
- **The program's map across projects.** Needs the program → project read, which is `project-rollup-service.ts`'s,
  not this module's.

## Trunk red found while verifying, not mine

`server/services/__tests__/artifact-signed-target-binding.test.ts` fails one case,
`'approved: no-assignment policy remains ordinary approval'`, with and without this diff (stash-verified).
`72232bdbc` ("an artifact is approved only after its review", P-95) made approval refuse when no one has reviewed
the document; the isolated-adapter fixture `artifact-signed-target-cases.json` still asserts `allowed: true` for
`quorum: "none"`. It is the F1 lane's fixture and its package's file, so it is reported, not edited here.
