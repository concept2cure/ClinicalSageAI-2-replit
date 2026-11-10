# GA and sales readiness map, 2026-11-10

One ledger built from seven readers' work: launch rows, the plan, the demo walks, the human tests, the spine by client type, sales material and trunk CI.
Readers read at 332b4152e and 8a65a6f3a. This file was first written at 7f465d34f. Two challengers then checked it (an adversarial check at 7f465d34f and a completeness check at 452ea0ac6). Their corrections were re-checked and applied at 4a7b69a06, or declined at the end of this file.
Every item, with its evidence, holder and close condition, is in `ledger.json` (246 items: 183 open, 31 held, 32 unknown). Items the challengers added are `GA-ADV-*` and `GA-CC-*`. An item with a `founderPart` and a `sessionPart` is split: the founder decides, then a session implements.
This is a map of existing work (RULE 3). It names no new capability.

## In short

- No launch row (D1–D10) is green. The dashboard reads 8 of 42 ready. 17 of its 18 blockers are live; the PDF/A blocker is stale.
- No ci.yml run has finished green since 2026-09-23. The CI queue runs about 34 h behind. No release commit can get a verdict until the founder chooses runners, batching or a drain (a session can run the drain once authorised).
- Nothing is deployed. No AWS account, no ESG account, no validator licence, no DTDs, no working Anthropic key. Every model's PQ is `pending`. Nothing measures the 99.5 % availability the paper promises (`GA-CC-05`).
- That means AnA, Draft with AnA, the CSR build and push-back have never been shown with a real model. A model-drafted CSR cannot be approved or filed.
- What a presenter can show today: biotech end to end except safety and live AnA. Diagnostics (510(k)) only on its filing half, and only inside a biotech-mode org.
- Pharma, CRO and non-IVD medical device have no seeded story. There is no whole-platform presentation (`GA-CC-14`).
- 17 items block the demo outright. 95 embarrass it. These include CMC calling 14 stability results out of spec, a QC result recorded "pass" against its own criterion and shown as "Pass", RBM "New KRI" returning 500, the seeded 510(k) export returning 422, and both walkthrough scripts describing screens that no longer exist.
- Part 11 gaps found since the first pass: the editor lets the person who reviewed a version also approve it (`GA-ADV-01`), and AnA writes model text into governed records under the confirming person's name (`GA-CC-01`, a founder ruling first).
- The exit promise (MSA §10.1, the tenant export) has a server route and no caller in the app (`GA-CC-04`). FDA's eCTD validation criteria 1.7 reject from 2027-01-16 and are not in the rule corpus (`GA-CC-06`).
- The sales paper (2026-09-20) sells six apps where the code ships nine. It denies device features the code ships. It shows a price table where Professional costs less than Standard, and features that do not exist. Packaging is not enforced.
- GA also needs: signed validation (contractor not engaged), SOC 2, a pen test, the Anthropic agreement, a lawyer, a price and a customer. All of these are the founder's.
- The Week 8 gate (about 2026-11-15: D10 signed and D1 staging green) will not be met as things stand.

## What already exists

