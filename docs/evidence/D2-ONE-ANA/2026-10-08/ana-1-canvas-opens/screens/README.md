# Slice 1 in a real browser: the document opens on the right

Captured 2026-10-08, 01:17 to 01:22 UTC, in headless Chromium (Playwright). It ran against the real server, client and database at `d390f9646`. AnA's replies came from a scripted stand-in model, labelled "STAND-IN" on screen. The `draft_authoring_document` tool, its approval card ("Confirm and run") and the stored documents were real.

**Result:** at 1440 and 1280 the document opened on the right by itself, while AnA was still working. At 1024 it was offered, not opened. A conversation reopened from history opened nothing. That last result says less than it seems: the reopened conversation has no document in it at all (finding 1 below).

## How it ran

- **Database:** `c2c_ui_screens` in the local PostgreSQL 16 cluster (`/var/lib/postgresql/c2c-local`). It was built on 2026-10-07 by `install-fresh.mjs`, then `deploy-migrate.mjs`, then the ga-demo seed (see `../../0-screens/README.md`). It was reused here, not rebuilt.
- **Server:** `npx tsx server/index.ts` with `NODE_ENV=development PORT=5077 ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on`, and `ANTHROPIC_BASE_URL` pointing at the stand-in.
  - It started at 01:14 from a clean tree at `d390f9646`, without watch mode.
  - Another session edited four server authoring files from 01:20 on. That code was not loaded by this server.
  - The client was served by Vite from the unmodified tree.
- **Sign-in:** `jm.smith@concept2cure.pro`, dev mode with MFA skipped.
- **Project:** Vorelinib · KIT-mutant GIST (IND), BX-512.
- **The ask:** "Draft the Module 2.5 clinical overview for Vorelinib BX-512." was typed in Project home's composer. I then clicked "Confirm and run".
- **Stand-in:** the same script as 2026-10-07. Its pacing was `FAKE_DELAY_MS=3000` (the default is 300), so AnA's closing text streams for a few seconds after the tool returns. That gives a visible stretch where the turn is still running.
- **Clicks:** Send, then "Confirm and run". At 1024 only, "Open" on the notice. **"Open full editor" was never clicked in any run.** Each step's click list is in `capture-log.json`.
- **Viewport:** every PNG is a viewport-only screenshot.

## Files

| File | What it shows | Expected | Matched? |
|---|---|---|---|
| `1440-0-approval.png` | 1440x900, the approval card "Confirm the proposed action" in the thread, just before confirming. The right column is Progress. | (context) | — |
| `1440-a-after-confirm.png` | 1440x900, 46 ms after "Confirm and run". The card reads "Running…", Progress shows "Running 1 step…" and nothing is open on the right yet. | right after confirming | yes |
| `1440-a2-pane-open-editor-loading.png` | 1440x900, from an identical run a minute earlier, 298 ms after the click. The pane is already open on the right, but empty while the editor loads. The card in the thread reads "Reading the document…". | (the in-between moment) | see finding 2 |
| `1440-b-document-appears.png` | 1440x900, 1.07 s after the click. The editor is open on the right: x=527, 913 px wide, on "2.5.1 Product Development Rationale" with the 4-section outline and the STAND-IN text. The conversation stays on the left at 471 px. The turn is still running ("Working", Stop, "AnA is driving"). | open on the right, beside the conversation, with no "Open full editor" click | **yes** |
| `1440-c-turn-ended.png` | 1440x900, 4.5 s after the click. The turn has ended: "Stand-in answer…" is complete, Stop is gone and the header chip reads "Progress". The editor is still open on the right, and the thread card offers "Close the editor". | after the turn ends | **yes**, the document stays open |
| `1280-a-after-confirm.png` | 1280x800, 55 ms after the click, "Running…". Nothing is on the right yet. | (context) | — |
| `1280-b-document-appears.png` | 1280x800, 1.08 s after the click, turn still running. The editor is open on the right at x=472, 808 px wide. The conversation is on the left at 416 px. | open on the right | **yes** |
| `1280-c-turn-ended.png` | 1280x800, turn ended. The editor is still open on the right. | (extra) | yes |
| `1024-a-after-confirm.png` | 1024x768, 65 ms after the click, "Running…". | (context) | — |
| `1024-b-notice.png` | 1024x768, 0.74 s after the click, turn still running. The editor did **not** open: the pane is hidden and the conversation keeps its full width. A notice above the composer reads "AnA built **Module 2.5 Clinical Overview (stand-in draft)**" with an **Open** button and ×. | no takeover; notice "AnA built <title> · Open" above the composer | **yes** (wording: see finding 3) |
| `1024-c-notice-after-turn.png` | 1024x768, turn ended. The notice is still there. The thread card shows "Open full editor", which was not clicked. | (extra) | yes |
| `1024-d-after-open-click.png` | 1024x768, after clicking the notice's Open. The editor takes the full content width and the conversation is hidden. "Back to conversation" sits at its top left. | click Open, then screenshot | yes, it opens as designed for ≤1100 px |
| `1440-h1-project-conversations-list.png` | 1440x900, Project home › Conversations. The red outline marks the row clicked: the conversation from the 1440 run (`ana-ri_1791422302138_3qisj9qga`, 3rd newest). | (context) | — |
| `1440-h2-reopened-from-history.png` | 1440x900, that conversation reopened from the list, 6 s after it loaded. Nothing is open on the right; the right column is Progress. | the document must not open by itself | **yes, but see finding 1** |
| `capture-log.json` | For every screenshot: the pane's and conversation's boxes, whether the pane holds the editor, the notice text with its `role` and `aria-live`, `document-canvas` ids and expanded state, Stop visibility, focused element, clicks so far, and ms since confirm. | — | — |

