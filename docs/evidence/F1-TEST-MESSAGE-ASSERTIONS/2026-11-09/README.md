# F1 sweep: a refusal's message is compared, not assumed (2026-11-09)

The coordinating session asked, 2026-11-09, for the owed sweep to be logged under RIM's row with its grep count. It
was logged with `17463713f`, and is done here.

## What already exists (RULE 3)

- `server/services/submission-service/__tests__/transmit-refusals.test.ts` asserted four of `transmitSequence`'s
  refusals as `rejects.toMatchObject({ code: 'VALIDATION', message: /regex/ })`.
- Against a thrown `Error`, a regular expression as the expected `message` is not compared with the message.
  `mutation-message-changed.txt` shows it:
  - the refusal is rewritten to "Transmit needs a target.";
  - the old assertion still passes;
  - the same test with `expect.stringMatching(...)` fails.
- A string `message` is compared, so only the regex form is blind.

## The change

The four sites now read `message: expect.stringMatching(/same regex/)`. No regex changed, and no service code changed.
All four pass when they are actually compared, so the refusals already said what the tests meant. Only the tests could
not see it.

## Proof

| File | What it shows |
|---|---|
| `sweep.txt` | 4 sites before, all in this file. 0 after, by the single-line grep and by a multi-line search that also covers `toEqual`, `toStrictEqual` and `objectContaining`. The file's 15 tests pass |
| `mutation-message-changed.txt` | the same changed message under both forms: the old one passes, the new one fails. The service file was restored byte for byte |

`Plan: F1`, `Completes: server/services/submission-service/__tests__/transmit-refusals.test.ts`.