| Path | What it does today | What it does not do |
|---|---|---|
| `docs/LAUNCH_DEFINITION_OF_DONE.md` | Rows D1–D10, two gates, decisions P-1 to P-120 | Row D2 still says seven apps; D7 still says "preflight 15/15"; no P-121 |
| `scripts/ops/ga-readiness-report.mjs` | 42-line GA dashboard: 8 ready, 18 blockers, 16 advisories | Reads local env only; counts the decided PDF/A rule as a blocker; no REVIEW_ADMIN_TOKEN line. Held by RIM (row :107) |
| `scripts/ops/submission-preflight.mjs` | Procurement preflight, 3 of 13 present | Asks for the validator under different settings than the dashboard |
| `docs/design/ONE_DESIGN_PLAN.md`, `docs/design/one-design-plan.json` | The plan; 25 packages, all open; 4 approvedAdditions | Decisions list stops at P-112; no package closed |
| `.design/claude-convergence/COORDINATION.md`, `BUILD_ORDER.md` | Holds, hand-offs, the D1–D7 step list | Several stale rows (RBM, CSR draft route, Codex editor, J2 Vault); four sessions commit today with a "stopped" row or no row (`GA-ADV-02`) |
| `terraform/`, `.github/workflows/deploy-aws.yml`, `provision-database.yml` | One stack, two roots; 121 offline tests pass; WAF; ci-verdict gate | Never applied; no FDA ESG, READYZ_TOKEN, REVIEW_ADMIN_TOKEN or submission-grade flags wired; no availability probe or alarm |
| `.github/workflows/ci.yml`, `.husky/pre-push`, `docs/evidence/F1/2026-11-10-trunk-ci/` | Full CI; the trunk-CI lane reproduced each job locally | No green run; pre-push does not run class coverage or shards |
| `docs/validation/`, `tests/validation/`, `docs/evidence/W3/2026-11-10/` | VMP, URS-001..008, OQ-001..008, TM, VSR. 170 pass / 0 fail / 8 deviation / 2 not executed | Dev build only; unsigned; no URS/OQ for RBM or Biostatistics |
| `server/eval/pq/`, `server/services/ai-governance/approved-models.ts` | PQ protocol v1.0.0 approved (P-118); 17 models registered | No csrDrafting run; verdict ignores use; 0 passed |
| `scripts/demo/launch-demo/seed.mjs` and `packs/` | API seed: biotech (C2C-101, C2C-201), lumen (LMN-201+, third person since 3d22a942d), mdx (NeuroPanel-Dx), faux (FBT-201) | No pharma, CRO or non-IVD device pack; every org `biotech` mode |
| `.devcontainer/post-create.sh` | Fonts (4a473cffe), LibreOffice and xmllint (01a5f04db) | Not yet pressed in a real Codespace; python-docx and lxml not checked |
| `docs/demo/*-walkthrough.md`, `docs/demo/README.md` | Presenter scripts for biotech, 510(k), IVD; CLI demos for PMA, CDx, IVDR | Stale lines remain (biotech script edited today by 14f00b197 and 0155d81c7, not corrected); CLI demos end not-assessed |
| `docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/` | 36 verified high findings, 125 unverified, presenter advice | Its `fixes/` folder does not exist; no fix landed |
| `docs/evidence/DEMO/2026-11-10-sales-showcase/README.md` | 14-scene Lumen run of show, walked without a key, launch scope off | No production-posture run; scenes 8 and 11 never run live |
| `docs/evidence/DEMO/2026-11-10-sales-rehearsal/` | The lead's production-posture rehearsal | Screenshots only, no README |
| `docs/evidence/F1/2026-11-10-client-admin/` | The lead's client-administration walk: onboarding and people, security and licensing, sign-up fixes (8a65a6f3a, 452ea0ac6) | Onboarding, licensing and billing findings are the lead's; this map defers to it |
| `docs/evidence/L1/2026-11-10-security-review/README.md` | What was verified and fixed today, and eight items left for a decision | Items 1–8 undecided (`GA-CC-01`, `GA-CC-02`) |
| `docs/evidence/F1/2026-11-08-cross-module-data-flow/README.md` | Nine owner-scoped findings with acceptance, and regulatory currency findings | Held by the P-104 continuation (`GA-CC-03`); currency unheld (`GA-CC-06`) |
| `server/routes/tenant-export.ts` | `GET /`, `GET /full` and `/attestation`, mounted | Only `/attestation` has a caller (`ComplianceAttestation.tsx`) (`GA-CC-04`) |
| `docs/design/HELP_AND_SUPPORT_2026-11-10.md` | A proposed help and training design (P-121, proposed) | Not recorded; `/api/docs` answers an empty list (`GA-CC-10`) |
| `docs/evidence/HUMAN-TEST/J1..J5`, `CLICK-THROUGH/`, `CODESPACE/` | Five journeys and two click-throughs; own-screen defects fixed | Dev mode, administrators only, no key; runs B and D unfinished |
| `tests/lineage/founder-path-lineage.*` | Founder-path lineage walk and its shrink-only baseline | Stops at the seal hop; 11 baseline entries |
| `docs/commercial/`, `docs/security/`, `docs/connector/` | Commercial paper, trust statement, SIG-Lite, policies (incl. POLICY-VM-006, POLICY-AI-008), connector listing | Unreviewed, unsigned, stale against HEAD; no presentation or leave-behind |
| `server/services/billing.ts`, `fixtures/licensing.ts`, `LicensingSurface.tsx`, `auth/ZenSignup.tsx` | Price tables and plan cards shown to clients | Professional below Standard; undeliverable features; trial 500 |
| `server/services/entitlements/enforcement-mode.ts`, `shared/regulatory/license-model.ts` | Tier entitlements; a segment × project-type model | Enforcement defaults off (:142); license-model has no callers |
| `shared/constants/launch-scope.ts`, `scripts/ci/one-product-baseline.json` | Nine launch apps with device features under Projects; 101 registered surfaces | No CRO portfolio, safety or pharmacovigilance surface; most of the 101 have no reach/fold/retire line (`GA-CC-11`) |

## Only the founder or operations can do these

Most blocking first. Where a session implements after the decision, the line says so.

