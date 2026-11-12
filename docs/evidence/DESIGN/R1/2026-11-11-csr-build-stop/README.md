# Reach: stopping a CSR build from the page (2026-11-11)

Package R1 (Reach), launch row D2. The founder, 2026-11-11: *"focus entirely on getting what we built surfaces
correctly on the UI and working for GA."*

## What was built and not reached

`POST /api/csr/jobs/:jobId/cancel` (`server/routes/csr-jobs.ts`) stops a build that is queued or drafting. It is
served in production and no screen called it (R1 inventory, `../2026-11-01-inventory/`: "served, no caller"). A
build asks the model for 69 headings. One started by mistake, or on the wrong study data, ran to its end on the
model's account while the page could only watch.

## What already exists (RULE 3)

| Path | What it does | What it did not |
|---|---|---|
| `server/routes/csr-jobs.ts` `POST /:jobId/cancel` | Records the build `cancelled`, in one conditional update; 409 for a build that has ended | Was not called by any screen |
| `server/services/csr/csr-job-runner.ts` `isJobDrafting` | Looks after each model call; a build no longer drafting saves nothing more | Takes a `queued` or `failed` build only, so a `cancelled` one could never run again |
| `server/routes/csr-jobs.ts` `POST /:jobId/resume` (2026-11-10) | Resumes a failed build as the same build | Refused a `cancelled` build |
| `client/…/surfaces/CsrRunBuilds.tsx` | The build's status line, live view, reason and "Resume build" | Offered no stop, and printed `cancelled` |

Searches run: `/cancel`, `cancelled`, `isTerminalStatus`, `Stop build` across `client/src` and `server/`; every route
in `csr-jobs.ts`, `csr-jobs-assembly.ts`, `csr-jobs-narratives.ts`, `csr-source-inputs.ts` and `csr-study-pivotal.ts`
was checked for a caller in `client/src/concept2cure`. The cancel route was the only one without one.

## The reach

In the CSR document's "Build from the study's data" (the one editor), under the build's status line:

- **"Stop build N"** while a build is queued or drafting, with "The headings already saved are kept, and the build
  can be resumed."
- A stopped build reads **"CSR build N · stopped · 15%"**, then "This build was stopped. The sections already saved
  are kept.", and offers **"Resume build N"**.
- A build that ended before the request arrived: "Build N had already ended, so there was nothing to stop."

**Why a stopped build must be resumable.** A CSR document takes its imported sections from one build. If a person
stops a build, approves what it saved and imports it, the rest of the report can only come from that same build. So
`POST /:jobId/resume` now takes a build a person stopped as well as a failed one: it queues it again in one
conditional update, and hands it to the runner, which is unchanged. Asked twice, the second request finds it queued
and hands nothing over.

No new screen, route, service or table: `BuildActs` and `StopBuild` are in `CsrRunBuilds.tsx`.

## Walked in the running app (`stop-resume.cjs`, `running-with-stop.jpg`, `stopped.jpg`)

As the Lumen lead, on the LMN-201 report, with the stand-in provider:

| Step | The page |
|---|---|
| "Build CSR draft", then wait for ten headings | "CSR build 18 · drafting · 14%", "Writing §9.2 … · 10 of 69 headings written", "Stop build 18" |
| "Stop build 18" | "CSR build 18 · stopped · 15%", 11 headings drafted, no live view, no stop offered |
| Twelve seconds later | Unchanged: nothing more was saved |
| "Resume build 18" | "CSR build 18 · complete · 100%"; 69 headings saved (read from `csr_section_outputs`) |

No failed request and no console error.

## Tests (each seen failing first)

| Suite | Red | Green |
|---|---|---|
| `client/…/__tests__/csrCardReach.test.tsx` | 3 new cases failed | 26 of 26 |
| `server/routes/__tests__/csr-jobs-build-and-review.pglite.test.ts` | 1 new case failed: 409 where 202 was expected | 25 of 25 |

No file gained a lint warning.

## Limits, stated

- **The heading in hand when a build is stopped is asked of the model and then discarded.** The runner looks after
  each model call, not during one, so one request's cost is spent.
- **Who stopped a build is not recorded.** The cancel route records the state only. It is an operational act, not a
  change to a governed record: no section, approval or signature is touched.
- **No real model wrote the text.** The provider was the stand-in.
