# D2 — the fixture gates block, shown failing

**Date:** 2026-09-23
**Row:** D2 (Launch catalog)
**Evidence D2 asks for:** *"a CI run showing the gate block on a reintroduced fixture"*

D2 requires `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` to be **set to
block**. Both report clean at a zero baseline, but a gate that has only ever
been seen to pass has not been tested (CLAUDE.md working agreement). So the
blocking branch was exercised against a real reintroduced fixture rather than
asserted.

## Files

| File | What it is | Exit |
|---|---|---|
| `ci-fixture-fallback-BLOCKED.txt` | The gate refusing a reintroduced content fallback | **1** |
| `ci-fixture-fallback-CLEAN.txt` | The same gate on the restored tree | 0 |
| `ci-no-mock-in-prod-routes-CLEAN.txt` | The second D2 gate on the restored tree | 0 |

## What was reintroduced

A content fallback of exactly the shape the gate exists to catch, in the surface
being worked on that day — the Submission Center Planner, which had just been
wired to the live region profile:

```ts
const FIXTURE_REGION_SECTIONS = [{ number: '1.1', title: 'Forms', required: true, description: '' }];
const probeSections = profile.data?.module1Sections ?? FIXTURE_REGION_SECTIONS;
```

That is the live-read-or-example-content substitution which, on an empty tenant
or a failed read, shows a filer a required-section list that is not theirs. The
gate refused it by file and line and named the sanctioned alternative
(`useSampleRows` behind an explicit sample-mode boundary with a visible banner).

The probe was reverted immediately; `ci-fixture-fallback-CLEAN.txt` is the same
command on the restored tree, and the working tree carries no trace of it.

## A correction worth recording

The **first** probe used the name `REGION_FIXTURE` and the gate did **not**
block. That looked like a gate weakness and was not: the detector keys on a name
**prefix** —

```js
const CONTENT_NAME = /^(?:FIXTURE|SAMPLE|DEMO|MOCK|SEED)(?:_|$)/;
```

— and `REGION_FIXTURE` carries it as a suffix. The script's own header records
that keying on the identifier name was chosen deliberately *after* path-based
detection was tried and dropped. So the first run was a badly-named probe, not a
missed defect, and the second run with `FIXTURE_REGION_SECTIONS` blocked
correctly.

It is recorded here because the failure mode is worth knowing for anyone who
repeats this: **a fixture that does not follow the naming convention is not
caught by this gate.** That is the designed trade-off, not a gap to be fixed
here, but it means the gate enforces a convention rather than detecting the
pattern universally. Reviewers reading a diff still carry that load for a
non-conforming name.

## Not covered by this evidence

D2 also requires the six launch apps on by default for a new organisation, every
other surface behind a production-off flag, and fresh-org screenshots **on
staging**. Those remain owed with D1 — no staging environment exists yet. This
file is only the gate-blocks half.