1. **CI capacity** (D1, `GA-CI-01`). Choose more runners, push batching, or a drain of superseded runs (COORDINATION.md:505-512, F-7). Once authorised, a session can run the drain. Unblocks every CI verdict and therefore every deploy.
2. **A working Anthropic key** (D4, `GA-D4-03`). Load it as a Codespaces secret. Unblocks every AnA walk, the CSR build and the PQ run.
3. **First-apply decisions and accounts** (D1, `GA-D1-01`, `GA-D1-02`). Region, accounts, domain, certificates, SES, NEW-2, NEW-3, B4, retention. Then the apply. Unblocks staging, which D2, D3, D4, D5 and D8 all wait on.
4. **Revoke the three live credentials** (D6, `GA-D6-01`). Two Neon passwords and a Hugging Face token (`.gitleaksignore:15, 31, 38`).
5. **A pilot customer** (D10, `GA-D10-01`), and **decide the Week 8 gate** (`GA-GATE-01`) before about 2026-11-15.
6. **A price, a seat model, tier bands and the enforcement mode** (D9, `GA-D9-02`, `GA-SAL-09`, `GA-SAL-07`). Then a session implements in `billing.ts`, `fixtures/licensing.ts`, `LicensingSurface.tsx` and the `enforcement-mode.ts` default, with `GA-SAL-05`; `ZenSignup.tsx` is the lead's.
7. **Rule on the security review** (D5/D6, `GA-CC-01`, `GA-CC-02`). Whether model text is shown at confirmation and marked "proposed by AnA"; the single-file reason; sole-member approval after a removal; the WAF count mode. Then a session implements.
8. **A lawyer on the commercial paper** (D9, `GA-D9-01`), plus the founder placeholders in it.
9. **Validation signatures** (D4, `GA-D4-11`). Engage a qualified contractor; sign as system owner. Decide only whether RBM and Biostatistics leave the validated release; their URS and OQ are the validation lane's work (`GA-D4-09`).
10. **eCTD artefacts** (D7). DTD vendoring with legal sign-off (`GA-D7-01`), a validator licence or recorded advisory posture (`GA-D7-02`), an ESG test account (`GA-D7-03`), 4.0 timing (`GA-D7-07`), the eSTAR switch (`GA-D7-06`).
11. **Availability** (D1, `GA-CC-05`). Name the probe provider and the on-call person. Then a session wires the probe and alarm in `terraform/stack`.
12. **Tenant purge vs the owner boundary** (D6, `GA-CI-05`). Decide what the export returns and how private AnA profiles are erased. Two real-database tests stay red until then.
13. **Retrieval bank** (D4, `GA-D4-05`). Run `fetch-official-sources.mjs` from the Codespace and rule on four publishers' terms.
14. **SOC 2, pen test, Anthropic agreement** (D6, `GA-D6-02`). **Sign the SIG-Lite and trust statement** and decide whether a trust page is published (a new route needs an approvedAdditions entry); a session re-verifies the answers first (`GA-SAL-13`).
15. **Connector directory boxes** (D8, `GA-D8-01`).
16. **Scope decisions a presenter trips over.** CMC for biologics (P-28, `GA-S7-02`). The CRO portfolio (`GA-CT-02`). Where safety is shown (`GA-CT-06`). J3's R3/R7/R8 (`GA-UI-17`). Markets F22 (`GA-D7-24`). MedDRA and WHODrug (`GA-DASH-03`). The CSR source tier (`GA-S4-05`). Predicate intelligence in or out (`GA-CC-08`). Help and training, P-121 (`GA-CC-10`). Reach, fold or retire for the non-catalog surfaces (`GA-CC-11`).
17. **Lift or keep the D4-3 hold** (`GA-UI-13`). Approve P-113 additions (`GA-PLAN-03`). Close the finished packages after a session files their six-lens reviews (`GA-PLAN-05`). Confirm P-120 with counsel (`GA-D6-04`).
18. **Tester VM, DNS, SMTP** (`GA-D1-10`).

Taken off this list: the saved cloud environment with pgvector (`GA-D1-11`). A session proposes it with the environment tools and the user approves it in that prompt.

## What a presenter can show today, by client type

Steps: project and goal · data room · protocol · evidence · AnA narrative · editor · eCTD. Featured: CMC, RBM. Also QMS and Reporting.

**Biotech** (C2C-101, C2C-201, Lumen LMN-201)
- Project: yes. Only Lumen has a recorded goal; C2C-101, C2C-201 and NeuroPanel have none (`GA-DEMO-15`).
- Data room: yes, but captured Quality records list first with raw titles (`GA-S2-04`; the counts were fixed by 912ec3cf3).
- Protocol: yes (C2C-101, LMN-201).
- Evidence: design sizing only. No endpoint result is computed (`GA-S3-01`). Sensitivity points are wrong (`GA-DEMO-05`). No safety (`GA-CT-06`).
- AnA narrative: not shown. No key (`GA-D4-04`). After ten failed turns, every further failure blocks AnA reads for 30 s, and nothing resets the count (`GA-DEMO-04`).
- Editor: yes, freeze and e-sign seeded. A frozen document is labelled "unbound" (`GA-UI-19`).
- eCTD: FDA 3.2.2 sequence 0000 only, stopping at "dispatch blocked" (`GA-D7-26`). The two rule sets disagree, 8 vs 37 (`GA-D7-10`, `GA-D7-10B`).
- CMC: C2C-201 only (Lumen is refused as a biologic). Stability "14 of 14 OOS" and the contradicted "Pass" make it unsafe to show (`GA-DEMO-01`, `-02`).
- RBM: Lumen only. "New KRI" 500 (`GA-S8-01`). Site risk shows 0 sites (`GA-S8-02`).
- QMS: yes. Reporting: Lumen yes; C2C-101 reads "No governed artifacts" (`GA-DEMO-06`).

**Diagnostics** (NeuroPanel-Dx 510(k), in a biotech-mode org, `GA-CT-05`)
- Project, Vault, editor with e-sign, eSTAR sequence, readiness, QMS: yes.
- No protocol, no clinical-performance evidence, no RBM, no Reporting (`GA-CT-04`). The project may still offer the protocol workspace and say its markets are on Submit (`GA-CC-07`, unchecked).
- Avoid the seeded export (422, `GA-DEMO-10`) and the 510(k) page's raw "fetch failed" (`GA-DEMO-07`).
- The release-signature gate reads "Satisfied" on an unsigned sequence (`GA-D7-11`).

**Medical device (PMA, De Novo, EU MDR)**: nothing seeded. Only CLI scripts ending not-assessed (`GA-CT-03`, `GA-DEMO-34`). The IVDR door offers only FDA eSTAR (`GA-R1-04`).

**Pharma**: nothing seeded through the API (`GA-CT-01`). NDA, MAA and BLA data exist only in the legacy SQL seed.

**CRO**: nothing. The portfolio surface is outside the launch catalog (`GA-CT-02`). The nearest thing is two client workspaces in the dev org.

