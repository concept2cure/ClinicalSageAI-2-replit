# AnA after the device surfaces joined the release: five red tests, and 35 steps that read "Ran a step"

Commit `62a8d5e7f` (2026-10-23) admitted the device and diagnostics surfaces to the launch catalog
(`shared/constants/launch-scope.ts`). The filing-types session reported four AnA tests red on trunk, and a fifth
failed for the same reason (`red/trunk-ana-tests.txt`). They sit in the device lane this session is working.

## What already exists

- **`anaCapabilityInLaunchScope`** (`server/services/ana/ana-launch-scope.ts`) decides whether AnA offers a tool or
  command by re-checking its surface against `LAUNCH_SURFACE_IDS`. So the device tools came back into production the
  moment their surfaces were admitted.
- **`ana-launch-scope.inventory.json`** is the bookkeeping file. Its own rule: a tool or command that touches a launch
  surface is `inScope`. It still filed the device tools as `hiddenApp`.
- **`ci:step-presentation`** (`scripts/ci/check-step-presentation.mjs`) requires a `present` block, in
  `tool-authorization.register.json`, for every tool the inventory calls `inScope`. It checked the inventory, not
  what production offers. So the 35 device, Labeling and Risk tools were offered with no `present` block, and their
  steps in AnA's conversation read "Ran a step".
- **`selectToolsForTurn`** (`server/services/ana/tool-selection.ts`) ranks tools by the request's words in each tool's
  name and description, after an always-on core.

## What changed

1. **The inventory follows its own rule.** Every `hiddenApp` entry with a surface in the release moved to `inScope`:
   64 tools and commands, across 11 surfaces:
   - `device-510k`, `-cer`, `-clinical-studies`, `-diagnostics`, `-postmarket`, `-presub`, `-software`, `-udi` and
     `-workstream`;
   - `labeling`;
   - `risk`.

   The file's note records the amendment. The JSON was rewritten in its own one-space format, so the diff is the
   change alone.
2. **35 `present` blocks**, so each of those tools' steps says what it does ("Recording a device complaint · Quality",
   "Assembling the 510(k) Summary · Engine"):
   - verbs and sources come from the closed tables in `shared/ana/step-verbs.ts`;
   - objects are plain words of 60 characters or fewer;
   - `preview: ['title']` is used only where the tool takes a title;
   - five read tools whose descriptions say they are deterministic claim `engine`. The gate checked each claim and
     found no reachable model call.
3. **`get_document_template` is always on.**
   - **The defect:** the open-document brief tells AnA to "call get_document_template with registry_id …" for the
     rest of an outline (`ana-ri/open-document.ts`), and relevance ranking could remove it. For "help me prepare an
     EU clinical trial application" it ranked 28th of 26 places, because the newly admitted device clinical tools
     outscore it by name. Its description names the IMPD, not the words a person uses, and the description is
     already at 1,013 of the 1,024 characters a provider keeps.
   - **The precedent:** this is the same failure that put `get_document_section_requirements` in the always-on core.
     It is deterministic and read-only.
4. **The tests' examples follow the catalog.**
   - `write_kit_section` and `create_clinical_study` move from the hidden examples to the kept ones, replaced by
     `prepare_meeting_package` (`agency-meetings`) and `create_tmf` (`etmf`), which are still outside the release.
   - `command-rbac`: `q_sub.create` and `post_market.document.create` move to KEPT, replaced by
     `pdev.program.contradictions` and `evaluate_endpoint`.

## Tests

- **Red: `red/trunk-ana-tests.txt`.** At `62a46933f`, 5 failures.
- **Red: `red/step-presentation-missing.txt`.** The gate with the inventory corrected and no `present` blocks: 35
  MISSING.
- **Green.**
  - The three test files: 86 tests pass.
  - `ci:step-presentation`: 654 in-scope tools each have a `present` entry, and none of the 133 engine claims can
    reach a model call. Its self-test: 20/20.
  - Every test reading the register or step presentation: 19 files, 289 tests pass.
  - Every test touching tool selection, the launch-scope inventory or `governedToolsetFor`: 46 files, 603 tests, all
    pass. At HEAD the same set fails the five above.
  - `ci:launch-scope` and `ci:launch-scope-api` pass.