## Measured

| Width | Confirm to first sign of the document | Pane | Conversation | Turn still running when the document appeared? |
|---|---|---|---|---|
| 1440 | 219 ms | open, x=527 w=913 | x=56 w=471 | yes (Stop visible) |
| 1280 | 234 ms | open, x=472 w=808 | x=56 w=416 | yes |
| 1024 | 239 ms (notice) | hidden | x=56 w=584 | yes |

At 1024 the notice was `role="status"` and `aria-live="polite"`, and focus stayed on `body` both when it appeared and after the turn ended. It did not take focus.

Each run stored its own document in `authoring_documents`, all titled "Module 2.5 Clinical Overview (stand-in draft)":

| Run | Document | Thread |
|---|---|---|
| 1440 | `a6257943-a4f8-4dc0-a957-5dd4ca69e2a6` | `ana-ri_1791422302138_3qisj9qga` |
| 1280 | `6f431aa9-1d2f-4411-bf66-cb3c5bcb5492` | `ana-ri_1791422333056_sus315o66` |
| 1024 | `ed19a25c-7fa9-4973-a832-40fae5af952b` | `ana-ri_1791422359658_w32l8lrqr` |

## Findings

1. **The history check passes only because the reopened conversation has no document in it at all.**
   - `1440-h2` shows the user's ask and AnA's text, but no document card, no "Open full editor" and no way to reach the document from the conversation.
   - The persisted assistant message is in `chat_messages` for `ana-ri_1791422302138_3qisj9qga`. Its `metadata` has only the keys `rounds, reasoning, runPolicy, toolTrace, verification`. It has no `authoringDocId`, and the document id `a6257943…` appears nowhere in the row.
   - `loadThread` in `client/src/concept2cure/components/ana/useAnaChat.ts` (around lines 814–860) rebuilds text, reasoning, tool calls, plan, ending and evidence, but not `generatedDraft`.
   - So "history opens nothing" holds in the browser, but trivially: nothing could open. The test `canvasAutoOpen.test.tsx` › "a conversation reopened from history opens nothing by itself" feeds a reopened message that carries `generatedDraft.authoringDocId`. The real app does not produce that state today.
   - When reopening starts carrying the document, this guard will need checking again in a browser.
2. **The pane opens before the editor has rendered.** For roughly 0.3–0.5 s after the click, the right side is an open, empty pane (`1440-a2`), and then the editor appears. This is brief, but it is visible.
3. **The notice's wording at 1024** is "AnA built **<title>**", then an "Open" button, then "×". There is no literal "·": the button itself is the separator.
4. **Overlaps while AnA is working (1440 and 1280).** The floating "AnA is driving" strip sits across the boundary between the conversation and the editor. It covers the bottom of the composer area and the editor's "…has a recorded origin" bar until the turn ends (`1440-b`, `1280-b`). Inside that strip, the "Ask or steer AnA…" field is partly covered by "Take over" (`1440-0`, `1024-a`).
5. **Cramped at 1280.** With the editor open, the editor's toolbar is clipped at the right edge: "Word" shows as "Wo", and the buttons after it are off-screen. The document title in the editor header is truncated. In the 416 px conversation column, the composer placeholder wraps and its second line is cut off (`1280-b`, `1280-c`).
6. **Not investigated.** Project home's "Recent drafts" reads "No drafted sections yet" and "Module completion" reads "No document sections yet". This is after five Module 2.5 documents were drafted on this project (four in this capture, one on 2026-10-07), as seen in `1440-h1`. "Some project context could not be loaded for this reply" also appears on every reply here, as it did on 2026-10-07.

## Cleanup

The server (port 5077) and the stand-in (port 8797) were stopped after the capture. PostgreSQL was left running. The capture scripts and the stand-in's request log stayed in the session scratchpad and were not added to the repository.
