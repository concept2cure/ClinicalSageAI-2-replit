# The harness behind this evidence

The browser battery and the stand-in model that produced `../browser-battery.txt`,
`../contract-audit.txt`, `../silent-thinking.txt`, `../answer-cut-off.txt`,
`../batched-moves.txt`, `../narration.txt`, `../held-actions.txt` and
`../launch-scope-on.txt`. Kept beside the evidence
so the runs can be repeated, the way `../../2026-09-24-ana-progress/live/harness/`
keeps its own. It is evidence tooling, not product: nothing in the app imports
it.

- `stand-in-model.mjs` stands in for the Anthropic Messages API on
  `127.0.0.1:8787`.
  - It plays a model that uses AnA's self-drive tools the way her instructions
    ask: navigation, operations, both demonstrations, and a retry with a name
    the screen listed. "act <action> [param=value]" makes one act_on_screen
    call and answers with what came back ("Act result: … Screen: …").
  - It refuses every request the real API documents that it refuses, with the
    API's own status and wording. Each rule and its source are in
    `../contract-audit.txt`.
  - It streams like an adaptive model: a thinking block first, then `ping`
    events.
  - On Opus 5.5 and Fable 5.x it returns a note of three or more sentences,
    written before a tool call, as a progress-update thinking block. The block
    is empty under the default display, and holds the note's first sentence
    under "updates" or "summarized", as the API documents for those models.
  - It saves every request body to `$FAKE_REQ_DIR` (default: a folder under
    the system temp directory).
- `api-contract.mjs` holds those rules. `validate()` returns the API's refusal
  or null, and `thinks()` says whether a real model would stream a thinking
  block first.
- `selftest.mjs` makes each of the stand-in's rules fail on a request built to
  break it (27 cases). Run it after any change to the stand-in.
- `battery.mjs` drives the real app in headless Chromium through 23 checks:
  - navigation from Home and from the rail;
  - a program's Vault, opening a program, a Vault search;
  - actions sent to a screen the person is not on, held while that screen
    loads and answered once it has (the Inconsistency overlay, a
    Biostatistics design);
  - both demonstrations, including the sales demonstration's recovery from a
    guessed title;
  - every stop of the training demonstration narrated in AnA's words, each
    stop in its own paragraph;
  - moves offered as buttons with Live Drive off;
  - no page errors.

## Run it

1. **A database with the GA demo seed.** The steps are in
   `docs/LOCAL_TESTING.md`. The sales demonstration opens a document of the
   program it picks, and the seed's one authoring document belongs to no
   program, so link it once:

   ```sql
   UPDATE authoring_documents
      SET client_program_id = (SELECT id FROM regulatory_programs WHERE code = 'BX-512')
    WHERE title = 'Clinical Overview (CTD Module 2.5)';
   ```

   The held-action scenario loads a study design, and the seed has none, so
   add one for BX-301:

   ```sql
   INSERT INTO cdisc_prm_studies (tenant_id, study_id, program_id, protocol_id, protocol_title,
                                  protocol_version, study_phase, indication, protocol_status,
                                  planned_subjects, created_at, updated_at)
   SELECT organization_id, 'BX301-P2-DF', id, 'BX301-P2', 'Phase 2 dose finding', '1.0',
          'Phase 2', 'NSCLC', 'draft', 120, now(), now()
     FROM regulatory_programs WHERE code = 'BX-301';
   ```

2. **The stand-in**, with its log in a file the battery reads:

   ```sh
   FAKE_DEMO_PROGRAM=vorelinib node stand-in-model.mjs > /tmp/stand-in.log 2>&1 &
   node selftest.mjs          # all 27 cases as expected
   ```

3. **The app, pointed at the stand-in.** Any key is accepted; the stand-in
   checks shape, not credentials:

   ```sh
   ANTHROPIC_API_KEY=local-stand-in ANTHROPIC_BASE_URL=http://127.0.0.1:8787 \
     DATABASE_URL=... NODE_ENV=development PORT=5000 npx tsx server/index.ts
   ```

4. **The battery.** It needs `playwright-core`; add it without saving it to
   `package.json`:

   ```sh
   npm install --no-save playwright-core@1.56.1
   FAKE_LOG=/tmp/stand-in.log node docs/evidence/W1/2026-09-28-ana-drive/harness/battery.mjs
   ```

   Name scenarios to run only those, e.g. `battery.mjs biostat demo`.
   Screenshots go to `$HARNESS_OUT` (default: a folder under the system temp
   directory).

## Settings

| Variable | Used by | Meaning |
|---|---|---|
| `FAKE_PORT` | stand-in | port (default 8787) |
| `FAKE_DELAY_MS` | stand-in | pacing of a reply (default 600) |
| `FAKE_DEMO_PROGRAM` | stand-in | the program a demonstration uses, by name or code |
| `FAKE_THINK_MS`, `FAKE_THINK_MATCH` | stand-in | think silently for that long (pings only), optionally only on asks matching a pattern — how the 30-second cut-off in `../silent-thinking.txt` was reproduced |
| `FAKE_CUT_OFF` | stand-in | on asks matching the pattern, the final answer stops halfway with `stop_reason: "max_tokens"`; run the battery's `cutOff` scenario by name with it — how `../answer-cut-off.txt` was made |
| `FAKE_PARALLEL` | stand-in | "search the vault for …" is answered with both moves in one response (the program's Vault, then the search), as a real model batches calls — `../batched-moves.txt` |
| `FAKE_SLOW_TOOL` | stand-in | `name:ms` holds a round that calls `name` |
| `FAKE_REQ_DIR` | stand-in | where request bodies are saved |
| `APP_URL` | battery | the app (default `http://localhost:5000`) |
| `FAKE_LOG` | battery | the stand-in's log; the sales-demo retry is read from it |
| `CHROMIUM_PATH` | battery | a Chromium to use instead of Playwright's own |
| `HARNESS_OUT` | battery | where screenshots go |
| `DATABASE_URL` | battery | only for the two scenarios run by name, `takeoverBeforePromotion` and `screenReportChannel` |
| `BATTERY_EMAIL`, `BATTERY_PASSWORD` | battery | the account; default the GA demo seed's |
| `LAUNCH_SCOPE` | battery | `on` when the app runs with `LAUNCH_SCOPE_ENFORCE=on` (production's default): the checks that name a screen outside the release (Biostatistics, Inconsistency) assert the honest refusal instead — `../launch-scope-on.txt` |

With `ANA_MODEL_TIERING=off` on the app, every round goes to Opus 5.5, which
takes AnA's operator turns as mid-conversation system messages. With tiering on
(the default), drive rounds go to Sonnet 5, and the gateway folds them into the
user turn. Both were run for `../contract-audit.txt`.

## What it cannot show

How a real model follows AnA's instructions. The stand-in plays the model a
fixed way. It shows that the app, the requests and the stream hold up, not
that a real model makes the moves it should. A run with a real key
(`docs/LOCAL_TESTING.md`, "AnA operates the app") is that evidence.
