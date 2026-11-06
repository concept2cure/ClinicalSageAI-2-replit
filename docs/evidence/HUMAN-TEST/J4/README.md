# J4 human test: Submission Center (2026-11-06)

Session `01QoxbLZbDqi…`, started by `011Dpx…`. Persona: a regulatory-operations publisher. The goal was that a tester
can take an IND from an empty sequence 0000 to a compiled, validated package, and that the dispatch gate assesses it
honestly. Everything below was done in the running app, at 1440×900 unless 390 is stated. Each fix has a red-then-green
test, and each was re-checked in the app after it landed.

**Outcome.** The IND **LMN-801** went from an empty sequence to a compiled package. The compile completed, assembled the
package and recorded it with its SHA-256 as the baseline for the next sequence. It is honestly "not submission-ready", for
the reasons listed under the walk's step 10. Validation of 0000 reads 0 errors. The dispatch gate blocks on two things:
no completed Shadow Review (no model key here) and no Part 11 release signature. Both blocks are correct.

## Setup and test accounts

- **Database.** A fresh Postgres 16 with pgvector, built in this order:
  1. `node scripts/db/install-fresh.mjs` (with `APP_SERVICE_DB_PASSWORD` set, at least 12 characters);
  2. `node scripts/db/deploy-migrate.mjs`;
  3. `node scripts/seed-admin.mjs`.
- **Server.** `tsx server/index.ts` on port 5200, with:
  - `NODE_ENV=development`, `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, `ALLOW_DEV_AUTH=1`;
  - `ALLOWED_ORIGINS=http://127.0.0.1:5200,http://localhost:5200`;
  - `DATABASE_URL`/`APP_DATABASE_URL` set to the **runtime role** `app_service`, and `DATABASE_OWNER_URL` set to the owner.
- **Demo data.** `node scripts/demo/launch-demo/seed.mjs --pack all --base-url http://127.0.0.1:5200 --email jm.smith@concept2cure.pro --plan enterprise`.
  It was run a second time with `OQ_SIGNER_EMAIL`/`OQ_SIGNER_PASSWORD` set to the approver.
- **Fonts.** `fonts-noto-core` and `fonts-noto-cjk` are installed.
- **People.** All three are in organisation `concept2cure` and are signed in with `POST /api/auth/dev-login`:

  | Person | Email | Role in the walk | Password (local only) |
  |---|---|---|---|
  | JM Smith | `jm.smith@concept2cure.pro` | publisher | `pass-word` |
  | Rhea Reviewer | `rhea.reviewer@concept2cure.pro` | review signer | `Signer-pass-2026` |
  | Ava Approver | `ava.approver@concept2cure.pro` | approval signer | `Signer-pass-2026` |

  The signers were created with `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… ADMIN_ORG_SLUG=concept2cure node scripts/seed-admin.mjs`.
- **Projects used.**
  - LMN-801 (Lumen, IND, empty at the start; program `d817942d…`);
  - C2C-101 (biotech IND with six seeded leaves; `181c7816…`);
  - NeuroPanel-Dx (MDX 510(k); `4c7859cb…`).
- **No model key.** The AI gateway runs in demo mode, so drafting and Shadow Review cannot complete. The product says so
  (D-3).

## What a tester can do now, step by step (verified)

1. **Submissions for a project.** Open Submission Center from the rail with a project open. It lists that project's
   submissions, and "Show all of the organization's submissions" widens the list.
2. **New submission.** "+ New submission" opens a drawer: title, application type (from the project), region, client
   type and a required reason.
3. **Planner.** Shows the region profile scoped to the application type. For an IND that means the Module 1 headings,
   the agency forms 1571 and 3674 (fixed: D-1), the region requirements and the six ESG gateway rules.
4. **Sequences.** "Start sequence 0000", then the transitions:
   - draft → assembling works;
   - the move to Validated is refused while validation has errors, with each error in full, including the 21 CFR
     312.23(a)(7) Module 3 rule and how to clear it;
   - "Start sequence 0001" creates an amendment (checked on C2C-101).
