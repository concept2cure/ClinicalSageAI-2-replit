# MDX: two device panels say what the server said (found walking the demo's NeuroPanel-Dx)

Plan: F1, a repair of shipped behaviour: no screen, mount or table. Found on 2026-11-09, the day of a client demo.
The founder's Codespace seeds the demo with `npm run demo:seed -- --pack all` (`.devcontainer/post-start.sh`), and its
`mdx` pack (`scripts/demo/launch-demo/packs/mdx.mjs`) creates the device project "NeuroPanel-Dx 510(k)".

## How it was found

The `mdx` pack was seeded into this install, on the merged trunk, through the product's API as the seeded admin. It
seeded every step, except the signed steps, which were recorded as "not executed": no second signer was given here,
and the Codespace supplies one (`runs/demo-seed-mdx.log`). Then the project's seven screens were opened in a browser,
with every non-GET request to a conversation endpoint aborted. Five were clean. Two were not:

| Screen | What it said | What the server had answered |
|---|---|---|
| 510(k) (`device-510k`) | "Could not load predicate candidates" and "Could not load substantial-equivalence rows", each with Try again, under a banner already saying predicate intelligence was not reachable | 503 `{"error":"Predicate Intelligence not configured","detail":"REVIEW_ADMIN_TOKEN is not set"}` from both `/api/predicate-intelligence/candidates` and `/se-matrix` |
| IVD (`device-diagnostics`) | "Could not load GSPR chapters", with Try again | 404 `{"error":"No GSPR assessment found for this project","code":"IVDR_GSPR_NOT_FOUND"}` |

Neither is a failed read, and trying again cannot change either answer. A deployment without `REVIEW_ADMIN_TOKEN` shows
both 510(k) panels on every device project. Every device project shows the GSPR panel until its matrix is started.

## What already exists (RULE 3)

- **`useFetchJson`** (`mdx/hooks/useFetchJson.ts`) already returns `failure: { kind, status, code }`, with the server's
  code read from the body, and classifies a 404 as `not-found`. The hooks dropped it and passed on only the message.
- **`DataGate`** (`mdx/components/DataGate.tsx`) already separates `empty` from `error`. An empty gate offers the
  screen's own hint, and a retry only where one is passed.
- **The server already sends `IVDR_GSPR_NOT_FOUND`** (`server/routes/ivdr-routes.ts`). The predicate route's
  `requireConfigured` (`server/routes/predicate-intelligence.ts`) sent no code. It gets one.
- **The 510(k) screen's banner** already said the service was not reachable. It now says "not configured" when that
  is what the service answered.

## The change

- `predicate-intelligence.ts`: the "not configured" 503 carries `code: 'PREDICATE_INTELLIGENCE_NOT_CONFIGURED'`.
- `useK510.ts`: `useK510Predicates` and `useK510SeMatrix` return `notConfigured`, true only for that 503 with that code.
- `K510Surface.tsx`:
  - The banner says "Predicate intelligence is not configured for this workspace…".
  - The candidates gate stays quiet when the banner has said so.
  - The SE gate is an empty state whose hint names the cause, "The SE matrix is built by predicate intelligence,
    which is not configured for this workspace.", and offers no retry.
- `useIvd.ts`: a 404 `IVDR_GSPR_NOT_FOUND` is an empty matrix, so the screen's own hint shows: "Start the GSPR matrix
  for this device to populate the chapter breakdown."

A genuine failure still reads as one: a 503 without the code (the service is down) and a 500 from the GSPR read.

## Verified

| Check | Before | After |
|---|---|---|
| `mdx/surfaces/__tests__/deviceScreensSayNotConfiguredAndNotStarted.test.tsx`, through the real host (4 cases: not configured, service down, no GSPR assessment, GSPR read failed) | the two targeted cases failed; the two failure cases passed (`red/panels-before.txt`) | 4 passed (`green/panels-after.txt`) |
| Every `client/src/concept2cure/mdx` suite and the predicate-intelligence route suites | — | 111 files, 1,202 tests passed (`green/neighbours.txt`) |
| The running app, restarted on this change, the seeded NeuroPanel-Dx | three "Could not load" panels | none. The 510(k) screen says "not configured" once, and the IVD screen shows the empty matrix with its hint (`shots/01-…`, `02-…`, `runs/demo-walk-after.json`) |

What is left on the 510(k) screen in this container is "Reduced openFDA fallback unavailable … fetch failed". This
container cannot reach openFDA; a deployment that can reach it shows the reduced lookup.
