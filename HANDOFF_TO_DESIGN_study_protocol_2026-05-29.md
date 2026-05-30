# Handoff to design — study/protocol backend, surfaces needed

> For Claude design. This is scoped to the delta from the 2026-05-29 backend
> pass (reproducibility + de-fabrication of the statistics engine). It lists
> only the surfaces that the shipped backend now requires to reach clients.
> Follow the design-system non-negotiables in `CLAUDE.md` / `README.md`
> (sentence case, no emoji, 13px body, Claude orange sparingly, 200ms ease-out,
> Lucide icons, second person, numbers over adjectives).

---

## Why there is a handoff

The backend now produces honest, reproducible statistics with provenance. Three
of those properties are invisible to clients until a surface shows them. Without
the surfaces below, the trust work done in the backend does not reach the human
client. Each item maps to a concrete API field that already exists.

---

## Surface 1 · Reproducibility + provenance on simulation results

**Backend contract:** `simulateAdaptiveTrial` and `simulateSurvivalData` now
return `seed: number` and `provenance: { engine, engineVersion, method,
methodVersion, seed, inputsSha256, reproducible, generatedAt, note }`.

**Needed surface:** wherever a simulation result is shown, add a quiet
provenance affordance — method + engine version, the seed, and a
"reproducible" indication. Include a "regenerate with this seed" action so a
reviewer can reproduce the exact result. Treat it like an audit detail: present
but not loud. One focal point per screen still applies; this is not the focal
point.

**Why:** reproducibility is a regulatory expectation. Showing the seed and hash
is what lets a client defend a number to a reviewer.

---

## Surface 2 · Honest confidence on any prediction

**Backend contract:** `predictTrialSuccess` returns `probability`,
`confidence`, and `contributingFactors`, and returns a low-confidence `0.5`
when there is no comparable data.

**Needed surface:** never render a bare percentage. Always pair the probability
with its confidence and the basis ("estimate from N comparable trials"). When
confidence is low or N is zero, the surface must say so plainly rather than
implying certainty. No cheerleading; numbers over adjectives.

**Why:** a confident-looking percentage with nothing behind it is the exact
failure mode the platform already rejected by disabling protocol generation.

---

## Surface 3 · The "not assessable" state

**Backend contract:** `compareTrials` now returns `pValue: null`,
`significance: 'not-assessable'`, and a `note` explaining that per-arm n and
variance are required for a valid test.

**Needed surface:** render the not-assessable state as a first-class, calm
result — show the observed difference and the note, and do not display a
significance verdict or a p-value placeholder. This pattern will recur anywhere
the engine declines to fabricate, so design it as a reusable state, not a
one-off.

**Why:** the honest absence of a result is a result. It needs a designed state
so it reads as rigor, not as an error or a gap.

---

## Surface 4 · Adaptive operating characteristics (when that surface is built)

**Backend contract:** `simulateAdaptiveTrial().simulationMetrics` now returns
Monte Carlo `typeIError` and `power` (with the run's seed). These are estimates,
not closed-form.

**Needed surface (future, with the Biostatistics surface in `ui_kits/`):** when
operating characteristics are shown, label them as Monte Carlo estimates and
expose the replication count and seed. Do not present an estimate as if it were
exact.

---

## Not in scope for design yet

The intelligence and ML surfaces (precedent benchmarking, probability-of-success
model output, enrollment/dropout forecasts) are gated on the corpus workstream
in `GA_READINESS_PLAN_STUDY_PROTOCOL_2026-05-29.md` §4. Do not design those until
their backend is grounded in a real corpus; designing against empty data would
bake in the wrong empty states. This handoff covers only what the shipped
reproducibility/honesty work needs today.
