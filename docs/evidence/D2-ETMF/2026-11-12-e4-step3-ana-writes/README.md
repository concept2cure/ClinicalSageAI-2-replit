# eTMF convergence E4, step 3: AnA's trial master file writes

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/ana/AnaToolExecutor.ts`, the TMF handlers this lane's row names by name. Build plan:
`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §4.2 and §6 step 3. Founder decision P-124 item 5: "`get_tmf_view`
and `classify_tmf_artifact` keep their names and read and file through the deployed store, the filing with the
person's confirmation and reason. `create_tmf`, `seed_tmf`, `update_tmf_artifact_status` and
`review_tmf_completeness` retire, each onto what now answers it. No tool is added."

## The defect

`create_tmf`, `seed_tmf`, `update_tmf_artifact_status` and `classify_tmf_artifact` wrote the second store
(`tmf_files`, `tmf_artifacts`), which no deploy creates. On a deployed database each failed.
`update_tmf_artifact_status` let a person, through AnA, type a status (received, in review, final) with no
document behind it. `review_tmf_completeness` is a subset of `get_tmf_view`'s answer since step 2.

## What already exists

| Piece | Path | What it answers |
|---|---|---|
| A study's trial master file | `tmf-artifact-persistence.ts` (`readTrialTmf`), the Vault's Trial master file section | It exists with the study (Protocol Development makes the study): `create_tmf` has nothing to create |
| The expected records | `shared/constants/domain/tmf-reference-model.ts`, `tmf-completeness.ts` | The reference model's: `seed_tmf` has nothing to seed |
| A record's state | filing, removing, declaring not applicable (`790706d7c3`); the document's review stage on the record (`d35c89ed05`) | No status is typed: `update_tmf_artifact_status` has nothing to set |
| Readiness | `get_tmf_view` (step 2, `76185b6434`) | `review_tmf_completeness`'s answer, and more |
| Filing | `recordTmfArtifactFiling` (study admission, Vault write role, reason floor, chained audit row in one transaction; proven on PostgreSQL in `tests/db/etmf-governed-filing.dbtest.ts`) | What `classify_tmf_artifact` now calls |
| The shared classifier | `etmf-logic.ts` (`classifyArtifact`) | Which reference-model record a name is |

## What changed

- **Four tools retired.** For `create_tmf`, `seed_tmf`, `update_tmf_artifact_status` and `review_tmf_completeness`,
  everything is removed together:
  - the handlers (`AnaToolExecutor.ts`);
  - the definitions (`document-surface-tool-defs.ts`, `notifications-study-memory-tool-defs.ts`);
  - their entries in `AnaToolDefinitions.ts`: imports and array entries only, as announced to RIM on COORDINATION
    row 103 since 2026-11-10;
  - the tool register (`tool-authorization.register.json`), the launch-scope inventory, the stated-reason list and
    the conditional rule for `update_tmf_artifact_status`.
- **`classify_tmf_artifact` re-pointed (L-1(a)).** It takes `study_id`, the record's reference-model name or code,
  an optional `document_id`, and the person's reason, and files through `recordTmfArtifactFiling`.
  - A name that is no record of the reference model is refused, and AnA asks which record it is. This covers a name
    only near a zone, or naming two.
  - A record noted with no document is said not to count as filed.
  - The store's refusals are passed on with their codes.
  - Its register entry is now `confirm`, writing `tmf_artifact_filings` and the chained audit row. Its conditional
    rule is gone, since there is no `final` to refuse.
  - `zone`, `status` and `document_date` are dropped from its inputs.
- **Six suites that used `seed_tmf` as their example now use a reason-tier write that stays.** `direct-mutator-confirm-gate`
  and `tool-authorization` use the Vault's own writes. `governedActionApprovalTenantPinned`, `confirm-tier`,
  `governedActionConfirmTier` and the client's `governed-action-signoff` use `log_inspection_finding`.
  `ana-launch-scope` names `get_tmf_view` as the hidden etmf example.
- **`tmf-tools-retired.test.ts`** pins the retirement on the precedent's model:
  - no definition, handler, register entry, launch-scope entry or stated-reason entry is left;
  - the replacements are defined and registered;
  - requests the retired tools were offered for still offer `get_tmf_view`.

Two things are not done here.

- **R5 of the plan.** The filing's audit row does not say it came through AnA. The store records who and why, the
  same as a filing made from the Vault.
- **A PostgreSQL test of AnA's filing.** AnA's filing is the store's own filing, already proven on PostgreSQL. A bare
  handler call has no request tenant scope, which the turn supplies in production. The tool's mapping is
  unit-tested: what it sends, each refusal, and the reason gate.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new and changed pins against the tools as they stood: they fail |
| `02-green.txt` | They pass; every AnA suite (server, AnA-RI and the client's AnA components); the typecheck; the gates |

## Next (plan §6)

- Step 4: the second store's eight routes and its metrics go.
- Step 5: its service, schema and migration go, and `etmf-logic.ts` keeps only the classifier.
