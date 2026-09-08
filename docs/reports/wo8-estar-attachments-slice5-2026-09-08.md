# Roadmap item 4 — slice 5: documents in named CDRH attachment slots

Date: 2026-09-08. Branch `concept2cure-v2`. Closes the engine and route halves of the
last slice of roadmap item 4 (`docs/handoff/HANDOFF_DEVICE.md` §6), specified in
`docs/reports/wo8-estar-attachments-2026-09-07.md` §4.

**The official eSTAR this platform produces now files documents into named CDRH
attachment slots.** Before this it populated 0 of the template's 113 (nIVD) / 145 (IVD).
Slices 1–4 had removed every reason it could not — the writer could express the objects,
they could be enciphered, they could be joined to the document without destroying the
form, and every slot was enumerable with the chapter token CDRH routes by — and nothing
joined them.

---

## 1. What ships

| piece | file |
|---|---|
| the planner, and its refusals | `server/services/pathway-engines/estar/estar-attachment-plan.ts` (new) |
| the two content resolvers | same file — governed sections, and vault documents |
| the manifest locator | `estar-field-map.ts` — `ESTAR_ATTACHMENT_MANIFEST_FIELD` |
| the per-slot cardinality rule | `estar-attachment-slots.ts` — `EstarAttachmentSlot.singleAttachment` |
| plan → fill → attach, in one place | `estar-fill.ts` — `fillEstarSubmission`, `attachPlannedFiles` |
| the route | `510k-estar-routes.ts` — `POST /official`, `attachments` |
| the shape gate, and its first self-test | `scripts/ci/check-governed-export-consequence-shape{,.selftest}.mjs` |

### Verified end to end, by a parser that has never seen this code

pypdf 6.16.2, on a real filled-and-attached nIVD eSTAR (5,287,129 bytes) produced by
`fillEstarSubmission`:

```
/Names keys           : ['/JavaScript', '/EmbeddedFiles']
/JavaScript entries   : 3                       ← the form's own scripts, intact
/EmbeddedFiles pairs  : 2
  key='2026-09-08T12:00:00'  /F='Doc 0.pdf'  /UF='Doc 0.pdf'
    /Desc='Administrative Documentation | Cover Letter'
    /Params /Size == len(plaintext) ✓   /CheckSum == md5(plaintext) ✓   sha256 matches the report ✓
  key='2026-09-08T12:00:01'  /F='Doc 1.pdf'  /UF='Doc 1.pdf'
    /Desc='Administrative Documentation | List of Terms/Acronyms'
XFA packets           : 10 (xdp:xdp, config, template, localeSet, datasets, PDFSecurity,
                            xmpmeta, xfdf, form, </xdp:xdp>)
AttachmentManifest    : ***Start***<<Doc 0.pdf|/CHAPTER 1/CH1.01/>><<Doc 1.pdf|/CHAPTER 1/CH1.03/>>
FDA checkRemovedAttachments — indexOf("<<") = 11 > 0 ✓
```

---

## 2. What the planner refuses, and why none of it is optional

Every one of these fails **silently** without the refusal. The file is embedded, the
manifest names it, the sponsor downloads it, and the document is wrong in a way nothing
in the response says.

| refusal | what shipping it would do |
|---|---|
| a slot this template does not declare | a token naming a chapter the form has no row for |
| a chapter that cannot be resolved | a US MDUFA cover sheet filed under Health Canada's chapter |
| a second file into a single-attachment slot | two tokens for a row the form holds one of |
| the template's own acceptance rules | the file is embedded, and DELETED on the applicant's first save |
| content the resolver could not produce | a manifest entry pointing at nothing |
| a section still marked draft | an unreviewed machine draft filed as a submission |

**Every refusal blocks the whole export (422 with the reasons).** A submission missing a
document the operator asked to file, handed back with a 200 and a note beside it, is the
failure mode this codebase refuses everywhere else. The attachment report travels on the
refusal too, so the operator sees *which* document and *why*.

The last row is why `AuthoredDeviceSection.substantive` was added on 2026-09-07: the draft
package `/build` produces is allowed to contain drafts — that is what its label says. A
named CDRH attachment slot is not.

---

## 3. Three things measured on the way, two of which corrected earlier work

### 3a. The one-attachment rule is **five** controls per template, not two

