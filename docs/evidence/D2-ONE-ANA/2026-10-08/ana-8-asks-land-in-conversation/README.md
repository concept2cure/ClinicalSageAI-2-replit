# Slice 8 — every ask lands in the one conversation

Launch row **D2**, 2026-10-08. Slice 8 of `docs/design/ONE_ANA_ONE_CANVAS.md`.

The founder, 2026-10-07: *"Why are there multiple places on one screen where AnA could be accessed through a chat conversation?"*

## What was wrong

An "Ask AnA" button on a work screen sent its question straight into the right rail: a second place to talk to AnA, beside the conversation, on every screen. ⌘K's typed question did the same. There are 77 such buttons; all of them reach `V2App.ask` through `onAsk`.

## What changed

**A screen's own button** (`V2App.ask` on a screen that does not own the conversation) hands the question to the one conversation:

- the question sits in the composer, **not sent**: the person reads it, edits it and presses Enter;
- a chip says where it came from, "From Vault (DMS)", with "Back to Vault (DMS)" and a × to send it without that screen's context;
- the turn that sends it carries that screen's published context and id (`module_context`, `context.screen`), as the rail's turns did, through one new per-turn send option in `useAnaChat` (`moduleContext`, `screenName`; the same pattern as `authoringContext`);
- it continues the conversation in progress.

**⌘K's "Ask AnA: …"** is the person's own words, already sent once. It goes to the conversation and is sent there on arrival, naming the screen it was asked from. If AnA is still answering, it waits in the composer.

**The rail's own composer** still sends into the rail until the rail goes (slice 9). No ask from a screen reaches it any more, and nothing opens or persists the rail on the way.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `shellAskGuard.test.tsx`: a work-screen button lands in the composer unsent, from that screen; Enter sends with `screen: 'vault'`; "Back to" returns; ⌘K goes to the conversation and sends once, naming its screen | 3 failed, 7 passed | 10 passed |
| Every suite that renders the shell, the rail, the conversation or the chat hook, plus `tests/ui` | — | 1,059 passed (86 files) |

The old ⌘K test, "opens the rail and streams there", asserted the behaviour this slice removes. It now asserts the new destination.
