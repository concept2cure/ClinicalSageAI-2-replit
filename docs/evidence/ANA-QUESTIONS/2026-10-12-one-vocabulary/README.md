# One vocabulary per class, and a gate that keeps it that way

**Row:** D4 / the working agreement's *zero duplication*
**Finding acted on:** `docs/evidence/ANA-QUESTIONS/2026-10-12-review/README.md`
— *"the MDR class is still hand-written in two flows and normalised by three
readers; the IVDR class is still enumerated in about fourteen places and the US
class in about fifteen, after a commit titled **one vocabulary for all of them**
— which promoted one vocabulary and migrated two holders, not fourteen."*

That criticism was fair. This is the rest of it, and the gate that stops the
next session writing a ninth list.

## The gate first

`scripts/ci/check-class-vocabulary.mjs` (`npm run ci:class-vocabulary`, in
`.husky/pre-push`) refuses a literal enumeration of a governed class vocabulary
— the US 21 CFR 860 classes, the MDR's seven DECLARED classes, the four the
Annex VIII rules yield, the IVDR's four — outside the three modules whose job
is to hold them.

Two things make it a gate someone can keep:

- **It is name-aware.** `'A' | 'B' | 'C' | 'D'` is also a GMP Annex 1 cleanroom
  grade and an FDA meeting type, and a gate that cannot tell those from an IVDR
  class is a gate that gets baselined into uselessness. It fires only where the
  surrounding name says which vocabulary it is: `ivdr`, `mdr`, `device_class`,
  `riskClass`, `eu_class`.
- **A comment is not a second vocabulary.** `// 'I', 'II', 'III' (for devices)`
  beside a column tells a reader what the column holds, and nothing reads it as
  a list. Only code is refused — including a trailing comment stripped off a
  code line, with `//` in a URL left alone.

A baseline exists (`class-vocabulary-baseline.json`) and **is empty**, because
nothing needed one. An entry without a written reason of at least thirty
characters fails the gate outright — the discipline RULE 1 sets for its own
baseline, applied here.

## What was migrated

Twenty-one files. Every one now imports from
`shared/regulatory/device-class.ts`:

| Vocabulary | Sites |
|---|---|
| IVDR (A–D) | `routes/mdx-ivdr.ts` (a module constant), `AnaToolExecutor` (a membership test), `medicalDeviceTools` ×2, `ivdLifecycleTools`, `mutation-surface-tool-defs` (JSON-schema enums), `regulatory/registration-listing` ×2, `medical-device-knowledge` (the `EUIVDRClass` alias) |
| MDR (the four the rules yield) | `intelligence-questions/programme-facts` ×3, `cerGenerationService`, `shared/regulatory/pathway-cautions` ×3 — **including `ProgrammeFacts` itself, which this batch wrote last week and which my own gate caught** |
| US (I/II/III) | `middleware/apiValidation` (a zod enum), `ana/coverLetterTools`, `biomarker-knowledge`, `k510-summary-composer`, `fda/index`, `grdhe/types`, `medical-device-knowledge`, `types/medical-device`, `digital-health-knowledge`, and the two client-side holders — `mdx/hooks/useDeviceProfile` and `mdx/surfaces/DeviceProfilePanel`, which write `regulatory_programs.device_class` and were offering a list of their own |

Three of them are **supersets**, and each says so rather than being flattened:

- `digital-health-knowledge.DeviceClass = UsDeviceClass | 'Unclassified/De Novo'`
  — the extra value is a statement about the ABSENCE of a classification, not a
  fourth class.
- `medical-device-knowledge.USDeviceClass = DeviceClass | 'unclassified'` — the
  same.
- `types/medical-device.deviceClass?: DeviceClass | '1' | '2' | '3'` — the
  Arabic spellings are what an openFDA payload carries, and that type models
  what arrives rather than what the platform states.

And one is a deliberate **narrowing**: `useDeviceProfile.RegulatoryPath` keeps
`510k | de_novo | pma` rather than the governed six, because the panel writes a
510(k)-family profile and `hde`, `ide` and `exempt` are not what it is for.
Narrower is safe — the write accepts all six.

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| V1 a ninth IVDR list put back in `routes/mdx-ivdr.ts` | the gate, naming the file, line and vocabulary |
| V2 a baseline entry with no reason | the gate, before it scans anything |
| V3 the US class restated in `middleware/apiValidation` | the gate |
| the self-test (`ci:class-vocabulary:selftest`) | constructs four files: an IVDR tool enum and an MDR union are refused; a cleanroom grade and an FDA meeting type are left alone |

```
$ npm run ci:class-vocabulary
OK — 4807 file(s) scanned, no restated class vocabulary.

$ npm run ci:class-vocabulary:selftest
OK — refuses the two class lists and leaves the cleanroom grade and the FDA
     meeting type alone.

$ npx vitest run <the question engine, both catalogues, the regulatory,
      global-ri and gspr suites, and the two c2c write/projection suites>
Test Files  147 passed (147)
     Tests  1702 passed (1702)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
21 lintable file(s) changed -- no file changed its warning count
```

## What is left of the duplication finding

The review's other half — *"three uncanonical region lists remain inside other
flows"* — is a different vocabulary (`shared/regulatory/agency-positions.ts`
holds the canonical regions) and wants the same treatment: migrate, then gate.
It is not claimed here.
