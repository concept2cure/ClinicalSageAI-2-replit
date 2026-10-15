# W3 / D4 — AnA startup and demo sequencing

The founder asked to continue after the first two direct publications. The
preceding commit, `4997ed619236ffccf202c472e5a1c426e6eda465`, passed the full
TypeScript check and ESLint in the C2C Agent workflow, plus the Tier 5 Browser
Smoke workflow. That resolves the two test-signature errors observed on the
first publication; no typecheck baseline or gate was relaxed.

- TypeScript/ESLint: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37398882991
- Browser smoke: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37398883061

The broader CI run is not fully green: its Security Scan job reported
unreviewed high/critical dependency findings in the lockfile audit (including
Jest packages, compression, proxy-addr, and source-map-js). These AnA changes
do not modify `package-lock.json` or dependency versions. The audit failure is
retained, not suppressed or added to an exception baseline:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37398883309/job/112061296035

## Reproduced startup bottleneck

`buildMemoryContextForChat` awaited the latest working-memory database read
before starting the independent client and project memory lookups. That read
had no assembler deadline and the stream awaited the assembler before calling
the model. A stalled read therefore prevented even healthy memory sources from
starting. The existing timeout helper also left timers armed after successful
reads, producing false timeout warnings later.

The focused change and its red/green evidence are described in `memory/`.
Unavailable context must be named in both diagnostics and the model-facing
context; a timeout is not evidence that no prior decision exists. Existing
database queries are not cancelled by a promise deadline.

## Reproduced demo failure on a healthy network

The real Submission Center, action bus, and drive queue reproduced a selected
submission race: select Beta IND, then select its sequence 0001. The first
handler returned success after scheduling React state; the queue immediately
ran the next action against the old Alpha IND selection and refused it.

The correction belongs to the shared React action/queue boundary, not separate
patches on every screen. An accepted action must cross its requested React
commit or owner-disposal boundary before the queue acknowledges it and runs
the next move. Once a handler has performed an action, Stop must preserve that
actual outcome rather than report it as never made. Details and real-surface
regression evidence are under `client/`.

## Validation

The focused and adjacent suites pass: 69 memory/context tests in five suites
and 64 client queue/bus/surface tests in six suites. The memory regressions were
first observed failing against the previous implementation, as was the real
Submission Center sequence. Repository guard results are recorded alongside
this file; the earlier local full-typecheck memory limitation still applies,
so the new publication is also checked by the unchanged GitHub typecheck gate.

## Limits

These are reproducible code-path failures. No live tenant URL or provider
credentials were supplied, so neither a production latency benchmark nor a
complete live-tenant demonstration is claimed. Prompt/model routing, governed
approval gates, tenant scoping, and demo scripts are outside this change.
The launch row D4 is not declared complete by these tests alone.
