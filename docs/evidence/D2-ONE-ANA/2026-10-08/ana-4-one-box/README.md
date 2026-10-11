# Slice 4 — one place to type to AnA during a run

Launch row **D2**, 2026-10-08. Slice 4 of `docs/design/ONE_ANA_ONE_CANVAS.md`.

## What was wrong

While AnA worked, the conversation screen showed three boxes to type to AnA at once. It happened in a real browser on 2026-10-07 (`../0-screens/05-conversation-after-ask.marked.png`) and again on 2026-10-08 (`../ana-1-canvas-opens/screens/1440-b-document-appears.png`):

- the composer, "Reply to AnA";
- the run strip's "Steer this run…";
- the Live Drive strip's "Ask or steer AnA…".

## What changed

- **The conversation composer is the one box.** While a run that can take a steer is in flight, it steers that run (`interject`), using the same rules the strip's box kept:
  - it is labelled "Steer this run", and its button says **Steer**;
  - under a Manual hold it is "Tell AnA what to do instead", its button says **Do this instead**, and it carries "The step shown will not run.";
  - under Manual while running, it carries the existing help text: a steer replaces her next step;
  - the text is cleared only once the server accepts it; a refusal says "Not sent — AnA did not accept this steer. The text is still here." and keeps the text;
  - a steer is words only, so attachments wait for the next turn;
  - when AnA is idle it is the ordinary composer again.
- **The run strip keeps Pause, Resume and Stop** on this screen and draws no box. On the screens that still carry the rail or their own chat, it is unchanged until those go (slices 9 and 16).
- **The Live Drive strip draws no box on the conversation screen**, unless another chat is the one driving. Everywhere else it keeps its box until slice 9.
- **The help text has one source.** `steerHelpFor` is exported from `AnaWorkSections.tsx`, so the composer and the strip say the same thing.
- **A question handed over mid-run keeps its notice.** A question handed to this screen while AnA is answering still waits in the composer. Its notice now says it can be used to steer her now, or sent once she has finished.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `oneBoxDuringRun.test.tsx` (new): one box, it steers, a refusal keeps the text, Manual hold wording, idle is the ordinary composer | 3 failed, 1 passed | 4 passed |
| Conversation, canvas, AnA, Live Drive, run and shell suites, plus `tests/ui/one-shell.test.ts` | — | 597 passed (58 files) |

`conversationThreadShellChat.test.tsx` found the held question by the label "Reply to AnA". During a run the box is now labelled "Steer this run", and the test reads it by that label.
