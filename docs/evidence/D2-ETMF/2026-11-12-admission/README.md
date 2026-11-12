# The eTMF is admitted to the Vault app: the trial master file is a section of Required documents

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes `shared/constants/launch-scope.ts`
(the `etmf` row this lane holds, COORDINATION). Decisions: P-74 item 1 (the eTMF lives inside the Vault, admitted with
one store, a URS and an OQ), P-75 (a professional-tier module, not a launch module), P-124 item 6 (the order to
admission), and the CMC precedent, P-28.

The founder, 2026-11-10: **"I don't see the TMF on the vault UI anywhere."** Until this change the answer was a page of
its own that the Vault's button opened, and in a release that page was locked. Now the trial master file is in the
Vault, in its Required documents view, beside the filing's coverage.

## The validation state, said plainly

P-74 admits the eTMF with "a URS and OQ for each new regulated function, as CMC had". CMC was admitted with its URS
(URS-007 landed with admission, `P-28`), and its OQ (OQ-008) was executed six days later. This admission follows that
order:

- **One store:** done (E4, steps 1 to 5; the last `2ccfe707cb`).
- **The URS and the OQ:** drafted for Validation for GA (`ed03906b8f`, `docs/evidence/D2-ETMF/2026-11-12-urs-oq-draft/`).
  They are not yet numbered, filed or executed. That is Validation's (`docs/validation/**` is theirs, COORDINATION).
- So the eTMF is in the release and **not described as validated** until its OQ is executed and filed. The OQ's two
  launch-boundary steps (OQ-ETMF-36 and -37) can now be run against the admitted state:
  - the launch boundary serves `/api/etmf`;
  - the screen offers the trial master file only to an organisation whose plan includes it, in every enforcement mode;
  - the API refuses an organisation outside the plan only when module enforcement is `enforce`. That is set on Master
    Licensing, and the deployment default is `off` (`server/services/entitlements/enforcement-mode.ts`). Who may read or
    file a study's records is the study admission's in every mode (`server/services/etmf/tmf-study-access.ts`).
    Entitlement is packaging, not the security boundary.

## What already exists

| Piece | Path | What it did before this change |
|---|---|---|
| The section | `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` | The study's trial master file: verdict, zones, records, filing, removal, "not applicable", the package. Hosted by the `etmf` page |
| The hook-in | `docs/evidence/D2-ETMF/2026-11-10-vault-section/held/vault-hook-in.patch` | Kept out of the build: the section in Required documents, the header button revealing it |
| The held suite | `…/held/vaultTrialMasterFile.inVault.test.tsx.held` | Five cases for the section inside the Vault |
| The `etmf` page | `client/src/concept2cure/v2/surfaces/Etmf.tsx` | Hosted the section, and told AnA what it read |
| The release | `shared/constants/launch-scope.ts` | The Vault app: `surfaces: ['vault']`. `etmf` outside, so `/api/etmf` refused in a release |
| The catalogue row | `migrations/20260814j_catalog_missing_product_surfaces.sql` | `etmf` with `tiers []` (every plan). `20260810_reconcile_module_catalog.sql` step 1 retired it on every replay |
| The CMC band | `db/migrations/20260824_cmc_professional_tier.sql` | The pattern followed: a band, a kept grant per organisation, a check that fails loud |
| AnA's inventory | `server/services/ana/ana-launch-scope.inventory.json` | Five tools hidden under `etmf`: the two trial master file tools and three inspection tools |

## What changed

**The release.** The Vault app's surfaces are `['vault', 'etmf']`; its modules stay `['vault']`. The eTMF's module
is not a launch module, so it is not granted to every organisation (P-75).

**The catalogue.** `db/migrations/20261112_etmf_module_professional_tier.sql`, in the set after every catalogue writer:
- the band: `etmf` is `["professional"]`, and the retired flag the replays left is cleared;
- an organisation below the band keeps the module by a subscription row naming this file, but only when it holds
  trial master file filings made before admission;
- a check that fails the deploy if the row is absent, unbanded or still retired.

Two migrations are amended in place, each with a dated note (RULE 1):
- `20260810_reconcile_module_catalog.sql`: its keep-list names `etmf`, so step 1 stops retiring it on every replay.
- `20260823_module_catalog_commercial_packaging.sql`: `('etmf', 'professional')`. Its guard refuses a catalogue module
  with no tier, and it refused `etmf` on the second replay (`03-replay-2-red.txt`).

