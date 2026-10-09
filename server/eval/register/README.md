# Register eval (chat vs. artifact)

Turns "does AnA talk like a colleague in chat, and write like a document only
when she is producing one?" into numbers. Companion to `server/eval/doc-quality`
(document output) and `server/eval/rag` (retrieval); this harness scores the
**shape** of a reply against the register defined in
`server/services/ana-ri/response-register.ts`.

## What it measures

`register-linter.ts` is pure and dependency-free. For a chat turn it counts
headers, list items (and the smallest list), bold spans, tables, paragraphs,
longest-paragraph words, exclamation marks and emoji, and detects the rituals
the register forbids: greeting after the first turn, re-introduction, praise
opener, restated question, labelled "next step", capability menu, empty
closer, filler transitions. Every violation carries a weight; `score` is 1.0
minus the deductions (floor 0) and `pass` means no violations.

For an artifact turn (`classifyRegister` → two or more headers or numbered
section labels) it checks for chat-voice interjections, an empty closer and
first-person voice.

Platform blocks (` ```ana-grounding `, ` ```ana-action `) are stripped before
measuring; they are machine-read, not chat structure.

## Run it

```bash
# Smoke run on the hand-written samples
tsx server/eval/register/run-eval.ts --samples

# Score a captured transcript, gate on pass rate (non-zero exit on a miss)
tsx server/eval/register/run-eval.ts --transcript turns.json --min-pass-rate 0.8
```

Transcript format: `{ "turns": [ { "id", "text", "firstTurn"?, "userAskedForList"?, "register"? } ] }`.

## Status

`samples.json` is **hand-written** (2026-09-21). None of it is model output;
no AI provider was available in the environment that wrote it. The samples pin
the linter on the shapes the founder reported ("long block statements") and the
shapes the register asks for. **Live evaluation is owed**: capture real AnA
turns through the governed gateway (`getGateway()`), save them in the
transcript format above, and run the gate. Until then the register change is
verified on the prompt (see `server/services/ana-ri/__tests__/response-register.test.ts`)
and on the linter, not on model behaviour.
