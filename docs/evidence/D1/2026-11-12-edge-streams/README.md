# D1 — streams and connector calls survive the 60-second edge (2026-11-12)

Row **D1** (Hosted production), work order `docs/work-orders/MR-03-first-deploy-staging-to-production.md`, Stage 6
(OPS-17), steps 7, 8 and 9. Session `…01QoxbLbx`, continuing `docs/evidence/D1/2026-11-11-aws-readiness/`.

Behind CloudFront and the ALB a connection that carries nothing for 60 s is closed (`origin_read_timeout` and
`idle_timeout`, both 60 s, pinned on 2026-11-11). Two kinds of response could be silent for that long: a server-sent
event stream waiting on its next event, and a connector tool call waiting on its result.

**Nothing was applied, and nothing was shown behind a real CloudFront.** The proof is the code's own behaviour under
fake and real timers. Stage 6's acceptance line "on staging behind CloudFront, a 200-leaf compile completes with no 504"
needs staging, which needs the founder's AWS inputs (MR-03 Stage 5).

## What already exists (RULE 3)

- **Two heartbeats**, each private to its producer:
  - `server/routes/ana-ri/stream.ts`: a 15 s `: heartbeat` written through the stream's own `writeFrame`, stopped on the
    response's `close` and `finish`, and kept running through a POST's request `close`;
  - `server/services/ai-actions/sse-stream.ts`: a 15 s `:ping` that also fed the job stream's idle watchdog.
- **Eight producers with none**: `ana-features.ts` (submission chat), `ana-intelligence.ts` (draft),
  `contentAssembly.routes.ts`, `cortex-unified.ts`, `deep-research.ts`, `fieldSync.routes.ts`, `ind.ts` and
  `submissions.ts` (section generation).
- **Three files that name the content type without producing a stream**: `server/mcp/client-transcript.ts` and
  `server/services/anaCortexClient.ts` (outbound requests asking for one), and `server/middleware/enterprise-performance.ts`
  (the compression filter that skips one).
- **The connector's tool runtime**, `server/mcp/tools/runtime.ts`: one wrapper for every tool. It handles scope, the
  tenant scope, the audit row and a connection released only after the work settles. It had no progress and no deadline.
- **The model gateway takes an abort signal** (`GatewayRequest.signal`). The agency-response tool did not pass one.

Searched and not found: a general SSE helper anywhere in `server/` (`server/utils` has none), `check-sse-heartbeat`, any
`progressToken` or `notifications/progress` in `server/`.

The work order names a new `server/utils/sse-stream.ts`. It is built from the two heartbeats above, which are deleted.
Ten private header blocks became one, with no second implementation left.

## What landed, each red first

| Commit | What | Red | Green |
|---|---|---|---|
| `333802662` | **Every event stream has a heartbeat.** `openSseStream` (`server/utils/sse-stream.ts`) writes the headers once (`no-cache, no-transform`, `X-Accel-Buffering: no`, `nosniff`), flushed, and a `: heartbeat` every 15 s. It stops on the response's finish or close, never the request's. The ten producers open their streams with it. `ci:sse-heartbeat` refuses any other server file that names `text/event-stream`. | The gate on trunk refuses ten producers (`sse-gate-red.txt`). | The gate passes and its self-test decides 8 of 8 cases (`sse-gate-green.txt`, `sse-gate-selftest.txt`). The helper, 10 of 10, one on a real socket: a POST stream keeps its heartbeat after its body is read (`sse-helper-green.txt`). Every test file that imports a producer: 116 files and 1176 tests before, 117 and 1186 after, all passing (`sse-producer-suites.txt`). |
| `fac4a391c` | **A connector call is answered inside the edge.** A call carrying `_meta.progressToken` gets `notifications/progress` every 15 s. A tool that writes nothing governed is answered at 50 s with an error result: it did not finish, nothing partial was returned, continue in the app. Its work is told to stop, and its connection is released when that work settles. A governed tool has no deadline. The agency-response draft passes the call's signal to the model gateway. | 6 of 9 fail on trunk (`mcp-deadline-red.txt`). | 9 of 9 (`mcp-deadline-green.txt`); the connector's 15 test files, 98 tests, pass. |

Also, on the final tree: the whole-program typecheck reports 0 errors, and the ESLint warning ratchet shows net −2 with no
file gaining a warning.

## Decisions made here, and why

- **The heartbeat listens on the response.** Since Node 16 a request emits `close` once its body is read. For a POST
  stream, a heartbeat stopped on that would end before the first frame. The AnA stream already knew this; the helper's
  real-socket test pins it.
- **A governed connector tool is not cut at 50 s.** It may already have written its record, and an error would report a
  persisted act as failed. Progress notifications still keep it alive.
- **The deadline applies to every tool that writes nothing governed**, not only the three the work order names. Any
  read that runs past 60 s is cut at the edge anyway, and an error that says why is better than a dropped connection.
- **The content type lost `charset=utf-8` on the Cortex stream.** EventSource and fetch readers ignore it, and SSE is
  UTF-8 by definition.

## Still open in Stage 6

- **Step 2, the measurement**: compile, package assemble, sequence assemble and export, at 50 and 200 leaves, on the
  production image with Ghostscript and veraPDF. It decides whether steps 4–6 are needed: if every p95 is under 45 s,
  they are skipped.
- **Steps 4–6**: compile and assemble answer 202 with a job id, and the three screens poll. Only if step 2 says so.
- **The staging acceptance**: a 200-leaf compile behind CloudFront with no 504.
