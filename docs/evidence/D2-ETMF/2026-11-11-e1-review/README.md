# eTMF slice E1, reviewed: the classifier names an artifact only when the name is that artifact, and there is one zone model

Row D2. Decisions P-74, P-75 and P-124 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). Design
`docs/design/ETMF_CONVERGENCE_2026-10-30.md`, slice E1 (`3fa2b6febc`, 2026-10-30). Session `…01LjrcEe8y`, which wrote
E1. E1 went in with its adversarial review owed (an account usage limit stopped the reviewers). The review ran on
2026-11-10 with two reviewers. Its fixes were then reviewed themselves, on 2026-11-11, by two more, who found two
regressions in the first version of the fix. This is what both rounds found and what was fixed.

This fixes E1. Nothing new was built: no route, service, table, mount, screen or tool.

## What already exists

Searched: `classifyArtifact`, `classifyTmfArtifact`, `TMF_ZONES`, `TmfZone`, `tmfZone`, `tmfStructure`,
`TMF_REFERENCE_MODEL`, `ESSENTIAL_DOCUMENTS`, `planEssentialDocuments`, `plan_essential_documents`, `1572`,
`essential document` across `server/`, `shared/`, `client/src/`, `scripts/`, `services/` and `tests/`; and
`git log --all --diff-filter=D` on `*etmf*`, `*tmf*` (one file, `client/src/concept2cure/v2/fixtures/etmf.ts`, deleted
by E1; the clone is shallow).

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| The catalog | `shared/constants/domain/tmf-reference-model.ts` | The one TMF Reference Model catalog since E1: 11 zones, 41 artifacts, 26 essential | Unchanged here (header comment only) |
| The classifier | `server/services/etmf/etmf-logic.ts` (`classifyArtifact`) | Names a zone, and since E1 a catalog artifact code, from a file name | Reported an artifact whenever its name appeared anywhere in a longer name |
| Vault filing | `server/services/vault/vault-filing.service.ts` (`classifyForFiling`, `FILING_RULES`) | Files an uploaded document; the service (CRO) view uses the TMF classifier | Its own FDA-form rule filed Form FDA 1572 to z03 before the classifier (zone 5) ran |
| The essential-documents library | `server/services/gcp-operations/gcp-operations-reference.ts` (`ESSENTIAL_DOCUMENTS`), read by `planEssentialDocuments` (`gcp-operations-knowledge.ts`) and AnA's `plan_essential_documents` (`server/services/ana/gcpOperationsTools.ts`) | 24 cited essential documents by trial stage, plus a device document | Kept its own seven "abridged" zones and returned them as the TMF's structure |
| A second essential-documents library | `server/services/global-ri/gcp-essential-documents.ts` (`server/routes/global-ri/gcp.routes.ts`) | The E6 principles, essential documents by stage, sponsor and investigator duties | No TMF zones, so not part of this defect. It duplicates the library above. Not touched; see "Left for the lane" |
| The drift guard | `server/services/__tests__/vault-taxonomy-etmf.test.ts` | Holds the catalog to one copy | Read three roots and `.ts`/`.js` only; could not see a zone model under other names |
| The rest of the eTMF | `server/routes/etmf.routes.ts`, `server/services/etmf/tmf-artifact-persistence.ts`, `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` | Study binding, governed filing and the Trial master file page, landed by the Vault parity lane (`…01KnUGoX3g`): `64e4bcca0a`, `8c84dd5fb4`, `0113bd0d2b`, P-124 | Not touched here |

## What the review found, and what changed