**The Vault** (`surfaces/Vault.tsx`):
- **The section.** It is in Required documents, after the coverage, with the Vault's `onAsk` and `onVaultChanged`.
- **The header button.** "Trial master file" shows Required documents and brings the section into view.
- **Where it is offered.** Both appear only where the organisation can use the eTMF: in the release
  (`useSurfaceAvailable`) and in its plan (`useNavEntitlements`). Elsewhere neither is shown and nothing under
  `/api/etmf` is read.
- **What AnA is told.** While Required documents is open, AnA hears what the section read: the study, the verdict as
  the server gave it, the counts of the scope on screen, or a refusal as that. These are the facts the `etmf` page
  used to tell, moved to `surfaces/vaultTmfAnaContext.ts` in the same folder (split, not added).

**The `etmf` page** (`surfaces/Etmf.tsx`) is the door. With a project open it opens the Vault on the section, once. With
none it says that a trial master file belongs to a project's study and offers Projects. It no longer hosts the
section, so the trial master file has one place (RULE 4). The Apps catalogue's path, `/concept2cure/etmf`, and any
link to the surface reach it.

**AnA.** `get_tmf_view` and `classify_tmf_artifact` move to inScope. **The three inspection tools stay hidden.** They
were filed under `etmf` beside the trial master file tools:
- `create_inspection`, `log_inspection_finding`, `review_inspection_readiness`
- They write and read the inspection record (`services/inspection/inspection-service.ts`, tables `inspections` and
  `inspection_findings`), not the trial master file.
- No surface claims `/api/inspections`, so production refuses it as unmapped, and no screen shows those records.
- Left under `etmf`, admission would have let AnA open inspections and log Form 483 observations in production, records
  no one could see on a screen. P-124 item 6 admits the trial master file only.

They are re-filed under `qmp`, the quality surface outside the release: inspection readiness and Form 483 responses
are quality assurance's. This follows the precedent of 2026-10-30, when agency-meetings' hidden tools were re-filed
(`amended20261112d` in the inventory).

**The held change** is applied, and its two files under `2026-11-10-vault-section/held/` are deleted, with a dated note
in that README naming where each now lives.

**Words.** The section's header comment and the `etmf` registry row (`ui-surface-registry.ui-v2.ts`) say where the
trial master file lives now.

## A defect only the running app showed, and its repair

Arriving by the eTMF's page, the section had focus but showed only its heading at the foot of the screen
(`15-before-door-section-at-foot.png`). The walk's first check passed it, because it asked only that the heading be
somewhere on screen; the check now asks for the top of the screen.
- **The trace** (`13-door-trace-before.txt`): the section was scrolled to as soon as it mounted, at 2.5 s. It then held
  only its heading, and its records were still being read. The page could scroll only 1,513px, so the section stopped
  750px down.
- **The header button had the same defect** the first time it was used. The walk passed it only because Required
  documents had been opened just before, so the section's records were already on the page.

**The repair** (`VaultTrialMasterFile.tsx`, `revealRequest`):
- The Vault asks the section to come into view: once when it was opened on it, once per click of the header button.
- The section honours each request once its own read has settled: a verdict, a refusal, no study, or a choice of
  studies.
- After the repair the scroll waits for the read (2.7 s), the page scrolls 2,215px, and the section's top is 48px from
  the top, under the page's bar (`13-door-trace-after.txt`, `16-after-door-section-at-top.png`).
- The case that pins it fails against the reveal as it stood, at both doors (`14-reveal-red.txt`).

## In the running app (PostgreSQL, 1440 by 900; `12-walk.txt`)

1. The Vault opens on its library. The header offers "Trial master file", and nothing under `/api/etmf` is read
   (`17-vault-library-header.png`).
2. The header button, before the section was ever opened: Required documents, the section 48px from the top
   (`18-header-button-reveals.png`).
3. The section is after the coverage, headed "Trial master file": "2 of 26 essential records are filed. 24 are
   missing.", 11 zones, 26 records (`19-required-documents-tmf-section.png`, its foot: the inspection package).
4. `/concept2cure/etmf` lands on the Vault, on Required documents, with the section 48px from the top
   (`20-etmf-door-opens-vault.png`).
5. The Vault opened again opens on its library: the ask was used once.

No console error, and no response of 400 or above.

## Tests