**Avoid in any demo:**
- Asking AnA anything.
- Site risk and Site oversight.
- "New KRI".
- CMC Stability, QC and Batch.
- The seeded 510(k) export.
- The audit trail "Filter E-sign" (it sees the newest 200 rows only, `GA-D5-05`).
- Forms and letters: a personal email address is shown as reviewer (`GA-D7-12`).
- The IND checklist (`GA-D7-13`).
- Module 2 QC (`GA-D7-14`).
- A sixth sign-in on the demo account, which ends the presenter's session (`GA-DEMO-20`).
- PDF export and "Compile and download" in a Codespace until one real Codespace has pressed them (`GA-DEMO-21`; the tools are now installed).
- The "do not click" lists in `deep-walk/findings.json` (`GA-DEMO-18`).
- Reading either walkthrough script as written (`GA-DEMO-16`).

## Open code work nobody holds

Ranked by demo impact, then GA impact. "Done" is the ledger's `closesWhen`.

1. `GA-DEMO-01`, `-02`, `-03` CMC verdicts. `CmcModule.tsx`, `cmcRegisters.tsx`, `server/services/cmc/batch-release-evidence.ts`, `module3Composer.ts`. Done when only an explicit false is OOS, a recorded pass that contradicts its criterion is shown as contradicted and blocks release, and §3.1 names the drug substance. The seed's DS-2502-R2 "pass" stays: the S7 phase-4 fixture pins it.
2. `GA-DEMO-04` circuit breaker. `circuitBreaker.ts`, `server/startup/routes.ts`. Done when a success resets the count and an expected "no provider" does not count.
3. `GA-DEMO-10`, `-12` mdx pack, and `-11` (the reviewer becomes the third person, before `GA-ADV-01`). `packs/mdx.mjs`.
4. `GA-DEMO-07` 510(k) page. `K510Surface.tsx`, `DataGate.tsx`. Done when no raw error shows.
5. `GA-DEMO-19`, `-20` demo host. `docs/demo/README.md`. Done when the preconditions are written down and a sixth sign-in no longer ends the session.
6. `GA-D4-04` live AnA walks. Needs the key. Done when scenes 8 and 11 and one push-back are filed.
7. `GA-D4-02` PQ csrDrafting run and use-aware verdict. `server/eval/pq/**`. Done when there is a PASS record for one model.
8. `GA-ADV-01` an approver who reviewed is refused. `authoring-review-route.ts`, the `reviewRefused` call in `authoring.router.ts`. Part 11 blocker.
9. `GA-D7-11`, `GA-D7-10`, `GA-D7-12`, `GA-D7-13` submission truth. `dispatch-gate.ts`, `ectd-compile.ts` (labelling only), the form manifests, `ind-checklist-view-assembler.ts`.
10. `GA-CC-09` P-115 CSR: "Not applicable because …" in the one editor; an amendment-sequence walk. `StudyDataBuild.tsx`, `CsrAssemblyControl.tsx`, `csr-assembly-body.ts`.
11. `GA-D5-05` audit trail paging. `AdminSurfaces.tsx`.
12. `GA-DEMO-05`, `GA-DEMO-06`, `GA-S2-04` engine figures, counts and titles. `judgment-engine.ts`, `db-providers.ts`, `qms/project-evidence.ts`.
13. `GA-DEMO-16`, `-13`, `-14`, `-15` walkthrough scripts and seed truth. `docs/demo/*-walkthrough.md`, the biotech packs, `lib.mjs`.
14. `GA-CC-04` tenant export reached. `ComplianceAttestation.tsx`. GA blocker (MSA §10.1).
15. `GA-CC-06` rule currency before 2027-01-16. `validation-rule-corpus.ts`, `biosimilar-knowledge.ts`.
16. `GA-D6-05` string organisation ids. `authEnterprise.ts`, `enterprise-security.ts`.
17. `GA-UI-04`, `GA-UI-27`, `GA-UI-05`, `GA-UI-03`, `GA-UI-07` shell. `OpenWork.tsx`, `Orchestration.tsx`, `Review.tsx`, `app-v2.css`.
18. `GA-SAL-05` licensing page tables and features. `billing.ts`, `fixtures/licensing.ts` (after the price decision).
19. `GA-CI-10` PGlite chain_seq. `pglite-harness.ts`, `disposition-fixture.ts` (RIM released them, row :114).
20. `GA-D7-04`, `GA-D1-03`, `GA-D7-06`, `GA-CC-08` deploy wiring. `terraform/stack/**`, `deploy-aws.yml`.
21. `GA-CC-13` a section save with no version token. `authoring.router.ts` PATCH.
22. `GA-CI-09` founder-path walk. `tests/lineage/**`, free to take. Needs PQ for path (c).
23. `GA-D7-27` assembled CSR leaf refused at release. `leaf-release-verdicts.ts` and a binding (effort L; RULE 1 and RULE 6 check first).
24. `GA-D6-03`, `GA-D5-02`, `GA-D5-03`, `GA-D5-04`, `GA-D5-06`, `GA-CI-11` Part 11 and security doors.
25. `GA-DEMO-08`, `GA-DEMO-09`, `GA-DEMO-28` device MDR queue, device door label, QMS template copy.
26. Design work with no holder: `GA-UI-01` D1-5/6/7, `GA-UI-20` and `-21` D6-1/6-2, `GA-D7-25` D7-A3 and 4.0 reach, `GA-UI-25` refused-read adoption, `GA-UI-28` 40–70 reads per page.
27. R1 has no holder (`GA-R1-01`..`-03`). LX-06, LX-10, LX-02 (`GA-S2-01`..`-03`). `GA-F1-01` reviewer who cannot decide. `GA-ADV-02` stale and missing coordination rows.
28. Seeds for missing client types: `GA-CT-01`, `-03`, `-04`, `-05`; `GA-DEMO-24` (4 steps left, approval state unchecked), `-30`.