| # | Finding | Fix |
|---|---|---|
| 1, must fix | **A document about an artifact was reported as the artifact.** E1 matched a catalog name found anywhere in a file name. "Data Safety Monitoring Plan.pdf" became `monitoring_plan` in zone 1, "IRB approval of Sample Informed Consent Form.pdf" became `sample_icf` in zone 2, "Investigators Brochure receipt site 04.pdf" became the brochure. Each is an essential record reported as present. Vault's service view filed them to that zone's folder with no review asked. Before E1 the keyword rules placed these correctly. | `classifyArtifact` returns an artifact code only when the name is the catalog name, give or take a version, a date, a status word or a file extension ("Monitoring Plan v3 FINAL.pdf"). A catalog name inside a longer name points to its zone at most, with no code ("SAE reports Site 101.pdf"). A keyword in the rest of the name that says what the document is and points elsewhere, or a second catalog name from another zone, makes two signals: the name is `unclassified`, marked `conflict`, and a person files it. A keyword that only says whose document it is (site, CRO, vendor, protocol) is not a second signal. |
| 2, must fix | **A second zone model.** The essential-documents library kept seven zones ("Central & Site Management", "Ethics", "IP & Trial Information", "Statistics / Data", "Site (ISF)", …) and AnA's `plan_essential_documents` returned them as the TMF's structure, beside an eTMF and a Vault that show eleven. It filed the protocol under "Trial Management" and the brochure under "IP & Trial Information"; the catalog has both in zone 2. | Each library document names a zone of the catalog by number, with the zone's name read from the catalog. A document that is a catalog artifact says which (`catalogArtifact`) and is held to that artifact's zone by a test. The plan returns the catalog's eleven zones. The seven zones and their type are deleted. The investigator site file was one of the seven; it is a holder, not a zone, and `heldBy` already says it. |
| 3, should fix | **Form FDA 1572 had two folders, by spelling.** "Form FDA 1572.pdf" matched Vault's FDA-form rule and went to z03; "1572 signed.pdf" reached the classifier and went to z05. | The 1572 is its own Vault rule, and its service folder is the classifier's answer, read at load. Forms 1571, 3674, 3454 and 356h, and every dossier view, are filed where they were. |
| 4, should fix | **Underscores and shadowed keywords.** The keyword rules read the raw name with `\b`, which an underscore does not break: "delegation_log_site_04.pdf" matched nothing. "sample icf" and "sample crf" (zone 2) could never fire, because "icf" (zone 4) and "crf" (zone 10) took the name first; "randomisation list" (zone 11) lost to "randomisation" (zone 6). | The rules are lists of plain words (`TMF_KEYWORD_RULES`), matched as whole words in the name's words. A longer keyword takes its words first, so a shorter one inside it is not counted. Of the keywords then found, the earliest rule decides, as it always did. A test fires every keyword of every rule alone. A possessive ("IRB's") still holds its keyword. |
| 5, should fix | **The drift guard would refuse ordinary code and miss real copies.** It counted generic literals (`'protocol'` is in 102 files), so a document-type union of six codes would be refused as a catalog. It read `/*` inside a string (a route glob) as a comment's start and skipped what followed. It read three roots and no JSON. | It reads every tracked source file (code and JSON). A literal that three or more other files use is ordinary vocabulary and is not counted; only a file that is itself under every threshold counts as such a user. Comments are removed in one pass that reads a string first. It uses the repository's own definition of a test file. An allow-list entry needs a reason and must still excuse something. A second test refuses a zone list written out under a TMF-zone name, in code or JSON. A self-test plants copies and runs the same functions the guard runs. |
| 6, note | Vault's rationale said "TMF keyword match" for a name that is a catalog artifact. | It says `Named as the TMF artifact "…"`. |
| 7, note | `TmfZone` was still in the duplicate-types baseline, and the scan's comment named the wrong timeout. | Removed by hand (the list only shrinks; it was not regenerated). The comment names the repository's 10 s. |

### What the review of the first fix found (2026-11-11)

