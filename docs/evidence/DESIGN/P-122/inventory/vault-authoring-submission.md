# Vault, Authoring, Submission Center, Submission Readiness, Communication, Audit trail: what left the screen, and what was never reached

Read-only investigation of `concept2cure-v2` at `8c7664b35` (2026-11-10). Nothing in the repository was edited.

**Baselines.** For a deleting commit, the tree before it (`<commit>^`). For the reshape, `bd1338c25` (2026-10-30/31). For the start of the window, `4b7234944` (last commit before 2026-10-15). History is complete back to 2026-06-30 in this clone.

**Method.**
- Surface ids diffed between the registry and the renderer map (`shared/constants/ui-surface-registry.ts`, `client/src/concept2cure/v2/surfaceViews.ts`) at each baseline and HEAD.
- `git log --diff-filter=D --since=2026-10-15` on `client/src` and `server`.
- `git log --no-merges --since=2026-10-15 --numstat` on every client file in these areas, keeping changes that deleted 40 lines or more (86 hits, each read).
- The fold evidence READMEs. Each has a parity table, and each was checked against HEAD by path.
- For every deleted component, the API calls it made, and whether any HEAD client file still makes them.
- A route scan over 180 route files: mount prefix, then any client caller, then the production launch-scope verdict, computed by calling `launchScopeApiVerdict` itself.

**Caveat on the route scan.** It is a text scan, and client code often builds its paths with helpers (`${base}/annotations/${id}/${act}`, `/api/submissions/sequences/${id}/${kind}`). So §3.1 lists only the routes checked by hand. §3.2 (Appendix) is the machine list, with known false positives named.

---

## 0. Bottom line

1. **In these areas, most of the "Fold X into Y" commits moved the function and did not delete it.** Each fold has a parity table, and checked against HEAD the target renders the same outcome:
   - Artifacts center → Vault;
   - ectd-publishing → eCTD Compile;
   - part11-console → Audit trail;
   - Dossier → project Author step;
   - FilingsCatalog → intake;
   - device-submission → Submission Center;
   - Agency Meetings → Communication.

   What the folds did cost is **reach**: fewer doors, more clicks, and some functions only inside a project step.
2. **The real losses are few, and they are specific:**
   - **Package-level gateway transmit**, which included device / eSTAR (K-number) packages, plus assemble, preflight, identifiers and rollback. Removed 2026-10-17 by `8b75e6b5b`. Only eCTD *sequences* can be transmitted now, and a tracked device filing has no transmit path at all.
   - **The last client caller of the agency-letter deficiency parser** (`/api/regulatory-correspondence/*`). Removed 2026-10-29 by `e3a2d0475`.
   - **The IND safety-report card** (21 CFR 312.32). Withheld by P-32 and moved out of the client on 2026-10-20 by `67d96c060`. Its bytes are kept intact at `tests/fixtures/withheld/indSafetyReportCard.ts`.
   - **The conversation's document card** (outline, per-section "Ask AnA to draft", File to vault, Send for review). Collapsed to a chip on 2026-11-09 by `5008143ab`.
3. **The "10% visible" effect in these areas comes mostly from two things that are not folds:**
   - **Launch scope.** `LAUNCH_SCOPE_ENFORCE` is on by default whenever `NODE_ENV=production` (since `5119f95ae`, 2026-10-08). That locks 20+ built screens in these areas: eCTD co-author, Template library, Regulatory workspace, Doc journey, Submission twin, standalone Shadow review, HAQ manager, CSR workflow, Investigator brochure, Orchestration, Inconsistency, NDA/MAA cockpits and more. API paths that only those screens claim are refused 403.
   - **Discoverability cuts.** On 2026-10-25 (`d97388005`) the rail was cut to five places and the features catalog was made organization-admin-only ("Subscription & features", `client/src/concept2cure/v2/Shell.tsx:683`). Submission Center was off the rail from 2026-10-25 to 2026-10-31 (`c5170db97`). Gateway transmittals and Submission Readiness have no in-product button at HEAD, only ⌘K and AnA.
4. **A large amount of server capability has never had a screen, and most of it is refused in production anyway** ("unmapped": nothing claims the path):
   - the IND lifecycle sequence diff, manifest, snapshots and dispatch-gate;
   - the IND registers (cross-references and LOA, annual reports, amendments, safety reports, ICSR transmissions);
   - the IND portfolio drift;
   - FDA forms (`/api/fda-forms/*`);
   - the eCTD submission agent;
   - Authoring "Wave 1" actions (promotion, contradiction resolution, preflights);
   - governed-artifact comments, reviewers and quorum;
   - correspondence intake, response packages and mailbox connections.
5. **Demo hazard introduced 2026-11-09.** `33c3e4de9` (P-95) refuses an approver e-signature with 409 `REVIEW_REQUIRED` unless the latest review route names a reviewer and every reviewer has signed. The demo seed records review and approval steps that need a second person as "not executed" (`c5170db97`). On the seeded demo, approving a document therefore fails unless someone first runs a review round.
6. **Whole-commit reverts are not the way back.** Every fold commit amends catalog migrations in place (Rule 1), deletes server routes and re-baselines CI, and 11 to 66 of each one's files have changed since. The one reshape commit that is safe to revert whole *and* gives back function is `5008143ab`. Everything else is re-adding a component, a door or a claim (§4).

---

## 1. Timeline: commits that removed or hid user-visible capability in these areas

Dates are author dates. "Moved" means the parity was checked at HEAD; "lost" means no HEAD path delivers the outcome.

| Date | Commit | What left the screen or got harder to reach | Area | Where it is at HEAD | Net |
|---|---|---|---|---|---|
| 2026-10-08 *(context, before the window)* | `5119f95ae` | `LAUNCH_SCOPE_ENFORCE` is on by default in production. The CPO decision of 10-08 locks ectd-coauthor, template-library, regulatory-workspace, dossier-map, ectd-publishing and authoring-engine. | All | `shared/constants/launch-scope.ts` (see §2.7) | **hidden in prod** |
| 2026-10-15 *(context)* | P-32 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) | IND lifecycle joins Submission Center. **IND safety reporting and ICSR stay shut.** `haq-manager` is not listed. | Submission | `IndLifecycle.tsx` (no safety card) | **hidden** |
| 2026-10-17 | `8b75e6b5b` | Gateway transmittals becomes a read-only log. Removed: the **package picker, assemble, regulatory identifiers, preflight, package transmit to ESG / CESP / EUDAMED / PMDA / HC-CESG, and the unsigned rollback** (GatewayTransmittals.tsx 1000 → ~570 lines). Registry claim narrowed to `/api/mdx/gateways/transmittals`. | Submission / gateway | Sequence transmit only: Submission Center → Dispatch → `TransmitPanel` (`SubmissionSeqWorkspaces.tsx:2095`) | **lost for non-sequence and device packages** |
| 2026-10-17 | `41c02467a` | Part 11 console loses "compliance status" and "SOC 2 controls". Both were constants (`not_assessed` / `not_collected`), and `POST /soc2/evidence` stored nothing. | Audit | — (they were fabricated) | removed, not a loss |
| 2026-10-17 | `1e18cdd49` | Submission Readiness stops being its own app (P-36); its module moves into the Submission Center app. Rail unchanged. | Readiness | `dispatch-readiness` surface (no in-product door; §2.4) | harder to reach |
| 2026-10-17 | `b0d7ac7c4` | Communication's inbox moves into `AgencyInbox.tsx`, shared with Project → Respond. | Communication | `AgencyInbox.tsx` | moved |
| 2026-10-18 | `0308ee257` | HAQ Manager (questions, drafted response, assemble the response package) and `server/routes/haq-manager.ts` deleted. Approval becomes a signed act. | Communication | `AgencyResponses.tsx` over `server/routes/c2c/agency-responses.ts` | moved, improved |
| 2026-10-19 | `4c605b99f` | Communication's commitment rows lose the in-place status flip (CommunicationCenter −119 lines). A PMR, PMC or REMS is now fulfilled by a signature. | Communication | `CommitmentFulfilment.tsx`, `commitment-fulfil-route.ts` | moved |
| 2026-10-20 | `67d96c060` | `indSafetyReportCard.ts` leaves `client/src`. | Submission (IND) | `tests/fixtures/withheld/indSafetyReportCard.ts` (not rendered) | **hidden** |
| 2026-10-22 | `13337e02a` | `GET /api/c2c/projects/:id/vault-structure` deleted (it had no caller). | Vault | — | n/a |
| 2026-10-22 | `0d39b20cb` | Submission Readiness rebuilt as the project's markets (DispatchReadiness −335 lines, programSequence −329). The old screen found one sequence org-wide. | Readiness | `DispatchReadiness.tsx`, `readinessFindingActs.ts` | improved |
| 2026-10-23 | `c50f8810e` | Home's **"everything in your category" capability browser** deleted (`CapabilityBrowser.tsx`, AdminSurfaces −816 lines). | Cross-cutting | `WorkflowCatalog.tsx` as `apps` (admin-only since 10-25) | **harder to reach** |
| 2026-10-25 | `d97388005` | Rail cut from 12 to 5 places. **Submission Center off the rail.** The Apps catalog becomes "Plan & features", **organization admins only**. | Cross-cutting | Submission Center back on the rail by `c5170db97` (10-31); catalog still admin-only (`Shell.tsx:683`) | **harder to reach** |
| 2026-10-26 | `8b192f1e7` | `Dossier.tsx` (CTD section readiness table) and `DossierMap.tsx` (M1–M5 completeness map) deleted, with `/api/dossier-readiness` and `/api/dossier-map`. | Submission | `ProjectDossier.tsx` on the project page's Author step (`ProjectHome.tsx:1674`) over `GET /api/c2c/projects/:id/dossier` | moved, now inside the project page |
| 2026-10-26 | `b9975a914`, `37f2ed240` | `FilingsCatalog.tsx` (browse every filing type, its clock and its requirements) and its fixture deleted. | Submission / Projects | `AnaVerbs.tsx` RegistryPicker (New project), `FilingLifecycleReference.tsx`, `ProjectPlan.tsx`; alias `filings-catalog` → `projects` | moved, now inside "New project" |
| 2026-10-26 | `0fc2fc294` | MDX `TemplatesSurface.tsx` deleted. Nothing imported it. | Authoring | Authoring → New document → Start from (`AuthoringTemplatePicker.tsx`) | n/a (was unreachable) |
| 2026-10-29 | `b9de04c62` | `device-vault` (mdx `VaultSurface.tsx`, `useVault.ts`, `/api/mdx/vault`) and the **Artifacts center** gallery (`AdminSurfaces.tsx` `ArtifactsCenter`) deleted. | Vault | Vault: Governed artifacts branch and the organization view `VaultOrganizationArtifacts.tsx` | moved; device framework filter and "vault size" KPI not carried |
| 2026-10-29 | `302d632db` | `PublishingCenter.tsx` deleted. | Submission | `EctdCompileReference.tsx` and `QualifiedSpecVersions` in eCTD Compile | moved |
| 2026-10-29 | `66efa6179` | `Part11Console.tsx` deleted. | Audit | `AuditEventChain.tsx` banner in Audit trail | moved |
| 2026-10-29 | `e3a2d0475` | The device Correspondence tab moves off `/api/regulatory-correspondence/*` and `AnaDrafter.tsx` is deleted. **This removed the last client caller of the correspondence service** (issue parser, issue review, response packages). | Communication / Authoring | Device tab reads the project inbox; "Respond in Communication" | **server function now unreached** |
| 2026-10-29 | `7bc96a3e1` | `c2c_commitments` routes and service retired. They had no client caller. | Communication | `/api/ha-interactions/commitments`, commitment-fulfil route | n/a |
| 2026-10-29 / 30 | `5894e1aaa`, `5ab665f63` | IND screen's briefing-book form → PDF assembler removed, with `POST /api/ind-lifecycle/briefing-book(/pdf)`. | Submission (IND) | `IndBriefingBookStart.tsx`: the meeting-package template opened in the editor | moved, improved |
| 2026-10-30 | `508b2b7a8` | `AgencyMeetings.tsx` (meeting worklist with briefing-book section status, questions with sponsor position, minutes, agreements) and `/api/agency-meetings` deleted. `c2c_agency_meetings` made read-only. | Communication | Communication → Meetings & commitments (`HaMeetings.tsx` on `/api/ha-interactions`); minutes are an inbox letter | moved; briefing-book section status is now in the editor |
| 2026-10-30 | `9e73fad98` | HAQ session store (`server/routes/c2c/haq-sessions.ts`) retired. No client had called it since 2026-05-01. | Communication | project inbox | n/a |
| 2026-10-30 | `776d9da46` | Device submission workbench (`mdx/workbench/Workbench.tsx`, `useSubmissions.ts`) deleted. | Submission | `DeviceFilings.tsx` in Submission Center (status filter, per-row readiness, history) | moved |
| 2026-10-30 | `041880cbd` | **Organization-wide device blocker list**, with "Pass" for a low-severity blocker, deleted. `/api/submission-ops/blockers` has no claimant now. | Submission | Per filing: `EstarFilingPanel` | **portfolio view lost** |
| 2026-11-01 | `2e4a9fe67` | Vault reshaped: the bands become five tabs (Library, Uploads, Required documents, Governed artifacts, Seals & fixity) and the record becomes an inspector. Nothing removed; folders, Plan work and data-room sources were added. | Vault | `Vault.tsx` | reshaped |
| 2026-11-01 | `f23853723` | Editor reads as a page (CSS only). | Authoring | — | cosmetic |
| 2026-11-02 | `b6a46499f` | **Editor header: 25 controls → one bar (title, Save, AnA, More).** Versions, Exports, Review tasks, Signatures, Audit trail, Access, Send for review…, File to vault…, New document/section and Download (Word) move into "More". | Authoring | `editor/DocumentWorkbench.tsx:4944-4995` | **harder to reach** (2 clicks) |
| 2026-11-09 | `9273b055b` | Ribbon row 2 behind "More formatting": superscript, subscript, highlight, alignment, image, caption, symbol. | Authoring | `RichSectionEditor.tsx` | harder to reach |
| 2026-11-09 | `5008143ab` | **The document card under an AnA turn collapses to a chip.** Gone from the card: the outline of every section, the first section's text, "Show all", the per-section "Ask AnA to draft", "Open full editor", File to vault, Send for review. | Authoring | Acts reached once the document is open | **harder to reach** |
| 2026-11-09 | `33c3e4de9` | **Approval refused without a completed review** (P-95, 409 `REVIEW_REQUIRED`). | Authoring / e-sign | `server/routes/authoring.router.ts`, `AuthoringFilingBar.tsx` | new gate (a founder decision) |
| 2026-11-09 | `c023b17ae`, `f52cc3be2`, `a66c04fa5` | Submission Center moves to the work-area pattern. "Plan the submission" and "Open the sequences" become tabs; "Dispatch gate clear" becomes "Cleared to dispatch?". Nothing removed. | Submission / Readiness | `SubmissionCenter.tsx`, `SubmissionSeqWorkspaces.tsx` | reshaped |
| 2026-11-09 | `edd225c02` | FDA ESG SFTP branch retired: an FDA package over 1 GiB is refused by name before signing. The branch never worked: no image shipped `ssh2-sftp-client`. | Gateway | `sequenceTransmitReadiness` refusal | removed; nothing that worked was lost |

