# P-122: the device change determination is reached from a Quality change record (2026-11-12)

A change record filed under a device project now offers "Assess the regulatory impact" in its detail, in Quality's
change control log. A person answers the rule engine's questions in the existing form. The engine's verdict is
kept on the change and shown as the engine's: for the United States, new 510(k) or letter to file; for the
European Union, significant change or not. The reach map's row 37 and section 4 item 4
(`docs/evidence/DESIGN/P-122/reach-map/README.md`) asked for this.

Nothing was built beside what existed: no screen, no route file, no mount, no table, no column, no AnA tool.

## What already exists (Rule 3)

| Piece | Path | Before this work |
|---|---|---|
| The FDA 510(k) change engine and the EU significant-change engine | `server/services/regulatory/change-assessment.ts` | Deterministic rules, no model. Served at `POST /api/ivd-lifecycle/change/fda-510k` and `/change/eu-significant` (`server/routes/ivd-lifecycle.ts:515-516`). No caller. Read an unanswered question as "no". |
| The engines' access checks | `server/routes/ivd-lifecycle.ts:93-94` | Sign-in only. They are calculators: they take no project and read no record, so they have no tenant or project check to make. |
| The shared change vocabulary | `shared/regulatory/change-control-taxonomy.ts` | Names the engines' outcomes (`letter_to_file`, `new_510k`, `pma_supplement_or_de_novo`, `significant`, `non_significant`). Did not hold their questions. |
| Quality change control | `client/src/concept2cure/quality/ChangeControl.tsx`, `ChangeRecordDetail.tsx`; `server/services/qms/changeControl.service.ts`; `server/routes/mdx-qms.ts` | The log, the record's detail, raise, edit assessment, advance, link, signed approval. A change may be filed under a project (`program_id`, P-60). Nothing ran the device determination. |
| Where a change keeps structured content | `qms_change_controls.metadata` (jsonb) | Holds the approval and the learning promotion. The approval's content digest covers it, less `metadata.approval` (`change-approval-signature.ts:119-141`). |
| The form | `client/src/concept2cure/v2/C2CForm.tsx` | The drawer every change-control write uses. A segmented field with `default: ''` starts with nothing chosen. |
| The admission of a project for a write | `server/services/c2c/current-program-access.ts`, `server/routes/c2c/project-access.ts` | Used by the IND registers (P-122). The change-control writes asked only for the organisation. |
| The transaction and the audit row | `withRiskWrite` (`server/routes/mdx-risk-access.ts`), `writeChainedAuditRow` (`server/services/auditService.ts`) | In use by the risk register and the signed acts. |
| What a device project is | `isDeviceFamily` (`shared/constants/domain/product-types.ts`) | Device, IVD, companion diagnostic, software as a medical device. |
| The locked screen and its store | `client/src/concept2cure/v2/surfaces/ChangeAssessment.tsx`, `server/routes/change-assessment.routes.ts`, `change_assessments` | Read-only list of a table no deploy creates. Not revived, not touched. |

Searches run: `change-assessment`, `assessFdaChange`, `assessEuSignificantChange`, `fda-510k`, `eu-significant`,
`letter to file`, `significant change`, `regulatoryImpact`, in `server`, `shared`, `client/src` and `scripts`; and
`git log --all --diff-filter=D` on `*hange*ssess*`, `*hangeImpact*`, `*egulatoryImpact*`, `*etterToFile*`,
`*ignificantChange*`, which found no deleted file.

## What changed

**The engines refuse an unanswered question** (`1ac0b70fb`, `da6899a1b`, F1). With no answers at all the FDA engine
returned letter to file and the EU engine "not significant", and so did the two endpoints with an empty body. Each
question with no yes or no is now refused by name, as the other IVD lifecycle engines refuse an unstated input. The
questions each engine asks are in the shared vocabulary in plain words (`DEVICE_CHANGE_QUESTIONS`), and the engine's
inputs are typed as exactly those. Each engine's rules carry a version (`fda-510k-change-2017/1`,
`mdcg-2020-3/1`). A test pins every answer set's outcome to it.

