# PF-10 S10b (D2): the chat send route resolves its project once

This was raised by the review of the intelligence-prefix fix (`wf_f0bc8794-d80`), upheld 2/2. The finding was pre-existing.

## The defect

`POST /api/chat/send-message` (`server/routes/chat/send-message.ts`, mounted behind `authenticateToken`) coerced `project_id` at eleven sites. For a v2 program `7abb1c22-…`, the sites that act or read went to project 7, a valid, wrong project of the same organization:

- **the guidance executor**, which auto-creates artifacts;
- **the session bootstrap**, which loads project memory and outcome lessons into AnA's prompt;
- **the in-context corpus**, when the corpus flag is on;
- **the tool context's integer project**, and the tool run log;
- **the routing-decision logs.**

The remaining sites got 0, `NaN` or none:
- RIM;
- reliability;
- working memory;
- the data-lineage record.

No in-repo client calls this route; the v2 UI uses the stream. It is live for API callers.

## The change

- **The project is resolved once** near the top of the handler, as `turnProjectId`. It uses `services/c2c/project-ref.ts` `integerProjectForRef`, the same resolution as post-processing and the intelligence prefix: an integer as itself, a program through its anchor row, anything else as none.
- **Every site uses it**, and a step that needs a project runs only when one resolved.
- **A contract test guards it.** `tests/schema-contract/no-project-id-coercion.contract.test.ts` refuses `parseInt(…project…)` and `Number(…project…)` in `send-message.ts`, `post-processing.ts` and `intelligence-prefix.ts`. Its first case shows the pattern catches the removed coercions and passes the resolution.
- **A unit test pins the resolver:** `server/services/c2c/__tests__/project-ref.test.ts`.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | The contract against the three files at `1d203bd1b`, before S6a and S10b: all three fail. |
| `02-green.txt` | Every suite that touches the chat routes, plus the c2c services (the resolver test included), the contract, the AnA route suites and lumen-context. 40 files, 515 tests, all passing. `tsc` passes, and the lint ratchet shows one fewer warning. |

## Still open (adjacent, pre-existing)

The review refuted two other `parseInt` findings as not reachable as claimed: `/api/cortex/chat` (out of the launch catalog, refused in production) and the project-intelligence routes.
