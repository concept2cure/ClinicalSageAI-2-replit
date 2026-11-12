# rC: device and IVD story, sales rehearsal of 2026-11-10

Walked in the running app on http://127.0.0.1:5240 (database gademo, commit 8a65a6f3a) with runtime role
app_service, RLS_ENFORCE=on, LAUNCH_SCOPE_ENFORCE=on, dev sign-in off and no model key, on a development build served by
Vite over a shared working tree. Everything was done through the
real UI as Ana Author (presenter), Rhea Reviewer (review signer), Ava Approver (approver) and Quinn Quality (QA lead), all
of organisation 2. Screens were walked at 1440 x 900 in light mode, the main stops again at 390 x 844, and four screens in dark. The screenshots are
`shots/rC-NN-*.png`. The driver and logs are in the scratch folder gademo/rC (repl.cjs, PROGRESS.md).

## What already exists (read before walking)

- docs/demo/mdx-walkthrough.md (NeuroPanel-Dx 510(k), seven stops), docs/demo/IVD_510K_WALKTHROUGH.md (a CLI script
  with no screens).
- docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/findings.json, areas `mdx-program` and `quality-audit-reporting`
  (rechecked below).
- docs/evidence/HUMAN-TEST/J1 (device RA manager journey), J3 (510(k) Summary in the editor), J4 (Submission Center).
- Seeded data: only one device project exists, **[Demo · MDX] NeuroPanel-Dx 510(k)** (an IVD, code NEUR). No non-IVD
  device project and no second diagnostics project were seeded. The "device company" half of the story was therefore
  walked on a project created here, as described below.

## Records created by this rehearsal (all named "Rehearsal rC …")

| Record | Where | State it was left in |
|---|---|---|
| Rehearsal rC — NeuroPanel-Dx Risk Management File (ISO 14971) | NEUR, editor | v2; review-signed by Rhea, approved and frozen by Ava |
| Hazard HZ-01 "Rehearsal rC — false negative HSV-1 result …" | NEUR, Device engineering | open; initial risk 8 |
| Design input "Rehearsal rC — the panel detects HSV-1 at or below 250 copies/mL …" | NEUR, Device engineering | untraced |
| CAPA-2026-0001 "Rehearsal rC — NeuroPanel-Dx field complaint …" | NEUR, Quality > CAPA | Open |
| Training acknowledgement of MDX-SOP-101 by Quinn | Quality | receipt recorded |
| Project **Rehearsal rC — CardioPatch wearable ECG monitor 510(k)** (code RRC, d1aaf069-6ec3-431b-abe2-be0b47a55e4a) | Projects | 510(k) eSTAR editing copy created; section B2 text saved (v2) |
| Project **Rehearsal rC — VitaStrep rapid strep A antigen test 510(k)** (code RRV, cc56524d-24a8-432b-b262-16f4bf20e4fd) | Projects | created, 510(k) for IVD |

## Run of show (only steps that were done and seen to work)

1. Home, then Projects, then NeuroPanel-Dx (rC-01, rC-02). The header reads "510(k) · FDA · indication". About shows Class II,
   QNX, 21 CFR 866.3985, Microbiology, predicate K223456 and the device flags.
2. Plan (rC-03). The 510(k) program plan has 42 tasks, the critical path is drawn back from the target date, and the MDUFA decision date is shown.
3. Author: open the 510(k) Summary (rC-09/10). It is approved and frozen, and its sections are cited to 21 CFR 807.92.
   Open Signatures (rC-11): meaning, reason, method "Password, re-verified at signing", and the content hash.
4. Create a document from the editor's New document dialog using the template "GLOBAL · Risk Management File (ISO 14971)" (rC-14,
   rC-15). Type into section 1, give the reason, Save, then reload: v2 persists (rC-18, rC-19).
5. Send for review to Rhea (rC-21, rC-22). Rhea signs a Review with her password (rC-26, rC-27). Ava signs Approval, which freezes the document (rC-29, rC-30).
6. Plan > Design controls > "Build the risk file and design-control trace" (rC-34). Add a hazard (rC-36), which persists with its
   risk matrix (rC-38). Add a design input linked to HZ-01, which persists in the traceability matrix (rC-40).
7. Submit > "Assemble the eSTAR" (rC-43) > "Generate official eSTAR (PDF)" downloads the FDA eSTAR form, a 5.6 MB PDF
   with 7 of the 19 administrative fields filled (rC-45).
8. Submission Center > Dispatch (rC-48). "Not yet": 7 leaves are not approved and no Shadow Review has run. The gate holds, and separation of duties is stated.
9. Quality as Quinn (rC-52). The SOP register is shown. Read and acknowledge MDX-SOP-101 gives a receipt (rC-53, rC-54). Change control: expand
   MDX-CC-2026-001 (rC-57). With the project open, Raise CAPA, and the CAPA persists after a reload (rC-62, rC-63).
10. Projects > New project > Medical Devices > 510(k) Premarket Notification. Fill in the device profile and Create (rC-70, rC-71, rC-73).
    Author > Find or start a document > Create editing copy gives the 38-section eSTAR outline (rC-77). B2 is saved and persists (rC-79, rC-80).
11. Projects > New project > Diagnostics & IVD > 510(k) for IVD > Create (rC-81, rC-82, rC-83).

## Findings

The structured result carries every finding with its evidence. The ones that stop the story:

- **F01 (blocks-demo).** NEUR > Evidence lists 29 "sources". All of them are QMS projection rows from other stories: Lumen
  suppliers, Lumen deviations, a Biotech change control, and "Quality record relationship: 7". None of the six device
  study PDFs is listed, and every row says "The original file is unavailable". A brand-new project shows 22 such sources (rC-04b, rC-86-rrc-plan).
- **F02 (blocks-demo).** The New project wizard, and the Raise CAPA drawer, close by themselves 20 to 55 seconds after
  they open, losing what was typed. It happened 5 times. The close coincides with a refresh of `/api/v1/auth/session`,
  `/api/tenants` and `/api/users/me` (rC-72).
- **F03 (blocks-demo).** Dispatch > "Assemble a test package" on the 510(k) answers 500 INTERNAL. The page then says "Whether the
  test package was assembled could not be confirmed — Request failed". The server log shows an eCTD Study Tagging
  File rejection (FDA validation 1789) applied to a device sequence (rC-51).
- **F04 (blocks-demo).** The Client Review Room on the Review step is always empty. No screen sets a task's client
  visibility (the only reference is the GET route), so the stop is an empty shell (rC-41).
- **F05 (blocks-demo).** The new "510(k) for IVD" project has no work breakdown: "This project's filing, 510(k) for IVD, has
  none yet". The seeded IVD project NEUR and a new device 510(k) both have the 42-task plan (rC-86-ivd-plan).

## Earlier findings rechecked (2026-11-09 deep walk, area mdx-program and quality)

The structured result lists each finding as fixed, still open or not checked.