`wo8-estar-attachments-2026-09-07.md` §4 recorded, as a measured fact:

> **Per-slot cardinality, measured** (three sources disagreed and all three were wrong):
> exactly **two** controls per template refuse a second attachment — `CLAddAttachment110`
> and `ADAddAttachment803`.

That is wrong. It is five, identical on both templates, each opening its handler with

```js
if (this.resolveNode(this.name.substr(0,2) + "Attachment" + this.name.substr(this.name.length-3)).presence == "visible") {
  xfa.host.messageBox("Only a single cover letter is needed.","",2,0);
} else { /* … the add path … */ }
```

| SOM path | FDA's words |
|---|---|
| `root.CoverLetter.CLAddAttachment110` | Only a single cover letter is needed. |
| `root.AdministrativeInformation.RelatedSubmissions.NSE510k.ADAddAttachment660` | Only one NSE'd 510(k) is required. |
| `root.RiskManagement.RiskMitigationTable.RMAddAttachment100` | Only one Risk/Mitigation table is required. |
| `root.RiskManagement.BenefitRisk.BRAddAttachment110` | Only one Benefit/Risk analysis is required. |
| `root.AdministrativeDocumentation.ADAddAttachment803` | Only a single Terms/Acronyms list should be attached. |

The two the earlier report named are the first and the last — the two an eye lands on. The
rule is now **read from the template** (`SINGLE_ATTACHMENT_REFUSAL`, anchored on the
`presence == "visible"` test rather than on the message text, which differs per control),
and asserted whole in the test rather than counted: a reader that started matching the
signed-PDF message box every one of the 113/145 handlers opens with would report 113, and
"more than zero" would call that correct.

The §4 finding that the "Only three attachments" limit sits inside a `/* … */` block is
confirmed — both occurrences, both templates.

### 3b. The slot module's own docblock had the withdrawn counts

`estar-attachment-slots.ts` read *"112 slots over 65 distinct chapters (nIVD) and 140 over
77 (IVD)"* — the pre-correction numbers from `device-market-readiness-2026-09-07.md`, which
that report later withdrew. The tests in the same directory have pinned 113/67 and 145/78
since they were written. A comment disagreeing with the assertion beside it is how a
withdrawn number survives; corrected, with the correction dated in the file.

### 3c. The manifest locator, enumerated rather than trusted

`listXfaFields` on both templates, independently of the 2026-09-07 proof:

```
{ somPath: 'root.Verification.AttachmentManifest', type: 'text',
  inDatasets: true, dataSomPath: 'root.AttachmentManifest' }
```

identical on nIVD and IVD, which is why one constant serves both, and both ship
`root.AttachmentManifest = "***Start***"` and `root.ApplicationType.ATRadioButton100 = "1"`
(the FDA branch — so the User Fee Form resolves to `/CHAPTER 1/CH1.09/`, not Health
Canada's `CH1.04`, by the same computation FDA's own script performs on the same input).

---

## 4. The blank-form check had to be narrowed, or it would have been cleared

`fillEstarSubmission` refuses to call a fill "filled" when it wrote nothing, because the
alternative is handing back the blank official template dressed as a submission. The
manifest is a value the fill writes — so a request carrying attachments and no
administrative data would have written exactly one field, cleared the check, and produced
**a blank FDA form with files stapled to it**.

Two things keep that closed:

- `ESTAR_ATTACHMENT_MANIFEST_KEY` is deliberately **not** a member of any map in
  `ESTAR_FIELD_MAPS`, so the check can count administrative fields only. That also keeps
  the manifest out of `isFieldMapPopulated`, the governed-provenance resolution and the
  per-field report, where it would be a field with no governed source.
- The converse is a blocker too: a manifest that was **planned and then not written** would
  embed every file and route none of them. An attachment reaches CDRH as a manifest token,
  not as an embedded file.

Both are pinned by tests seen failing on the un-narrowed code.

---

## 5. The CI gate this necessarily broke, and its first self-test

`ci:governed-export-consequence-shape` pinned two literal strings, one of which was the
official route's exact `withOfficialExtras(consequence, fieldReport, retention)` call.
Adding the attachment report broke it, as §4 of the earlier report predicted. **The gate
was run and seen to fail on the real change before it was touched.**