| Suite | What it pins |
|---|---|
| `vaultTrialMasterFile.inVault.test.tsx` (was the held suite) | A section of Required documents, never a view of its own, reading nothing until the view opens. The header button reveals it and opens no other screen. AnA is asked in the Vault's conversation. A file filed from the section is read back into the Vault. **New:** with the release lock or the plan lock, neither the button nor the section, and nothing of it is read. Opened by the eTMF's page, the Vault opens on Required documents with the section in view, once. By either door, the section is brought into view only once its read has settled |
| `vaultTmfAnaContextInVault.test.tsx` (new, the page's six AnA cases moved) | With Required documents closed, AnA is told nothing of it. The study, the verdict as the server gave it, the counts. "Not determined" as that. The scope on screen and that scope's figures only. A read that checked nothing, with no verdict. A refusal as a refusal. No study, or several and none chosen |
| `etmfHostsTrialMasterFile.test.tsx` (rewritten) | The door: with a project open, the Vault is opened on the trial master file and nothing is read on the page; with none, the empty state and Projects |
| `filingPathNoDeadEnds.test.tsx` | `etmf` is now a launch surface. Its locked example is `ectd-coauthor`, and the Vault's door is tested with `etmf` locked by the verdict |
| `ana-launch-scope.test.ts` | `get_tmf_view` and `classify_tmf_artifact` are kept in production; `create_inspection` is withheld |
| `entitlements/__tests__/launch-scope.test.ts` | The Vault app is `['vault', 'etmf']`, its modules `['vault']`, and `etmf` is not a launch module |
| `folded-module-grant-continuity.test.ts` | Its catalogue replay now creates the filings table the band reads (on the deploy path it exists already) |

## Evidence

| File | What it shows |
|---|---|
| `01-ana-scope-red.txt` | `ana-launch-scope.test.ts` against the inventory as it stood, with `etmf` admitted: production offers `create_inspection`, and the inventory names a launch surface as hidden. Three failures. Green after the re-filing (`07-suites.txt`) |
| `02-replay-1.txt` | The set deployed on fixture `platform_ci_vault_fixture_e4b`: the band applied |
| `03-replay-2-red.txt` | The second replay, before `20260823` named `etmf`: halted at that file's guard, "catalog modules with no tier assigned: etmf" (224 of 473 applied) |
| `04-replay-3.txt`, `04-replay-4.txt` | The third and fourth replays after the amendments: complete, the row stable at `{"tiers": ["professional"], "industries": []}` |
| `05-fixture-grants.txt` | On that fixture: 57 grants written by the band, for exactly the 57 organisations below the band holding filings made before admission; none to an organisation without such filings or at professional or above; 142 below the band with no filing receive none |
| `06-fresh-deploy-1.txt`, `06-fresh-deploy-2.txt` | A blank database deployed twice: complete, the row professional |
| `06-fresh-install.txt` | `install-fresh` on a blank database: incomplete in one area, `20261112_vault_catalog_dataset_profile.sql` ("relation vault.document_catalog does not exist"). That file is S2's, not this change's; noted to S2 in COORDINATION |
| `08-dev-db-before.txt`, `08-dev-db-after.txt` | The development database before and after: the row was retired with no band; after, professional and live. Its enterprise organisation needs no grant, and its standard one, with no filings, gets none |
| `07-suites.txt` | 141 suites, by file: the Vault and eTMF client suites, the launch-scope and entitlement suites, AnA's scope and authorisation suites. 2,145 of 2,146 pass. The one failure is trunk's, named below |
| `09-gates.txt` | Each gate's last lines; all pass. The typecheck (0 errors, the baseline) is `10-typecheck.txt`, and the lint ratchet (no file changed its warning count) is `11-eslint.txt` |
| `12-walk.txt`, `15-` to `20-*.png` | The walk in the running app, above |
| `13-door-trace-before.txt`, `13-door-trace-after.txt` | The section's position over time after landing by the eTMF's page, before and after the repair |
| `14-reveal-red.txt` | The two reveal cases against the reveal as it stood: scrolled while the section's read was still pending |

**Not this change's, red on trunk:**
- `server/services/entitlements/__tests__/launch-scope.test.ts`, "the shell no longer carries training". `training`
  joined the launch shell as Help & training in S13's `1207a3c307` (P-127), and the test predates it. Noted to S13 in
  COORDINATION.
- Two noted before, in suites this change does not run: `server/services/vault/__tests__/vault-document-filter.test.ts`
  (the data room lane's `a5043b4c49`) and `client/src/concept2cure/v2/__tests__/foundationsRetiredRatchet.test.ts`
  (screen work's `40cc8265b7`).
