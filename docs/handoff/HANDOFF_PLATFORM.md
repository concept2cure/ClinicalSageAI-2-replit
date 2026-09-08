# Session Handoff — Platform & UI Stream

**Commit to `docs/handoff/HANDOFF_PLATFORM.md`.**

**Scope:** The AnA conversation surface, shell, visibility, layout, and cross-cutting
repo hygiene. Everything that is neither the device pathway nor the biotech pathway.
**Last verified:** 2026-09-03 against commit `499f096` on `concept2cure-v2`.

This file is self-contained. An agent working this stream needs no other handoff.

---

## 0. How a new agent starts

Paste exactly this as the first message of a new Claude Code session, and nothing else:

> Read `docs/handoff/HANDOFF_PLATFORM.md` in full before anything else. Then read only
> the files it names. Do not read the whole repo. Do not propose work. Report what you
> understand the current state and the single next authorized action to be, and stop.

---

## 1. This stream's purpose

This stream exists so JM can **see what the product is doing**. It is instrumentation
for the operator, not features for a customer.

The premise: JM cannot currently distinguish a real failure from a silent success. That
costs more than the bugs do — every verification session ends in "AnA is broken" whether
or not she was. Fixing observability makes every other stream cheaper.

Nothing on this stream ships a new capability. If a task on this stream requires
building a new capability, it is on the wrong stream.

---

## 2. This stream's territory

**You may edit:**
- `client/src/concept2cure/v2/` — `Shell.tsx`, `V2App.tsx`, `AnaActivity.tsx`,
  `AnaWorkPanel.tsx`, `surfaces/ConversationThread.tsx`, `fixtures/`, `styles/`
- `client/src/concept2cure/components/ana/` — `useAnaChat.ts` and its types
- `docs/reports/` for proof

**You may not edit:**
- `server/services/pathway-engines/estar/`, `server/services/forms/`,
  `assets/estar-templates/` — the device stream, running concurrently
- `server/services/ectd/`, `server/services/ind-forms/`, `assets/ectd-dtd/` — the
  biotech stream, running concurrently

If your work appears to require a file outside your territory, **stop and report it.**

---

## 3. Ground rules

1. **Branch `concept2cure-v2` only.** Never create a branch.
2. **No file proliferation.** Refactor in place. No `AppShellV2.tsx`, no `-new`, no
   `-final`. This repo's history of creating a file beside an old file *is* the disease.
3. **The machine room is sacred.** Editor, artifact lifecycle, provenance, review,
   submission, vault, audit chain, tenant isolation. A UI task never restructures it.
4. **Fail closed, never fabricate.** Unpopulated fields stay omitted. Never render a
   tool trace, a grounding chip, or a governance ceremony that the server did not send.
   This surface has already had three such defects; see §6.
5. **One renderer per concern.** If a component already renders a thing, extend it —
   do not build a second one beside it.
6. **Done means JM watched it.** You report and stop. You do not declare completion on
   a visual change.
7. **One fix per session.**
8. **Typecheck baseline is zero and stays zero.**

---

## 4. Where truth lives

| Source | Use it for |
|---|---|
| `docs/handoff/WO-11_ANA_VISIBILITY_AND_CANVAS.md` | The current work order |
| `CLAUDE.md` | Repo law. Current and clean. |
| `client/src/concept2cure/v2/V2App.tsx:195-218` | The reference implementation for §6 |
| `docs/reports/orphan-endpoints-latest.md` | Machine-generated. Regenerate; never cite from memory. |

### Retired documents — do not follow

**`docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md` is dead law.** It names `ZenApp.tsx` and
`ZenSidebar.tsx` as canonical, describes a five-destination shell, and prescribes a
`LayoutMode` enum collapse.

**Both files no longer exist.** That architecture was replaced by
`client/src/concept2cure/v2/` — `Shell.tsx` (~1,816 lines), `V2App.tsx`, a rail +
segment IA (`RAIL_CORE`, `RAIL_SPECIALIST`, `RAIL_EXPLORE`, `RAIL_QUICK`,
`NAV_TIERS_V2`, `SEGMENTS`, `NAV_HIDDEN`), and `surfaceViews.ts` as the lazy
`id → loader` map.

The parity document was never retired and will mislead any agent that reads it as law.
**Do not restore the five-destination shell. Do not collapse a `LayoutMode` enum that no
longer exists. Do not create `config/ui-surface-registry.json`** — it does not exist and
is not the registry; the real ones are `shared/constants/ui-surface-registry.ts` and
`.ui-v2.ts`.

Any root-level markdown older than 2026-08 is a snapshot, not an instruction. There are
939 markdown files in this repo. Most are history.

---

## 5. Current state of the frontend

Measured, not assumed:

