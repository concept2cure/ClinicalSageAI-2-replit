# Keep section drafting bound to the current saved section

Plan: F1. Complete the existing editor-to-AnA handoff; no new screen, route, service, tool, provider or approval rule.

## What already exists

- GitHub Tier 5 run `43507358580`, head `b9cd90c9d`, passed authenticated smoke, access-boundary and keyboard proofs. Its golden journey failed in `checkPreparedEditorAsk`: the prepared section identity matched none of the exact document's admitted sections. The retained GitHub artifact is `14076728340`.
- `DocumentWorkbench.tsx` computes `readableSourceSectionId` only from the current admitted document-section read. Its module context uses that identity; its saved authoring context uses the loaded active section. Both already avoid inventing a section.
- The existing section-specific `Draft with AnA` menu action asks `Draft this section from the linked section evidence.` It is disabled only for read-only content, while the document title can render before the sections load. The existing test navigates back to the editor and waits for its title, then selects this action.
- `editorOversightNavigation.test.tsx` already tests the menu and empty-section drafting doors, saved context, guarded editor navigation and real unsaved-work decisions. These existing behavioral fixtures can delay the current section read without fabricating model output.
- `authoring-document-read.ts` already returns exact admitted section rows and the existing server stream resolves their identities. No route or admission is widened. The relevant section read and workbench source are unchanged between the native rehearsal's `35af13338` baseline and the hosted failing head.
- Coordination's old Codex project/editor hold is explicitly released in its 2026-11-06 delivery note. The bounded change concerns only this section action's current-read admission, not another lane's saved refresh, layout, drafting engine or provider control.

Searches covered current section reads, saved authoring context, all existing Draft with AnA doors, the golden assertion and their focused tests. Deleted-history search over the editor draft/AnA paths found no alternative action owner.

## Completion contract

First reproduce the action while the exact current document's sections are delayed. If the section-specific action permits an ask without a current saved section, retain its existing read-only refusal and disable/refuse that action until current section admission is established. Preserve legitimate document-level questions, independent read/access checks, ownership retirement and the existing one-conversation handoff. Do not weaken the golden identity assertion, use a broader locator, skip a proof, or call a provider.

Verify pending, failed and refreshed section reads and the positive exact-section handoff in existing behavioral tests, then repeat the controlled real-browser path. Root owns full compiler/build and canonical Git publication.

## Verification

- Corrected behavioral assertions against the pre-repair Workbench failed twice with 13 existing cases passing: the pending and failed saved-section reads both left the section action operable. The shared menu uses `aria-disabled` so its refusal remains focusable; the tests assert that actual control contract and no ask/navigation. The repaired existing suite passes **15/15**, with zero skips, including current-section recovery with a new saved timestamp and legitimate document-level Review while sections are pending.
- `browser-section-delay.mjs` delayed only the exact sections GET of the existing synthetic VNH-310-301 planning CSR, as Ana Author. The baseline action was enabled and its actual prepared stream request carried no section identity, matching zero saved rows. The patched action was disabled while that read was pending; after release, the actual request carried the exact saved section UUID, code and timestamp in both contexts, matching exactly one admitted row. Every AnA POST was intercepted and aborted before server/provider dispatch. No fixture, permission or provider configuration was changed.
- `native-red.json`, `native-green.json` and the retained hosted failure metadata distinguish the observations. The native rehearsal reused the official Codespace-image filesystem and its existing backend with only the repaired Workbench overlaid. It is not a hosted GitHub Codespaces edge test, a final-HEAD backend stamp, model output or performance qualification.
- Explicit lint reports zero errors. The focused test and browser helper have zero warnings; the large existing Workbench retains its prior 12 warning locations. Whitespace checks pass. The existing golden assertion was not changed or relaxed. Root performs full compiler/build and the four-case smoke/golden repeat separately.

The repair uses the existing fixed section prompt in one place, preserving all general asks. A current saved section is required at both the menu and the shared ask boundary, so an empty-section ask cannot bypass a pending refresh. Pending, failed and ready-without-selection states each explain the available remedy.

Root repeated the unchanged authenticated smoke and governed golden journey against the running image rehearsal with this exact Workbench overlay: **4/4 passed**, zero skips, in one minute. This includes the exact section-identity assertion that failed in hosted CI, real project/source/assignment/edit/review paths and the unauthenticated negative control. `native-golden-green.txt.gz` retains the result; live provider output remains unclaimed.
