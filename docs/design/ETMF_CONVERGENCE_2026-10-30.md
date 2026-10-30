# eTMF: converge the two TMF stores onto one, bind it to the study, and admit it inside Vault

**Status:** design, 2026-10-30. **Decisions:** P-74 (eTMF admitted, first of six) and P-75 (study record, placement,
tier), both in `docs/LAUNCH_DEFINITION_OF_DONE.md`. **Row:** D2 (the launch catalog). **Evidence:**
`docs/evidence/D2-ETMF/<date>/`. **Session:** `…session_01LjrcEe8y3zUQxwX91zzTaM`.

This is a **convergence and a reach**, not a build (RULE 3). Every piece below already exists; the work is to
make one of each, wire the survivor to the study the project already has, and admit it.

## What already exists

Mapped read-only at `6a99d6af` by six readers (stores, schema, services, client and launch gate, study stores,
history). The local clone is shallow; history before 2026-10-29 was read through the GitHub API.

### Two TMF stores on one mount (`server/bootstrap/register-inline-routes.ts:502-514`, `/api/etmf`)

| | Store A — `server/routes/etmf.routes.ts` | Store B — `server/routes/etmf.ts` |
|---|---|---|
| Tables | `tmf_artifact_filings` (`migrations/20260615_tmf_artifact_filings.sql`) | `tmf_files`, `tmf_artifacts` (`migrations/20260610_etmf.sql`) |
| Deployed | **Yes** — `scripts/db/migration-set.mjs:2971` | **No** — install-fresh overlay only (`scripts/ci/migration-deploy-path-baseline.json:62`); every deploy-migrate database answers 42P01 |
| Key | `trial_id TEXT`, typed by hand (`Etmf.tsx:112,451-458`), bound to nothing | `study_id` → `clinical_studies`, with **no same-org check** (`etmf-service.ts:31-37`) |
| Readiness | Counts only **verified Vault documents** (`tmf-artifact-persistence.ts:65-124, 220-249`); `ready` true/false/null | Counts rows a person **typed** `final` (`etmf-logic.ts:106-142`); `PATCH /artifacts/:id/status` reaches `inspection_ready` with no document |
| Gates | `requireRole('regulatory-author')`, rate limits | **None** — any member writes |
| Audit | `recordAuditRow` after commit; omits `documentRef`; hard delete with no reason | `recordGovernedAction` in the transaction, hash-chained, HMAC-sealed, reason ≥ 8 chars |
| Callers | `client/src/concept2cure/v2/surfaces/Etmf.tsx` (the only client) | No client; six AnA tools (`AnaToolExecutor.ts:14066,14094,14128,21230,21446,21484`), `search_all_documents` (`:21542`), report pack `etmf.completeness_pack` (`research-compliance-report-providers.ts:195-199`), metrics |

History: Store A was created on 2026-06-15 (`5f696de4e`) "to avoid collision with the richer etmf.ts registry" —
the duplication began there. Store A has since been hardened (`925989121` fabricated references removed;
`896cf3917` verified-document readiness; `abb9ea766` not-determined).

### The reference model exists five times (zero-duplication violation)
`server/services/etmf/tmf-completeness.ts:36` (11 zones, 41 artifacts, 26 essential), `server/services/etmf/etmf-logic.ts:15`,
`shared/constants/domain/tmf-reference-model.ts:30`, `client/src/concept2cure/v2/fixtures/etmf.ts:93` (plus a dead
client `assessTmfCompleteness`), and `server/services/gcp-operations/gcp-operations-reference.ts:282` (seven
"abridged" non-DIA zones). The keyword classifier (`etmf-logic.ts:35-47`, also used by Vault filing,
`vault-filing.service.ts:386-401`) leaves 10 of the 41 catalog names unclassified and puts 4 in the wrong zone.