- **Zero dead code.** All 117 surface `.tsx` files are reachable — 89 registered in
  `v2/surfaceViews.ts`, 49 ids in `shared/constants/ui-surface-registry.ts`, and the 28
  single-reference surfaces are all legitimate (24 via `surfaceViews`, 4 as children:
  `AnaDocContext`←`ConversationThread`, `AuthoringRevisionDiff`←`DocumentAuthoring`,
  `CmcQuality`←`CmcModule`, `ProtocolGov`←`ProtocolDev`, `RbmIngest`←`RbmSurfacesA`).
- **The problem is scope, not rot.** The fix for surface sprawl is feature flags, not
  deletion. Do not delete a surface file.
- Server-side dead-code removal is a **separate, deferred** workstream
  (`WO-10_SAFE_DEAD_CODE_REMOVAL.md`, 581 candidates). It does not start until the
  device demo passes. Do not start it here.

---

## 6. The open work — WO-11

`useAnaChat` receives a full SSE contract: `status` phases, `thread_id`,
`orchestration`, `text`, `done`, `post_done`, `warning`, `grounding_strip`, `tool_use`,
`tool_result`, `artifact_draft`, `error`. `AnaActivity.tsx` (299 lines) already renders
the phase line, tool rows, lens, detected document type, thinking, and draft title.
`Shell.tsx:969` mounts it in the rail.

**`ConversationThread.tsx` — the primary conversation surface — drops all of it.**

`toTurn` at line 26 maps `AnaChatMessage → CtTurn` carrying only `answer`, `thinking`,
`grounding`, `executedActions`, `pendingSignoffs`. It discards `toolCalls`,
`statusPhase`, `streaming`, `detectedLens`, `detectedDocumentType`, and
`generatedDraft.title` — every field `AnaActivityProps` needs.

While a run is in flight, line 754 renders three animated dots. A run can execute many
tools across multiple rounds over minutes.

**This exact bug was already found and fixed elsewhere.** `V2App.tsx:195-198`:

> *"…dropped here — useAnaChat captured the tools, rounds, lens and drafts, and the rail
> rendered a single line of body text — so AnA could run three deterministic engines
> across two rounds and the person waiting saw the word 'Thinking…'"*

It was fixed in the rail and never applied to the conversation surface. Treat WO-11 as
applying an existing fix to the surface that was missed — not as new work.

**A fourth dead renderer.** `AnaTurn` lines 78–85 render `turn.tools` with a `.ct-tool`
row. `toTurn` never sets `tools`, so it has never appeared once. This is the same defect
class the file's own comments already caught twice — the deleted proposal block, and the
dropped `executedActions`/`pendingSignoffs` that cost a 21 CFR 11.50 signature gate.
**Watch for this pattern on this surface. It recurs.**

**Layout.** `app-v2.css:2576` caps `.ct-col` at 768px beside a fixed 384px dock
(`:2698`), leaving a narrow strip with dead margin on a wide display. `.ct-side-work` is
`max-height: 52%`, which truncates the live work panel so a long run scrolls its own
history out of a half-height box.

---

## 7. Next authorized action

**WO-11, Fix A.** Read `docs/handoff/WO-11_ANA_VISIBILITY_AND_CANVAS.md`.

Acceptance is a seven-row table that **JM fills in while watching a real turn**. The
agent does not fill it and does not commit a proof report claiming completion on an
unverified row.

After WO-11 passes: stop. The next action on any stream is JM's to name.

---

## 8. Do not

- Restore the five-destination ChatGPT-parity shell.
- Create `config/ui-surface-registry.json`.
- Delete a surface `.tsx` file. All 117 are reachable.
- Start server dead-code removal. It is deferred behind the device demo.
- Build a second tool-transparency renderer. `AnaActivity` is the sole authority.
- Build a drag-resize handle. Collapse plus a stepped measure is enough.
- Remove the reading-measure cap entirely. Long-form regulatory prose is unreadable at
  1400px line length.
- Invent a storage-key convention. Grep for an existing persisted UI preference and
  follow it.
- Wire a dead renderer rather than deleting it, when wiring would mean inventing a
  client-side pipeline the server does not drive. That is fabricated governance and the
  house rule forbids it. Delete, and leave a comment saying why.
- Write a new architecture document.

---

## 9. Session log — append one row, never rewrite

| Date | Account | Authorized fix | What JM verified | Report |
|---|---|---|---|---|
| 2026-09-03 | B | WO-11 Fix A — AnA visibility in the thread | | `docs/reports/wo11-ana-visibility-proof-2026-09-03.md` |

**Rule:** the last row with an empty "What JM verified" cell is the open work. A session
that ends without filling it resumes that row rather than starting a new one.