## Open code work that is held

By holder, one line each. Do not duplicate.

- **Trunk CI (`01E8btkB…`)**: green CI at HEAD (`GA-CI-02`). Unverified production-image and Codespace jobs. It also edited `CmcModule.tsx` today (10e643a0e); L1 tells it.
- **Validation for GA (`01QoxbLcnW…`)**: production-build execution, fixtures, missing OQ steps, URS revisions, system PQ, IQ font check (`GA-D4-01`, `-06`, `-07`, `-08`, `-10`, `GA-D1-07`), and URS/OQ for RBM and Biostatistics (`GA-D4-09`; its list does not name this yet).
- **RIM (`011e42…`)**:
  - the D7 queue (`GA-D7-08`), splitter (`GA-S10-01`), P-87/106 deletion (`GA-D7-18`), dashboard PDF/A line (`GA-DASH-01`) and the dashboard's REVIEW_ADMIN_TOKEN line (`GA-CC-08`, `ga-readiness-report.mjs`, row :107);
  - handed to RIM with no hold row: J4 defects (`GA-D7-15`) and the one error count (`GA-D7-10B`), Module 2 QC (`GA-D7-14`), copy (`GA-D7-16`), R1 reaches and cover letter (`GA-D7-17`), P-103, P-120 dispatch, reapproval, credential event, LX-12, the drawer (`GA-S10-02`), S9.
- **Project page (`01FTWcmX…`)**:
  - dossier copy (`GA-UI-08`), C2C-201 empty state (`GA-UI-09`), Review step (`GA-UI-10`), Quality link (`GA-UI-11`), StageBand (`GA-UI-12`);
  - the projectCreationDoors contract red (`GA-CI-08`), CMC work-project mount (`GA-S12-01`), feeds (`GA-S12-02`);
  - `ProjectRespond.tsx`'s device wording, M9 (`GA-CC-07`; `projectDoors.ts` is unheld).
- **Vault parity (`01KnUG…`)**: device coverage onto eSTAR (`GA-S6-01`), renditions (`GA-S6-02`), RMP rule (`GA-S6-04`), retrieval scope (queued, `GA-D6-06`), and the estar barrier test red (`GA-CI-04`, handed at COORDINATION.md:403-410; proposed diff in `docs/evidence/F1/2026-11-10-trunk-ci/`).
- **Anna runtime (`01KZK3…`)**: spike acceptance (`GA-S4-01`); the sub-agent toolset red (`GA-CI-07`, handed at :376-386, "Yours to choose"; `01QoxbLZVw…` edited the tool definitions today). **`019ZvHmh…`**: question flows, state unknown (`GA-S4-02`).
- **P-104 continuation (Trust, Spec)**: the cross-module findings (`GA-CC-03`), and `ana-ri/command-executor.ts`, which `GA-CC-01`'s fix would touch.
- **Quality (`01GyGhjgjrNv…`)**: C11–C18 and MR-12 slice 5 (`GA-UI-23`); register rows at 390 (`GA-CC-15`). The class-coverage red that keeps the build red (`GA-CI-06`).
- **Client administration / GA and sales (`01T2woo…`, the lead)**:
  - sign-up style, cards, terms, acceptances and job title (`GA-UI-02`, `GA-SAL-06`); AUD-01/02 (`GA-D5-08`); onboarding, people, security and licensing findings in `docs/evidence/F1/2026-11-10-client-admin/`;
  - the production-posture rehearsal (`GA-DEMO-22`); possibly Faux (`GA-DEMO-23`).
- **No hold row, committing today**: `01QoxbLdKp…` on the Codespace tools and Lumen packs (`GA-DEMO-21`; row :173 says "stopped"); `01QoxbLdTrwY…` on the biotech script and packs (row :86 says "left"); `01QoxbLZjz…` on the CSR build and the monitoring screens. See `GA-ADV-02`.
- **Coordinator (`01JbQU…`), stale**: `mdx-rbm.ts` and `Rbm*.tsx` are still on its row (:106) though its own row (:140) says "Holds: none", and `01QoxbLZjz…` committed to `Rbm*.tsx` today (3da8bd712). This blocks RBM "New KRI" (`GA-S8-01`) and D7-C (`GA-UI-22`). Clear the row first (`GA-PLAN-01`).
- **Reporting (`011HLkY…`)**: Insights header copy that matches `GA-DEMO-06`.

## Proposed lanes

Eleven lanes, in rank order by demo then GA impact. Each lane's files are disjoint from the other lanes and from every file COORDINATION.md shows as held at 4a7b69a06 (checked by script over `ledger.json` and by grep of each path in COORDINATION.md).
Each completes existing paths (RULE 6) and adds no screen, route file, service or table. Each commit carries `Plan:` and `Completes:`. Before its first edit, each lane runs `git log --since=2026-11-10 -- <its files>` and posts its claim in COORDINATION.md (`GA-ADV-02`). Proof for every lane:
- a test written red first, then green;
- a check that fails when the fix is removed;
- the screen used in the running app at 1440 and 390 where it is UI.