| # | Finding in the first version of the fix | Fix |
|---|---|---|
| 8, must fix | **The keyword with the most words decided.** "IRB approval - Case Report Form v2.pdf" went to Data Management (zone 10), "IRB approval of site delegation log.pdf" to Site Management, "FDA letter re central lab.pdf" to Testing. The code before E1, and E1, filed each with IRB / IEC or Regulatory. Of 3,464 two-keyword names, 1,390 had moved. | A longer keyword only takes the words of a shorter one inside it. The earliest rule decides. A differential over 3,346 generated two-keyword names against the code before E1 now shows only the intended moves: the investigator's forms (1572, financial disclosure) first, randomisation to Statistics, and "sample icf" and "sample crf". |
| 9, must fix | **Any keyword vetoed a catalog name.** "SAE reports Site 101.pdf", "IRB/IEC approval Site 101.pdf" and "Safety Management Plan - CRO.pdf" got no zone: 36 of the 41 catalog names lost theirs with " Site 101.pdf" after them. | Site, CRO, vendor and protocol say whose document it is. Beside a catalog name they are not counted (`TMF_QUALIFIER_KEYWORDS`). All 41 names keep their zone with each of four such suffixes, with no artifact code. |
| 10, must fix | **Three copies of the catalog passed the guard.** Each copy made the others' literals "ordinary vocabulary". | Only a file under every threshold counts as a user of a literal. The self-test plants three copies and a JSON copy and sees all four refused. |
| 11, should fix | The guard dropped a row written after an inline comment, kept a block comment whose lines do not start with a star, refused the singular field `tmfZone`, and missed `TMF_ZONE_NAMES` and a JSON `tmfZones`. | One comment pattern that reads strings first; the zone-list check matches plural and list names with an array or object literal, in code and JSON. Each case is in the self-test. |
| 12, should fix | **The classifier and AnA's plan disagreed on three library documents**: the financial disclosure (plan 5, classifier 3 by "fda"), randomisation (11 and 6), the deviation log (1 and 2). | "financial disclosure" is a keyword of the investigator's-forms rule and "randomisation" a Statistics keyword, each as the catalog places the record. A test holds every library document to the classifier's answer or to none. The deviation log is its one recorded exception, with the reason; see "Left for the lane". |
| 13, should fix | Vault's "Named as the TMF artifact" never appeared in practice: ingest always passes a title, and name and title read together are no artifact's name. | Vault reads the file name and the title apart. A name and a title that point to different zones, or a name that points to two, are not filed and ask for review. |
| 14, should fix | Store B's refusal said a two-zone name "matches no zone keyword". | It says the name points to more than one zone. The tool description is left to slice E4, which rewrites or retires that tool. |
| 15, note | Form FDA 1572 with "IRB" in its name was zone 4 to the classifier and z05 to the Vault. Three keywords were also catalog names and could never fire as keywords. `essentialDocument()` did not check a tie. | The investigator's-forms rule is first. The three keywords are removed. A tie to a catalog artifact is checked where the document is made. |

## Where each essential document is filed, and on what basis

No placement below is new regulatory content invented in this change. Three rules, in this order:

1. The document is a catalog artifact: it takes that artifact's zone (pinned by the drift guard).
2. Otherwise it keeps the group the library already gave it, where that group is one zone of the model: Trial
   Management → 1, Central & Site Management → 5, Ethics → 4, IP & Trial Information → 6, Safety → 7.
3. Three exceptions, each with its basis in the last column: monitoring visit reports, source documents and the
   clinical study report.

| Document | Was | Zone | Basis |
|---|---|---|---|
| ED-IB, ED-IB-UPDATE | IP & Trial Information | 2 | catalog `investigators_brochure` |
| ED-PROTOCOL | Trial Management | 2 | catalog `protocol` |
| ED-CONSENT, ED-IRB-CONTINUING, ED-FINAL-IRB | Ethics | 4 | the library's group |
| ED-IRB-APPROVAL | Ethics | 4 | catalog `irb_approval` |
| ED-CONSENT-SIGNED | Ethics / Site (ISF) | 4 | the library's group; the site file is `heldBy` |
| ED-1572 | Central & Site Management | 5 | the library's group, and the classifier's own 1572 rule |
| ED-CV | Central & Site Management | 5 | catalog `investigator_cv` |
| ED-FINANCIAL | Central & Site Management | 5 | catalog `financial_disclosure` |
| ED-LAB-CERT | Central & Site Management | 8 | catalog `lab_certification` |
| ED-IP-RELEASE | IP & Trial Information | 6 | the library's group |
| ED-IP-ACCOUNT | IP & Trial Information | 6 | catalog `ip_accountability` |
| ED-IP-RECON | IP & Trial Information | 6 | catalog `ip_destruction` |
| ED-RANDOM | Trial Management | 11 | catalog `randomization_plan` |
| ED-SAE | Safety | 7 | catalog `sae_reports` |
| ED-MONITORING | Trial Management | 5 | exception: the classifier files a monitoring visit report in Site Management, and the product says one thing |
| ED-DELEGATION | Site (ISF) | 5 | catalog `site_signature_sheet` |
| ED-DEVIATION, ED-CLOSEOUT | Trial Management | 1 | the library's group |
| ED-DB-LOCK | Statistics / Data | 10 | catalog `database_lock` |
| ED-SOURCE | Site (ISF) | 5 | exception: "Site (ISF)" is not a zone; the TMF Reference Model lists Source Data as a site-level Site Management record (05.04.11) |
| ED-CSR | Statistics / Data | 2 | exception: "Statistics / Data" is two zones; the CDISC TMF terminology places the Clinical Study Report in the Central Trial Documents zone |
| ED-DEVICE-IDE (device trials) | IP & Trial Information | 3 | catalog `regulatory_submission`: the IDE application and its approval |