It now pins the *property* rather than the argument list: the consequence is the wrapper's
first argument, and the wrapper's object literal opens with `...body`. A gate that fails
whenever an argument is added is not protecting the shape — it is protecting the argument
list, and the cheapest way to satisfy it is to stop passing things through the wrapper.

The earlier report also noted the gate **has no self-test**, "contrary to what one design
assumed". It has one now (`ci:governed-export-consequence-shape:selftest`, wired into
`pr-checks.yml`), which copies the repo into a scratch tree, breaks it in four ways the
gate exists to catch, and requires a non-zero exit for each. Writing it found two cases the
gate accepted — both because the gate asks whether a token is present *anywhere* in a file,
so a break leaving one copy behind passes. That is a real limit of a grep-shaped gate; the
self-test's cases are written to mean what their names say (`replaceAll`), and the limit is
now written down instead of assumed away.

---

## 6. Verification

| check | result |
|---|---|
| `estar/__tests__/estar-attachment-plan.test.ts` | 31 passed (new), both templates |
| `estar/__tests__/estar-fill.test.ts` | 40 passed (11 new), against the real vendored template |
| `estar/__tests__/estar-attachment-slots.test.ts` | 29 passed (1 new, 1 amended) |
| `tests/routes/estar-official-pdf.test.ts` | 35 passed (7 new), real template + real planner |
| estar engine + `server/services/forms` + both official-route suites | 26 files / 475 passed |
| `npx tsc --noEmit` | clean |
| `ci:governed-export-consequence-shape` | passes; **seen failing first** on the real change |
| `ci:governed-export-consequence-shape:selftest` | 5/5 (new) |
| pypdf 6.16.2 on the produced artifact | §1 |

### Every rule was seen to fail

Not "the tests pass". Each rule below was broken in the real source, the suite re-run, and
the named test observed to fail — then reverted. A gate that has only ever been seen to
pass has not been tested (CLAUDE.md).

| mutation | tests that failed |
|---|---|
| single-attachment detection blinded | 2 |
| duplicate-path memory removed | 2 |
| `***Start***` seed dropped | 4 |
| name-tree key ordinal frozen (keys collide) | 2 |
| jurisdiction values not passed to the slot resolver | 4 |
| acceptance check skipped | 4 |
| unknown slot falls through to the first slot | 2 |
| ASCII catch-all removed from the file name | 1 |
| extension budget ignored (name exceeds 124) | 2 |
| manifest counted as an administrative field | 1 |
| planned files never joined to the document | 1 |
| refusals reported but not blocking | 1 |
| manifest never written into the fill data | 5 |
| manifest names one file, `/Filespec` another | 1 |
| FDA's description dropped from the `/Filespec` | 1 |
| signed-PDF guard mistaken for a cardinality refusal | 4 |
| attachments accepted but never passed to the fill | 5 |
| the refusal's report withheld from the 422 | 1 |
| what was filed dropped from the governed record | 1 |
| the resolver trusts the body's program, not the request's | 1 |

---

## 7. What this does NOT do

**There is no surface yet, and that is a scope boundary, not an omission.**
`POST /official` accepts `attachments`, and every mechanical way the choice can be executed
wrongly is refused — but *which* document belongs in *which* of 113 slots is a regulatory
judgement, and nothing here derives it or should. A picker over 113 slots is only a product
once the choice is a persisted, governed artifact (the `c2c_estar_slot_map` the design panel
specified); a picker with nowhere to save to would be worse than none. That is the next
slice, and it is the whole of what remains of roadmap item 4.

The §4b limits are unchanged and unchangeable from a datasets-only build: the completeness
indicators are `<draw>` elements, so **a machine-built eSTAR still opens with every
attachment question red**; `<subform name="CLAttachment110" presence="hidden">` means the
per-attachment row with its Open and Delete buttons is never instantiated, so the applicant
cannot remove our files through the form; and slot subforms are `presence`-gated by the
applicant's own answers.

The one artifact that settles those — **one eSTAR with a single attachment added in Acrobat
Pro and saved** (`wo8-estar-attachments-2026-09-07.md` §4c) — is still outstanding, and is
still the only thing here that cannot be measured from the templates. It answers whether the
LiveCycle runtime preserves a datasets-only `AttachmentManifest` on open, which is the
question that decides whether any of this works in a viewer.
