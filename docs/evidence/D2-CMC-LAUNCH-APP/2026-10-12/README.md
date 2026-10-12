# CMC / Module 3 is the eighth launch app

Row **D2**. Decision **P-28** (2026-10-12), under the founder's delegation of
2026-10-07.

## What was wrong

The CMC operating system was built, governed and tested — and **refused to
every organisation**, entitled or not. `cmc` was not in
`shared/constants/launch-scope.ts`, so `applyLaunchScope` overwrote its
entitlement verdict with a `launch-scope` lock whatever the licence said, and
every path under `/api/cmc` was unattributed and refused 403 in production.
Ten AnA tools and six platform commands that serve the surface were withheld
with it.

An IND without Module 3 is not an IND, and nothing downstream had ever asked
whether the CMC work was done: Projects opens a "Draft IMPD / CMC (M3)" task
for every IND programme, and until D2 2026-10-05 a sequence carrying Module 1
alone read dispatch-clear.

## What the flip is

**The app** (`shared/constants/launch-scope.ts`): an eighth entry,
`{ id: 'cmc', label: 'CMC / Module 3', surfaces: ['cmc'], modules: [] }`.

**`modules` is empty on purpose, and that is the decision's substance.**
`provisionLaunchModules` writes an explicit grant for every module id listed,
and a grant outranks tier permanently. Listing `cmc` would hand the module to
every new organisation and overturn the professional band the product owner set
on 2026-08-24 — a pricing decision as a side effect of a scope list. Listing
the **surface** is enough and is what this entry is for:
`applyLaunchScope` says in its own docstring that it "never widens anything",
so it lifts the lock and leaves the catalog verdict, and the band plus any
explicit grant still decide. The 2026-08-24 migration's grandfather grants
already cover every organisation entitled then, so **no backfill migration is
needed and none was written**.

**The pins that follow**, each bumped deliberately rather than discovered by a
red build:

| Pin | Before | After |
|---|---|---|
| `scripts/ci/check-launch-scope.mjs` | 7 apps | 8 |
| `launch-scope.test.ts` | `toHaveLength(7)` | 8, plus two cases below |
| `demo-scripts.ts` orientation | seven apps, no CMC stop | eight, with a CMC stop |
| AnA inventory | the CMC entries under `hiddenApp` | under `inScope` |

**Two new test cases carry the decision**, not just the count:

- *CMC / Module 3 is a launch app* — and the lock it lifts is shown by giving
  the surface a `subscribed` verdict and watching it survive.
- *CMC grants NO module, so the professional band still decides who sees it* —
  `modules` is `[]`, `LAUNCH_MODULE_IDS` does not contain `cmc`, and a `tier`
  verdict requiring `professional` comes back unchanged through
  `applyLaunchScope`.

**The AnA half.** `anaCapabilityInLaunchScope` re-checks the surface against
`LAUNCH_SURFACE_IDS` rather than trusting the inventory — its comment says the
reason: "so that promoting a surface into the launch catalog brings its tools
back without editing the inventory". So the ten tools and six commands returned
the moment the surface did, and the inventory move is bookkeeping. It was still
made, because `hiddenApp` is defined as "operates records of surfaces outside
the launch catalog only", which is now false for them — and the suite's own
invariant *names only surfaces outside the launch catalog* failed on exactly
that (`cmc: expected true to be false`).

`cmc-launch-scope-flip.test.ts` pins the mechanism rather than the bookkeeping:
it takes `cmc` out of the id set and shows all sixteen withheld again, so the
suite cannot pass merely because a JSON file was edited.

**And what the flip must not open.** `start_intelligence_flow` reached
production with those tools. It starts an interview for any document type the
registry knows — protocol, CSR, IND, NDA, BLA, SOP, 510(k), CER — but
`buildInterviewCommitPlan` produces entries for the CMC specification flow and
an **empty plan** for every other category. Any other interview could be
started, answered to the end and commit nothing: an empty result standing in
for a refusal. `COMMITTING_FLOW_CATEGORIES` is now one list, read by the plan
builder and by the tool, and a non-committing flow is refused where the
boundary is enforced — naming Document editor & authoring — and still offered
on a development server.

## Green

- `ci:launch-scope` (`green-ci-launch-scope.txt`): **8 apps · 31 surfaces · 13
  modules**, routable, registered, licensable and fixture-free. The gate was
  seen refusing first: with the app added and the count still 7 it reported
  `✗ shape: expected 7 launch apps, parsed 8`.
- `ci:launch-scope-api` (`green-ci-launch-scope-api.txt`): **344** API paths
  named by launch and shell screens, **none refused** — up from 288, the
  difference being the CMC screens' own calls, now attributed.
- `ci:validation-traceability`: every file cited by **7** URS documents
  resolves.
- The four suites that carry the catalog, the AnA scope and the demo scripts:
  **78 tests pass** (`green-after.txt`).
- `ci:unreferenced-modules` 81 against a baseline of 81; the ESLint ratchet
  reports no file with more warnings than before; `tsc --noEmit` clean.

## The requirements, and what validation still owes

`docs/validation/URS-007-CMC-MODULE-3.md` specifies the app: **20
requirements**, each with its Part 11 clause, its risk and the file that
implements it — the register role gate, the one compile, the composition
boundary, the signed section approval and its read-before-sign, the
contradiction lifecycle, the export gate, placement, the append-only history,
the signed register states, the deterministic engines, screen honesty, the
interview commit, the release-signature binding, the original-IND Module 3
requirement, the API allowlist and the orchestrator's governed load.

**OQ-008 is not filed, and that is deliberate.** The protocol was written
(31 steps, one per requirement) and then **withheld**, because
`ci:validation-traceability` refuses a protocol that names no runner:

```
[no-runner] OQ-008-CMC-MODULE-3.md: names no runner that exists (none)
```

That gate is right — a protocol its runner does not implement is not a
protocol — and satisfying it with a stub that declares steps it does not
execute would be gaming it. The runner
(`tests/validation/oq/cmc/run.mjs`, ~500 lines on the pattern of the Projects
and QMS runners) is owed, and with it:

1. **OQ-007 for Reporting & analytics**, which does not exist either — so
   "OQ-001…007" in P-28 names a set that is not yet complete;
2. execution under the W3 posture (RLS enforcing, non-owner runtime role,
   launch scope enforced, a credentialed second signer) at one commit beside
   IQ-001;
3. a named expert's signature on the reference-record verification;
4. TM-001 regenerated and VSR-001 §8 amended.

Until all four are done, nothing in the product or its documentation describes
CMC / Module 3 as validated, and P-28 says so.

## Also withheld at the flip

- The change simulator and the "Filing path by market" matrix stay hidden: a
  client-side lookup that contradicts the server classifier, using
  post-approval categories that are wrong for an IND.
- `POST /api/cmc/variations/classify` and
  `GET /api/cmc/projects/:id/process-capability` stay unclaimed — deterministic
  and sound, but no screen calls them.
- "Fileable, DTD-valid eCTD Module 3 sequence" is not claimed until D7's
  F00/F02 land.
