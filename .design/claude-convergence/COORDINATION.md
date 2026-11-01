# Coordination of the working sessions (ONE_DESIGN_PLAN §4.6)

Every session working on `concept2cure-v2` reads this after each fetch. It holds only who is working on which files
right now, so that no two sessions edit the same file at once. The rules are `CLAUDE.md` RULES 0, 5 and 6 and
`docs/design/ONE_DESIGN_PLAN.md`. Nothing here adds to them.

The coordinating session is `session_01JbQUvBxcGHdBgkgAydQKpx`, "UI and workflow redesign". It continues
`session_011Dpx…`'s plan (the D0–D7 specs, `18261a908`). Send it your package, step and file list before you
change a file that another package's spec also names.

## Locked now

| Files | Held by | For | Until |
|---|---|---|---|
| `design-system/**` (except `design-system/CLAUDE.md`, a plan file) | the coordinating session | D0, foundations: D0-1 to D0-5 | its message, and this row deleted |
| `client/src/concept2cure/v2/styles/**`, all of it (D0-3 sweeps every sheet for sentence case) | the coordinating session | D0 | same |
| `client/src/concept2cure/v2/AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx`, `dataConnect.tsx` | the coordinating session | D0 | same |

## Who works where

| Session | Packages | Now | Layout work |
|---|---|---|---|
| UI and workflow redesign (`01JbQU…`) | D0, then the D1–D7 build order | D0 | — |
| CMC Module UI and data integration (`01GJidg5…`) | S7 behaviour, D5 layout | S7 | D5 after D0-2, per `D5.md` |
| RIM system build-out (`011e42…`) | S5 behaviour, D7 layout (Submission Center) | S5 | D7 after D0-2, per `D7.md` |
| Regulatory document AI architecture (`017CFk…`) | L1 (AI-gateway placement, zero retention), S6 or S2 (Vault chunking) | L1, S6 | D6 (Vault) layout through the coordinator |
| Biotech FDA filing types build-out (`011Fyq…`) | F1, S4 or S3 (the Rule 2 audit slices) | F1 | through the coordinator |
| R1 inventory and protocol (`01QoxbL…`) | R1, S3 | R1 | through the coordinator |

## What every session does

1. Fetch, read this file, and stay off the locked rows.
2. Every commit names one package (`Plan: <ID>`) and the existing path it finishes (`Completes: <path>`), and stays
   inside that package's ledger paths.
3. An S package changes behaviour on a screen, never its layout (plan §3). Layout follows the screen's D spec in
   `.design/claude-convergence/` and uses D0's primitives once they land.
4. Add none of the retired patterns (plan §2).
5. If the plan is wrong, ask the founder. No session amends it.