5. **Forms and letters (1571, cover letter, LOA).**
   - **Applicant identity.** Record a sponsor (legal name, D-U-N-S, regulatory contact, authorised representative, with
     a reason), then bind it with the agency application number, sponsor address and IND type, with a reason.
     "Project facts saved."
   - **Forms.** Build & check, PDF and Save to dossier all work for 1571 (the save shows a toast). "Attach completed
     form" files the PDF into the chosen sequence at m1.1. Without the attestation it reads "Attached · not complete"
     and names the boxes the sponsor still owes (for 1571: ind_type, phase_of_study).
   - **Layout.** At 390 px the table scrolls inside its card instead of being clipped (D-10).
6. **Placing documents.**
   - **From the Vault.** An approved file's "Place into filing…" asks for a submission, sequence, section, operation
     and reason. It refuses a Module 4/5 study file without a study id and STF file-tag, and now also refuses the
     undefined tag "study-report" (D-14). On success: "Filed as leaf … The vault copy is what will be assembled."
   - **From the editor.** Place into filing on the approved, frozen 510(k) Summary opens with an empty section code,
     instead of its own refused prefill (D-6).
   - **In the Builder.** The Builder lists the leaves. "Edit study tagging" corrects a leaf's study id and file-tag.
7. **Required deliverables.**
   - For the 510(k), the Required deliverables tab offers the eSTAR 510(k) framework.
   - For an IND it says plainly that no coverage catalogue is available in that view. The IND's coverage is measured
     instead by Validation and the compile.
8. **Validation.** Computed server-side from the leaves, each finding shown as its corpus rule. LMN-801 went from 7
   errors to 0 as its 35 documents were placed.
9. **Shadow review.** "Run shadow review" with no model key now says "No AI provider is configured on this deployment,
   so no review was performed." The run is listed, and Dispatch says it is not an outage, so it cannot be waived (D-3).
10. **Compile & export eCTD.**
    - **Identity first.** With no identity recorded, whether or not anything is placed, the first errors are the
      application number, the bound sponsor, the D-U-N-S and the regulatory contact. Each says "Record it in Submission
      Center, Forms and letters (1571, cover letter, LOA), under Recorded applicant identity" (B3, and D-11 for placed
      leaves).
    - **Module readiness.** "None placed" at 0 of N, not "Partial" (D-5).
    - **LMN-801's compile completed.** Package SHA-256 `6f859162…`, recorded. It is not submission-ready for these
      reasons:
      - 1.1.2 and 1.1.3 had no leaf at that compile. 1572 and 3674 were then attached, unattested.
      - The ICH and regional DTDs are not bundled, so DTD validation did not run.
      - The PDF/A toolchain is absent on this host.
      - The regional backbone is not conformant. Its telephone-number-type code list is not vendored, the 1571 leaf has
        "no declared form type", and 1.12.14 and 1.14.4.1 are written directly under `<m1-regional>`.
11. **Dispatch.** The gate is honest. It reports 0 validation errors and 2 blockers: no completed Shadow Review, and no
    Part 11 release signature. It says that the sequence's creator cannot sign its freeze or dispatch. The test package
    and the inspection copy are offered, and Transmit opens only after dispatch.
12. **The device eSTAR path (510(k)).**
    - Submission Center shows the device assembly readiness: 11 required eSTAR sections missing.
    - The empty "Device filings" card now opens the 510(k) filing panel it names (D-16). From there: "510(k) and eSTAR"
      with Start tracking and the eSTAR sections.
    - A drug IND shows no device card (B4).

## Defects found