| Rank | Lane | Items | Files | Package · completes | Proof |
|---|---|---|---|---|---|
| 1 | L1 CMC tells the truth | GA-DEMO-01, -02, -03 | `v2/surfaces/CmcModule.tsx`, `cmcRegisters.tsx`, `server/services/cmc/batch-release-evidence.ts`, `server/services/module3Composer.ts`, `packs/biotech-work-content.mjs` (stability flags only) | F1 · `CmcModule.tsx`, `batch-release-evidence.ts`, `module3Composer.ts` | Stability shows 1 OOS; DS-2502-R2 shown as a pass contradicted by its value and its batch not eligible; the seed's "pass" unchanged and the S7 phase-4 fixture still green; §3.1 names the substance. Tell S12 (`01FTWcmX…`) and `01E8btkB…`, both in CmcModule.tsx recently. |
| 2 | L2 AnA reads survive failed turns | GA-DEMO-04 | `server/middleware/circuitBreaker.ts`, `server/startup/routes.ts`, `server/bootstrap/register-ai-routes.ts` | F1 · `circuitBreaker.ts` | A success resets the count; with no key, a further question and the background queue still read. |
| 3 | L3 Demo seed and scripts match the screen | GA-DEMO-10, -11, -12, -13, -14, -15, -16 | `packs/mdx.mjs`, `mdx-content.mjs`, `biotech.mjs`, `biotech-authoring.mjs`, `biotech-submission.mjs`, `biotech-content.mjs`, `launch-demo/lib.mjs`, `docs/demo/biotech-walkthrough.md`, `docs/demo/mdx-walkthrough.md` | DATA (seed) and F1 (scripts) · `scripts/demo/launch-demo/`, `docs/demo/` | Fresh seed: export 200; the mdx reviewer is the third person (OQ_APPROVER_*), landed before `GA-ADV-01`; every script line read off the screen with the gate on. Tell `01QoxbLdTrwY…` and `01QoxbLdKp…` (both in these files today) and the lead's rehearsal. |
| 4 | L8 Device screens | GA-DEMO-07, GA-DEMO-08 | `mdx/surfaces/K510Surface.tsx`, `mdx/components/DataGate.tsx`, `mdx/surfaces/PostmarketSurface.tsx`, `server/services/capa-mdr/capaMdr.service.ts` | F1 · `K510Surface.tsx`, `capaMdr.service.ts` | "Assemble the eSTAR" shows no raw error; MDR queue excludes filed MDRs. |
| 5 | L4 Submission gates say what is true | GA-D7-11, -10 (labelling half), -12, -13 | `server/services/ectd/dispatch-gate.ts`, `server/routes/ectd-compile.ts`, `templates/forms/acroforms/FDA_{1572,3454,356H}.pdf.manifest.json`, `v2/surfaces/IndFormsPanel.tsx`, `ind-lifecycle/ind-checklist-view-assembler.ts`, `v2/surfaces/IndLifecycle.tsx` | F1 · `dispatch-gate.ts`, `ind-checklist-view-assembler.ts` | "Not required" not "Satisfied"; Compile names its rule set and says the other exists; no personal email; placed IB reads placed. The one count (`GA-D7-10B`) and `assess-dispatch-readiness.ts` stay with RIM. |
| 6 | L5 Audit trail and Part 11 reads | GA-D5-05, GA-D6-03, GA-D5-02, GA-D5-03 | `v2/surfaces/AdminSurfaces.tsx`, `server/routes/audit-trail-routes.ts`, `server/routes/part11-compliance.ts`, `shared/constants/ui-surface-registry.ts`, `migrations/0014_report_os_foundation.sql` (amended in place with a dated note, RULE 1) | F1 · `AdminSurfaces.tsx`, `audit-trail-routes.ts` | "Filter E-sign" finds the seeded signatures; verify refuses another org and a non-reviewer; runtime role cannot UPDATE a sealed snapshot. Do not touch `audit-trail-ledger.routes.ts` (held). |
| 7 | L6 Figures, counts and titles | GA-DEMO-05, GA-DEMO-06, GA-S2-04 | `ana-biostats/judgment-engine.ts`, `ana-biostats/document-generator.ts`, `report-os/providers/db-providers.ts`, `server/services/qms/project-evidence.ts` | F1 · those four files | Breakpoints from recomputed power, rounded; C2C-101 counts its governed artifacts; captured Quality records have human titles and list after the project's own. |
| 8 | L7 Shell opens the right thing | GA-UI-04, GA-UI-27, GA-UI-05, GA-UI-03, GA-UI-07 | `v2/OpenWork.tsx`, `v2/surfaces/Orchestration.tsx`, `v2/surfaces/Review.tsx`, `v2/styles/app-v2.css` | F1 · `OpenWork.tsx`, `Orchestration.tsx` (CSS under D0 if split) | A route task opens its version in one click; Orchestration follows the open program; bell count beside the bell; filing tabs scroll at 390. |
| 9 | L9 Data return and harness drift | GA-CC-04, GA-CI-10 | `v2/surfaces/ComplianceAttestation.tsx`, `server/routes/tenant-export.ts` (no new route), `server/db/pglite-harness.ts`, `document-data-disposition/__tests__/disposition-fixture.ts` | F1 · `ComplianceAttestation.tsx`, `pglite-harness.ts` | An administrator downloads the full export with digest and receipt in the running app; suites pass without per-suite chain_seq patches. Tell the lead (Administration) and RIM (row :114 released the harness). |
| 10 | L10 Deploy wiring | GA-D1-03, GA-D7-04, GA-D7-06 (wiring half), GA-CC-08 (terraform half) | `terraform/stack/main.tf`, `terraform/stack/variables.tf`, `terraform/stack/tests/boot_contract.tftest.hcl`, `.github/workflows/deploy-aws.yml`, `server/services/ectd/__tests__/submission-gate-posture.test.ts` | L1 · `terraform/stack/` | Offline Terraform tests fail before and pass after: READYZ_TOKEN, FDA ESG settings, gate flags and REVIEW_ADMIN_TOKEN reach the task. No apply. The availability probe (`GA-CC-05`) joins this lane after the founder names a provider. |
| 11 | L11 Rule currency | GA-CC-06 | `server/services/ectd/validation-rule-corpus.ts`, `server/services/biosimilar/biosimilar-knowledge.ts` | F1 · those two files | The corpus names the criteria version; each 1.7 high-severity rule has a positive and a negative fixture; biosimilar advice states final, draft or withdrawn. Before 2027-01-16. |

