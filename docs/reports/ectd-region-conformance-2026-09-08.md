# eCTD regional Module 1 conformance — which regions will pass, which will fail

**Date:** 2026-09-08
**Scope:** the twelve regions the canonical packager builds a Module 1 backbone for.
**Verified from:** `server/services/submission-gateways/regional-packager.ts`,
`server/services/ectd/regional-backbone-readiness.ts`,
`server/services/ectd/controlled-vocab/fda-regional-sections.ts`, and the bytes the
packager actually writes (asserted in
`server/services/ectd/__tests__/regional-backbone-readiness.test.ts`).

## The one-sentence finding

**One region of twelve — FDA — has a Module 1 backbone built to its agency's heading
structure. The other eleven do not, and vendoring the licensed DTDs will not change
that: it will turn "cannot be validated" into "fails validation".**

## What each region actually emits

| Region | File written | Root element | Module 1 filing | Verdict |
|---|---|---|---|---|
| **fda** | `m1/us/us-regional.xml` | `<fda-regional:fda-regional>` | leaves **grouped** under FDA heading elements — **no `<leaf>` is a direct child of `<m1-regional>`** | **built to the agency heading table** |
| ema | `m1/eu/eu-regional.xml` | `<eu-regional>` | every Module 1 leaf **flat** under `<m1-eu>` | non-conformant (own root, flat) |
| pmda | `m1/jp/jp-regional.xml` | `<jp-regional>` | every Module 1 leaf **flat** under `<m1-jp>` | non-conformant (own root, flat) |
| ca | `m1/ca/ca-regional.xml` | `<ca-regional>` | every Module 1 leaf **flat** under `<m1-ca>` | non-conformant (own root, flat) |
| uk | `m1/uk/uk-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure in an MHRA-named file |
| ch | `m1/ch/ch-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| au | `m1/au/au-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| cn | `m1/cn/cn-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| br | `m1/br/br-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| in | `m1/in/in-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| kr | `m1/kr/kr-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |
| sg | `m1/sg/sg-regional.xml` | **`<eu-regional>`** | flat under `<m1-eu>` | placeholder — EMA structure |

Every cell in the "Root element" and "Module 1 filing" columns is read out of the
packager's real output by the test named above — not restated from a map. Specifically:

- **Root element** — `ROOT_ELEMENT` in that test records the twelve values above and each
  is compared against the root read from the bytes the packager wrote. *Until 2026-09-08
  the FDA row was the exception:* `fda-regional:fda-regional` — the root of the one region
  claimed conformant — appeared in no assertion in the file at all, while this sentence
  claimed otherwise. It does now.
- **Module 1 filing** — asserted as the real structural property, not a positional one.
  For FDA: **no `<leaf>` is a direct child of `<m1-regional>`, wherever in the container
  it sits.** For ema/pmda/ca: **every** `<leaf>` is a direct child of `<m1-eu>` /
  `<m1-jp>` / `<m1-ca>`, not merely the first one.

  Both directions were previously written as `<container>\s*<leaf>` regexes, which read
  only the child immediately after the container's opening tag. A stray
  `<leaf ID="strayflat" …/>` appended inside `<m1-regional>` **after** the grouped
  headings — exactly what "grouped, not flat" says cannot happen — left the suite at 28
  passed (28). The assertion is a depth walk (`directChildrenOf`) now, and that walk
  throws rather than returning "no flat leaves" when the container is absent, unclosed,
  or the document is not readable text.
- **The fixture is no longer vacuous.** It supplied ONE Module 1 leaf (`1.2`), so
  `bySection` in `buildFdaBackbone` always held a single entry and multi-section grouping
  was never executed: a partial-flattening mutation (`i === 0 ? grouped : flat`) produced
  **bit-identical** output against it. The fixture is now five leaves across four
  headings — `m1-1-forms` (holding both `1.1` and the non-heading descendant `1.1.1`),
  `m1-2-cover-letters`, `m1-3-4-financial-certification-and-disclosure` and
  `m1-6-1-meeting-request` — and that same mutation now fails with *"3 `<leaf>`
  element(s) are filed FLAT as direct children of `<m1-regional>`"*.

### Where this comes from in the code

- `backboneByRegion` (`regional-packager.ts:743`) routes **eight** regions —
  uk, ch, au, cn, br, in, kr, sg — to `buildEmaBackbone`. That builder emits
  `<!DOCTYPE eu-regional …>` and an `<eu-regional>` root
  (`regional-packager.ts:392`), so `uk-regional.xml` is an EU regional document
  with a UK file name.
- `buildEmaBackbone`, `buildPmdaBackbone` and `buildHcBackbone` each filter the
  Module 1 leaves and emit them as a flat list directly inside `<m1-eu>` /
  `<m1-jp>` / `<m1-ca>`. There is no heading level between the container and the
  leaves, and each `<admin>` envelope is a plausible-looking invention rather
  than the agency DTD's element order.
- `buildFdaBackbone` (`regional-packager.ts:264`) is the exception: it groups each
  leaf under `usRegionalSectionElement(section)`, whose names are derived from
  the FDA-published Context-of-Use code list
  (`controlled-vocab/fda-regional-sections.ts`).

### The honest caveat on FDA

FDA is the only region **built to** its agency's published Module 1 heading table.
That is a statement about construction, not a validation result: `us-regional-v3-3.dtd`
is licensed and not vendored, so no FDA backbone in this repo has been machine-checked
against the real DTD either. "Conformant" in `regionConformant` means built to the
published structure; it does not mean validated.

## Why the DTD procurement does not close this

The DTD gate (`server/services/ectd/dtd-bundler.ts`) answers one question: *does the
package ship the grammar its DOCTYPEs point at?* That is self-containment. It says
nothing about whether the XML is written to that grammar.

So when the licensed DTDs land in `assets/ectd-dtd/`:

- every region's package becomes self-contained and `ECTD_REQUIRE_DTD` becomes
  switchable;
- FDA becomes actually verifiable for the first time;
- the other **eleven** become *verifiably wrong*. A validator handed
  `uk-regional.xml` with an `<eu-regional>` root, or `eu-regional.xml` with leaves
  where the EU Module 1 headings should be, rejects it.

This is pinned as an executable assertion, not just prose:
`__tests__/dtd-bundler.test.ts` → *"a fully vendored drop-point clears the DTD gate
WITHOUT making a region conformant"* — all twelve regions clear the DTD gate at its
strictest setting, and only FDA is region-conformant.

**Closing the other eleven is engineering, not procurement:** the EMA/PMDA/HC builders
must file Module 1 under the agency heading tables and emit the agency `<admin>`
envelope, and the eight widened regions each need their own backbone instead of a
borrowed EU one.

## Is it reported where a user can see it?

Partly. Reported today:

- **The packager stamps it on every bundle.** `regional-packager.ts:930` calls
  `classifyRegionalBackbone`, and the status (`regionConformant`, `placeholderOf`,
  `conformanceGap`) is persisted on the bundle descriptor by the assemble route
  (`server/routes/submission-ops.ts:2676`) and forwarded through governed transmit.
- **The pre-transmit gate always surfaces it.** `evaluateRegionalBackboneGate`
  emits a **failing check row** and a **warning** for every non-conformant backbone
  regardless of enforcement, and a blocker only under
  `ECTD_REQUIRE_REGIONAL_BACKBONE=true` in production. A non-conformant region can
  never read as a passing check there.

Not reported today — **two gaps, both outside this cluster's files**:

1. `server/services/submission-gateways/index.ts:141` consumes only `pre.blockers`
   from the pre-transmit result. The regional-backbone **check row and warning are
   computed and discarded**, so with enforcement off (today's posture) nothing about
   the non-conformance reaches an operator through the transmit path.
2. `server/routes/ectd-compile.ts:806,864` — the compile surface a user reads —
   raises a blocker from `dtdStatus.selfContained` but has **no regional-backbone
   blocker or finding**. Once the DTDs are vendored, `selfContained` flips to true,
   that blocker disappears, and an EMA/UK/PMDA compile reads **clean** while its
   Module 1 backbone is still non-conformant. This is the precise surface where
   "the DTDs arrived" will be misread as "the region is ready".

Recommended (owner of those files, not changed here): carry
`regionalBackbone.regionConformant` into the compile findings the same way
`dtdSelfContained` is carried, and surface `pre.warnings` alongside `pre.blockers`.

## Enforcement

`server/services/ectd/__tests__/regional-backbone-readiness.test.ts` →
*"every region: the claim and the bytes agree"* pins the state above for all twelve
regions in three directions: each region's **root element** must match the table above;
a region marked conformant must have **no `<leaf>` as a direct child** of its Module 1
container; and a region marked non-conformant must have **every** `<leaf>` as a direct
child, or must actually carry another region's root element. Moving a region into
`CONFORMANT_REGIONS` without building the structure fails it; building the structure
without updating the classification fails it too; grouping some sections and leaving the
rest flat fails it as well.
