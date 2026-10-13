# Semgrep trunk red: 12 findings, 1 of them real

**Row** D6 (security gate green). **Date** 2026-10-13.
**Run** `38330933352`, head `111a2d693`, baseline `4c7bbf6ae`.

## What failed

`Semgrep` → step *"Blocking scan — nothing the baseline commit did not already
have"*:

```
 • Findings: 12 (12 blocking)
 • Rules run: 250
 • Scan was limited to files changed since baseline commit.
##[error]Semgrep found what 4c7bbf6ae… did not have
```

Two rule classes, across another session's `truth-engine/clinical-claims/*`
work, three test files and one CI script:

- `javascript.lang.security.audit.detect-non-literal-regexp` × 10
- `javascript.lang.security.audit.path-traversal.path-join-resolve-traversal` × 2

The gate's own instruction is *"Fix it, or mark a reviewed false positive inline
with `nosemgrep: <rule-id>` and the reason."* So every one of the 12 was traced
to its source before being classified — the point of the exercise is that they
were **not** all the same answer.

## The one that was real

`server/services/truth-engine/clinical-claims/doc.ts` builds the arm roster out
of **document text** (`rosterOf(text)`), then interpolates those keys into
`new RegExp` in three places. One escaped regex metacharacters and two did not:

```ts
// armSource (doc.ts:181) — correct
.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));

// armRef (doc.ts:204) — the SAME roster, no metacharacter escape
.map((k) => k.replace(/\s+/g, '\\s+'))

// the dose loop inside rosterOf (doc.ts:168) — same gap
new RegExp(String.raw`\b${arm.drug.replace(/\s+/g, '\\s+')}\s+(${DOSE})`, 'gi')
```

**Nothing was exploitable, and the reason is the finding.** The capture class

```
W = (Drug\s+[A-Z]|[A-Za-z][a-z]{4,}|[A-Z]{5,})
```

admits letters and one space, so a key cannot contain `(`, `[`, `*` or `\`
today. That invariant sits ~90 lines away from two of the three consumers, and
those two consumers disagreed about whether to rely on it. Widening `W` — to
admit a hyphen, a digit, a parenthesised synonym, all plausible vocabulary
changes — turns that into a `SyntaxError` on a **legitimate** document, or a
catastrophic pattern on a hostile one. The author got it right once and not
twice, in one file, which is precisely the state a scanner is useful for.

Fixed by routing all three through one helper, so they cannot drift again:

```ts
export const rosterKeyPattern = (k: string): string =>
  k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
```

Note the two call sites still carry a `nosemgrep`, with a reason naming the
helper. That is not a contradiction: they pass a **value**, not a literal, so
the rule still fires correctly — escaping makes the argument *safe*, not
*literal*, and this rule is about the latter.

## Verify by making the check fail

`server/services/truth-engine/__tests__/roster-key-pattern.test.ts`, 5 cases.
A document-level test would prove nothing, because `W` will not let a document
produce the input that breaks — so the contract is pinned directly, plus a
structural case that pins all three sites going through the helper.

With `armRef` reverted to its pre-fix form:

```
 ✓ escapes every regex metacharacter, so a key matches as text
 ✓ does not throw on a key that would be an invalid pattern raw
 ✓ keeps whitespace runs flexible, which is the behaviour it replaced
 ✓ does not let a metacharacter act as a pattern
 × is the ONLY way a roster key reaches a RegExp in doc.ts
   → a roster key reaches a pattern without rosterKeyPattern:
     ${[...doc.roster.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/\s+/g, '\\s+')).join('|') || 'placebo'}
 Tests  1 failed | 4 passed (5)
```

The structural case is the one that matters: the four behavioural cases pass
either way, because they test the helper and the helper was always correct. It
was the *call sites* that disagreed, so that is what is pinned.

Restored: 526 tests pass across the 9 suites touching any file in this change.

## The eleven reviewed false positives

Each traced to its source, each annotated inline per the gate's instruction:

| site | why it is not a finding |
|---|---|
| `vocabulary.ts:15` `ci(src)` | every caller passes a `String.raw` literal; a readability wrapper over this file's own patterns |
| `items.ts:107` `S(src)` | same — callers compose from module constants `CNT`, `ARM_HEAD`, `PCT`, `NOUN`, `DOSE`; `ARM_HEAD` is itself a literal const |
| `items.ts:192` `doc.armSrc` | that is `armSource()`'s output, already escaped through `rosterKeyPattern` |
| `doc.ts:159`, `forms-efficacy.ts:246` ×2, `:290` | `r.re` is a module-constant `RegExp` in `vocabulary.ts`; the code anchors its **own** `.source`. The document text is the input, not the pattern |
| `check-class-vocabulary.mjs:72` | `values` are that script's own class-vocabulary constants; a build-time lint script with no request path |
| `biostat-refusal-is-not-a-failure.test.ts:97` | a test; `endpointType` is a literal from the table above it |
| `stf-coverage-1789.test.ts:101`, `cross-reference-packaging.test.ts:42` | tests; `src` is the test's own `mkdtemp` directory |

## What could not be verified locally, and why

The registry rulesets could not be fetched: `semgrep.dev` is denied by this
environment's network policy (`Tunnel connection failed: 403 Forbidden` on
`/c/p/default`). Local rules written to the same ids confirmed that every
`nosemgrep` comment is on the right line and does suppress — none of the ten
annotated lines reappeared in a local scan — but a hand-written
`detect-non-literal-regexp` is far broader than the registry's (it flags every
`new RegExp` built from a `String.raw` template of constants, 95 of them in
these files alone), so it cannot confirm the registry rule's exact verdict.

That confirmation needs the trunk run. Stated plainly rather than implied: the
escape fix and its test are proven locally; the twelve-to-zero claim is not,
until `Semgrep` runs on this commit.
