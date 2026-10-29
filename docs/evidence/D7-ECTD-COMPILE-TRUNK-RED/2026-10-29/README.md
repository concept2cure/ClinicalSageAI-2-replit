# D7: fifteen eCTD compile and packager suites red on trunk, fixed where each now stands (2026-10-29)

Trunk CI is queued without runners, so nothing reported these suites. They were found while proving gap 6.2 (`../../D7-ECTD-FILED-STATE-VIEW/2026-10-29-leaf-history/`). Each fails identically on trunk `d35b6bd59` with no local change. Every fix is to a test fixture: the product rules each fixture had fallen behind are correct and are left as they are.

## What already exists

- **Packages name their market from the record.** Since `b0beb9392` (2026-10-23), a package whose project records no recognized primary agency is refused before assembly (`server/services/ectd/package-identity.ts`). P-44 reads the market's application number from the sequence's own submission.
- **Assembly reads the tenant's company legal requirements.** Since `5ebfcfd2c` (2026-10-18), `assemble-from-core.ts:255` calls `requireStoredCompanyLegalRequirements`. That function reads `organizations.settings` and refuses (409 `LEGAL_REQUIREMENTS_UNVERIFIED`) a tenant it cannot read. The Vault lifecycle source also reads `company_legal_registry` (`legal-registry.ts`).
- **Originals are parsed before packaging.** Also since `5ebfcfd2c`, every original PDF's catalog and page tree are parsed before it is packaged (`original-pdf-integrity.ts`), so a `%PDF-` header over free text is refused.
- **Earlier fixture updates.** Suites written after these changes already carry what they need:
  - `assemble-from-core.vault-uuid.pglite.test.ts` applies the real registry migration and uses `plainPdfFixture` (async, pdf-lib);
  - the P-44 cases in `ectd-compile-sequence.test.ts` mock the market read.
  - Nothing synchronous built a real PDF, and nothing in the harness applied the registry.
- **Other sessions' trunk-red work.** Session `01E8bt` is clearing the authoring and CSR suites (`b84f297ca`). These suites are not on its list.

## The cause and the fix, per suite

| Suites | Red at `d35b6bd59` | Cause | Fix |
|---|---|---|---|
| `tests/routes/ectd-compile-{spine,lifecycle,dtd-evidence,vault-uuid,recorded-type}` | 36 | The harness program had no `primary_agency`, so the market was unrecognized and assembly was refused. | `PROGRAM.primary_agency: 'FDA'` in `ectd-compile-spine.harness.ts`. The real column is NOT NULL. |
| `tests/routes/ectd-compile-sequence` | 2 | The same, plus the P-44 market read was answered only inside the P-44 cases. | `NDA_PROGRAM.primary_agency`. The market read moves into the base mock, so the MAA carries its own number; the P-44 cases still replace it. |
| `lifecycle-from-core`, `lifecycle-declared-acts` | 7 | No `organizations` table. | `applyCompanyLegalReads(pglite)` (new, `server/services/ectd/__tests__/support/company-legal-reads.ts`): `organizations` when absent, and the real `20261018_company_legal_registry.sql`. Each suite inserts its own tenant row. It sits in test support, not in `server/db/pglite-harness.ts`, because `ci:runtime-ddl` counts DDL in that file as server code. |
| `vault-version-lifecycle-binding` | 10 | No `company_legal_registry`, and fake PDFs. | `applyCompanyLegalReads`, and real PDFs from `plainPdfFixture`. |
| `package-leaf-bytes`, `regional-backbone-readiness`, `section-to-ctd`, `stf-coverage-1789`, `stf-generator`, `builder-study-tagging-route` | 14 | Fake PDFs. | `minimalPdf(label)` (new, `__tests__/support/signed-pdf-fixture.ts`): a real one-page PDF built synchronously, with a correct cross-reference table, for fixtures that build leaves inline. |

Total: 69 tests in 15 files, red on trunk and green after.

## Evidence

| File | What it shows |
|---|---|
| `01-red-at-d35b6bd59.txt` | The nine compile and lifecycle suites at merged trunk: 55 failed of 97. |
| `02-red-packager-at-d35b6bd59.txt` | The six packager suites with all local work stashed: 14 failed. |
| `03-green.txt` | Every suite under `server/services/ectd`, every compile-route suite and the filed-state card: 136 files, 1,870 passed, 4 skipped, 0 failed. |
| `04-mutation.txt` | With the tenant row removed, assembly refuses with `LEGAL_REQUIREMENTS_UNVERIFIED`. The legal read is live in these suites and fails closed; it is not stubbed. |

## Not done

- Eight other suites define `company_legal_registry` inline, and they still pass. They are not converged onto `applyCompanyLegalReads` here, because their DDL works and moving them is not needed to make anything green.
- The handed-on list in `b84f297ca` (authoring, founder-path lineage) is that session's.
