# F1: with no project open, Biostatistics opens on the example that fits the organisation

**Package:** F1 (a defect in shipped behaviour; no new screen, mount, table, route or read path).
**Completes:** `client/src/concept2cure/v2/surfaces/Biostatistics.tsx`.
**Found:** 2026-11-09, in the running app, while proving the rail opens Biostatistics with no project (`fb9562f399`).
**Fixed:** 2026-11-12.

## The defect

The rail opens Biostatistics with no project open (P-107: it "stays on the rail … a work area over the project's data,
not an app"). The page chose its worked example with `defaultPresetFor(project)`, which read
`isDeviceFamily(project?.productType)`. With no project that is `isDeviceFamily(undefined)`, false, so **every
organisation opened on "Pivotal OS (survival)"**: a Phase III oncology overall-survival design, sized, with its verdict
and its generated documents. A medical-device or diagnostics organisation saw it too.

The same function was repaired once for the project-open case (2026-10-31, "an IVD project opened on an oncology
survival preset"). The project-less case, which is now how the rail opens the area, was left.

Two smaller faults sat beside it:

- The note above the document told a project-less visitor to "Choose your project's study design on the left". There is
  no project; the list is every design the organisation has recorded. And at phone width the list is not on the left:
  the document comes first and the list sits below it (`.bs-doc-layout > .bs-main{ order:-1 }`).
- Repairing only the choice would have sized the oncology design first and swapped it a moment later. The page already
  refuses that flash for an open project's own design (2026-10-31); the same hold now covers this read.

## What already exists (RULE 3)

Searched before any code: `industry`, `clientType`, `clientTrack`, `primaryIndustry`, `medical_device_diagnostics`,
`diagnostics_ivd`, `isDeviceFamily`, `defaultPreset`, `industry-profile`, `effective-context` across `client/`,
`shared/` and `server/`; and `git log --all --diff-filter=D` for `*industryProfile*`, `*defaultPreset*`,
`*biostatWorkedExamples*`, `*BiostatPreset*` (nothing deleted under those names; the history is complete, 19,000+
commits, not a shallow clone).

| Piece | Path | Does today | Does not |
|---|---|---|---|
| The organisation's industry, as a governed record | `organization_industry_profiles` (`shared/schema.ts`), written at sign-up (`server/services/industry-context/signup-profile.ts`) and by Setup | `primary_industry` and `mdx_specialization`; the schema calls it the authoritative source of a tenant's industry context | — |
| Its read | `GET /api/mdx/industry-profile` (`server/routes/mdx-industry-context.ts:99`) | Answers the row, or `null` for an organisation that has recorded none | — |
| The vocabulary's translation | `client/src/concept2cure/mdx/lib/industryProfileMapping.ts` (`governedToPicker`, `PRIMARY_INDUSTRIES`) | Governed pair to client type: `medtech`, `diagnostics`, `biotech`, `cro`, `consulting`, `health` | Was not used by Biostatistics |
| A v2 screen reading that route | `surfaces/Onboarding.tsx:331`, `useLiveData('/api/mdx/industry-profile')` | The precedent for a v2 screen reading it through the shell's one read hook | — |
| A read-and-write hook for the same route | `client/src/concept2cure/mdx/hooks/useIndustryProfile.ts` (used by `OrganizationProfileCard.tsx`) | Reads on every mount and carries the audited PATCH | Cannot be told not to read; brings a write path a read-only screen should not hold |
| The project's product type | `ShellProject.productType`, `isDeviceFamily` (`shared/constants/domain/product-types.ts`) | Decides the example when a project is open | Says nothing with no project |
| The worked examples | `surfaces/biostatWorkedExamples.ts` (`e965a16772`); `__tests__/biostatWorkedExamplesSize.test.ts` sizes each on the real engine | Six complete designs, the diagnostic-accuracy one included | — |
| The hold against a flash | `holdForDesign` in `Biostatistics.tsx` | Keeps the engine from sizing an example while an open project's design loads | Did not cover the project-less case |

Nothing new was needed. The screen now reads the existing route through the shell's existing read hook, the way
`Onboarding.tsx` does, and asks the module that owns the vocabulary what the pair means. `useIndustryProfile` was not
extended: the read must not happen while a project is open, and this screen writes nothing.

## What changed

One screen file and one test file. No route, table, mount, service, AnA tool or surface.

- `defaultPresetFor(project, orgClientType)`: a device or diagnostics **project** opens on the diagnostic-accuracy
  example, as before. With **no project**, a device or diagnostics **organisation** opens on the same example. One rule,
  applied at both levels.
- `useRecordedClientType(projectOpen)`: reads the profile only when no project is open, so a project visit costs no
  extra request.
- The engine waits for that read before sizing anything (`holdForDesign`). The read has a deadline, so the wait ends.
- The note names the list by its heading, which is true at every width:
  - no project: "Worked example — *name*, not your study. Choose a design under Study design, or open a project, and the
    engine sizes your own."
  - a project open: "… Choose your project's design under Study design and the engine sizes your own."


## What is deliberately not inferred

| The profile says | The page opens on |
|---|---|
| Medical device, diagnostics (IVD), SaMD, companion diagnostic, combination product | Diagnostic accuracy |
| Biotech / pharma | Pivotal OS (survival) |
| CRO, regulatory consulting, academic | Pivotal OS (survival): these serve both, and nothing recorded says which |
| Nothing recorded (`null`) | Pivotal OS (survival) |
| The read failed | Pivotal OS (survival) |
| A value outside the governed vocabulary | Pivotal OS (survival) |

An absent or unreadable profile is never read as a statement about the tenant. Every example is labelled a worked
example, not the person's study, in the note and in the document's own header, as before.

## Red first

`client/src/concept2cure/v2/__tests__/biostatProjectlessExampleFitsTheOrg.test.tsx`, 17 cases.

- Against trunk's `Biostatistics.tsx`: **12 fail, 5 pass** (`red.txt`). The three device-organisation cases read
  "expected 'Pivotal OS (survival)' to be 'Diagnostic accuracy'"; the note cases read the old sentence; the rest fail
  because the profile is never read. The five that pass are the project-open cases and the two "sized as soon as that is
  known" cases, none of which may change.
- With the choice repaired and the hold removed: the no-flash case fails with `expected [ 'time_to_event' ] to deeply
  equal []` (`red-no-hold.txt`). The oncology design was sized before the organisation's own.
- With the change: **17 pass** (`green.txt`).

The first version of the test waited only for "one example chip is pressed". The survival chip is pressed on the first
paint, so that wait returned at once and three cases read the page before the profile had landed. The helper now waits
for the expected chip, and the cases where the example must not move wait for the read to be made and committed first.

## Neighbouring suites

`client/src/concept2cure/v2/__tests__/`: every `biostat*`, `workbench*`, `adaptive*`, `knowledge*`,
`protocolStatistics*`, `shellNav` and `railOpensWithoutProject` suite, 30 files, run on the final content
(`neighbours.txt`). ESLint on the two files: no error, and no warning this change adds (the screen's four existing
size and complexity warnings stand).

## In the running app (RULE 4)

`walk.txt`, with screenshots at 1440 and 390 in `screenshots/`. A fresh browser context each time (an account that has
never opened a project in it), Home, the rail, Biostatistics. The organisation's industry was recorded through the
governed route (`PATCH /api/mdx/industry-profile`, with a reason for change), never by a database write.

| The organisation | Trunk | With the change |
|---|---|---|
| IVD diagnostics | Pivotal OS (survival), sized (`before-diagnostics-org-1440.png`, `-390.png`) | Diagnostic accuracy, sized: co-primary sensitivity and specificity against a performance goal, n by the engine (`after-diagnostics-org-1440.png`, `-390.png`) |
| Medical device | the same | Diagnostic accuracy |
| Biotech / pharma | Pivotal OS (survival) | Pivotal OS (survival) (`after-biotech-org-1440.png`) |
| Nothing recorded | Pivotal OS (survival) | Pivotal OS (survival) |
| Any, with a project open | the project's own design | the project's own design; **0** reads of the profile (`after-project-open-1440.png`) |

No response of 400 or above on any Biostatistics visit, and no console error.

Five 5xx appeared on the **project page** of this container while opening the project (`walk.txt`, last section). They
are this container's database, provisioned on 2026-11-09 and not migrated since (`relation "project_sections" does not
exist`, and two more). They are not on Biostatistics and not from this change.

## Not done here, and why

- **The demo tenants record no industry.** No pack under `scripts/demo/launch-demo/packs/` writes an industry profile,
  so the seeded device tenant (`mdx`) has none and opens Biostatistics from the rail on the general example, exactly as
  an organisation that recorded nothing does. A real organisation gets its profile at sign-up
  (`server/services/industry-context/signup-profile.ts`), so this is a gap in the demo data, not in the product. The
  remedy is one governed PATCH per tenant in its pack (package DATA); the device pack is another session's to change.
  Reported to the coordinating session.
- **The calculators' filing module with no project.** `DesignCalculatorsSection` takes `deviceProject` from the open
  project only. With no project it stays `false`. That is correct today: a calculator result is saved into a project,
  and with none open there is nothing to file it under.
