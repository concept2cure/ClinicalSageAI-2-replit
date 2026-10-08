# Slices 6 and 9 — the right rail goes; what only it carried has moved

Launch row **D2**, 2026-10-08. Slices 6 and 9 of `docs/design/ONE_ANA_ONE_CANVAS.md`.

The founder, 2026-10-07: *"I don't understand why the right rail AnA is prevalent everywhere when there's AnA in the middle screen sometimes."*

## What was wrong

The shell drew a right-hand AnA rail on 117 of 123 screens (`V2App.tsx`, `AnaRail`). It showed the same conversation the conversation screen shows, a second time, beside every work screen. On Home and Project home it sat beside those screens' own composers (`../0-screens/02-home-rail-open.marked.png`, `04c-project-home-rail-open.marked.png`). Since slice 8 no screen's ask reaches it; its only input left was its own composer.

## What changed

**Slice 6: first, the pieces only the rail carried moved.**

- **The engine picker** for the conversation's turns is now in the conversation's composer ("Engine: …", the same `EngineChoices`, writing `prefs.anaMode`, which the shell chat sends). It reaches the screen through one new prop, `engine`, on `OwnedSurfaceViewProps`.
- **The first-run welcome** (client-type greeting and starters) is on Home, where a new client starts. A starter opens a new conversation seeded with it, through Home's own front door.
- **Pending Part 11 sign-offs** already render inside each conversation turn (`SignoffList`). Nothing moved.
- **Live Drive narration** shows in the drive strip on every screen. It had been shown only where the rail was not, because the rail carried it.

**Slice 9: then the rail stopped being drawn.**

- `V2App` mounts no `AnaRail` and no scrim. `data-ana-open` is always false, and `--ana-seam` is 0, so no screen reserves a column for it.
- Nothing opens the rail any more: not a drive event, not a queued tour or demo, not ⌘\ (removed).
- The logo goes to Home, not to the document editor.
- Escape closes only the narrow navigation drawer; there is no AnA drawer.

**Found on the way, fixed here.** Home's quick actions offered "Search evidence" and "Intelligence", which this release does not carry. They are filtered by the launch-scope verdict, the rule Project home already follows.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `shellAskGuard.test.tsx` (no AnA column and no seam on vault, projects, submission-center, home, crl-library; ⌘\ opens and persists nothing) and `tests/ui/ana-rail-phone-drawer.test.ts` (the shell mounts no rail and no scrim) | 7 failed, 11 passed | 18 passed |
| `railPiecesRehomed.test.tsx` (new): the welcome on Home and its starter; Home offers no locked destination; the conversation's engine pill and choice | 3 failed, 1 passed | 4 passed |
| Every suite that renders the shell, the rail, the conversation, Home or the chat hook, plus `tests/ui` | — | 1,305 passed (117 files) |
| `ci:canvas-path`, `ci:launch-scope-api` | — | green |

## Not done in this commit

The `AnaRail` component (`Shell.tsx`) and its 14 component tests are no longer mounted by anything. They are deleted in the next commit, which names `ConversationThread.tsx` as the place that delivers each behaviour, as the working agreement requires. Most of those tests already have a conversation-screen twin (Continue, interrupted turns, warnings, caveats, run control, attach, actions, sign-off).

**Real browser.** The capture of the new layout at 1440, 1280 and 390 is filed with that commit.