**The determination is run from the change and kept on it** (`c332eca5a`, R1).
`POST /api/mdx/qms/changes/:id/regulatory-impact` takes a market and the person's answers.
- The server runs the engine. A verdict sent by the browser is ignored.
- Kept in `metadata.regulatoryImpact.<market>`: the answers, what the engine returned, the rules' version, who ran
  it and when. No column was added, so no migration changed.
- The change record and its chained audit row (`mdx.qms.change.regulatory_impact`) are written in one transaction.
- The engine does not set the change's classification, state or assessment.
- It is recorded only while the change is proposed or under assessment. The approval's content digest already
  covers the metadata, so the approver signs the determination they read, and one recorded after they opened the
  change refuses their signature as any other edit does.
- Assessing a market again states why. The audit row keeps the determination it replaced.
- Refused: another organisation (404); a colleague who is not on a private project, or who reads the project and
  does not edit it (403 `PROJECT_PERMISSION_DENIED`); a drug or biologic project's change, an organisation-wide
  change or an approved change (409); an unanswered question (422).
- The register read (`GET /api/mdx/qms/changes`) says per change whether the determination applies and what is
  recorded. Something kept that is not a determination is said to be unreadable.

Where the code is: `server/services/qms/change-regulatory-impact.ts`, a file of the change-control service's
folder, because `changeControl.service.ts` is at the 500-line lint ceiling. The route is mounted from the existing
`server/routes/mdx-qms-records.ts`, because `mdx-qms.ts` stands one line under the repository's line ceiling.

**The change record's detail** (R1, in D7's Quality files).
- A device project's change shows "Regulatory impact" between its assessment and its linked records: one row per
  market, "Not assessed yet." until the engine has run, and the button "Assess the regulatory impact" while the
  change can still be assessed.
- The form (`ChangeImpactForm.tsx`, the existing `C2CForm`) asks the chosen market's questions. None is answered
  for the person, and it does not send while one is unanswered. On a reassessment each question shows the
  recorded answer beside it, the person answers again, and gives a reason.
- A recorded determination shows the verdict, the engine's rationale, what it found, the rules' version, who ran
  it and when. Under it: "The rules engine's determination from the answers recorded. It does not classify the
  change: its classification, assessment and approval are a person's."
- The approval dialog lists the determination among what the signature binds.
- A drug or biologic project's change, and an organisation-wide change, say in one sentence that the determination
  is not offered there. Only an organisation that has a device project sees that sentence: nobody looks for a
  510(k) determination in an organisation with no device.
- A refusal or a failed call stays in the drawer in the server's words. A reply with no determination is not
  reported as one.

## Red and green

| What | Red | Green |
|---|---|---|
| The engines: an unanswered question, the questions, the rule versions | `red-engine-at-head.txt`: 6 of 13 failed | `green-engine.txt`: 13 of 13 |
| The version pin catches a changed rule | `red-rule-changed-without-a-new-version.txt`: a trigger was made decisive, the pin failed | (same test, green above) |
| The two engine endpoints | `red-engine-routes-before-the-engines-refused.txt`: 3 of 5, "expected 200 to be 422" | `green-engine-routes.txt`: 5 of 5 |
| The route, the record, the audit row and the refusals, on PostgreSQL as `app_service` with RLS on and the production gate | `red-db-at-head.txt`: 16 of 18 failed | `green-db.txt`: 18 of 18 |
| The project admission | `red-db-without-project-admission.txt`: with the admission removed, a colleague off a private project recorded a determination; 3 of 18 failed | (same test, green above) |
| The detail, the form, the verdict and the failure states | `red-client-at-head.txt` | `green-client.txt` |
| A call that never reached the server (found in the running app) | `red-failed-call-in-the-browsers-words.txt`: the drawer read "Not recorded — Failed to fetch" | `green-failed-call.txt`: 49 of 49 across the five change-control suites |
| The database test again, after two merges with other lanes' change-control work | | `green-db-after-the-merge.txt`: 18 of 18 |