### The study record
Five study stores exist (`clinical_ops.studies`, `clinical_studies`, `cro_studies`, `protocol_documents`, and
`cdisc_prm_studies`, which the parity design's list missed). `cdisc_prm_studies` (`shared/schema.ts:13135-13150`) is
the protocol-design study: project-scoped by `program_id` with a same-org key (`20260926b_program_same_org_keys.sql:206-220`),
a unique `(id, tenant_id)` target already used by `cre_evidence_sources.study_ref`
(`20261008d_cre_source_study_ref.sql`), and a launch-path writer and lister (`/api/study-design`,
`study-design.ts:565-575`).

### The launch gate
`etmf` is a registered surface (`ui-surface-registry.ui-v2.ts:72-87`, `apiPrefixes: ['/api/etmf']`) outside
`LAUNCH_APPS`. Its catalog row is inserted (`20260814j`) and then marked `deprecated` on every deploy by
`db/migrations/20260810_reconcile_module_catalog.sql`'s keep-list, which omits it; healing it without a packaging
tier row fails the deploy at `20260823_module_catalog_commercial_packaging.sql`. The CMC admission (`f3927184`,
P-28, 32 files) is the template.

### What does not exist
A TMF QC workflow, filing timeliness, document bytes in the inspection package (the index ZIP carries none), a
per-site/per-country level, an eTMF URS/OQ (`docs/validation` stops at URS-007 / OQ-008).

## Decisions

- **P-74** (2026-10-30): eTMF is admitted, first of six; prerequisites bind.
- **P-75** (2026-10-30, the founder):
  1. **Study record:** `cdisc_prm_studies` — the protocol-design study, reached, not rebuilt. eTMF picks a study of
     the open project. Device trials (`clinical_studies`) and CRO trials (`cro_studies`) get no TMF until CTMS
     converges the study stores.
  2. **Placement:** inside the **Vault** app (`LAUNCH_APPS` vault gains the `etmf` surface). The app count stays
     seven.
  3. **Tier:** **professional** (`('etmf','professional')`), the catalog row kept and healed. `modules` stays empty
     for it, as CMC's does: listing it would grant it to every organisation and overturn the tier.
- **P-53** ("parked … eTMF") is superseded for eTMF by P-74; the record says so.

## Target shape

- **One store: Store A** (`tmf_artifact_filings`, `etmf.routes.ts`). It is the one deployed, the one the screen
  reaches, and the only one whose verdict needs documents.
- **Bound to the study:** `tmf_artifact_filings.study_ref INTEGER` with a same-org foreign key
  `(study_ref, organization_id) → cdisc_prm_studies(id, tenant_id)`, NOT VALID, the `20261008d` shape, guarded on
  `to_regclass`. New filings carry it; `trial_id` holds the study's own id string so the existing unique key holds.
  Rows filed before this read "not linked to a study" — a link is never inferred from free text.
- **Governed writes:** Store B's in-transaction governed audit (reason, hash chain, HMAC seal) moves onto Store A's
  file and remove; the audit records the document filed and the one it replaced; remove becomes a soft delete with
  a reason.
- **One reference model**, in `shared/constants/domain/tmf-reference-model.ts`; the classifier classifies against it.
- **Store B retired:** routes, service, schema, metrics and its verdict deleted; `20260610_etmf.sql` amended in place
  to create nothing (its tables on install-fresh databases are left untouched — they hold asserted statuses with no
  documents and are not migrated into filings), and removed from the deploy-path baseline. Its callers move to
  Store A or are retired with it.

## Slices (each one commit, each check seen failing first)

1. **E1 — one reference model and an honest classifier.** Shared catalog; the five copies import it or are deleted;
   the classifier matches all 41 catalog names to their own zones.
2. **E2 — the study.** The additive migration (in `C2C_MIGRATION_FILES`, before the final pair); the route accepts a
   study of the caller's organisation and an accessible project and refuses anything else; the screen picks from
   `GET /api/study-design?program_id=<open project>`.
3. **E3 — governed filing.** Reason, in-transaction governed audit with the document reference, soft delete with a
   reason; the inspection package becomes a recorded download (`sendAuditedDownload`).
4. **E4 — Store B retired, its callers converged.** AnA tools re-pointed or retired, the report pack re-pointed (its
   seed row corrected in place), the TMF leg of `search_all_documents` re-pointed; Store B deleted; RULE 1 handled.
5. **E5 — the screen.** ZIP failures said, with the reason; retry; AnA context offers only real actions; the
   "Filing…" label; the E6(R3) citation; `useVaultUpload`.
6. **E6 — admission.** `LAUNCH_APPS` vault gains `etmf`; registry prefixes narrowed to what the screen calls; catalog
   keep-list and the professional tier row (both creating migrations amended in place, dated); AnA inventory; the
   pinned tests; URS-008, OQ-009 and its runner; evidence.

## Not in this design
TMF QC review, filing timeliness, document bytes in the inspection export (Vault's folder export is the thing to
reach when it comes), site/country levels, CTMS and the study-store convergence.
