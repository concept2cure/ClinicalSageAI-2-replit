# eTMF: a study whose every required record is declared not applicable has no readiness verdict

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/etmf/tmf-completeness.ts`. Found while preparing eTMF convergence E4 step 5
(`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §6), which deletes the retired store's verdict.

## The defect

`assessTmfCompleteness` set `ready` from the gaps alone. When every record in scope is declared not applicable
(P-124 item 5, `790706d7c3`), the required set is empty and no gap is left. So the store answered `ready: true` with
nothing filed, and three readers repeated it:

- AnA's `get_tmf_view` said "Readiness: ready.";
- the inspection package's cover said "Inspection ready: YES";
- the report pack's row said `ready: 'yes'`.

The Vault's own section was already right: `tmfVerdict` reads an empty required set as "No verdict" before it reads
`ready`.

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The retired store's verdict | `server/services/etmf/etmf-logic.ts` (`evaluateCompleteness`) | Refused this case since 2026-10: "an empty required set is the absence of an assessment, not readiness". Step 5 deletes it, so its guard is carried here first |
| The deployed store's assessment | `server/services/etmf/tmf-completeness.ts` (`assessTmfCompleteness`) | `ready: null` already meant "not determined" for gaps on off-platform references |
| The Vault's verdict | `client/src/concept2cure/v2/surfaces/vaultTmf.ts` (`tmfVerdict`, `tmfVerdictSentence`) | "No verdict. Every essential record is declared not applicable to this study (n), so there is none to check." Unchanged |

## What changed

- **`assessTmfCompleteness`:** with no record left to check, `ready` is `null`. The field's comment says so. One record
  left to check is a verdict again.
- **AnA's `get_tmf_view`:** that case reads "No readiness is stated: every required record (n) is declared not
  applicable to this study, each with a reason, so there is none to check." It never gives the off-platform reason.
- **The inspection package's cover:** "Inspection ready: NO VERDICT (every required record is declared not
  applicable)". This is in a helper, so the builder stays under its size limit.
- **The report pack:** `ready` was already "not determined" for `null`. Its row also states 0 required and n declared.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The three new cases against the code as it stood: they fail ("ready" where "not determined" is expected; `true` where `null` is) |
| `02-green.txt` | Those pass: the eTMF server suites, AnA's eTMF tools, the report pack and the eTMF routes (206), and the Vault's trial master file suites (70) |

The assessment is pure, so it is proven on its own unit. The store's read (`readTrialTmf`) passes its declarations
to it unchanged, as `tests/db/etmf-governed-filing.dbtest.ts` already shows on PostgreSQL.
