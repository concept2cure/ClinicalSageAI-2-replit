# Lint's last two red steps: one gate was wrong, one stylesheet was

The runner backlog cleared enough for a completed CI run to appear
(`65bb71d87`, 08:42). Its `Lint` job no longer failed on the generated text
ramp — this morning's fix held — and failed instead on two steps nothing had
looked at.

## 1 · The biostat key gate was wrong, and wrong in the way that gets a gate baselined

`ci:biostat-calculator-keys` reported **five live fields as dead** on
`/adaptive/interim`: `informationFractions`,
`designEffect.standardizedEffect`, `designEffect.nPerArm`, `prior.mean`,
`prior.sd`. Its message is strongly worded, and rightly so for a real finding:

> The form will collect it, the request will succeed, and the value will be
> ignored.

Every one of those five **is** read. The route calls `parseInterimLook`, which
calls `checkInformationFractions`, `resolveDesignDrift` — which destructures
`const { standardizedEffect, nPerArm } = b.designEffect` — and `resolvePrior`.
They sit outside the handler because the route file puts them there on purpose:

> Split into named validators so the handler stays a handler.
> — `biostat-design-stats.ts:485`

The gate read only the source between one `router.<verb>('<path>'` and the
next, so a tidy refactor took five fields out of its sight. **This gate has no
baseline by design** — "unlike the ratchet gates this has no legitimate
exceptions" — so a false positive on it has exactly one likely outcome: someone
gives it a baseline. That is the RULE 0 failure shape, pre-emptively.

Fixed by following real call edges: a path's region now carries the bodies of
the module-level functions it calls, **transitively** (the route calls
`parseInterimLook`, which calls the three validators). Not widened to the whole
file, which would let a mention anywhere in a thousand lines satisfy the check
and take the teeth out.

One bug of my own on the way, worth recording because it was silent: taking the
first `{` after the signature matched the **return type** of
`function parseInterimLook(b: …): { error: string } | InterimLookRequest {`, so
the captured "body" was `{ error: string }` and the walk never reached the
validators. A return-type object literal is written on one line and a body is
not, so the body is now the first brace-matched span after the parameter list
that contains a newline.

Result: **128 field keys across 18 calculators, all read by their handlers.**

## 2 · `--danger` is not a token on this platform

`ci:token-cascade` found one unresolved `var()` across 39 stylesheets:
`--danger`, three times in `client/src/concept2cure/v2/styles/app-v2.css`, in
the AnA question block added earlier today
(`.ana-q-issue.is-critical`, `.ana-q-position.is-inapplicable`,
`.ana-q-position-caution.is-inapplicable`). The block pairs it with
`var(--warning)`, which does exist; the platform's counterpart is **`--error`**,
and this same stylesheet already uses `var(--error)` at five other places
(`:340`, `:348`, `:442`, `:474`, `:477`). Three references repointed at the
token that exists — not a new alias, which would have made `--danger` real and
given the palette two names for one colour.

That step is blocking, not advisory, despite its name: it was flipped to
blocking on 2026-09-10 under WO-4 and the title was never updated.

## Measurements

`measured.txt` — both gates before and after, the two other CSS gates
unaffected (`ci:surface-text-ramp`, `ci:undefined-css-classes`), and the
mutations:

- a key no handler reads (`lookNumber` → `lookNumbr`) is still caught;
- a reintroduced unresolved token is still caught, naming the file and the var.

A second mutation — making `resolveDesignDrift` stop destructuring and hardcode
the two values — is **not** caught, and that is the limit the gate's own header
states: it "proves the handler *mentions* each leaf name — not that the value is
used correctly". My change does not alter that boundary; it only decides which
source counts as the handler.
