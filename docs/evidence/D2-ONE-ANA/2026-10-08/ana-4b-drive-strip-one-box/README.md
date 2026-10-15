# Slice 4, completed — the drive strip draws no box on the conversation screen

Launch row **D2**, 2026-10-08. Found by the real-browser capture of the rail removal (`../ana-9-rail-goes/screens/README.md`, expectation 3 failed).

## What was wrong

With Live Drive on (the default), a run on the conversation screen still showed two places to type to AnA:

- the composer, "Steer this run";
- the drive strip's "Ask or steer AnA…".

Slice 4 hid the strip's box only when no drive controls were held (`V2App.tsx`). But the shell's own drive also hands the strip its controls, so "controls present" never meant "another chat is driving", and the guard was false during every drive. `oneBoxDuringRun.test.tsx` never ran a turn with Live Drive on.

## What changed

On a screen that owns its conversation, the strip gets no `onSteer`, whichever chat drives. Stop and take-over stay.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `liveDriveShell.test.tsx` › "one box: … while the shell's own turn drives" (the real V2App on the conversation screen, the shell's own drive started) | 1 failed | passed: with `liveDriveOverlay` and `oneBoxDuringRun`, 29 passed |

## Not done here

The strip also says "AnA is driving" while Progress says she is waiting for approval, from the same misread of "controls present" (`V2App.tsx`, the `waiting` prop). That is noted for the next drive-strip change.