Tests: `server/services/regulatory/__tests__/change-assessment.test.ts`,
`server/routes/__tests__/ivd-lifecycle-change-refuses-an-unanswered-question.test.ts`,
`tests/db/p122-device-change-determination.dbtest.ts`, `server/routes/__tests__/qms-changes.test.ts` (one case
added, three given the register's third read), `client/src/concept2cure/quality/__tests__/ChangeRegulatoryImpact.test.tsx`.

## Screenshots

Taken in the running app on 2026-11-12, signed in as the demo organisation's author on the device project NEUR
(NeuroPanel-Dx, a 510(k)), with the production access gate on (`LAUNCH_SCOPE_ENFORCE=on`,
`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`) and row-level security on. `walk.cjs` is the script: it files one change
under NEUR through the product's own route, opens its detail, forces one failed call, and runs the United States
and the European Union assessment through the form. `walk-failed-call.cjs` retook one picture after the wording fix
below. No 403 `LAUNCH_SCOPE`, no page error.

| File in `screenshots/` | What it shows |
|---|---|
| `before-1440-light-1-device-change.png`, `before-390-light-1-device-change.png` | Before: a device change's detail has no regulatory impact |
| `before-1440-light-9-biologic-change.png` | Before: a biologic project's change |
| `after-*-1-offered-not-assessed.png` | "Regulatory impact": both markets "Not assessed yet.", and the button |
| `after-*-2-form-no-question-answered.png` | The form: the engine's questions in plain words, none answered |
| `after-1440-light-3-failed-call-says-so.png` | The request is cut: "Not recorded — the server could not be reached, so nothing was sent. Check your connection and try again." |
| `after-1440-light-3b-nothing-recorded-after-the-failed-call.png` | After it, the change still reads "Not assessed yet." |
| `after-1440-light-4-us-recorded-toast.png` | The US assessment recorded; the toast repeats the engine's verdict |
| `after-*-5-determinations-kept.png` | Both verdicts kept: "New 510(k)" with the engine's rationale and what it found, "Not a significant change", the rules' version, who and when |
| `after-*-6-assessing-again.png` | Assessing again: each question shows the recorded answer, none is answered, a reason is asked |
| `after-*-9-biologic-change-one-sentence.png` | A biologic project's change says in one sentence that the determination is not offered there |

`*` is `1440-light` and `390-light`; `5` also has `1440-dark` and `390-dark`.

## What to know

- **Found in the walk and fixed: a cut connection was reported in the browser's words.** The drawer read "Not
  recorded — Failed to fetch". `ChangeControl.tsx`'s write runner now says that the server could not be reached
  and nothing was sent; a refusal still shows the server's own sentence.
- **The same raw message is still shown by three other Quality write runners**, in files the Quality and training
  lane holds: `CapaActions.tsx:63`, `QmsRecords.tsx:104` and `:120`, `ReviewActions.tsx:40`
  (`Not recorded — ${err.message}`). It is recorded for that lane in the coordination file; nothing was changed
  there.
- **Merged twice with other lanes' work on the same screen** (2026-11-12): a linked record can be removed from a
  change (`94450dd2c`), and a record's actions no longer cover its facts (`c83219951`, `dd14af400`). Both are kept
  beside the determination; the detail takes `onAssessImpact` and `onUnlink`.
- **The verdict is the engine's from the answers given.** It reads no design file, risk file or test report: a
  wrong answer gives a wrong verdict, and the record keeps the answers so a reviewer can see them. It does not
  replace the regulatory assessment a person signs.
- **Rule sources, and what the EU answer covers.** The US rules follow FDA's 2017 guidances on deciding when to
  submit a 510(k) for a change to an existing device and for a software change. The EU rules follow MDCG 2020-3,
  the guidance on significant changes under the transitional provision (MDR Article 120; the engine also cites IVDR
  Article 110(3)). That is the question for a device still marketed under its Directive certificate. A device
  certified under the MDR or IVDR reports changes to its notified body under its own certificate, and the engine
  does not decide that. The form's sentence for the European Union now says which devices the answer is for; it
  read "MDR and IVDR: whether the change is a significant change". The engine has no separate rule set for an IVD
  (MDCG 2022-6), and for a device beyond a 510(k) it says so and stops.
- **Not offered for a drug or a biologic.** A post-approval change category for a medicinal product (CBE, PAS,
  Type IA/IB/II) is outside this release (P-28); nothing here changes that.
- **Not done:** the screen was not walked as a second person without edit rights (the refusals are covered by the
  database test as `app_service`); AnA was not asked about a determination in conversation (no model key here);
  `change_assessments` and the locked Change assessment screen are untouched and await the reach map's retire
  decision.