Removed from the first draft's L9: the estar barrier test (`GA-CI-04`, held by Vault parity's subject) and the sub-agent toolset red (`GA-CI-07`, handed to Anna runtime, edited today by a session with no row).

Not laned, because the file is held, another session is active on it, or a decision comes first:
- `GA-ADV-01` and `GA-CC-13` need `authoring.router.ts`. Row :93 holds the draft route and its accept in that file, and that row is itself stale (`GA-PLAN-01`). Clear or confirm row :93 first; then one lane takes `authoring-review-route.ts` and the router's `reviewRefused` call and section PATCH, after L3 has landed the mdx reviewer change.
- `GA-CC-09` (CSR "Not applicable because …", amendment walk). `01QoxbLZjz…` commits on the CSR build path today with no row, and any route the act needs must be checked against approvedAdditions first.
- RBM "New KRI" (held, stale row; `01QoxbLZjz…` also in `Rbm*.tsx`).
- PQ csrDrafting (large; S4 needs an owner).
- String org ids (lane capacity; it is next).
- Module 2 QC, D-13 and the one error count (handed to RIM).
- `GA-D7-27` (needs a stored binding; effort L; RULE 1 and RULE 6 check first).
- `GA-CC-01`, `GA-CC-02`, `GA-CC-05` (founder rulings first).

## Sales material

**Remove or reword now**
- "Six apps" and the retired-surface lists. Use the catalog in `launch-scope.ts` (`GA-SAL-01`).
- "Not in this release: eSTAR, 510(k), CER/PER, predicate, GSPR". These features ship (`GA-SAL-02`).
- "Claude Opus 5" as primary. The registry's primary is claude-opus-5-5 (`GA-SAL-03`).
- "AI drafting included", unless it says no model has passed PQ, so drafts cannot be approved or filed (`GA-SAL-04`).
- The per-user table (Professional below Standard), and On-Prem, Custom AI Models, SLA Guarantee, eSTAR Builder, EU MDR/IVDR (`GA-SAL-05`).
- Sign-up claims: HIPAA, 7-year audit retention, TLS 1.3, published overage rates, CSR builder, all connectors, the 14-day trial (`GA-SAL-06`, held by the lead).
- "No per-seat fees" (`GA-SAL-09`). Bedrock EU residency and client-configured SSO in the Order Form (`GA-SAL-11`).
- MSA §6.8 weekly auditor reports (`GA-SAL-12`).
- "Tamper-evident, verified" until AUD-02 is fixed (`GA-D5-08`).
- The Partner Hub line that says the connector does not exist (`GA-SAL-14`).
- Every "Demo access" sign-in step (`GA-DEMO-16`).
- The 99.5 % availability target, until something measures it (`GA-CC-05`). "Export at any time through the Service", until the export has a screen (`GA-CC-04`).

**A whole-platform presentation still needs**
- The presentation itself. None exists: no deck, one-pager or leave-behind (`GA-CC-14`). Build it from `launch-scope.ts`, the showcase run of show and the corrected claims above, and say plainly what is not shown.
- The production-posture rehearsal README. It completes `docs/evidence/DEMO/2026-11-10-sales-rehearsal/` (`GA-DEMO-22`).
- Live AnA scenes 8 and 11, and one push-back. These complete `docs/evidence/DEMO/2026-11-10-sales-showcase/README.md` (`GA-D4-04`).
- One scene list per buyer: consultancy, clinical ops/RBM, QA/security reviewer, enterprise pharma. This completes the showcase README and `docs/commercial/ICP_AND_OUTREACH.md` §4 (`GA-SAL-16`).
- Dated objection answers (validation kit, Part 11 map, residency, model governance with POLICY-VM-006 and POLICY-AI-008, uptime, exit, SIG-Lite). These complete ICP §6, `docs/security/REGULATORY_CONTROL_MAP_US_JP_EU.md` and `SECURITY_QUESTIONNAIRE_SIG_LITE.md` (`GA-SAL-16`, `GA-SAL-13`, `GA-CC-16`).
- Seeded stories for pharma, device and CRO, which complete `scripts/demo/launch-demo/packs/`. Until they exist, say plainly that they are not shown (`GA-CT-01`..`-05`).
- A competitive sheet against Veeva, Weave Bio, Artos and Certara. It completes `docs/commercial/RIM_COMPETITIVE_PACKAGING_RESEARCH_2026-08-23.md` (`GA-SAL-17`).
- A refreshed onboarding runbook (`GA-SAL-15`), with the lead's client-administration walk.

## Where readers disagreed

Each disagreement was re-checked at 7f465d34f and recorded on its item (`disagreement`). Challenger corrections are recorded on their items (`finalizeNote`).

