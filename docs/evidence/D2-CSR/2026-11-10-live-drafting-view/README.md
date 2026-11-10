# D2: watching a CSR being written (2026-11-10)

Launch row D2, workstream W1, ledger package F1. The founder, 2026-11-10: *"I want to visually see the drafting of a
CSR report section … I want to see it happening, or in the background, I want to see that it's progressing, and then I
want to see the result. I need a visual presentation to sell this system to humans."*

## What a person saw before

Walked in the running app with a whole-report build drafting (`before-drafting.png`):

- One line: "CSR build 8 · drafting · 13% · last updated …". No heading, no text, no bar.
- The heading list under it blinked out ("Reading the build's sections…") each time a heading was saved, about every
  five seconds. Any saved heading a person had opened to read closed with it.
- The saved text, once opened, was shown in small monospace, like a log.

## What a person sees now

In the same place, the CSR document's "Build from the study's data" (`writing.png`):

- **"Writing §7 Introduction · 7 of 69 headings written"**, with a thin bar that fills as headings are written.
- **The heading's prose as the model writes it**, in the page's own type, following the newest line. Under it: "This
  text is being written now. It is saved only after every figure in it is checked against the study's tables."
- **The result:** each heading becomes a row in the section review as it is saved ("Draft · Send for review"), and
  "Read saved section text" opens it in place, in the same readable type. It stays open while the build goes on.
- A build that has ended shows no live view: only its status line and its headings, as before.

## What already exists (RULE 3)

Nothing new: no screen, route file, service, table or tool. Each change finishes an existing file.

| Path | What it did | What it does now |
|---|---|---|
| `server/services/csr-builder.ts`, `csr/csr-draft-refusal.ts` | Asked for each heading as a stream and ignored the chunks | Hands the prose to the build's live view as it arrives; the model's reasoning is not shown |
| `server/services/csr/csr-job-runner.ts` | Knew the heading in hand only in memory, and wrote it only into a failure receipt | `csrLiveBuild(jobId)`: the heading, the count, and the prose so far without its claims block. In memory, gone when the build ends |
| `server/routes/csr-jobs.ts` `GET /api/csr/jobs` | Listed status, percentage and failure | Adds `writing` for a drafting build, to the project's readers |
| `client/…/surfaces/CsrRunBuilds.tsx` | Re-read the list every 5 s; emptied the heading list on every re-read | Re-reads every 2 s while a build says what it is writing; shows it; keeps the headings on screen |
| `client/…/surfaces/CsrBuildProgress.tsx` | Saved text in monospace | Saved and live text share one readable style |

Searches run: `progress`, `streaming`, `onStream`, `AnaActivity`, `currentSection`, `BUILD_POLL_MS` across `client/src`
and `server/`. The conversation already streams AnA's text (`ana-ri/stream.ts`); the editor's single-section "Draft
from sources" does not, and is not changed here.

## Limits, stated

- **The live text is work in progress.** It is not yet checked against the study's tables and is never saved from
  the live view. A draft the figure checks refuse is seen being written and then is not saved; the build says why.
- **It is held in the process that runs the build.** A second server process answers with no live text, and the
  panel then shows the heading count alone. Enough for one server; a multi-instance deployment needs the text
  carried between processes.
- **No real model wrote the text in these pictures.** This environment has no Anthropic key. The provider is the
  stand-in (`../2026-11-10-build-provider-refusals/csr-stand-in.mjs`), streaming prose made from the study's own
  metadata at a watchable pace. With a real key the same view shows Claude's prose at Claude's pace.

## Tests (each seen failing first)

| Suite | Red | Green |
|---|---|---|
| `client/…/__tests__/csrCardReach.test.tsx` | 2 new tests failed; then the opened-heading check failed alone | 18 of 18 |
| `server/services/__tests__/csr-builder-provider-refusal.test.ts` | 1 new test failed | 18 of 18 |
| `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts` | 2 new tests failed | 28 of 28 |

No file gained a lint warning.

## Record it yourself

```
node docs/evidence/D2-CSR/2026-11-10-live-drafting-view/record-drafting.cjs \
  http://127.0.0.1:5000 ~/.concept2cure-codespace/cdisc-pilot <out-dir outside the repository>
```

It signs in as the author, opens the CSR, presses "Build CSR draft", films the live view for `RECORD_SECONDS`
(default 60), opens one saved heading, and writes `csr-drafting.webm`. It starts a new build each run. Keep the video
out of the repository: it shows the study's text and tables.
