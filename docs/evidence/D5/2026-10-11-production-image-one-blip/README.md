# One upstream blip failed the whole production image, so the job that checks the shipped build boots never ran

**Row:** D5 adjacent — this is the deploy gate, not a Part 11 path, and it is
here because the shape is identical to the gate repairs filed beside it: a check
that cannot start is guarding nothing. **Session:** `…01P6GWSv`. **Date:**
2026-10-11.

## What happened

CI run **13271** (head `56ceff4e`): the job *"Production Image Boot (built
image, empty database, sign-in)"* failed at **"Build the provision and
production images (as deploy-aws.yml does)"**. The `--target provision` image
built; `--target production` died at stage 6 of 22, the veraPDF download
(`Dockerfile.optimized:108`):

    curl: (22) The requested URL returned error: 404
    https://repo1.maven.org/maven2/org/verapdf/apps/cli/1.30.2/cli-1.30.2.jar
    ERROR: process "/bin/sh -c set -eu; ..." did not complete successfully: exit code: 22

## It is not a standing breakage, and it matters that it is not

Across the **twenty most recent CI runs this job failed here exactly once.**

| Run | Head | Build step |
|---|---|---|
| 13270 | `de0fceff` | passed, 307s — started 22:23:30Z |
| **13271** | **`56ceff4e`** | **failed, 150s — started 22:39:34Z** |
| 13272 | `2274cf03` | passed, 232s — started 22:57:36Z |

`ARG VERAPDF_VERSION=1.30.2` and `ARG VERAPDF_SHA256=287cc9…` are
**byte-identical** at all three heads, so the pin did not move, and the step ran
for 228–357s on ephemeral runners in every other surveyed run, so it was neither
skipped nor cached. The same download succeeded sixteen minutes before the
failure and eighteen minutes after it.

Checked directly from this container:

- the URL serves **200** and the artifact is present;
- its bytes hash to **exactly** the pinned `287cc9c9757f…a332`, which is also
  the value Maven Central publishes in `cli-1.30.2.jar.sha256`.

**So the version pin and the checksum pin are both correct.** The artifact was
there the whole time. What failed was one HTTP GET.

A second, separate observation: fetching that same 16 MB jar repeatedly from one
host earned a **429**, then a 200, and later a *sustained* 429. Maven Central
refuses a share of requests from a busy egress address. A 404 rather than a 429
is an odd way to say so, but a 404 is what run 13271 was served.

## Why one blip is worth fixing rather than re-running

That job exists because *"no other DB-backed job here proves anything about the
application booting"* — with `RLS_ENFORCE=on` the shipped build once threw
`[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope` and shut
down before it listened, and no job noticed. When the image build dies, the job
**never reaches that check**. One unretried GET against a third party was enough
to switch off the only gate that proves the product starts. That is the same
shape as the contract gate repaired beside this one, which could not even load.

So the fetch is now retried. Nothing else changed: same version, same checksum,
same URL, same fail-closed verification.

    curl -fsSL --retry 8 --retry-all-errors --retry-max-time 300 \
      -o /opt/verapdf/verapdf-cli.jar "…/cli-${VERAPDF_VERSION}.jar"

Two choices in that line are deliberate and were measured, not guessed:

- **`--retry-all-errors`, not plain `--retry`.** curl's default retryable set is
  408/429/5xx. **404 is not in it**, and 404 is what was served, so plain
  `--retry` would have changed nothing in run 13271.
- **No `--retry-delay`.** Passing one *replaces* curl's exponential backoff with
  a fixed wait. The first version of this fix used `--retry 5 --retry-delay 2`,
  and against the sustained 429 above it burned all five attempts in about ten
  seconds — inside the refusal window — and failed exactly as the unretried
  fetch did. Left to back off on its own (1s, 2s, 4s, … bounded by
  `--retry-max-time`) curl waits *across* the window instead of inside it.

## Proof, with the flags that actually ship

A local server standing in for Maven Central, because fetching the real one
enough times to test it is what triggers the rate limit:

| Case | curl | checksum | elapsed | meaning |
|---|---|---|---|---|
| 404 three times, then the real jar | 0 | **0** | 7s | recovers and verifies — and survives three consecutive refusals, more than run 13271's one |
| a payload that is **not** the pinned artifact | 0 | **1** | 0s | `computed checksum did NOT match` — integrity still refuses |
| 404 on every attempt | 22 | 1 | **255s** | bounded give-up; the build fails rather than shipping an unverified validator |

The middle row is the one that matters most: **retrying cannot weaken the
supply-chain guarantee.** A retry only buys more chances to obtain the *pinned
bytes*; anything else still fails `sha256sum -c`. And the last row shows an
artifact that is genuinely gone still stops the image, within a bounded 300s,
rather than hanging or being skipped.

Before the change, the first case reproduces run 13271 exactly:

    curl: (22) The requested URL returned error: 404
    sha256sum: out.jar: No such file or directory
    RESULT exit=1

`curl` was the only unretried network fetch in `Dockerfile.optimized`; the other
network steps are `apt-get`, `pip` and `npm ci`, which retry internally.

## Also found, not this change's work

- **An earlier, distinct failure of this same job**, runs 13254–13258, at a
  different step — *"Provision the empty database with the provision image"*,
  with the build step passing. It stops at run 13259 (`a17157f3`, "fix(db):
  provision AnA run parent before fresh-install event overlays") and has passed
  since. Already fixed by that lane; recorded so the history is not re-diagnosed.
- **`stats_computation_runs`**, the table the tenant-purge ratchet named in run
  13271, was already joined to the purge by another lane's `a3fbd6ff3` with a
  justifying comment (`tenant-offboarding.ts:958-965`). That commit is not an
  ancestor of `56ceff4e`, which is the whole reason the gate was red on that
  head. Green at HEAD; nothing to do.
- **Local and CI disagree on `RLS_ENFORCE`.** The repo's `.env` sets it to `on`;
  CI has no `.env`, so `readEnforcementMode()` resolves `off`. Anything whose
  expectation embeds the enforcement value therefore passes in one place and
  fails in the other — which is exactly how the four stale tenant-stamp
  assertions filed beside this were able to be pushed red. No gate runs a suite
  in both postures. Named for whoever owns CI topology; the fixes in this
  session were each verified under both.