- **RBM site register** (`GA-S8-02`). `gcc/index.ts` mounts `gcc/site-intel/routes.js`, not the writer. Open.
- **RBM hold** (`GA-S8-01`). Still on row :106. The row is stale but the hold stands.
- **ZenSignup.tsx** (`GA-UI-02`). Held by the lead (row 95), not unheld. Its path is `client/src/concept2cure/auth/`.
- **IQ fonts** (`GA-D1-07`). Held by validation.
- **Device coverage** (`GA-S6-01`). Held by `01KnUG…` (row :102).
- **CI capacity** (`GA-CI-01`). Open, with no holder row.
- **Founder-path counts** (`GA-CI-09`). The readers give 9/15 failing, 6/15 passing and 11 baseline entries. The holder is unheld.
- **mdx pack** (`GA-DEMO-10`). Unheld.
- **Click-through** (`GA-DEMO-26`). Unknown.
- **Faux** (`GA-DEMO-23`). Unknown.
- **PQ holder** (`GA-D4-02`). Unheld.
- **GA impact.** Where one reader said blocker and another said advisory, the item records blocker: `GA-D4-04`, `GA-D6-05`, `GA-D7-08`, `GA-S2-04`.
- **Codespace tools** (`GA-DEMO-21`). Both challengers: mostly closed by 01a5f04db. Recorded held-in-progress, embarrasses, narrowed.

## Not read

- **LAUNCH_DEFINITION_OF_DONE.md**: P-1 to P-114 were not read end to end. A founder question inside an older decision may be missing.
- **Founder register**: MR-00's F-1 to F-27 decided states were not checked. F-1 and branch protection were not checked on GitHub.
- **Other planning docs**:
  - `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md`;
  - MR-02, MR-04, MR-10, MR-13, MR-16 (read at grep hits only);
  - ONE_DESIGN_PLAN.md §1d, §4, §5;
  - the D0–D7 specs beyond the step tables.
- **Coordination and validation**:
  - COORDINATION.md was not read line by line. It changed during every read;
  - the W3 step records and transcripts;
  - the D5 Part 11 audit folder (`GA-D5-07`).
- **Demo and human-test evidence**:
  - the 125 unverified deep-walk findings item by item;
  - the demo manifests and transcripts;
  - the Faux data files;
  - `docs/evidence/F1/2026-11-06-demo-readiness/qualifiers/`;
  - `CLICK-THROUGH/2026-11-10` beyond its README;
  - D2-CLIENT-JOURNEY sub-passes and their parity gaps;
  - MDX-JOURNEY slices beyond grep;
  - J1 screenshots;
  - most of the 306 evidence folders dated 2026-11-* (the completeness check found 264 never named here; most are closed fix records).
- **Code not read**:
  - the thirteen non-FDA gateway adapters;
  - the device eSTAR code;
  - the legacy `scripts/seed/ga-demo.d` contents;
  - whether the editor's CSR build is metered (`GA-SAL-10`).
- **Commercial and security paper**: DPA beyond §6 and the lines checked for `GA-CC-16`; MSA and Pilot clause by clause; security policies other than DR-007, VM-006 and AI-008 by name; the pen-test scope; the 2026-09-24 security audit count.
- **Not run**: no test, tsc, gate (except five static ones a reader ran), PQ preflight, running app or deployment. Every "unknown" stays unknown until someone runs or walks it.
- **After this commit**: anything committed after 4a7b69a06.

## Challenges declined

Each challenge was re-checked at 4a7b69a06. These were declined in whole or in part:

- **`GA-CC-16`, the DPA contradiction (DPA:105 vs :142).** Declined. DPA §4.2(b), lines 103-106, is a condition before any PHI is uploaded ("Customer will not upload PHI … unless … Provider has a signed Business Associate Agreement with each AI subprocessor"), not a statement that one is signed. Line 264 says the Anthropic BAA is not signed. They agree. The rest of `GA-CC-16` was kept, narrowed to citing the model-governance policies.
- **`GA-CC-09`, resuming a failed CSR build.** Declined. ee78552eb (2026-11-10 05:39, `01QoxbLZjz…`) added `POST /api/csr/jobs/:jobId/resume` and "Resume build N" in the build panel; 93c6392c1 keeps it. The COORDINATION.md:742 hand-off predates it. The rest of `GA-CC-09` was kept.
- **`GA-CC-04`, the file `AdminSettings.tsx`.** Changed. `ComplianceAttestation.tsx` already calls `/api/tenant-export/attestation`, so the export is reached there, with no new screen.
- **`GA-CC-08`, `scripts/ops/ga-readiness-report.mjs` in the lane.** Changed. RIM holds that file (row :107). Only the Terraform half is laned (L10).
- **`GA-ADV-01`, `mdx.mjs` in its files, and laning it.** Changed. `mdx.mjs` stays with L3 (`GA-DEMO-11`), which lands first, so the lanes stay disjoint. `GA-ADV-01` is not laned, because `authoring.router.ts` is partly held by row :93.
- **`GA-ADV-02`, the time of 3d22a942d.** Corrected: 11:27, not 11:01.
- **`GA-CC-11`, "100 surfaces".** Corrected: `one-product-baseline.json` lists 101.
- **`GA-CC-12`, the client-administration walk.** Applied to this README ("What already exists", the held list, sales). It is not a ledger item, because it is about this file.
- **`GA-DEMO-21`, "held by 01QoxbLdKp…".** Applied with care: that session's row says "stopped; holds nothing", so the holder is recorded as "no hold row, committing today".
