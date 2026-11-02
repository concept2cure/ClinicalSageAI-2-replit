# MDX M19: the PMA mapper places a governed leaf by its 814.20 key, never by its title

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, found walking the PMA journey in the running app (slice 5b),
the morning M18 landed. Plan: F1, a repair of a deterministic engine: no screen, mount or table.

## What the running app showed

With M18's cards reading the PMA mapper over the project's own PMA document
(`../2026-11-02-m18-pma-modules-own-document/shots/02-after-own-document.png`), B.2 was listed under two modules:
- module 7, "Summary of safety and effectiveness data (SSED)", which is its own;
- module 2, "Device description & indications for use".

B.2 is the SSED's "Device description summary". It was a draft, so neither module was yet counted present. Once B.2
was approved, the assembly verdict would count module 2 present with nothing written under C, the complete device
description that 21 CFR 814.20(b)(4)(i) requires.

## Why, and how far it reached

`mapToPma` (`server/services/pathway-engines/pma/pma-mapper.ts`) matched each slot by:
- the governed pack's letter key, for example `key('C')`;
- **or** a document-type matcher;
- **or** a title matcher.

The title matchers were written for legacy leaves, which have no letter. They also fired on the pack's leaves. The
SSED (B) summarises the other modules, so four of its leaves were counted under modules that are not theirs:

| Leaf | Its label | Also counted for |
|---|---|---|
| B.1 | Indications for use | module 2, device description (`ti('indications for use')`) |
| B.2 | Device description summary | module 2, device description (`ti('device description')`) |
| B.5 | Summary of nonclinical laboratory studies | module 4, nonclinical (`ti('nonclinical')`) |
| B.6 | Summary of clinical investigations | module 5, clinical (`ti('clinical investigation')`) |

So an approved SSED made the verdict count modules 2, 4 and 5 present, with C, F and G empty. Three required modules
of an original PMA were overstated by one section. Everything that reads the verdict inherits it:
- the assembly verdict (`device-assembly/assemble-device-submission.ts`);
- the PMA screen's "Assess a submission";
- AnA's `assemble_device_submission` and `advise_pma_readiness`;
- the PMA package's assembly report;
- since M18, the PMA screen's module cards.

Red: `red/mapper-before.txt`, case "an approved SSED is module 7 only". `device-description` was present from B.1 and
B.2.

## What already exists (RULE 3)

- **The mapper itself**, `pma-mapper.ts`. Its `key` matcher was added for exactly this pack, to place a child leaf
  ("Study protocols and amendments", G.1) by its letter when its title names no module. This change finishes that
  rule: a leaf with a letter is placed by the letter.
- **The pack**: the `pma:fda` rule pack `fda-pma-21cfr814-20-v1.0`. Its outline (A–M), as the running database holds
  it for the walked project, is listed in `runs/` of M18 (`pma-screen-after.txt`).
- **The legacy leaves** (numeric `sectionNumber` codes from `cerv2_510k_sections`, and the tests' `'1'`…`'8'`) keep
  their title and document-type matchers. They have no letter, so they still need them.

No matcher, slot, table or route was added. The ten slots, their keys, their legacy matchers and their required-ness
per submission type are unchanged.

## The change

A leaf whose `sectionCode` is a pack key (`/^[A-Z](\.\d+)*$/`: anchored, upper case, the same shape the `key` matcher
already assumed) is matched by its slot's key **only**. Any other leaf is matched as before, by document type or title.
`slotMatch(keys, legacy)` builds each slot's matcher from the two.

## Verified

| Check | Before | After |
|---|---|---|
| `pma-mapper.test.ts`, new block "a governed leaf is placed by its 814.20 key, never by its title" (an approved SSED is module 7 only; C.1, F.1 and G.1 place their own modules; G.5 is clinical and statistics, as the pack places it; legacy leaves still match by title and type) | 1 failed of the 4 (`red/mapper-before.txt`) | 20 of 20 in the file passed |
| Every suite that names a PMA (88 files: the mapper, device assembly, the PMA package build, the governed-assembly contract, AnA's device tools and PMA advisor, the cockpit, the MDX screens, M18's tests) | — | 2,087 passed, 16 failed (`green/pma-scorers-after.txt`). All 16 are pre-existing. Nine are in `useMdxPrograms.productType` and `OfficialEstarPanel.attachments`, which fail at HEAD before M18 (`../2026-11-02-m18-pma-modules-own-document/green/preexisting-at-head.txt`). Seven are in `clientNamesSlice1`, `projects-client-workspaces`, `mdx-pathway-panes-smoke` and `requirements-resolver`, which fail the same way, for the same reasons, before M18 and without this change (`green/preexisting-before-m18.txt`, `green/preexisting-at-m18.txt`). The run also caught M18's cards throwing on a malformed answer, fixed in M18's follow-up commit |
| The running app, restarted on this change, with the same PMA project | B.2 under module 2 and module 7 | B.2 under module 7 only, "Written, not finished: B.2", and module 2 "Nothing written" (`runs/pma-screen-after.txt`, `shots/01-b2-under-module-7-only.png`) |
