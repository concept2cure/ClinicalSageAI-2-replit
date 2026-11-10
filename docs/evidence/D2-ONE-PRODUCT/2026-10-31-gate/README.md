# ci:one-product — CLAUDE.md RULE 4 enforced (2026-10-31)

The founder: "We don't have apps. We don't have cards. We have one product." RULE 4 says so; a rule in a
document had not stopped screens being added (RULE 0's own lesson). This gate refuses them.

## What already exists

- `scripts/ci/check-surface-discoverability.mjs` (`ci:surface-discoverability`): every surface is discoverable
  or declared not. It pushes the other way: it makes a new surface findable; it never refuses one.
- `client/src/concept2cure/v2/__tests__/shellNav.test.tsx`: pins the rail's current entries, not their growth.
- Nothing refused a new surface or rail entry.

## The gate

`scripts/ci/check-one-product.ts`, in `.husky/pre-push` after the replay-safe DROP check:
- holds `UI_SURFACES` (102) and `RAIL_CORE` (10) to `scripts/ci/one-product-baseline.json`, which only shrinks;
- a new id fails the push with RULE 4's message and where the capability goes instead;
- `--write` records removals only; an addition needs `founderDecisions["surface:<id>"]` with the founder's
  recorded decision (P-number or dated quote), which a session cannot grant itself.

## Made to fail

| Run | Result |
|---|---|
| A fake `csr-card` surface added to the real registry (`red.txt`) | exit 1: "new surface:csr-card: put what it does into the one editor or the project's document start instead." |
| Registry restored byte for byte (`green.txt`) | "102 surfaces, 10 rail entries, none new." |
| `--selftest` | refuses a new surface, a new rail entry and a reasonless grant; allows a removal |
