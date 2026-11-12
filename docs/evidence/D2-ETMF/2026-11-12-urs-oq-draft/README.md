# eTMF admission: the URS and the OQ, drafted for Validation for GA

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes `server/routes/etmf.routes.ts`
(the eTMF this lane holds). Founder decisions P-74 (item 1, and its prerequisites), P-75 and P-124 item 6 ("Order to
admission: E4 (one store); 'not applicable'; the URS and OQ; then the Vault app gains the `etmf` surface").

## Why this is a draft here and not a filed document

P-74 admits the eTMF only with "a URS and OQ for each new regulated function, as CMC had (`URS-007`, `OQ-008`)". The
other prerequisites are met:

- **One TMF store:** eTMF convergence E4, steps 1 to 5, the last `2ccfe707cb`.
- **The store's migrations on the deploy path:** both files are in `C2C_MIGRATION_FILES`.
- **No model step:** the classifier is deterministic, and AnA's filing waits for the person's confirmation.

`docs/validation/**`, `tests/validation/**` and `scripts/validation/**` are held by Validation for GA (`01QoxbLcnW…`,
COORDINATION). This lane asked on 2026-11-10 which numbers to use, or for Validation to write them. The ask is
unanswered, and that session is at work on other lanes' walks. So the two documents are drafted here, in the form of
URS-007 and OQ-008, for Validation to number, review, file and implement. Nothing under `docs/validation/` is
touched.

## What already exists

| Piece | Path | What it is |
|---|---|---|
| The validation package | `docs/validation/` (URS-001 to -008, OQ-001 to -008, VMP-001, TM-001, VSR-001) | The model followed: URS-007 and OQ-008 (CMC) |
| The OQ runners | `tests/validation/oq/*/` | One per app. None for the eTMF |
| The eTMF's development evidence | `docs/evidence/D2-ETMF/` (2026-11-10 onward) | Each slice's red and green runs; the URS traces each requirement to the suites |
| The admission change | `docs/evidence/D2-ETMF/2026-11-10-vault-section/held/` | The Vault app gains the `etmf` surface, and the section moves into the Required documents view |

## The drafts

- `URS-ETMF-draft.md`: proposed URS-009. Twenty requirements, each with its Part 11 clause, risk, source and the
  suites that prove it today. Section 3 records six constraints. The question it first put to the founder, whether a
  read-only identity may read a trial master file, is answered by P-124 item 7: it reads, and writes nothing.
- `OQ-ETMF-draft.md`: proposed OQ-009. Thirty-seven steps against those requirements. Each expected result, except
  the two launch-boundary steps, is one a development suite already observes. The runner is owed, under
  `tests/validation/oq/etmf/`.

Two findings while tracing, each handled:
- The deployed store said "ready" when every required record was declared not applicable. Repaired before the
  retired verdict went (`e37936ad31`).
- The `etmf` surface's catalog entry named an AnA tool that does not exist. Repaired (`fc1f474db4`).

Not tested by any suite, and so made OQ steps: that the launch boundary refuses `/api/etmf` before admission
(OQ-ETMF-36), and serves it after admission only to an entitled organisation (OQ-ETMF-37).

## Next

Validation numbers and files them, and writes the runner. After execution under the W3 posture, the held admission
change is applied (task E6 of the convergence design), and the founder's note of 2026-11-10 ("I don't see the TMF on
the vault UI anywhere") is fully answered: the trial master file is a section of the Vault.

**Amended 2026-11-12, later: admission came first, as CMC's did** (`docs/evidence/D2-ETMF/2026-11-12-admission/`).
CMC's URS-007 landed with its admission and its OQ-008 was executed after it, so the held change is applied now, with
these drafts. The eTMF is in the release and is not described as validated until the OQ is executed and filed. The
OQ's launch-boundary steps can be run against the admitted state:
- **OQ-ETMF-36:** the launch boundary now serves `/api/etmf`. The step's expected result is the refusal before
  admission, and it is recorded by this lane's development suites up to `2ccfe707cb`.
- **OQ-ETMF-37:** the screen offers the trial master file only to an organisation whose plan includes it. The API
  refuses an organisation outside the plan when module enforcement is `enforce`.