---

## 2. Capability inventory: present at baseline, absent or harder to reach at HEAD

Restore effort: **S** is under a day (a door, a claim, a revert); **M** is 1–3 days (UI plus claim plus tests); **L** is more than 3 days or a design.

### 2.1 Vault

| Capability (in a regulatory-affairs user's words) | Where it was (path@commit) | What is there now (does the target deliver it?) | Server route still mounted? | Value | Effort |
|---|---|---|---|---|---|
| "Show me every governed or AnA-drafted artifact across all my projects, with its signature state, cited sources, a DOCX download and a CSV manifest" | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` `ArtifactsCenter`@`b9de04c62^` (surface `artifacts-center`) | `client/src/concept2cure/v2/surfaces/VaultOrganizationArtifacts.tsx` in `Vault.tsx`. **Yes**: same rows, four-state signature, DOCX, CSV (same 17 columns), Open in editor. Shown only with no project open, or after one click ("Show governed artifacts across your projects"). | `GET /api/artifacts-center` (now bound to accessible projects) and `/:artifactId/export`: mounted, launch | LOW: delivered; a gallery tab label would help it be found | S (a tab or ⌘K label) |
| "Device document vault: folders by CTD family, KPI strip (vault size, retention), filter by framework, detail drawer with versions and the five newest audit rows" | `client/src/concept2cure/mdx/surfaces/VaultSurface.tsx`, `mdx/hooks/useVault.ts`@`b9de04c62^` | Vault Governed artifacts grouped by CTD module, with the leaf's versions and audit report (`VaultGovernedArtifacts.tsx`). **Mostly.** Not carried: framework filter (it was a guess from the kind, `VaultSurface.tsx:47-57`), "Vault size" KPI, retention tile, and the Download/Preview buttons (which only typed a chat prompt). | `/api/mdx/vault` **deleted**; replacement `/api/c2c/project-vault/*` mounted | LOW: what was real is carried | S (vault-size KPI); framework filter needs a recorded field (M) |
| "Inspection readiness from the Vault" | `Vault.tsx` button, gated on `available('etmf')`, both at baseline and HEAD | Unchanged: shown only when eTMF is available, and eTMF is locked in production (§2.7) | `/api/etmf/*` claimed only by locked `etmf` | MED: inspectors ask for it | M (an eTMF scope decision) |
| "Vault as one long page with every band visible" | `Vault.tsx`@`bd1338c25` | Five tabs plus an inspector (`2e4a9fe67`). Everything is still there; folders, Plan work and data-room sources were added. | — | LOW | — |

### 2.2 Authoring (editor, AnA drafting, review, e-sign)

| Capability | Where it was | What is there now | Server route | Value | Effort |
|---|---|---|---|---|---|
| "From AnA's answer, see the drafted document's outline and first section, ask AnA to draft any section, file it to the Vault or send it for review **without opening the editor**" | `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`@`5008143ab^` | A chip with "Open". Each act is reached once inside the open document (More → File to vault…, Send for review…, an empty section's Draft with AnA). **Delivered, but one or two screens further away.** Pinned path: `docs/design/ANA_DOCUMENT_CANVAS.md`. | `/api/authoring/*` mounted | MED: this is the AnA → canvas → editor → vault demo path | **S: `git revert 5008143ab`** (21 files, 5 changed since, no migrations) |
| "Versions, signatures, audit trail, review tasks, exports, access, Send for review, File to vault and Download Word visible on the editor header" | `editor/DocumentWorkbench.tsx`@`b6a46499f^` (25-control header) | One bar plus More (`DocumentWorkbench.tsx:4944-4995`). **Delivered**, every control kept by name and test id, at two clicks. | mounted | MED: in a demo they look gone | S (promote Versions, Signatures and Send for review back onto the bar) |
| "Superscript, subscript, highlight, alignment, image, caption and symbol on the ribbon" | `editor/RichSectionEditor.tsx`@`9273b055b^` | Row 2 behind "More formatting". Delivered. | — | LOW | — |
| "Approve (e-sign) a document" | `AuthoringFilingBar.tsx` / `authoring.router.ts`@`33c3e4de9^` | Refused 409 `REVIEW_REQUIRED` unless the latest RR5 route names a reviewer, all reviewers signed, on this text (P-95, founder). The bar offers "Send for review". | mounted | **HIGH demo impact** | S: seed a completed review in the demo (`scripts/seed/ga-demo.d/*`); do **not** revert (founder decision) |
| "Device template browser" | `mdx/workbench/TemplatesSurface.tsx`@`0fc2fc294^` | Authoring → New document → Start from (`AuthoringTemplatePicker.tsx`, `GET /api/authoring/templates`). It was unreachable before deletion. | `/api/authoring/templates` mounted | LOW | — |
| "Draft a response to a device agency letter with AnA, from the device Correspondence tab" | `mdx/components/AnaDrafter.tsx`@`e3a2d0475^` | "Respond in Communication": `AgencyResponses.tsx` and the editor. The old drafter's Send was disabled and its draft never saved. | `/api/concept2cure/projects/:id/agency-communications/*` mounted, launch | LOW | — |
| Locked since 10-08: Template library, Regulatory workspace, Authoring engine, Batch draft, Doc journey | `surfaces/TemplateLibrary.tsx`, `BiopharmaProject.tsx` RegulatoryWorkspace, `AuthoringEngine.tsx`, `BatchDraft.tsx`, `DocJourney.tsx` (all present at HEAD) | Rendered only when `LAUNCH_SCOPE_ENFORCE=off` | mounted; claims out-of-scope | MED (Template library), LOW (others) | S each, as a founder scope decision |

### 2.3 Submission Center (eCTD build and compile, sequences, IND lifecycle and forms, publishing, gateway)

| Capability | Where it was | What is there now | Server route | Value | Effort |
|---|---|---|---|---|---|
| **"Transmit an assembled package (including a 510(k)/eSTAR package by K-number, or a non-sequence package) to FDA ESG, EMA CESP, EUDAMED, PMDA or Health Canada CESG; assemble it, preflight it, set its regulatory identifiers; roll back a stuck transmit"** | `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`@`8b75e6b5b^` (lines ~165-760: package picker, `POST /api/mdx/gateways/${region}/${gateway}/transmit`, `/api/submission-ops/packages/:id/assemble`, `/preflight`, `/regulatory-identifiers`, rollback) | **Only an eCTD sequence can be transmitted**: Submission Center → Dispatch → `TransmitPanel` (`SubmissionSeqWorkspaces.tsx:2095`). Routing by region, EUDAMED and CESP included, is in `transmitRouteFor` (`server/services/submission-service/submission-service.ts:3663+`). **A tracked device filing (`DeviceFilings.tsx`, `estar_submissions`) has no transmit path.** The fold target does **not** deliver this for device or non-sequence packages. | `POST /api/mdx/gateways/:region/:gateway/transmit`: mounted, **out-of-scope** (claimed only by `labeling-pi`), no caller. `/api/submission-ops/packages/*` (assemble, preflight, identifiers, publish): mounted, no caller. Rollback route **deleted**. | **HIGH for device customers**, MED overall | M: re-add the package panel from `git show 8b75e6b5b^:client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`, re-claim the transmit path, and settle FILING_SPINE F12 ("one transmit path") with the founder |
| **"File an IND safety report (21 CFR 312.32): classify the event, generate the 15-day / 7-day report PDF, file it"** | `client/src/concept2cure/v2/surfaces/indSafetyReportCard.ts`@`67d96c060^` | Nothing on screen. Bytes and tests kept at `tests/fixtures/withheld/indSafetyReportCard.ts`; its header lists the four steps to offer it again. | `/api/ind-lifecycle/safety-report`, `/pdf`, `/file`, `/classify`, `/icsr`: mounted, **out-of-scope** (claimed by `pharmacovigilance`) | **HIGH**: a legal obligation for every IND sponsor | S technically; needs the founder to lift P-32 |
| "Show me the dossier: CTD section readiness (artifacts by status, last updated) and the M1–M5 completeness map" | `surfaces/Dossier.tsx`, `surfaces/DossierMap.tsx`@`8b192f1e7^` | `ProjectDossier.tsx` (`DossierReadinessCard`, `ModuleCompletion`) on the project page's **Author** step (`ProjectHome.tsx:1674`). **Delivered**, but only inside the project, not as a dossier screen; alias `dossier` → `project-home`. | `/api/dossier-readiness`, `/api/dossier-map` **deleted**; `GET /api/c2c/projects/:id/dossier` mounted | LOW-MED | S (a "Dossier" tab or door) |
| "Browse every filing type (IND, NDA, BLA, 510(k), MAA…) with its clock and requirements, without starting a project" | `surfaces/FilingsCatalog.tsx`@`b9975a914^` | RegistryPicker in New project (`AnaVerbs.tsx`), `FilingLifecycleReference.tsx`, `ProjectPlan.tsx`. **Delivered inside intake.** Browsing without starting a project now means opening "New project". | static data | LOW-MED | S |
| "eCTD reference: spec versions qualified against, FDA Regional IG OID, v3.2.2 / v4.0 controlled vocabularies" | `surfaces/PublishingCenter.tsx`@`302d632db^` | `EctdCompileReference.tsx` and `QualifiedSpecVersions` (`EctdCompileDtdEvidence.tsx`) in eCTD Compile, also with no project open. **Delivered**, with four defects fixed. | `/api/ectd/controlled-vocab`, `/api/ectd/qualification/spec-versions`: mounted, launch | LOW | — |
| "Device submission workbench: packages, milestones, readiness" | `mdx/workbench/Workbench.tsx`, `mdx/hooks/useSubmissions.ts`@`776d9da46^` | `DeviceFilings.tsx` and `TrackedFilingHistory.tsx` in Submission Center over `estar_submissions`. **Delivered.** | `/api/510k/estar/submissions/*` mounted | LOW | — |
| "One list of every device blocker across the organization; pass a low-severity one" | `mdx/workbench/Workbench.tsx` ValidationSurface, `hooks/useWorkbench.ts`@`041880cbd^` | Per filing only (`EstarFilingPanel`). "Pass" was dropped on purpose (a blocker is closed by fixing it). **Portfolio view not delivered.** | `GET /api/submission-ops/blockers`, `PATCH /blockers/:id`: mounted, **unmapped** (refused in production), no caller | LOW-MED | M |
| "IND briefing book: fill a form, get a PDF" | `IndLifecycle.tsx` briefing card@`5894e1aaa^`; `server/services/ind-lifecycle/ind-briefing-book-service.ts`@`5ab665f63^` | `IndBriefingBookStart.tsx`: the FDA meeting-package template opened in the editor (reviewable, signable, fileable). **Delivered, better.** | `/briefing-book(/pdf)` **deleted** | LOW | — |
| "Transmit an FDA package over 1 GiB (SFTP)" | `server/services/submission-gateways/fda-esg.ts`@`edd225c02^` | Refused by name before signing. It never worked in any shipped image. | — | LOW | L (it would need a real SFTP or physical-media path) |
| "Open Gateway transmittals and Submission Readiness from Submission Center" | No in-product door at either baseline or HEAD | Only ⌘K, AnA, the deep link, and the admin-only features catalog | mounted | MED: built screens nobody finds | S (two header buttons) |
| Submission Center on the rail | `registryModel.ts` RAIL_CORE@`4b7234944` | Removed 10-25 (`d97388005`), restored 10-31 (`c5170db97`) | — | — | done |
| Locked since 10-08 / 10-15: eCTD co-author, Submission twin, standalone Shadow review, Orchestration, Inconsistency, NDA/MAA cockpits, CSR workflow, Investigator brochure, Safety narrative | all present in `client/src/concept2cure/v2/surfaces/` | Rendered only with `LAUNCH_SCOPE_ENFORCE=off`. Submission twin's 11 client calls are all refused in production. | mounted; claims out-of-scope | MED (Submission twin, NDA cockpit), LOW (co-author: a second editor over a second store) | S each, as a founder scope decision |

### 2.4 Submission Readiness

| Capability | Where it was | What is there now | Server route | Value | Effort |
|---|---|---|---|---|---|
| "Submission Readiness as its own app on the rail" | `launch-scope.ts` app list before `1e18cdd49` (10-17) | `dispatch-readiness` surface in the Submission Center app; per-sequence verdict on the Dispatch tab ("Cleared to dispatch?", `a66c04fa5`). **Delivered; the standalone screen has no door.** | `/api/submissions/sequences/:id/dispatch-readiness` mounted, called | MED | S (a door from the Submission Center header) |
| "Org-wide readiness for 'the' sequence" | `DispatchReadiness.tsx`@`0d39b20cb^` | One list per project market (`DispatchReadiness.tsx`). It used to pick one sequence from the unscoped list. | — | improvement | — |

### 2.5 Communication and agency correspondence

| Capability | Where it was | What is there now | Server route | Value | Effort |
|---|---|---|---|---|---|
| **"Log an agency letter and have its deficiencies itemized (deterministic parser), review each issue, build a response package, connect a mailbox, see deficiency patterns"** | Client: `client/src/concept2cure/services/programTabsService.ts` (`/api/regulatory-correspondence/correspondence`, `/:id` issues, `PATCH /issues/:id/review`)@`e3a2d0475^`. Server: `server/routes/regulatory-correspondence.ts`, `server/services/regulatory-correspondence/issue-parser.ts` (`governed_heuristic_mode_v1`, no model). | The project inbox (`AgencyInbox.tsx`, `AgencyResponses.tsx`) records **questions typed by hand** ("Nothing is inferred from the letter", `b0d7ac7c4`). **The parser, issue review, response-package build, mailbox connections and deficiency analytics have no client caller.** Note: no browser client ever wrote that store, so the old tab read an empty table. | All 13 routes mounted, launch verdict, **no client caller** (§3.1) | **HIGH**: itemizing an FDA letter is daily RA work | M: reach the parser from the inbox's letter logging, proposing questions a person confirms |
| "Agency meeting worklist: type, clock, briefing-book sections with status, questions with sponsor position, minutes, agreements, commitments" | `client/src/concept2cure/v2/surfaces/AgencyMeetings.tsx`@`508b2b7a8^`; `server/routes/agency-meetings.routes.ts` | Communication → Meetings & commitments (`CommunicationCenter.tsx` over `GET /api/ha-interactions/interactions`, organization-wide). Record and move a meeting through `HaMeetings.tsx`; minutes are an inbox letter; the briefing book is the editor's meeting package (`IndBriefingBookStart.tsx`). **Delivered, split three ways.** The per-meeting briefing-book section status is no longer in the list. | `/api/agency-meetings` **deleted**; `/api/ha-interactions/*` mounted. `POST /interactions/:id/questions` and `GET /interactions/:id/readiness` have **no caller**. | MED | S (link each meeting to its package document; show `/readiness`) |
| "Answer agency questions; approve answers; assemble the response package" | `surfaces/HaqManager.tsx`@`0308ee257^` over `/api/haq-manager` | `AgencyResponses.tsx` over `c2c/agency-responses.ts`: signed approval, author cannot approve, package only when every answer is signed. **Delivered, improved.** `haq-manager` is now a locked view of the inbox. | `/api/haq-manager` **deleted** | LOW | — |
| "Commitments: record, flip status" | `CommunicationCenter.tsx`@`4c605b99f^`; `/api/c2c/commitments`@`7bc96a3e1^` | `CommitmentFulfilment.tsx` (signed for PMR, PMC and REMS) calls both `fulfilment-options` and `fulfill` through `fulfilBase` (`CommitmentFulfilment.tsx:372`). The model extraction of commitments was not carried (Rule 2). **Delivered.** Only `POST /api/ha-interactions/commitments/:id/milestones` has no caller. | mounted | LOW | S |

### 2.6 Audit trail / Part 11

| Capability | Where it was | What is there now | Server route | Value | Effort |
|---|---|---|---|---|---|
| "Part 11 console: both audit-chain verdicts (audit_logs ledger and audit_events chain)" | `surfaces/Part11Console.tsx`@`66efa6179^` | `AuditEventChain.tsx` banner in Audit trail (`AdminSurfaces.tsx` `AuditTrail`), plus AnA facts. **Delivered.** | `GET /api/part11/audit-trail/chain-integrity` mounted, called | LOW | — |
| "Part 11 clause compliance status, SOC 2 controls" | `Part11Console.tsx`@`41c02467a^` | Nothing. The rows were constants. | `/compliance-status`, `/soc2/*` **deleted** | MED as a need, but nothing real existed | L (needs a real assessment) |
| "Verify a signature's manifestation / list signatures on a record / see validation (IQ/OQ/PQ) records / seal integrity" | never on screen | Nothing | `GET /api/part11/signatures/by-target`, `/signatures/:id/manifest`, `POST /authority-check`, `GET /validation`, `GET /audit-trail/seal-integrity`: mounted, never-gated, **no caller** | MED: an auditor asks for a signature manifest | S-M |

### 2.7 Present in the tree but locked in production (launch scope)

None of these was deleted. Each renders only where `LAUNCH_SCOPE_ENFORCE=off` (the default outside `NODE_ENV=production`). If the founder's demo ran a production build, every one was locked or absent.

| Surface id | Component | In these areas | Locked by |
|---|---|---|---|
| `ectd-coauthor` | `EctdCoauthor.tsx` | Submission | CPO 2026-10-08 |
| `template-library` | `TemplateLibrary.tsx` | Authoring | CPO 2026-10-08 |
| `regulatory-workspace` | `BiopharmaProject.tsx` | Authoring | CPO 2026-10-08 |
| `authoring-engine`, `batch-draft`, `doc-journey` | `AuthoringEngine.tsx`, `BatchDraft.tsx`, `DocJourney.tsx` | Authoring | not in `LAUNCH_APPS` |
| `submission-twin` | `SubmissionTwin.tsx` | Submission | not listed |
| `shadow-review` (standalone) | `ShadowReview.tsx` | Submission (the Submission Center workspace of the same name is in scope) | not listed |
| `orchestration`, `inconsistency` | `Orchestration.tsx`, `Inconsistency.tsx` | Submission | P-36 note in `launch-scope.ts` |
| `nda-cockpit`, `maa-cockpit` | `NdaCockpit.tsx`, `MaaCockpit.tsx` | Submission | not listed |
| `haq-manager` | `HaqManager.tsx` | Communication | P-32 |
| `csr-workflow`, `investigator-brochure`, `safety-narrative` | `BiopharmaProject.tsx`, `InvestigatorBrochure.tsx`, `SafetyNarrative.tsx` | Authoring | not listed |
| `etmf` | `Etmf.tsx` (Vault's "Inspection readiness" door) | Vault | not listed |
| `decision-lineage`, `source-tracer`, `evidence-search` | present | Authoring / audit | not listed |

Checked with `LAUNCH_SURFACE_IDS` from `shared/constants/launch-scope.ts`. In scope are `vault`, `document-authoring`, `review`, `submission-center`, `ectd-compile`, `gateway-transmittals`, `ind-checklist`, `dispatch-readiness`, `communication-center`, `audit-trail` and `compliance-reports`.

---
## 3. Server capability in these areas that nothing in `client/src` calls

"Launch verdict" is what `launchScopeApiVerdict` (`server/services/entitlements/launch-scope-api.ts:120`) answers for the path today:
- `launch`: served;
- `out-of-scope`: refused 403 in production;
- `unmapped`: no surface claims it, so production refuses it (`LAUNCH_SCOPE_API_UNATTRIBUTED` unset means enforce);
- `never-gated`: always served.

Reaching an `unmapped` route needs a claim in `shared/constants/ui-surface-registry.ts` as well as a screen.

### 3.1 Checked by hand (the token was grepped across `client/src` with tests excluded; zero hits)

**IND lifecycle and forms** (`/api/ind-lifecycle`, mounted by `server/bootstrap/register-ind-lifecycle-routes.ts:31` → `server/routes/ind-lifecycle.routes.ts:35-40`):

The client calls only `amendment-plan`, `amendment/file`, `annual-report`(`/file`, `/pdf`), `clock`, `cover-letter`(`/pdf`), `loa`(`/pdf`) and `right-of-reference`(`/pdf`). The `ind-checklist` claim (`ui-surface-registry.ts`, `apiPrefixes`) allow-lists exactly those, so every route below is **unmapped, refused in production**.

| Route | Handler | What it does |
|---|---|---|
| `GET /sequence/:seqId/validate` | `ind-lifecycle/sequence.routes.ts:99` | Validates a sequence from its stored type and leaves (`filingTypeForSequence`) |
| `POST /sequence/:seqId/dispatch-gate` | `sequence.routes.ts:125` | Evaluates the dispatch gate for a sequence |
| `POST /sequence/:seqId/dispatch-gate/snapshot` | `sequence.routes.ts:139` | Evaluates the gate **and persists an auditable readiness snapshot** |
| `GET /sequence/:seqId/snapshots` | `sequence.routes.ts:157` | Lists a sequence's readiness snapshots, newest first |
| `GET /sequence/:currentId/diff` (+ `/diff/pdf`) | `sequence.routes.ts:173`, `:190` | **What changed versus the previous sequence**, leaf by leaf, as JSON or PDF. Named in CLAUDE.md Rule 3. |
| `GET /sequence/:seqId/manifest` (+ `/manifest/pdf`) | `sequence.routes.ts:207`, `:220` | **Package manifest for QC**: every leaf grouped by module, with checksums. Named in Rule 3. |
| `GET /portfolio`, `/portfolio/drift`, `/portfolio/drift/csv` | `ind-lifecycle/submission.routes.ts:69`, `:109`, `:120` | The organization's IND portfolio, and an org-wide drift sweep (CSV is an inspection artifact) |
| `GET /submission/:id/overview`; `POST /submission/:id/dashboard`, `/cockpit`, `/drift` | `submission.routes.ts:137`, `:154`, `:182`, `:222` | Per-IND roll-ups: counts, latest sequence, timeline, prioritized action items, every sequence's verdict in one call, drift from the last snapshot |
| `POST /submission/:id/cross-references`; `GET` same; `GET …/cross-reference-register`; `POST …/cross-references/:id/file-loa`; `PATCH`/`DELETE /cross-references/:id` | `ind-lifecycle/registers.routes.ts:72`, `:101`, `:114`, `:133`, `:192`, `:218` | **DMF / IND / NDA / BLA cross-reference register with LOA-coverage QC**, and filing an LOA |
| `POST`/`GET /submission/:id/annual-reports`, `GET /annual-reports/:id`, `GET …/annual-reports/overdue` | `registers.routes.ts:318`, `:340`, `:353`, `:368` | Tracked annual reports (21 CFR 312.33, due within 60 days), with overdue detection |
| `POST`/`GET /submission/:id/amendments`, `GET /amendments/:id` | `registers.routes.ts:388`, `:409`, `:422` | Tracked protocol and information amendments with changed documents |
| `POST`/`GET /submission/:id/safety-reports`, `GET …/overdue`, `GET /safety-reports/:id` | `registers.routes.ts:240`, `:270`, `:298`, `:283` | Tracked IND safety reports with deadlines (`/safety-reports/:id` is out-of-scope) |
| `POST`/`GET /submission/:id/icsr-transmissions`, `POST /icsr-transmissions/:id/transmit`, `/acknowledge` | `registers.routes.ts:466`, `:496`, `:519`, `:534` | E2B(R3) ICSR transmission and ACK (out-of-scope: PV) |
| `POST /readiness`, `/timeline`, `/action-items`, `/sequence/validate`, `/sequence/lifecycle-validate`, `/sequence/history-audit` | `ind-lifecycle/compute.routes.ts:27`, `:52`, `:89`, `:120`, `:138`, `:156` | Stateless engines: Module 1 readiness and safety clock, 312.40 / 312.33 milestones, prioritized actions, lifecycle-operation validation |
| `POST /authorized-persons`, `/cross-reference-register`, `/envelope`, `/annual-report/line-listing`, `/cover-letter/pdf-from-records` | `ind-lifecycle/documents.routes.ts:384`, `:414`, `:430`, `:214`, `:306` | m1.4.3 List of Authorized Persons, cross-reference register, eCTD envelope XML, annual-report line listing (CSV), a cover letter assembled from records |
| `POST /safety-report/classify`, `/safety-report/icsr`, `/safety-report/icsr/message` | `documents.routes.ts:107`, `:124`, `:155` | 312.32 classification and E2B(R3) projection (out-of-scope: PV) |
| `POST /api/ind-forms/:form/pdf-from-records`, `/:form/artifact-all`, `/1572/pdf-all`, `/3455/pdf-all` | `server/routes/ind-forms.routes.ts:650`, `:916`, `:1068`, `:1084` | A form PDF from stored records; all forms as artifacts; **one FDA 1572 per investigator**; 3455 for each investigator (launch: served) |
| `/api/fda-forms/*` (9 routes) | `server/routes/fda-forms.routes.ts:64-595` | A second FDA-forms engine: registry, applicable forms, generate one, all, "smart" or by stage. **Duplicates `/api/ind-forms` (Rule 3: converge or delete).** Launch: served |

**eCTD and submissions:**

| Route | Handler | What it does | Verdict |
|---|---|---|---|
| `/api/ectd-submissions/*` (prepare, documents, validate, submit, list, detail, status, amend) | `server/routes/ectd-submission-agent.routes.ts:81-196` | A whole eCTD submission agent beside Submission Center (Rule 3 duplicate) | unmapped |
| `/api/ectd-documents/*` (CRUD, meta/structure, classify, extract) | `server/routes/ectd-documents.ts:53-485` | eCTD document store for the locked co-author | unmapped |
| `POST /api/coauthor/documents/:id/compile`; `GET`/`POST /api/coauthor/sessions`; `GET /api/coauthor/templates` | `server/routes/coauthor.ts:853`, `:62`, `:87`, `:1076` | Co-author compile, sessions, templates (screen locked) | launch / out-of-scope |
| `POST /api/ectd/export/validate/preflight` | `server/routes/ectd-export.ts:1122` | Preflight of an export bundle | launch |
| `POST /api/ectd/v4/forward-compat` (and `/v4/validate`) | `server/routes/ectd-v4.ts:185` | v3.2.2 → v4.0 conversion preview; v4 validation | out-of-scope |
| `/api/submission-ops/packages/*` (CRUD, sections, artifact-section-map, milestones, readiness(-history), publish, regulatory-identifiers, assemble, preflight) | `server/routes/submission-ops.ts` (36 routes) | The package model whose only screen was Gateway transmittals' package picker (removed by `8b75e6b5b`) and the device workbench (removed by `776d9da46`) | launch for packages; **unmapped** for blockers, policies, workload, hotspots, automation, digests and command-center |
| `POST /api/mdx/gateways/:region/:gateway/transmit`, `GET /transmit-independence`, `PATCH /findings/:id/resolve` | `server/routes/mdx-submission-gateway.ts:343`, `:173`, `:700` | Package transmit (signed); transmit independence; resolving a gateway finding | **out-of-scope** |
| `GET /api/submissions/sequences/:id/pathway-readiness`, `/technical-file` | `server/routes/submissions.ts:1645`, `:1686` | Deterministic pathway readiness; technical-file gap map (device) | launch |
| `POST /api/submissions/:id/plan`, `/:id/sections/generate` | `submissions.ts:1274`, `:1606` | AI planner; section generation over SSE (check against Rule 2 before reaching) | launch |
| Reference endpoints: `/api/submissions/capabilities`, `validation-rules`, `market-specs/:id/validate`, `document-templates`, `requirements`, `change-categories(/classify)`, `device/*` (classify, reviewer-checklist, biocompatibility, software/classify, blueprint, global-strategy, timeline, udi/validate, electrical-safety, sterilization, labeling, cer assess-stored), `regulatory-capabilities` | `submissions.ts:352-1007` | Deterministic regulatory reference and classification engines (about 25 routes). Some are read by AnA tools. | launch |
| `POST /api/submission-orchestrator/m2/nonclinical`, `/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate`, `/validate/hardened`, `/runs/:id/regenerate` | `server/routes/submission-orchestrator.ts:904-1092` | Module 2 builders, CSR §10–12 tabulation, hardened validation | unmapped / launch |
| `POST /api/authoring-pdf/m2-summary/pdf`, `/m2-summary/qc`, `/m4-nonclinical/qc`, `/m5-clinical/qc`, `/ctd-readiness` | `server/routes/authoring-pdf.routes.ts:36-124` | Module 2 PDF leaf; M2 / M4 / M5 QC verdicts; CTD readiness QC report | unmapped |
| `POST /api/submission-readiness/assess`, `GET /pathways` | `server/routes/submission-readiness.ts:22`, `:58` | The "capstone scorecard" readiness twin | out-of-scope |
| `/api/regulatory-submissions/*` (projects, sequences, modules, granules) | `server/routes/regulatorySubmissions.ts:186-419` | Legacy submission spine | unmapped |
| `/api/ind/applications/*`; `/api/ind-generation/*` | `server/routes/ind.ts:80-436`; `server/routes/ind-generation.ts:207-404` | Legacy IND application store and AI section generator | unmapped |

**Authoring and review:**

| Route | Handler | What it does | Verdict |
|---|---|---|---|
| `/api/authoring-actions/*` (29 routes: resume-last-section, promotion-blockers, compare-versions, promote-to-review, mark-submission-ready, correction-draft, harmonize-sections, resolution-changelog, section-evidence, cross-section-consistency, section-expectations, body-aware-gaps, dossier-preflight, section-preflight, section-context, decision confirm, authority-map, the six contradiction-* routes, project-resolution-status, seed-overlay-rules) | `server/routes/authoring-actions.ts:323-3581` | "Wave 1" governed authoring actions. Only `module-preflight`, `decisions` and `decision-context` are called. Several use a rewrite model, so check Rule 2 before reaching them. `explain-contradiction-resolution` is "structured, no LLM". | **unmapped** (except 3) |
| `POST`/`DELETE /api/authoring/sections/:id/tokens`, `GET` tokens, `POST /sections/:id/cite` | `server/routes/authoring.router.ts:946`, `:985`, `:6029`, `:2747` | Citation tokens (the editor uses `cite-source` instead: a duplicate) | launch |
| `GET /api/authoring/docs/:id/frozen`, `POST /send-to-packager`, `POST /apply-template`, `POST /submit`, `GET /workflow`, `POST /import/docx`, `DELETE /export-history/:id` | `authoring.router.ts:5855`, `:5959`, `:6448`, `:7268`, `:7300`, `:8946`, `:6276` | Frozen snapshot read; send to packager; apply a template to a document; the older approval-chain submit and its status; DOCX import | launch |
| Governed-artifact review on `/api/concept2cure/projects/:id/artifacts/:id/…`: `comments` (POST, GET, resolve), `reviewers` (POST, GET, DELETE, remind), `reviews/submit`, `reviews/status`, `signatures`, `snapshots`, `provenance`, `verify-integrity`, `rollback`, `ctd-section`, `placement`; plus `dossier-metrics`, `vault/register-artifact`, `projects/all/artifacts-summary` | `server/routes/c2c/artifacts.ts:378-4397` | **A complete artifact review system** (reviewer assignment with due date, reminders, approve / request changes / reject, quorum), provenance, integrity verification and rollback. The client calls only `/versions`, `/audit-report`, `/status` and `/review-record/export`. It overlaps the RR5 review route (Rule 3: converge). | launch (most) |
| `PATCH`/`DELETE /api/concept2cure/review-comments/:id`; `GET …/reviews/project-queue`; `GET …/review-pulse` | `server/routes/c2c/reviews.ts:1068`, `:1082`, `:1888`, `:2044` | Edit and delete a comment; a project-level review queue; a review pulse | unmapped / launch |
| `/api/audit-services/*` (15 routes: figures, export/pdf, traceability map, click-through and report, keywords, extraction queue, confidence, claim verification) | `server/routes/audit-services.ts:75-514` | Sentence-to-source traceability report, claim verification against evidence, keyword consistency | unmapped |

**Communication:**

| Route | Handler | What it does | Verdict |
|---|---|---|---|
| `/api/regulatory-correspondence/*` (all 13: parser/health, submissions CRUD and state, correspondence/intake, correspondence list and detail, issues/:id/review, response-packages, timeline, mailbox-connections GET/POST, analytics/deficiency-patterns) | `server/routes/regulatory-correspondence.ts:206-1097`; parser `server/services/regulatory-correspondence/issue-parser.ts` | Letter intake → **deterministic deficiency itemization** (device taxonomy, `heuristic_v2`, human review required) → issue review → response package; mailbox intake; deficiency analytics. Last client caller removed by `e3a2d0475` (2026-10-29). | launch |
| `POST /api/ha-interactions/interactions/:id/questions`, `GET /interactions/:id/readiness`, `POST /commitments/:id/milestones` | `server/routes/ha-interactions.ts:232`, `:244`, `:316` | Questions for a meeting, a meeting's readiness, commitment milestones | launch |
| `/api/lifecycle/obligations*`, `/api/lifecycle/calendar` | `server/routes/lifecycle.ts:100-154` | Lifecycle obligations and calendar (its tables are on no applier; P-39 4b deferred) | unmapped |

**Audit and Part 11:**

| Route | Handler | What it does | Verdict |
|---|---|---|---|
| `GET /api/part11/signatures/by-target`, `/signatures/:id/manifest` | `server/routes/part11-compliance.ts:384`, `:471` | The signatures on a record, and **a signature's §11.50 manifestation** as captured at signing | never-gated |
| `POST /api/part11/authority-check`, `GET /validation`, `GET /audit-trail/seal-integrity` | `part11-compliance.ts:1019`, `:1063`, `:1140` | Authority check; IQ/OQ/PQ records; seal-anchor integrity | never-gated |
| `GET /api/audit/logs`, `/api/audit-logs`, `POST /api/audit/chain-monitor/check` | `server/routes/audit-trail-routes.ts:238`, `:260`, `:811` | Legacy log reads; an on-demand chain integrity check | never-gated / unmapped |

**Not mounted at all:** `server/routes/submissionCenter.routes.ts` (deliberately unmounted with `void submissionCenterRoutes`, `server/bootstrap/register-governance-routes.ts:55-69`: no tenant column, and nothing called it).

### 3.2 Appendix: machine scan of uncalled routes

See the end of this file. It lists 307 routes over Vault, Authoring, Submission, Communication and Audit route files, with `file:line`, method, full path, launch verdict and the handler's nearest comment.

**Known false negatives.** These were removed by hand after checking, because the client builds their paths with helpers:
- `project-vault` folder rename and move (`VaultFolderEdit.tsx:38`), catalog confirm and correct (`VaultCatalogRecord.tsx:56`), annotation replies, resolve and retract (`VaultAnnotations.tsx:184`);
- commitment `fulfil` and `fulfilment-options` (`CommitmentFulfilment.tsx:372`);
- `/api/submissions/sequences/:id/freeze` and `/dispatch` (`SubmissionCenter.tsx:1112`).

Treat any appendix row whose last segment the client could build dynamically as "verify before acting". The `ivd-lifecycle.ts` file (48 uncalled routes, device IVD) is counted but not listed.

---

## 4. Recommendation: restore order, as a paying customer would rank it

The ranking follows what an RA lead at a sponsor or device maker loses most often in a working week, and what embarrasses in a demo. **Do not revert the fold commits whole.** Each one:
- amends `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` and sometimes `migrations/20260814j_*` in place (Rule 1), so a revert re-advertises retired catalog rows and fails the catalog contract tests;
- deletes or narrows server routes and registry claims, so a revert puts back routes that production refuses;
- has 11 to 66 of its files changed since (counted per commit: `8b192f1e7` 66, `b9975a914` 45, `b9de04c62` 44, `776d9da46` 32, `302d632db` 17, `66efa6179` 19, `508b2b7a8` 11).

And in most cases the fold target already renders the outcome (§2). Restore by re-adding the component, door or claim.

| # | Restore | Why a customer ranks it here | How | Effort |
|---|---|---|---|---|
| 1 | **Make the built screens findable.** (a) The features catalog visible to every member, not only org admins (`Shell.tsx:683`, `isOrgAdmin` guard added by `d97388005`). (b) Doors from Submission Center's header to Gateway transmittals and Submission Readiness. (c) A "Dossier" door on the project page. (d) Promote Versions, Signatures and Send for review out of the editor's More menu. | Everything here exists and works; in a demo it looks absent. Nothing to rebuild. | Small edits in `Shell.tsx`, `SubmissionCenter.tsx` header actions, `ProjectHome.tsx`, `editor/DocumentWorkbench.tsx:4944-4995`. No revert. | S |
| 2 | **Demo seed: a completed review before approval** (P-95, `33c3e4de9`). | Without it, "Approve" refuses 409 on every seeded document in a live demo. | Extend the demo seed (`scripts/seed/ga-demo.d/*`, made to finish by `c5170db97`) to run one RR5 review round with a second seeded reviewer. Do **not** revert `33c3e4de9` (founder decision P-95). | S |
| 3 | **IND safety reports (21 CFR 312.32).** | A legal 7- and 15-day obligation for every IND sponsor; competitors show it. | Founder lifts P-32 for this card; then the four steps in `tests/fixtures/withheld/indSafetyReportCard.ts`'s header (move three `/api/ind-lifecycle/safety-report*` prefixes from `pharmacovigilance` to `ind-checklist`, clear `withheld`, wire it in `IndLifecycle.tsx`, flip the tests). Bytes and tests are intact. | S (plus a decision) |
| 4 | **Itemize an agency letter's deficiencies** from the project inbox, through the existing deterministic parser. | FDA AI and deficiency letters are the RA team's most time-critical work; today questions are typed by hand. | Reach `server/services/regulatory-correspondence/issue-parser.ts` from `AgencyInbox.tsx` letter logging, proposing questions that a person confirms into `agency_communication_questions`. Converge `/api/regulatory-correspondence` onto the project inbox, or retire it (Rule 3). Do not revert `e3a2d0475`: the store it read was empty. | M |
| 5 | **Sequence QC: what changed since the last sequence, and the package manifest with checksums** (`/api/ind-lifecycle/sequence/:id/diff`, `/manifest` and their PDFs), plus readiness snapshots. | Every publisher does this QC before dispatch; CLAUDE.md Rule 3 already names it as built and unreached. | Add the two panels to eCTD Compile's result or the Dispatch tab (`SubmissionSeqWorkspaces.tsx`). Add exact claims for `/api/ind-lifecycle/sequence` to `ind-checklist` or `submission-center` in `ui-surface-registry.ts`, or production refuses them (unmapped). | M |
| 6 | **Cross-reference / LOA register, annual-report, amendment and safety-report trackers** (`registers.routes.ts`). | IND maintenance work after the original sequence. | Reach from the IND screen (`IndLifecycle.tsx`) with claims, as in #5. | M |
| 7 | **Device and package transmit** (non-sequence packages, 510(k) eSTAR by K-number). | A device customer cannot send anything from the product today. | Founder decision on FILING_SPINE F12 ("one transmit path"). Then either give tracked device filings a transmit act on `DeviceFilings.tsx` that calls the same gateway layer, or re-add the package panel from `git show 8b75e6b5b^:client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx` and re-claim `POST /api/mdx/gateways/:region/:gateway/transmit` on `gateway-transmittals`. **Do not revert `8b75e6b5b` whole**: 14 of its 15 files changed since, and it also carried the IND "Forms and letters" door. | M |
| 8 | **The conversation's document card** (outline, per-section "Ask AnA to draft", File to vault, Send for review). | The AnA → canvas → editor → vault path is the product's headline demo. | **`git revert 5008143ab` is safe whole**: 21 files, 5 changed since, no migrations, no deletions; CSS and tests revert with it. Re-run the gate in `docs/design/ANA_DOCUMENT_CANVAS.md`. | S |
| 9 | **Unlock built screens held by launch scope**: Template library, Submission twin, NDA cockpit, Doc journey. | Visible value, already built. | Founder scope decision per screen: add the surface id to `LAUNCH_APPS` in `shared/constants/launch-scope.ts` and move its claims. For a demo only, run with `LAUNCH_SCOPE_ENFORCE=off` (dev default). | S each |
| 10 | Portfolio blocker list (device), meeting readiness, signature-manifest viewer, artifact provenance and integrity viewer. | Useful, lower frequency. | Reach the existing routes (§3.1) with claims. | M |
| — | **Leave as folded:** Artifacts center, device vault, ectd-publishing, Part 11 console, Dossier/DossierMap, FilingsCatalog, HAQ Manager, Agency Meetings, device-submission, MDX TemplatesSurface, briefing-book assembler, ESG SFTP. | The target delivers the outcome; the old screens carried fabricated or unbacked parts (constant Part 11 rows, "Pass" on blockers, chat-prompt Download and Preview, unsigned HAQ approvals). | None. | — |
| — | **Converge or delete (Rule 3), do not reach as they are:** `/api/fda-forms/*` (duplicates `/api/ind-forms`), `/api/ectd-submissions/*` (duplicates Submission Center), the governed-artifact review in `c2c/artifacts.ts` (duplicates the RR5 review route), the citation `tokens` and `cite` routes (duplicate `cite-source`), `/api/regulatory-submissions`, `/api/ind/applications`, `/api/ind-generation`. | Two engines for one job. | Decide which is canonical and delete the other. | M |

**Commits safe to revert whole:**
- `5008143ab`: restores function (#8).
- `9273b055b` and `f52cc3be2`: mechanically safe (2 and 3 of their files changed since, no migrations), but they restore no function. Reverting `9273b055b` brings back a ribbon that overflowed at 1440 px.

**Not safe whole:** `8b75e6b5b`, `0308ee257`, `c50f8810e`, `d97388005`, `8b192f1e7`, `b9975a914`, `37f2ed240`, `b9de04c62`, `302d632db`, `66efa6179`, `e3a2d0475`, `5ab665f63`, `508b2b7a8`, `9e73fad98`, `7bc96a3e1`, `776d9da46`, `041880cbd`, `2e4a9fe67`, `b6a46499f`, `c023b17ae`, `a66c04fa5`, `33c3e4de9`, `edd225c02`, `67d96c060`. Each one either:
- touches catalog migrations;
- deletes server routes or narrows claims;
- has 5 to 114 of its files changed since; or
- encodes a founder decision (P-32, P-36, P-61, P-93, P-95).

---

## Appendix: machine scan, routes with no `client/src` caller (Vault, Authoring, Submission, Communication, Audit)

`file:line` is under `server/`. Verdict as in §3. The description is the handler's nearest preceding comment, verbatim and truncated. Rows not marked in §3.1 were not checked by hand.

| Handler | Route | Launch verdict | Handler comment |
|---|---|---|---|
| `routes/audit-services.ts:75` | POST `/api/audit-services/figures/generate` | unmapped | Generate a figure from data + specification. |
| `routes/audit-services.ts:107` | POST `/api/audit-services/figures/auto-insert` | unmapped | Auto-detect and insert appropriate figures into a document. |
| `routes/audit-services.ts:135` | POST `/api/audit-services/export/pdf` | unmapped | Generate a PDF from a project/document. |
| `routes/audit-services.ts:192` | POST `/api/audit-services/traceability/map` | unmapped | Map sentences in a document to their source evidence. |
| `routes/audit-services.ts:231` | POST `/api/audit-services/traceability/click-through` | unmapped | Resolve a click at a character offset to source evidence. |
| `routes/audit-services.ts:262` | POST `/api/audit-services/traceability/report` | unmapped | Generate a full traceability report for a document. |
| `routes/audit-services.ts:295` | POST `/api/audit-services/keywords/extract` | unmapped | Extract structured keywords from a document. |
| `routes/audit-services.ts:317` | POST `/api/audit-services/keywords/consistency` | unmapped | Check keyword consistency across multiple documents. |
| `routes/audit-services.ts:365` | POST `/api/audit-services/extraction/queue` | unmapped | bug being latent was the only thing preventing it. |
| `routes/audit-services.ts:386` | GET `/api/audit-services/extraction/status/:id` | unmapped | Check extraction job status. |
| `routes/audit-services.ts:414` | GET `/api/audit-services/extraction/project/:id` | unmapped | List all extraction jobs for a project. |
| `routes/audit-services.ts:441` | POST `/api/audit-services/confidence/compute` | unmapped | Auto-compute confidence score for an evidence object. |
| `routes/audit-services.ts:464` | POST `/api/audit-services/confidence/batch` | unmapped | Batch-compute confidence scores for all evidence in org. |
| `routes/audit-services.ts:486` | POST `/api/audit-services/verification/verify-claim` | unmapped | Verify a single claim against source evidence. |
| `routes/audit-services.ts:514` | POST `/api/audit-services/verification/batch-verify` | unmapped | Batch-verify all claims in a document. |
| `routes/audit-trail-routes.ts:238` | GET `/api/audit/logs` | never-gated | GET /api/audit/logs  paginated audit logs |
| `routes/audit-trail-routes.ts:260` | GET `/api/audit-logs` | unmapped | GET /api/audit-logs  legacy alias with page/pageSize |
| `routes/audit-trail-routes.ts:811` | POST `/api/audit/chain-monitor/check` | never-gated | Trigger an on-demand chain integrity check. |
| `routes/audit-trail-routes.ts:828` | POST `/api/audit/bulk-delete` | never-gated | Bulk-delete is disabled. Audit events cannot be modified or deleted. |
| `routes/authoring-actions.ts:323` | GET `/api/authoring-actions/resume-last-section/:id` | unmapped |  |
| `routes/authoring-actions.ts:366` | GET `/api/authoring-actions/promotion-blockers/:id` | unmapped |  Wave 1 Action 3: Explain Promotion Blockers  |
| `routes/authoring-actions.ts:504` | GET `/api/authoring-actions/compare-versions/:id/:id` | unmapped |  Wave 1 Action 4: Compare Against Last Approved Version  |
| `routes/authoring-actions.ts:592` | POST `/api/authoring-actions/promote-to-review` | unmapped |  Wave 1 Action 5: Promote to Review (governed)  |
| `routes/authoring-actions.ts:931` | POST `/api/authoring-actions/mark-submission-ready` | unmapped |  Promotion Lifecycle: mark-submission-ready (locked �� submission_ready)  |
| `routes/authoring-actions.ts:1161` | POST `/api/authoring-actions/correction-draft` | unmapped | ACTION 6: Governed correction draft  uses rewrite-coordinator |
| `routes/authoring-actions.ts:1261` | POST `/api/authoring-actions/harmonize-sections` | unmapped | ACTION 7: Harmonize with linked sections  uses harmonize-engine |
| `routes/authoring-actions.ts:1426` | POST `/api/authoring-actions/resolution-changelog` | unmapped | ACTION 8: Resolution changelog  uses ana-resolution-support + resolution-planner |
| `routes/authoring-actions.ts:1518` | GET `/api/authoring-actions/section-evidence/:id/:id` | unmapped | ACTION 10: Section evidence  uses EvidenceManagementService + gap analysis |
| `routes/authoring-actions.ts:1638` | POST `/api/authoring-actions/cross-section-consistency` | unmapped | ACTION 11: Cross-section consistency check  combines harmonize + contradiction + linked sections |
| `routes/authoring-actions.ts:1810` | GET `/api/authoring-actions/section-expectations/:id/:id/:id` | unmapped | Body-aware section expectations endpoint |
| `routes/authoring-actions.ts:1859` | POST `/api/authoring-actions/body-aware-gaps` | unmapped | Body-aware gap detection |
| `routes/authoring-actions.ts:1980` | POST `/api/authoring-actions/module-preflight` | launch | Aggregates section preflights for all sections in a module. |
| `routes/authoring-actions.ts:2275` | POST `/api/authoring-actions/dossier-preflight` | unmapped | Aggregates module preflights across all modules in a project/dossier. |
| `routes/authoring-actions.ts:2527` | POST `/api/authoring-actions/section-preflight` | unmapped | Returns structured preflight with overall verdict + recommended actions. |
| `routes/authoring-actions.ts:2812` | GET `/api/authoring-actions/section-context/:id/:id` | unmapped |  Section-level readiness + contradiction data feed  |
| `routes/authoring-actions.ts:2917` | GET `/api/authoring-actions/decisions/:id` | launch | Retrieve formal decision records for a project, optionally filtered. |
| `routes/authoring-actions.ts:2975` | GET `/api/authoring-actions/decision/:id` | unmapped | Retrieve a single decision + its receipt. |
| `routes/authoring-actions.ts:3014` | POST `/api/authoring-actions/decision/:id/confirm` | unmapped | Confirm or reject a recommended decision. |
| `routes/authoring-actions.ts:3064` | GET `/api/authoring-actions/decision-context/:id` | launch | Get decision context for AnA explanation grounding. |
| `routes/authoring-actions.ts:3125` | GET `/api/authoring-actions/authority-map` | unmapped | Return the full authority boundary map for UI display. |
| `routes/authoring-actions.ts:3155` | POST `/api/authoring-actions/contradiction-scan` | unmapped | and regulator/body overlay context. |
| `routes/authoring-actions.ts:3277` | POST `/api/authoring-actions/contradiction-consequence` | unmapped | Execute a consequence path for a contradiction finding. |
| `routes/authoring-actions.ts:3338` | GET `/api/authoring-actions/contradiction-context/:id` | unmapped | Includes contradiction findings, overlay state, decision links. |
| `routes/authoring-actions.ts:3397` | POST `/api/authoring-actions/plan-contradiction-resolution` | unmapped | Returns authority check, recommended path, affected objects. |
| `routes/authoring-actions.ts:3446` | POST `/api/authoring-actions/execute-contradiction-resolution` | unmapped | Creates decision record + receipt. Triggers preflight refresh. |
| `routes/authoring-actions.ts:3505` | POST `/api/authoring-actions/explain-contradiction-resolution` | unmapped | Explain a contradiction resolution plan (structured, no LLM). |
| `routes/authoring-actions.ts:3547` | GET `/api/authoring-actions/project-resolution-status/:id` | unmapped | Get resolution status for a project (plans + bundles summary). |
| `routes/authoring-actions.ts:3581` | POST `/api/authoring-actions/seed-overlay-rules` | unmapped | Idempotent  safe to call multiple times. |
| `routes/authoring-pdf.routes.ts:36` | POST `/api/authoring-pdf/m2-summary/pdf` | unmapped | Render a built M2 CTD summary to a navigable PDF leaf. Body: an M2Summary. */ |
| `routes/authoring-pdf.routes.ts:70` | POST `/api/authoring-pdf/m2-summary/qc` | unmapped | SubmissionModule2Qc.tsx in Submission Center. |
| `routes/authoring-pdf.routes.ts:80` | POST `/api/authoring-pdf/m4-nonclinical/qc` | unmapped | Returns the verdict + findings (coverage, section status, CTD placement, GLP). |
| `routes/authoring-pdf.routes.ts:104` | POST `/api/authoring-pdf/m5-clinical/qc` | unmapped | (phase coverage, required-section status, CTD 5.3.x placement, structure). |
| `routes/authoring-pdf.routes.ts:124` | POST `/api/authoring-pdf/ctd-readiness` | unmapped | JSON by default; `?format=pdf` returns the same explicitly scoped QC report. |
| `routes/authoring.router.ts:946` | POST `/api/authoring/sections/:id/tokens` | launch | ============= Token Operations ============= |
| `routes/authoring.router.ts:985` | DELETE `/api/authoring/sections/:id/tokens/:id` | launch | DELETE /api/authoring/sections/:sectionId/tokens/:citeId - Delete a token |
| `routes/authoring.router.ts:2747` | POST `/api/authoring/sections/:id/cite` | launch | POST /api/authoring/sections/:sectionId/cite - Add citation |
| `routes/authoring.router.ts:5855` | GET `/api/authoring/docs/:id/frozen` | launch | GET /api/authoring/docs/:docId/frozen - Get frozen document snapshot |
| `routes/authoring.router.ts:5959` | POST `/api/authoring/docs/:id/send-to-packager` | launch |  |
| `routes/authoring.router.ts:6029` | GET `/api/authoring/sections/:id/tokens` | launch | GET /api/authoring/sections/:sectionId/tokens - Get tokens (citations) for a section |
| `routes/authoring.router.ts:6276` | DELETE `/api/authoring/export-history/:id` | launch | asked and writes nothing. |
| `routes/authoring.router.ts:6448` | POST `/api/authoring/docs/:id/apply-template` | launch | POST /api/authoring/docs/:docId/apply-template - Apply template to document |
| `routes/authoring.router.ts:7268` | POST `/api/authoring/docs/:id/submit` | launch | POST /api/authoring/docs/:docId/submit - Submit for review (the approval chain). |
| `routes/authoring.router.ts:7300` | GET `/api/authoring/docs/:id/workflow` | launch | GET /api/authoring/docs/:docId/workflow - Get current workflow status |
| `routes/authoring.router.ts:8946` | POST `/api/authoring/import/docx` | launch |  |
| `routes/biopharma/submissions.ts:66` | GET `/api/biopharma/submissions/plan` | out-of-scope | GET /plan  resolve the per-region build+submit plan for a filing. |
| `routes/biopharma/submissions.ts:86` | GET `/api/biopharma/submissions/coverage` | out-of-scope | GET /coverage  the (filing × region) build+submit coverage matrix. |
| `routes/biotech-artifacts.ts:158` | GET `/api/biotech-artifacts/catalog` | unmapped | GET /api/biotech-artifacts/catalog  list all available document types */ |
| `routes/biotech-artifacts.ts:201` | POST `/api/biotech-artifacts/ectd/cover-letter` | unmapped | POST /api/biotech-artifacts/ectd/cover-letter */ |
| `routes/biotech-artifacts.ts:219` | POST `/api/biotech-artifacts/ectd/validation-report` | unmapped | POST /api/biotech-artifacts/ectd/validation-report */ |
| `routes/biotech-artifacts.ts:240` | POST `/api/biotech-artifacts/pv/icsr` | unmapped | POST /api/biotech-artifacts/pv/icsr */ |
| `routes/biotech-artifacts.ts:281` | POST `/api/biotech-artifacts/pv/psur` | unmapped | POST /api/biotech-artifacts/pv/psur */ |
| `routes/biotech-artifacts.ts:308` | POST `/api/biotech-artifacts/pv/cioms` | unmapped | POST /api/biotech-artifacts/pv/cioms */ |
| `routes/biotech-artifacts.ts:329` | POST `/api/biotech-artifacts/pv/expedited-report` | unmapped | POST /api/biotech-artifacts/pv/expedited-report */ |
| `routes/biotech-artifacts.ts:359` | POST `/api/biotech-artifacts/clinical/protocol-synopsis` | unmapped | POST /api/biotech-artifacts/clinical/protocol-synopsis */ |
| `routes/biotech-artifacts.ts:391` | POST `/api/biotech-artifacts/clinical/monitoring-report` | unmapped | POST /api/biotech-artifacts/clinical/monitoring-report */ |
| `routes/biotech-artifacts.ts:419` | POST `/api/biotech-artifacts/clinical/deviation-report` | unmapped | POST /api/biotech-artifacts/clinical/deviation-report */ |
| `routes/biotech-artifacts.ts:452` | POST `/api/biotech-artifacts/clinical/enrollment-report` | unmapped | POST /api/biotech-artifacts/clinical/enrollment-report */ |
| `routes/c2c/artifacts.ts:378` | GET `/api/concept2cure/projects/all/artifacts-summary` | out-of-scope | gallery above lists. A check that cannot run is an error, never a zero. |
| `routes/c2c/artifacts.ts:1133` | POST `/api/concept2cure/vault/register-artifact` | unmapped | Register an artifact in the vault for governed document management. |
| `routes/c2c/artifacts.ts:1164` | PUT `/api/concept2cure/projects/:id/artifacts/:id/placement` | launch | Records a provenance event for the audit trail. |
| `routes/c2c/artifacts.ts:1569` | GET `/api/concept2cure/projects/:id/artifacts/:id/signatures` | launch | List electronic signatures for an artifact (21 CFR Part 11). |
| `routes/c2c/artifacts.ts:1615` | GET `/api/concept2cure/projects/:id/artifacts/:id/snapshots` | launch | List immutable submission/export snapshots for an artifact. |
| `routes/c2c/artifacts.ts:1679` | GET `/api/concept2cure/projects/:id/artifacts/:id/provenance` | launch | 6. Submission / Placement Context (from provenance_events where eventType = 'placement') |
| `routes/c2c/artifacts.ts:2945` | PUT `/api/concept2cure/projects/:id/artifacts/:id/ctd-section` | launch | Assign or update the CTD section placement for an artifact. |
| `routes/c2c/artifacts.ts:3090` | GET `/api/concept2cure/projects/:id/artifacts/:id/verify-integrity` | launch | Returns real verification results  no hardcoded trust. |
| `routes/c2c/artifacts.ts:3153` | POST `/api/concept2cure/projects/:id/artifacts/:id/rollback` | launch | Never mutates history  fully auditable. |
| `routes/c2c/documents.ts:253` | GET `/api/c2c/documents/by-legacy/cerv2-section/:id` | launch | established in the Day 2 backfill migration. |
| `routes/c2c/documents.ts:305` | GET `/api/c2c/documents/rule-packs` | launch |  GET /api/c2c/rule-packs  |
| `routes/c2c/reviews.ts:1068` | PATCH `/api/concept2cure/review-comments/:id` | unmapped | kept no copy of what they had said. No launch screen calls it. |
| `routes/c2c/reviews.ts:1082` | DELETE `/api/concept2cure/review-comments/:id` | unmapped | Soft-delete a comment. Only author or admin can delete. |
| `routes/c2c/reviews.ts:1888` | GET `/api/concept2cure/projects/:id/reviews/project-queue` | launch | Returns all open threads and tasks for a project, for admin/project-level overview. |
| `routes/coauthor.ts:62` | GET `/api/coauthor/sessions` | out-of-scope |  Sessions (backed by coauthor_sections table)  |
| `routes/coauthor.ts:87` | POST `/api/coauthor/sessions` | out-of-scope |  |
| `routes/coauthor.ts:853` | POST `/api/coauthor/documents/:id/compile` | launch | Compile a document into eCTD module structure |
| `routes/coauthor.ts:1076` | GET `/api/coauthor/templates` | out-of-scope |  Templates  |
| `routes/company-document-designs.ts:26` | POST `/api/client-branding/company-documents/designs/:id/publish` | launch |  |
| `routes/company-document-governance.ts:20` | GET `/api/client-branding/company-documents/permissions` | launch |  |
| `routes/company-document-governance.ts:31` | PUT `/api/client-branding/company-documents/permissions/:id` | launch |  |
| `routes/ectd-documents.ts:53` | GET `/api/ectd-documents/` | unmapped |  List  |
| `routes/ectd-documents.ts:118` | GET `/api/ectd-documents/:id` | unmapped |  Get by ID  |
| `routes/ectd-documents.ts:173` | POST `/api/ectd-documents/` | unmapped |  Create  |
| `routes/ectd-documents.ts:233` | PUT `/api/ectd-documents/:id` | unmapped |  Update  |
| `routes/ectd-documents.ts:330` | DELETE `/api/ectd-documents/:id` | unmapped |  Delete  |
| `routes/ectd-documents.ts:380` | GET `/api/ectd-documents/meta/structure` | unmapped |  eCTD Structure Metadata  |
| `routes/ectd-documents.ts:452` | POST `/api/ectd-documents/:id/classify` | unmapped |  |
| `routes/ectd-documents.ts:485` | POST `/api/ectd-documents/:id/extract` | unmapped |  |
| `routes/ectd-export.ts:1122` | POST `/api/ectd/export/validate/preflight` | launch |  |
| `routes/ectd-submission-agent.routes.ts:81` | POST `/api/ectd-submissions/prepare` | unmapped | POST /prepare  Create a draft submission |
| `routes/ectd-submission-agent.routes.ts:97` | POST `/api/ectd-submissions/:id/documents` | unmapped | POST /:id/documents  Add document to submission |
| `routes/ectd-submission-agent.routes.ts:116` | POST `/api/ectd-submissions/:id/validate` | unmapped | POST /:id/validate  Run pre-submission validation |
| `routes/ectd-submission-agent.routes.ts:131` | POST `/api/ectd-submissions/:id/submit` | unmapped | POST /:id/submit  Submit to agency gateway |
| `routes/ectd-submission-agent.routes.ts:146` | GET `/api/ectd-submissions/:id` | unmapped | GET /:id  Get submission detail |
| `routes/ectd-submission-agent.routes.ts:162` | GET `/api/ectd-submissions/` | unmapped | GET /  List submissions with optional filters |
| `routes/ectd-submission-agent.routes.ts:181` | GET `/api/ectd-submissions/:id/status` | unmapped | GET /:id/status  Get submission status with history |
| `routes/ectd-submission-agent.routes.ts:196` | POST `/api/ectd-submissions/:id/amend` | unmapped | POST /:id/amend  Create amendment linked to parent |
| `routes/ectd-v4.ts:185` | POST `/api/ectd/v4/forward-compat` | out-of-scope |  Preview a v3.2.2 �� v4.0 forward-compat conversion  |
| `routes/fda-forms.routes.ts:64` | GET `/api/fda-forms/registry` | launch | Get forms registry |
| `routes/fda-forms.routes.ts:88` | GET `/api/fda-forms/applicable` | launch | Unknown/absent criteria simply don't constrain (unknown program �� no matches). |
| `routes/fda-forms.routes.ts:110` | GET `/api/fda-forms/project/:id/forms` | launch | Get available FDA forms for a project |
| `routes/fda-forms.routes.ts:182` | POST `/api/fda-forms/project/:id/generate/:id` | launch | Generate a specific FDA form |
| `routes/fda-forms.routes.ts:290` | POST `/api/fda-forms/project/:id/generate-all` | launch | Generate all FDA forms for a project |
| `routes/fda-forms.routes.ts:333` | POST `/api/fda-forms/project/:id/generate-smart/:id` | launch | Generate any SMART form from registry |
| `routes/fda-forms.routes.ts:432` | POST `/api/fda-forms/project/:id/auto-generate` | launch | Auto-generate forms when workflow is updated |
| `routes/fda-forms.routes.ts:564` | GET `/api/fda-forms/project/:id/form/:id` | launch | Get a specific generated form |
| `routes/fda-forms.routes.ts:595` | POST `/api/fda-forms/project/:id/generate-stage/:id` | launch |  |
| `routes/ha-interactions.ts:232` | POST `/api/ha-interactions/interactions/:id/questions` | launch |  |
| `routes/ha-interactions.ts:244` | GET `/api/ha-interactions/interactions/:id/readiness` | launch |  |
| `routes/ha-interactions.ts:316` | POST `/api/ha-interactions/commitments/:id/milestones` | launch |  |
| `routes/ind-forms.routes.ts:1068` | POST `/api/ind-forms/1572/pdf-all` | launch | Render one 1572 PDF per investigator; returns base64-encoded PDFs as JSON. */ |
| `routes/ind-forms.routes.ts:1084` | POST `/api/ind-forms/3455/pdf-all` | launch | sponsor certifies "none" on Form 3454 instead (see POST /FDA_3454/pdf). |
| `routes/ind-generation.ts:207` | GET `/api/ind-generation/structure` | unmapped |  GET /api/ind/structure  |
| `routes/ind-generation.ts:230` | GET `/api/ind-generation/lifecycle-types` | unmapped | NDA, BLA, ISS/ISE, and post-approval supplements. |
| `routes/ind-generation.ts:251` | GET `/api/ind-generation/lifecycle-types/by-registry/:id` | unmapped | the product's catalog already offers  to its deep authoring guidance. |
| `routes/ind-generation.ts:264` | GET `/api/ind-generation/lifecycle-types/:id` | unmapped |  GET /api/ind/lifecycle-types/:id  |
| `routes/ind-generation.ts:282` | GET `/api/ind-generation/guidance/:id` | unmapped | Leaf-level CTD authoring guidance for a section code (e.g. "3.2.S.4", "2.7.4"). |
| `routes/ind-generation.ts:292` | GET `/api/ind-generation/guidance` | unmapped |  GET /api/ind/guidance  |
| `routes/ind-generation.ts:305` | GET `/api/ind-generation/device-status/:id/:id` | unmapped | Universal section status for device submissions (510K, PMA, DE_NOVO, CER, IVDR) |
| `routes/ind-generation.ts:360` | GET `/api/ind-generation/status/:id` | unmapped |  GET /api/ind/status/:projectId  |
| `routes/ind-generation.ts:404` | POST `/api/ind-generation/generate-section` | unmapped |  POST /api/ind/generate-section  |
| `routes/ind-lifecycle.routes.ts:33` | GET `/api/ind-lifecycle/openapi.json` | unmapped | (cannot drift). Authenticated discovery; no specific role required. |
| `routes/ind-lifecycle/compute.routes.ts:27` | POST `/api/ind-lifecycle/readiness` | unmapped | Module 1 forms + safety clock. Body is IndReadinessInput. |
| `routes/ind-lifecycle/compute.routes.ts:52` | POST `/api/ind-lifecycle/timeline` | unmapped | due-date milestones (21 CFR 312.40 / 312.33). Body: { receiptDate, ... }. |
| `routes/ind-lifecycle/compute.routes.ts:89` | POST `/api/ind-lifecycle/action-items` | unmapped | sequenceValidationInput?, overdueSafetyReports? }. |
| `routes/ind-lifecycle/compute.routes.ts:120` | POST `/api/ind-lifecycle/sequence/validate` | unmapped | sequence-scoped GET /sequence/:seqId/validate derives it when omitted.) |
| `routes/ind-lifecycle/compute.routes.ts:138` | POST `/api/ind-lifecycle/sequence/lifecycle-validate` | unmapped | Body: { existingSequenceTypes: string[], proposedType }. |
| `routes/ind-lifecycle/compute.routes.ts:156` | POST `/api/ind-lifecycle/sequence/history-audit` | unmapped | Body: { sequenceTypes: string[] }. |
| `routes/ind-lifecycle/documents.routes.ts:107` | POST `/api/ind-lifecycle/safety-report/classify` | out-of-scope | 21 CFR 312.32  classification only (reporting obligation + deadline). */ |
| `routes/ind-lifecycle/documents.routes.ts:124` | POST `/api/ind-lifecycle/safety-report/icsr` | out-of-scope | by default; `?format=xml` returns the escaped E2B(R3) XML projection. |
| `routes/ind-lifecycle/documents.routes.ts:155` | POST `/api/ind-lifecycle/safety-report/icsr/message` | out-of-scope | message XML. |
| `routes/ind-lifecycle/documents.routes.ts:214` | POST `/api/ind-lifecycle/annual-report/line-listing` | launch | `?format=csv` returns the line listing as an attachable CSV appendix. |
| `routes/ind-lifecycle/documents.routes.ts:306` | POST `/api/ind-lifecycle/cover-letter/pdf-from-records` | launch | tenant-scoped, assembles the letter, and returns the PDF. |
| `routes/ind-lifecycle/documents.routes.ts:384` | POST `/api/ind-lifecycle/authorized-persons` | unmapped | Assemble the m1.4.3 List of Authorized Persons model + gaps + intent. */ |
| `routes/ind-lifecycle/documents.routes.ts:414` | POST `/api/ind-lifecycle/cross-reference-register` | unmapped | LOA on file is a blocking error. |
| `routes/ind-lifecycle/documents.routes.ts:430` | POST `/api/ind-lifecycle/envelope` | unmapped | Body: EctdEnvelopeInput. Returns application/xml. |
| `routes/ind-lifecycle/registers.routes.ts:72` | POST `/api/ind-lifecycle/submission/:id/cross-references` | unmapped | Record an external dependency (DMF/IND/NDA/BLA) for a submission. */ |
| `routes/ind-lifecycle/registers.routes.ts:101` | GET `/api/ind-lifecycle/submission/:id/cross-references` | unmapped | List a submission's cross-references. */ |
| `routes/ind-lifecycle/registers.routes.ts:114` | GET `/api/ind-lifecycle/submission/:id/cross-reference-register` | unmapped | The live cross-reference register (LOA-coverage QC) computed from stored rows. */ |
| `routes/ind-lifecycle/registers.routes.ts:133` | POST `/api/ind-lifecycle/submission/:id/cross-references/:id/file-loa` | unmapped | { sequenceNumber, holderName, authorizedPartyName, signatoryName, ... }. |
| `routes/ind-lifecycle/registers.routes.ts:192` | PATCH `/api/ind-lifecycle/cross-references/:id` | unmapped | Patch a cross-reference (e.g. mark the LOA on file). */ |
| `routes/ind-lifecycle/registers.routes.ts:218` | DELETE `/api/ind-lifecycle/cross-references/:id` | unmapped | Delete a cross-reference. */ |
| `routes/ind-lifecycle/registers.routes.ts:240` | POST `/api/ind-lifecycle/submission/:id/safety-reports` | unmapped | aggregateContext?, now? }. 422 when the event is not expedited-reportable. |
| `routes/ind-lifecycle/registers.routes.ts:270` | GET `/api/ind-lifecycle/submission/:id/safety-reports` | unmapped | List a submission's safety reports. */ |
| `routes/ind-lifecycle/registers.routes.ts:283` | GET `/api/ind-lifecycle/safety-reports/:id` | out-of-scope | Fetch one tracked safety report by id (org-scoped; the id `create` returned). */ |
| `routes/ind-lifecycle/registers.routes.ts:298` | GET `/api/ind-lifecycle/submission/:id/safety-reports/overdue` | unmapped | The submission's overdue (unfiled, past-deadline) safety reports. */ |
| `routes/ind-lifecycle/registers.routes.ts:318` | POST `/api/ind-lifecycle/submission/:id/annual-reports` | unmapped | indEffectiveDate? }. The optional indEffectiveDate drives the 60-day due date. |
| `routes/ind-lifecycle/registers.routes.ts:340` | GET `/api/ind-lifecycle/submission/:id/annual-reports` | unmapped | List a submission's annual reports. */ |
| `routes/ind-lifecycle/registers.routes.ts:353` | GET `/api/ind-lifecycle/annual-reports/:id` | unmapped | Fetch one tracked annual report by id (org-scoped; the id `create` returned). */ |
| `routes/ind-lifecycle/registers.routes.ts:368` | GET `/api/ind-lifecycle/submission/:id/annual-reports/overdue` | unmapped | The submission's overdue (unfiled, past 60-day-deadline) annual reports. */ |
| `routes/ind-lifecycle/registers.routes.ts:388` | POST `/api/ind-lifecycle/submission/:id/amendments` | unmapped | changedDocuments: ChangedDocument[] }. |
| `routes/ind-lifecycle/registers.routes.ts:409` | GET `/api/ind-lifecycle/submission/:id/amendments` | unmapped | List a submission's amendments. */ |
| `routes/ind-lifecycle/registers.routes.ts:422` | GET `/api/ind-lifecycle/amendments/:id` | unmapped | Fetch one tracked amendment by id (org-scoped; the id `create` returned). */ |
| `routes/ind-lifecycle/registers.routes.ts:466` | POST `/api/ind-lifecycle/submission/:id/icsr-transmissions` | unmapped | { event, icsr?, gateway, senderId, messageNumber, receiverId?, now? }. |
| `routes/ind-lifecycle/registers.routes.ts:496` | GET `/api/ind-lifecycle/submission/:id/icsr-transmissions` | unmapped | List a submission's ICSR transmissions. */ |
| `routes/ind-lifecycle/registers.routes.ts:519` | POST `/api/ind-lifecycle/icsr-transmissions/:id/transmit` | out-of-scope | the send; 2026-09-23, MDN final pass, repair). |
| `routes/ind-lifecycle/registers.routes.ts:534` | POST `/api/ind-lifecycle/icsr-transmissions/:id/acknowledge` | out-of-scope | Record an agency acknowledgment (ACK) against a transmission. Body: { ackXml }. */ |
| `routes/ind-lifecycle/sequence.routes.ts:99` | GET `/api/ind-lifecycle/sequence/:id/validate` | unmapped | from the sequence's stored type + leaves (filingTypeForSequence). |
| `routes/ind-lifecycle/sequence.routes.ts:125` | POST `/api/ind-lifecycle/sequence/:id/dispatch-gate` | unmapped | stored type + leaves (filingTypeForSequence). |
| `routes/ind-lifecycle/sequence.routes.ts:139` | POST `/api/ind-lifecycle/sequence/:id/dispatch-gate/snapshot` | unmapped | Evaluate the dispatch gate AND persist it as an auditable snapshot. */ |
| `routes/ind-lifecycle/sequence.routes.ts:157` | GET `/api/ind-lifecycle/sequence/:id/snapshots` | unmapped | List a sequence's dispatch-readiness snapshots (newest first). */ |
| `routes/ind-lifecycle/sequence.routes.ts:173` | GET `/api/ind-lifecycle/sequence/:id/diff` | unmapped | Path: the current sequence id. |
| `routes/ind-lifecycle/sequence.routes.ts:207` | GET `/api/ind-lifecycle/sequence/:id/manifest` | unmapped | Package manifest (QC review): every leaf grouped by module, with checksums. */ |
| `routes/ind-lifecycle/submission.routes.ts:69` | GET `/api/ind-lifecycle/portfolio` | unmapped | manager. |
| `routes/ind-lifecycle/submission.routes.ts:109` | GET `/api/ind-lifecycle/portfolio/drift` | unmapped |  |
| `routes/ind-lifecycle/submission.routes.ts:120` | GET `/api/ind-lifecycle/portfolio/drift/csv` | unmapped | The org-wide drift sweep as a CSV  an attachable QA / inspection artifact. */ |
| `routes/ind-lifecycle/submission.routes.ts:137` | GET `/api/ind-lifecycle/submission/:id/overview` | unmapped | (counts by type/status, latest sequence number, dispatch/validation roll-ups). |
| `routes/ind-lifecycle/submission.routes.ts:154` | POST `/api/ind-lifecycle/submission/:id/dashboard` | unmapped | timeline + sequence validation + prioritized action items. |
| `routes/ind-lifecycle/submission.routes.ts:182` | POST `/api/ind-lifecycle/submission/:id/cockpit` | unmapped | EVERY sequence in the submission, in one call. |
| `routes/ind-lifecycle/submission.routes.ts:222` | POST `/api/ind-lifecycle/submission/:id/drift` | unmapped | has drifted from their last recorded snapshot, or that were never verified. |
| `routes/ind-master-data.routes.ts:100` | GET `/api/ind-master-data/${base}` | unmapped |  |
| `routes/ind-master-data.routes.ts:110` | POST `/api/ind-master-data/${base}` | unmapped |  |
| `routes/ind-master-data.routes.ts:120` | GET `/api/ind-master-data/${base}/:id` | unmapped |  |
| `routes/ind-master-data.routes.ts:132` | PATCH `/api/ind-master-data/${base}/:id` | unmapped |  |
| `routes/ind.ts:80` | GET `/api/ind/applications` | unmapped | Supports ?status=&limit=&offset= query parameters. |
| `routes/ind.ts:141` | GET `/api/ind/applications/:id` | unmapped | Fetch a single IND application by ID, including its sections. |
| `routes/ind.ts:186` | POST `/api/ind/applications` | unmapped | Create a new IND application draft. |
| `routes/ind.ts:219` | PUT `/api/ind/applications/:id` | unmapped | Update an existing IND application. |
| `routes/ind.ts:271` | DELETE `/api/ind/applications/:id` | unmapped |  DELETE /applications/:id  |
| `routes/ind.ts:406` | POST `/api/ind/applications/:id/analyze/:id` | unmapped | Analyze existing section content for compliance and quality. |
| `routes/ind.ts:436` | POST `/api/ind/applications/:id/followup` | unmapped | Generate a follow-up AI response for a section (revision / Q&A). |
| `routes/lifecycle.ts:100` | POST `/api/lifecycle/obligations` | unmapped |  |
| `routes/lifecycle.ts:113` | GET `/api/lifecycle/obligations` | unmapped | Best-effort: surface the obligation deadline as a central task. |
| `routes/lifecycle.ts:120` | GET `/api/lifecycle/obligations/:id/events` | unmapped |  |
| `routes/lifecycle.ts:154` | GET `/api/lifecycle/calendar` | unmapped |  |
| `routes/mdx-submission-gateway.ts:173` | GET `/api/mdx/gateways/transmit-independence` | out-of-scope | id that does not exist: nothing about it is disclosed. |
| `routes/mdx-submission-gateway.ts:343` | POST `/api/mdx/gateways/:id/:id/transmit` | out-of-scope | §11.50: the meaning the signer declares for this transmission: a release act. */ |
| `routes/mdx-submission-gateway.ts:700` | PATCH `/api/mdx/gateways/findings/:id/resolve` | out-of-scope |  PATCH /api/mdx/gateways/findings/:findingId/resolve  */ |
| `routes/part11-compliance.ts:384` | GET `/api/part11/signatures/by-target` | never-gated |  |
| `routes/part11-compliance.ts:471` | GET `/api/part11/signatures/:id/manifest` | never-gated | record. Read-only; the data is captured at signing time, this assembles it. |
| `routes/part11-compliance.ts:1019` | POST `/api/part11/authority-check` | never-gated | Verify a user's authority to perform an action |
| `routes/part11-compliance.ts:1063` | GET `/api/part11/validation` | never-gated | Get system validation records (IQ/OQ/PQ) |
| `routes/part11-compliance.ts:1140` | GET `/api/part11/audit-trail/seal-integrity` | never-gated | `head` says the verdict is the walk only. An unreadable anchor is a 500. |
| `routes/protocol-reviews.ts:220` | GET `/api/protocol-reviews/documents/:id/summary` | launch |  Read: consensus + readiness summary  |
| `routes/regulatory-correspondence.ts:206` | GET `/api/regulatory-correspondence/parser/health` | launch |  |
| `routes/regulatory-correspondence.ts:217` | POST `/api/regulatory-correspondence/submissions` | launch |  |
| `routes/regulatory-correspondence.ts:286` | GET `/api/regulatory-correspondence/submissions/:id` | launch |  |
| `routes/regulatory-correspondence.ts:303` | PATCH `/api/regulatory-correspondence/submissions/:id/state` | launch |  |
| `routes/regulatory-correspondence.ts:401` | POST `/api/regulatory-correspondence/correspondence/intake` | launch |  |
| `routes/regulatory-correspondence.ts:669` | GET `/api/regulatory-correspondence/correspondence` | launch |  |
| `routes/regulatory-correspondence.ts:698` | GET `/api/regulatory-correspondence/correspondence/:id` | launch |  |
| `routes/regulatory-correspondence.ts:791` | PATCH `/api/regulatory-correspondence/issues/:id/review` | launch |  |
| `routes/regulatory-correspondence.ts:882` | POST `/api/regulatory-correspondence/response-packages` | launch |  |
| `routes/regulatory-correspondence.ts:997` | GET `/api/regulatory-correspondence/timeline` | launch |  |
| `routes/regulatory-correspondence.ts:1021` | GET `/api/regulatory-correspondence/mailbox-connections` | launch |  |
| `routes/regulatory-correspondence.ts:1042` | POST `/api/regulatory-correspondence/mailbox-connections` | launch |  |
| `routes/regulatory-correspondence.ts:1097` | GET `/api/regulatory-correspondence/analytics/deficiency-patterns` | launch |  |
| `routes/regulatorySubmissions.ts:186` | GET `/api/regulatory-submissions/projects` | unmapped |  |
| `routes/regulatorySubmissions.ts:206` | POST `/api/regulatory-submissions/projects` | unmapped |  |
| `routes/regulatorySubmissions.ts:245` | GET `/api/regulatory-submissions/projects/:id` | unmapped |  |
| `routes/regulatorySubmissions.ts:264` | GET `/api/regulatory-submissions/projects/:id/sequences` | unmapped |  |
| `routes/regulatorySubmissions.ts:293` | POST `/api/regulatory-submissions/projects/:id/sequences` | unmapped |  |
| `routes/regulatorySubmissions.ts:333` | GET `/api/regulatory-submissions/sequences/:id/modules` | unmapped |  |
| `routes/regulatorySubmissions.ts:358` | POST `/api/regulatory-submissions/sequences/:id/modules` | unmapped |  |
| `routes/regulatorySubmissions.ts:403` | GET `/api/regulatory-submissions/modules/:id/granules` | unmapped |  |
| `routes/regulatorySubmissions.ts:419` | POST `/api/regulatory-submissions/modules/:id/granules` | unmapped |  |
| `routes/submission-ops.ts:231` | GET `/api/submission-ops/packages` | launch | ============================================================ |
| `routes/submission-ops.ts:251` | POST `/api/submission-ops/packages` | launch |  |
| `routes/submission-ops.ts:304` | GET `/api/submission-ops/packages/:id` | launch |  |
| `routes/submission-ops.ts:335` | GET `/api/submission-ops/packages/:id/sections` | launch | ============================================================ |
| `routes/submission-ops.ts:461` | POST `/api/submission-ops/packages/:id/sections` | launch | `?? 0`, the fingerprint reader's null check), so they compare as equal. |
| `routes/submission-ops.ts:506` | PATCH `/api/submission-ops/packages/:id/sections/:id` | launch |  |
| `routes/submission-ops.ts:588` | DELETE `/api/submission-ops/packages/:id/sections/:id` | launch |  |
| `routes/submission-ops.ts:690` | POST `/api/submission-ops/artifact-section-map` | launch | ============================================================ |
| `routes/submission-ops.ts:756` | DELETE `/api/submission-ops/artifact-section-map/:id` | launch | assembled with the mapping in place is cleared as stale. |
| `routes/submission-ops.ts:819` | GET `/api/submission-ops/sections/:id/artifacts` | unmapped |  |
| `routes/submission-ops.ts:863` | GET `/api/submission-ops/packages/:id/milestones` | launch | ============================================================ |
| `routes/submission-ops.ts:936` | POST `/api/submission-ops/packages/:id/milestones` | launch |  |
| `routes/submission-ops.ts:1000` | GET `/api/submission-ops/policies` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1015` | POST `/api/submission-ops/policies` | unmapped |  |
| `routes/submission-ops.ts:1078` | PUT `/api/submission-ops/policies/:id` | unmapped |  |
| `routes/submission-ops.ts:1117` | DELETE `/api/submission-ops/policies/:id` | unmapped |  |
| `routes/submission-ops.ts:1137` | POST `/api/submission-ops/policies/resolve` | unmapped |  |
| `routes/submission-ops.ts:1153` | GET `/api/submission-ops/packages/:id/readiness` | launch | ============================================================ |
| `routes/submission-ops.ts:1212` | GET `/api/submission-ops/packages/:id/readiness-history` | launch |  |
| `routes/submission-ops.ts:1247` | GET `/api/submission-ops/blockers` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1297` | PATCH `/api/submission-ops/blockers/:id` | unmapped | c2c_blockers.status, as shared/schema.ts declares it. */ |
| `routes/submission-ops.ts:1354` | GET `/api/submission-ops/approval-bottlenecks` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1410` | GET `/api/submission-ops/workload` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1438` | GET `/api/submission-ops/unified-work` | unmapped | unified_tasks became the fourth source. |
| `routes/submission-ops.ts:1454` | GET `/api/submission-ops/hotspots` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1530` | POST `/api/submission-ops/automation/run` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1546` | GET `/api/submission-ops/automation/runs` | unmapped |  |
| `routes/submission-ops.ts:1567` | GET `/api/submission-ops/automation/runs/:id/actions` | unmapped |  |
| `routes/submission-ops.ts:1595` | GET `/api/submission-ops/due-soon` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1628` | GET `/api/submission-ops/digests` | unmapped |  |
| `routes/submission-ops.ts:1638` | POST `/api/submission-ops/digests/:id/read` | unmapped |  |
| `routes/submission-ops.ts:1654` | GET `/api/submission-ops/command-center` | unmapped | ============================================================ |
| `routes/submission-ops.ts:1795` | POST `/api/submission-ops/packages/:id/publish` | launch | 4. Creates audit trail entry |
| `routes/submission-ops.ts:2448` | PUT `/api/submission-ops/packages/:id/regulatory-identifiers` | launch |  |
| `routes/submission-ops.ts:2535` | POST `/api/submission-ops/packages/:id/assemble` | launch |  |
| `routes/submission-ops.ts:3550` | POST `/api/submission-ops/packages/:id/preflight` | launch | Fail closed: two sha-less descriptors are not "the same bundle". */ |
| `routes/submission-orchestrator.ts:904` | POST `/api/submission-orchestrator/runs/:id/regenerate` | launch | organizationId, matching POST /runs. |
| `routes/submission-orchestrator.ts:979` | POST `/api/submission-orchestrator/m2/nonclinical` | unmapped |  |
| `routes/submission-orchestrator.ts:1004` | POST `/api/submission-orchestrator/m2/clinical` | unmapped |  |
| `routes/submission-orchestrator.ts:1032` | POST `/api/submission-orchestrator/m2/clinical-overview` | unmapped | Build M2.5 Clinical Overview standalone (does not require a full orchestrator run). |
| `routes/submission-orchestrator.ts:1062` | POST `/api/submission-orchestrator/csr/tabulate` | unmapped | Build CSR §10�§12 tabulations for a single study. |
| `routes/submission-orchestrator.ts:1092` | POST `/api/submission-orchestrator/validate/hardened` | unmapped | occurs in the validator itself. |
| `routes/submission-readiness.ts:22` | POST `/api/submission-readiness/assess` | out-of-scope |  |
| `routes/submission-readiness.ts:58` | GET `/api/submission-readiness/pathways` | out-of-scope | Discover which domains a pathway requires. |
| `routes/submission-twin.ts:74` | GET `/api/submission-twin/assessments/:id` | out-of-scope | Get assessment history for a package */ |
| `routes/submission-twin.ts:87` | GET `/api/submission-twin/assessment/:id` | out-of-scope | Get detailed assessment with challenges, drift, impacts */ |
| `routes/submission-twin.ts:107` | POST `/api/submission-twin/claims/extract/:id` | out-of-scope | Extract claims from package artifacts */ |
| `routes/submission-twin.ts:120` | GET `/api/submission-twin/claims/:id` | out-of-scope | Get claim-to-evidence integrity map */ |
| `routes/submissions.ts:352` | GET `/api/submissions/capabilities` | launch | Registered before '/:id' so it is not shadowed by the id param route. |
| `routes/submissions.ts:399` | GET `/api/submissions/validation-rules` | launch | path is not shadowed by the id param route. `?region=` scopes to a framework. |
| `routes/submissions.ts:462` | GET `/api/submissions/market-specs` | launch | Registered before '/:id' so the literal path is not shadowed. |
| `routes/submissions.ts:481` | GET `/api/submissions/market-specs/:id` | launch |  |
| `routes/submissions.ts:507` | POST `/api/submissions/market-specs/:id/validate` | launch |  |
| `routes/submissions.ts:527` | GET `/api/submissions/document-templates` | launch | Static reference data; `?family=` filters. Before '/:id' so it is not shadowed. |
| `routes/submissions.ts:543` | GET `/api/submissions/document-templates/:id` | launch |  |
| `routes/submissions.ts:559` | GET `/api/submissions/requirements` | launch | a deterministic gap assessment. Static reference data + pure assessment. |
| `routes/submissions.ts:571` | GET `/api/submissions/requirements/:id` | launch |  |
| `routes/submissions.ts:606` | GET `/api/submissions/designations` | launch | eligibility assessment from yes/no answers. |
| `routes/submissions.ts:638` | GET `/api/submissions/change-categories` | launch | that maps a proposed change to its category and the canonical sequence type. |
| `routes/submissions.ts:663` | POST `/api/submissions/change-categories/classify` | launch |  |
| `routes/submissions.ts:722` | POST `/api/submissions/device/classify` | launch |  |
| `routes/submissions.ts:737` | GET `/api/submissions/device/reviewer-checklist` | launch |  |
| `routes/submissions.ts:775` | POST `/api/submissions/device/biocompatibility` | launch |  |
| `routes/submissions.ts:789` | POST `/api/submissions/device/software/classify` | launch |  |
| `routes/submissions.ts:835` | POST `/api/submissions/device/blueprint` | launch |  |
| `routes/submissions.ts:849` | GET `/api/submissions/device/global-strategy` | launch | Global multi-region device strategy (build once, file many). |
| `routes/submissions.ts:865` | GET `/api/submissions/device/timeline` | launch | Regulatory timeline for a pathway. |
| `routes/submissions.ts:879` | POST `/api/submissions/device/udi/validate` | launch | UDI validation (GS1 check digit + AI parsing �� GUDID/EUDAMED components). |
| `routes/submissions.ts:899` | POST `/api/submissions/device/electrical-safety` | launch |  |
| `routes/submissions.ts:915` | POST `/api/submissions/device/sterilization` | launch | Sterilization requirements (ISO 11135/11137/17665) from device facts. |
| `routes/submissions.ts:927` | GET `/api/submissions/regulatory-capabilities` | launch | Regulatory capabilities index  one call for the UI to discover the whole layer. |
| `routes/submissions.ts:994` | POST `/api/submissions/device/labeling` | launch |  |
| `routes/submissions.ts:1007` | GET `/api/submissions/device/cer/:id/assess-stored` | launch | Tenant-scoped; needs a database. 404 when the report is not in the organization. |
