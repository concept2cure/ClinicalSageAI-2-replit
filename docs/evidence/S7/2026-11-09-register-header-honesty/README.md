# A register card refused to show itself and stated its contents in the same breath

**Row:** D4 (CMC / Module 3) · **Package:** S7 · **Date:** 2026-11-09

`RegisterCard` is the one component behind all **fifteen** CMC registers. Its body has always been
honest: a read in flight shows the busy state, a failed read shows `tone="error"` with its own title
and hint, a register read and found empty shows the empty state.

Its **header** was outside that triage. It rendered `meta(rows)` unconditionally, over the local
working set — which is seeded only once a read **resolves**. So on a failed read it printed a figure
derived from a read that never happened.

Caught in the running app, on the demo programme, with the analytical-methods read failed:

| | |
|---|---|
| **Before** (`01-…png`) | **Analytical method library** — *organization-wide — ICH Q2 — 0/0 validated · this project* ▸ **Couldn't load analytical methods** |
| **After** (`02-…png`) | **Analytical method library** — *Not loaded · this project* ▸ **Couldn't load analytical methods** |

One card, at one moment, both refusing to show the register and stating its contents. And on this
register that figure is the one that stops every specification approval: ICH Q2 says a limit cannot be
approved without a validated method, so "0/0 validated" is read as the fact that blocks the work.

The working agreement states the general rule: *"Fail closed, never fabricate… honest empty states. An
error is never rendered as an empty result."*

## What already exists

| Path | What it does today |
|---|---|
| `client/.../surfaces/cmcRegisters.tsx` | `RegisterCard`, and the fifteen register components that pass it a `meta`. Its body's loading/error/empty triage was already correct |
| `client/.../v2/dataConnect.tsx` | `useLiveRows` → `ListState` with `loading`, `error`, `rows`, `empty`. The states were already available; the header did not consult them |
| `client/.../v2/__tests__/*Honesty*.tsx` | 40 existing honesty suites — the established idiom (jsdom, stub `fetch`, render the real component, assert the DOM) |

Nothing new. One `span` moved inside the triage the same component already applies ten lines below.

## The change

`headerMeta(live, rows, meta)`, beside `RegisterCard`:

- any row in hand → the figure (so a failed **refetch** keeps its line, exactly as the body keeps its
  table);
- else a resolved read → the figure, **including a read that resolved empty** — zero is a fact about
  that register, and the body shows its empty state beside it;
- else failed → `Not loaded`; still in flight → `Loading…`.

Not silence: a header that simply dropped its line would read as a register with nothing to say.

The scope note (`· this project` / `· all projects`) stays in every case. It is not a figure — it says
where the register lives, which is true whether the read worked or not, and it is how a reader knows an
org-scoped register is not empty merely because no project is open.

Extracted to a function rather than inlined, because the ternary chain took `RegisterCard` to a
complexity of 18 against a cap of 15, and the rule is to extract rather than baseline. The file ends at
the **same 2 eslint warnings as HEAD**.

## Verified

- **In the running app**, signed in as the dev user, on `C2C-201`, Study records, with only
  `/api/cmc/analytical-methods` failed and every other read untouched. The two screenshots are that
  card before and after. The other eight registers on the tab kept their figures, and the ones that
  were read and hold nothing still print their zeros — which is right.
- **`cmcRegisterCardHonesty.test.tsx`** — 6 cases, pinning the rule rather than the wording. Against
  the unconditional header, **3 of 6 fail**, including
  `expected 'organization-wide — ICH Q2 — 0/0 vali…' not to match /\d+\s*\/\s*\d+\s*validated/`.
- `eslint` 0 errors, warning count unchanged against HEAD (stash-checked).

## Checked and found sound (not changed)

The same question was asked of the other "N of M" lines on the CMC surfaces. All three are already
inside their triage, so nothing was touched:

| Path | Why it is honest |
|---|---|
| `CmcModule.tsx:1192` — "N of M sections approved" | The whole block is guarded by `secs.length > 0`, so the zero case never renders. The readiness chip beside it already says "this is a failed read, not a pass" |
| `CmcModule3Build.tsx:499` — "N of M sections approved" | Inside `readiness.loading → status / readiness.error → alert / readiness.data → counts` |
| `CmcModule3Build.tsx:106` — `BuildCounts` | Only reached in the branch after loading, 409 and error are handled, and `module3BuildStateRoutes.ts:147` returns `summary` unconditionally on every 200, so the `EMPTY_BUILD_SUMMARY` defaults cannot stand in for a failed read |