| # | Step | Expected | Actual | Status |
|---|---|---|---|---|
| D-1 | Planner, IND | the forms and rules an IND files | "356h (required)", "Part 314/601", "PDUFA payment required" shown for an IND; 3397 described as patent information (it is the user fee cover sheet) | **fixed** `68c27e09` |
| D-3 | Shadow review, no model key | the cause stated | "The AI request could not be completed..", run list not refreshed, Dispatch blamed "the model's reply" | **fixed** `cf231e9e` |
| D-4/D-10 | Forms and letters, 1440 and 390 | actions inside their card | Actions column clipped ("Attach com…"), "Draft with AnA" 66 px outside its card, table unreachable at 390 | **fixed** `81708f78`, `9caf20d2` |
| D-5 | Compile, module readiness | "none placed" | "0% · Partial" on an empty sequence | **fixed** `66f727e9` |
| D-6 | Editor, Place into filing (510(k) Summary) | an empty or valid code | prefilled "1", then refused it in red | **fixed** `a036a648` |
| D-11 | Compile/Validate with leaves placed, no identity | B3's per-gap lines | one run-on refusal naming "Module 1 forms"/"sponsor registry", ending ".."; Validate silent on identity | **fixed** `456c13e2` |
| D-14 | Vault/editor placement, STF tag | refused before the write | "study-report" accepted; compile then refused it all with "Reassemble the CSR" for toxicology reports | **fixed** `3e732a22` |
| D-16 | 510(k), Device filings empty | a door to the panel named | text only, no way there | **fixed** `77d94883` |
| D-8 | Validation, IND Module 3 | its remedy reachable | "record the cross-reference to the DMF … with its LOA on file": the `/api/ind-lifecycle/…/cross-references` routes have no caller (R1 inventory), and `file-loa` renders the LOA itself and sets `loaOnFile`, which a DMF holder's signed letter should decide | **→ RIM** (S5); workaround: place 3.2.S/3.2.P documents |
| D-12 | Forms and letters, IND Cover Letter | rendered from the recorded applicant | shows the organisation and "[Sponsor Address]", not the bound sponsor; no fields for its "missing signatoryName, submissionType"; the sequence entered is cleared | **→ RIM**: R1's handoff "the IND cover letter rendered from records"; workaround: place the signed letter PDF at 1.2 from the Vault |
| D-13 | Dispatch gate | an incomplete form is not cleared | 1571/1572/3674 attached unattested with boxes missing, yet 0 validation errors | **→ RIM** (`assess-dispatch-readiness.ts` is held) |
| D-15 | Builder, Edit study tagging | an editor beside the row | renders as a narrow column inside the Actions cell (the row grows to about 600 px) | **→ RIM** (Builder layout, L9) |
| D-17 | Compile, regional backbone | conformant m1 | 1571 leaf "has no declared form type"; 1.12.14 and 1.14.4.1 written outside their parent headings | **→ RIM** (S5 packager) |
| D-18 | Validation, Module 2 QC | agrees with the gate | "2.3/2.4/2.5/2.7 Blocking: missing" while those leaves are placed and the gate reads 0 errors (it checks a package-run build, not the sequence; 2.7 is listed for an IND) | **→ RIM** |
| D-19 | Sequences copy | product words | "Transitions POST the real lifecycle endpoint"; "variation" offered for an FDA IND | **→ RIM** (copy held) |
| D-20 | Vault after placement | one meaning of "filed" | "Filed as leaf 1.20" and, in the same list, "1.20.pdf · Unfiled" (the data-room folder) | **→ J2** (Vault copy) |

## Known limits (this environment, not defects)

- **No model key.** Shadow Review cannot complete and is not waivable (P-34 waives an outage only), so the gate cannot
  clear here. AnA's narration is unavailable.
- **No PDF/A toolchain and no vendored DTDs.** The compile says so. A deployed host needs both before transmission.
- **No predicate-intelligence service and no openFDA from this container.** On the 510(k) panel the screen says so.
- **The cross-reference/LOA path (D-8) is not reachable.** An IND that incorporates Module 3 by reference cannot clear
  validation until RIM reaches it.
- **Freeze, dispatch and transmit were not signed.** The gate blocks them correctly, and a signed transmit needs ESG
  credentials.
- **Vault approval was scripted.** The 33 LMN-801 documents were approved through the Vault's UI ceremony by a script,
  and 29 of them were placed through the same PUT the Vault dialog makes (`PUT /api/submissions/sequences/:id/leaves`).
  The dialog itself was walked for three documents.
- **The demo documents are fictional.** The LMN-801 PDFs say so on their face.