**Not confirmed against the model itself.** `tmfrefmodel.com` and `evs.nci.nih.gov` are outside this container's
network policy. The last two placements were read on 2026-11-10 through search summaries of those two sites, not from
the model's spreadsheet. QA should confirm ED-SOURCE and ED-CSR against it before the eTMF's OQ.

## Red first

**Round 1, on E1's code (`3fa2b6febc` as merged at `9fb630345d`).**

- The new classifier test file: 10 of 15 cases failed.
- The drift guard: 4 of 22 failed (the second zone list, the library's zones, the plan's structure, the tie test).
- The cases added after the third reviewer reported, run against E1's classifier in a throwaway probe: 3 of 3
  failed. All 1,640 names made of two catalog names were reported as one of the two artifacts.

**Round 2, on the first version of the fix.**

- The classifier test file as it now stands: 8 of 26 cases failed (whose-document words, the earlier rule, possessives,
  financial disclosure and randomisation, the 1572 with "IRB" in its name, a name and title that disagree).
- The guard's self-test: with the three-copies rule taken out, "three copies that would hide each other" fails. With
  the old line-based comment filter put back, two cases fail.

**The guard was also seen refusing a real planted file** (`git add -N` on a six-artifact copy with a `tmfZones` list
under `server/services/etmf/`): both scans named it. The file was removed.

## Suites and gates

At `9fb630345d` plus this change:

- `server/services/__tests__/vault-taxonomy-etmf.test.ts`, `server/services/etmf/__tests__`,
  `server/services/vault/__tests__/vault-filing.service.test.ts`, `server/services/gcp-operations`,
  `server/services/ana/__tests__/gcp-operations-unstated-inputs.test.ts` and the `classify_tmf_artifact`
  description test: 16 files, 275 tests, all pass.
- The reviewers' wider runs on the first fix: 77 files, 960 tests (classifier, Vault filing and their consumers);
  12 files, 1,058 tests (gcp-operations and AnA's registry, authorization, launch-scope and skills). All passed.
- `ci:typecheck:no-regression --incremental`: 0 errors, on the first fix. The pre-push hook runs it again.
- ESLint: no file has more warnings than at HEAD.
- `ci:one-product` and `check-launch-scope.mjs`: exit 0 (run by a reviewer).
- Not run: the two PostgreSQL suites (`tests/db/vault-processing-sweep.dbtest.ts`,
  `tests/db/tmf-assessment-audit-outcomes.dbtest.ts`); this container has no PostgreSQL server.

**After the merge with trunk** (`b2c2003144`: 251 commits, among them the Vault parity lane's E2, E3 and Trial master
file page; the merge had no conflict):

- The same six paths, which now include that lane's study-binding and governed-filing tests: 18 files, 332 tests.
- Every test that names a changed module, the whole of `server/services/vault/__tests__`, and
  `server/routes/__tests__/etmf-artifacts.routes.test.ts`: 98 files, 1,501 tests.
- The callers that reach Vault filing with a title (`server/services/clinical-regulatory-evidence/__tests__`, AnA's
  document-placement tools, authoring's file-to-Vault): 64 files, 1,047 tests.
- All pass. The typecheck and the pre-push gates ran at push.

## The review of this fix

Two reviewers on 2026-11-11, read-only, each with its own probes (workflow `wf_a15f6cea-827`):

- **Classifier and Vault filing.** Three classifiers (before E1, E1, the fix) on 303 realistic names and targeted
  sets. Held: the noise words (41 catalog names, 41 distinct identities; no name tried identified a different
  artifact), every alternative of the old regular expressions, all 36 rule and view pairs in Vault filing, no
  difference from HEAD in the pharma, biotech, device and IVD views on 303 names, and each consumer's refusal of a
  two-signal name. Found: 8 and 9 above, and 13 to 15.
- **The library and the guard.** Held: no other reader of the old shapes, no description hash or golden file, the
  git fallback, the baseline shrink. Agreed with 21 of the 25 placements, from the catalog, the classifier or the
  model as the reviewer knows it, and doubted four (below). Found: 10 to 12 above.

The corrections to 8 to 15 were checked by the differential and the mutations under "Red first". They have not been
through a third independent review.

## Left for the lane (the Vault parity lane holds the eTMF files, `.design/claude-convergence/COORDINATION.md`)

These are recommendations, not decisions. None is built here.

- **Six placements for QA to confirm against the reference model's spreadsheet**, before the eTMF's OQ. Two were
  read through search summaries: source documents (zone 5) and the clinical study report (zone 2). Four keep the
  library's own group and were doubted by a reviewer from memory of the model: protocol deviations (zone 1 here; the
  model has them under Site Management, zone 5), the approved consent form and subject information (zone 4 here;
  the catalog's own consent form is zone 2), signed consent forms (zone 4 here; site-level, zone 5), and the
  close-out monitoring report (zone 1 here; zone 5). The classifier's keyword "protocol" still reads a deviation
  log as a protocol document (zone 2); that disagreement is recorded in the guard with its reason. None was changed
  from memory.
- **"site" alone still decides a name with no other keyword**, in either spelling: "ABC123_Site_101_Temperature_Log.pdf"
  is filed to Site Management, where its record is an IP one. It did so before E1 for the spaced spelling. Pinned
  as it is, not fixed.
- **Vault's FDA-form rule still files Form FDA 3454 to z03** in the service view, where the classifier says zone 5
  for a financial disclosure. Not changed: what the applicant's certification is in a TMF was not verified.
- **`docs/ana-capability-manifest.json` still carries the old `plan_essential_documents` description.** No gate reads
  it, three other descriptions in it are also stale, and E4's plan regenerates it.
- **The catalog is short of what an inspector asks for first.** It has 41 artifacts and no Form FDA 1572, monitoring
  visit report, signed consent form, protocol deviation log or DSMB record, so none can be filed as a record and none
  counts toward readiness. The essential-documents library in this repository already cites each of them. Adding
  them changes every study's verdict, so it is a decision for the lane and P-124's holder.
- **A consent form is filed to zone 4 by keyword.** The keyword rule sends "informed consent", "consent form" and "icf"
  to IRB / IEC. The model's master consent form is a Central Trial Documents record (02.02.03, read through the same
  search summaries). Not changed here: two tests pin the current answer, and the review did not ask for it.
- **Two essential-documents libraries.** `server/services/global-ri/gcp-essential-documents.ts` and
  `server/services/gcp-operations/gcp-operations-reference.ts` list the same kind of record twice. Converging them is
  its own slice (RULE 3: converge, not rebuild).
- **`classify_tmf_artifact` (E4, L-1).** The E4 plan re-points the tool onto `classifyArtifact(name).code`. With E1's
  matching it would have filed "Data Safety Monitoring Plan.pdf" as the Monitoring Plan. With this fix a code is
  returned only for an exact name, so the tool's refusal on `code: null` is the honest one.
- **`ci:duplicate-exported-types` fails on trunk** for 16 names, none in a TMF file. It is not in the pre-push hook.
  Not this lane's.
