# Module 1 placement, from the landed record (2026-10-12)

**Row:** D2 (AnA document intelligence). **Workstream:** the regulatory record.

## What the platform was telling sponsors

A sponsor at a 40-person biotech does not own a copy of FDA's regional Module 1 controlled
vocabulary. They accept the number the platform gives them. Five copies gave their own numbers,
none of them read from `shared/regulatory/regional-module1.ts`, which has held the FDA tree with
its citations since 2026-10-09:

| Copy | It said | FDA says |
|---|---|---|
| `server/services/ana-ri/document-routing.ts` | IB → **1.3.3** | 1.3.3 is **Debarment Certification** (21 USC 335a), marketing applications only — not a node an IND has. The IB is **1.14.4.1** (21 CFR 312.23(a)(5)). |
| `server/services/ana-ri/document-routing.ts` | cover letter → **1.1**; table of contents → **1.2** | 1.1 is **Forms**, 1.2 is the **Cover Letter**. They were swapped. And the table of contents is not a Module 1 heading at all: the XML backbone *is* the table of contents. |
| `server/services/ana-ri/document-routing.ts` | Form 1572 → **1.3.1** | 1.3.1 is Contact/Sponsor/Applicant Information. Every FDA transmittal form files under **1.1 Forms**. |
| `server/services/ctd-ingestion-service.ts` | risk management / RMP → **1.5.1** | US **1.5 is Application Status** — "withdrawal, inactivation, reactivation and reinstatement requests" — and it has **no child sections at all**. The platform was proposing that a sponsor file their risk-management plan under the heading whose controlled meaning is that they are withdrawing the IND. |
| `server/services/ctd-ingestion-service.ts` | patent information → **1.3.1** | Patent information and certification is **1.3.5**. |
| `server/services/vault/vault-filing.service.ts` | uploaded IB → **module-5 / 5.3** | Module 5 is where the **clinical study reports** live. |
| `server/routes/mission-control.ts` | IND scaffold creates the IB as a **module-5** artifact | — as above. |
| `services/regulatory/pyramids/ind-pyramid.ts` | IB task binds to **5.3.5.4** | — as above. |
| `services/regulatory/pyramids/ind-pyramid.ts` | cover letter → **1.1**; Forms 1571, 1572, 3674 → **1.2**; general investigational plan → **1.3**; environmental assessment → **1.2**; one binding named "Cover Letter / Meeting Request" at **1.2** | 1.1 is Forms and 1.2 is the Cover Letter — swapped, for four bindings at once. The general investigational plan is **1.20** (21 CFR 312.23(a)(3)); the environmental assessment is **1.12.14** (21 CFR 25.31); a meeting request is **1.6 Meetings**, so one binding naming two documents FDA files apart becomes two. Of the pyramid's nine Module 1 bindings, **eight were wrong**. |

The last three are the error the repository's own registry already names, in a comment written by
an earlier session: `shared/regulatory/global-document-registry.ts:271` — *"was M5, which is where
the CLINICAL STUDY REPORTS live; an M5 assignment puts it in the wrong backbone node and the
sequence does not validate."*

## What runs now

**`soleModule1Placement(role, jurisdiction, kind)`** — new, in the record. `placementFor` returns
every matching heading, which is the right shape for a reader and the wrong shape for a caller that
must put one number on one document. This narrows it, and returns **null** when the record holds no
node for the role, or more than one.

**A null is an answer, not a gap.** `soleModule1Placement('rmp', 'US')` is null because FDA has
REMS (1.16) and risk management that is not a REMS; there is no US node called an RMP, and the EU's
1.8.2 must not be carried over. The ingestion detector now returns the module with a **null
section** — the shape it already used where only the module is known — so the caller asks what the
document is. It does not fall back to a nearest match: a number that looked close is how 1.5.1
happened.

All five copies read from the record. No copy keeps a fallback literal: `vault-filing.service.ts`
carried `?? '1.14.4.1'` in an intermediate revision and it was removed, because a fallback literal
is the copy this step exists to delete.

**One citation on the same row.** The IND pyramid's IB task cited *ICH E6(R2) Section 7* as the
guideline in force. E6(R3) reached Step 4 on 2025-01-06 and moved that content to **Appendix A**
(`shared/regulatory/ich-e6r3.ts`, `E6R2_TO_R3['7']`); the task now cites `e6r3Ref({appendix A})`.
Nine further E6(R2) citations remain in the root-level `services/` tree, which the existing gate
`tests/regulatory/ich-e6r3-citations.test.ts` does not scan (`SCAN = ['server','shared','client/src']`).
**Recorded as owed, not fixed here.**

## Defects the registration surfaced, which the lane's own readers could not

The lane file's readers probed four filenames and four `/draft` phrases. Registering each copy's
*whole* table instead — and, for the pyramid, the **built** pyramid rather than the exported const
the tasks are assembled from — put the contract on rows nobody had looked at.

The pyramid's other **seven** wrong Module 1 bindings (in the table above) came out this way, and
only because the registry reads `buildIndPyramid()`. Reading the exported const would have passed:
a task that stops using the const and writes its own number back is exactly the regression the
registry exists to catch, and the first version of the reader could not see it. That was found by
the live mutation below, not by reasoning.

The Module 2–5 contract, reaching these tables for the first time, found three more:

- `document-routing.ts` routed "efficacy study report" to **5.3.1**. 5.3.1 is *Reports of
  Biopharmaceutic Studies*; efficacy and safety studies are **5.3.5** (ICH M4E(R2)). The row's own
  description — "controlled and uncontrolled efficacy studies" — is 5.3.5.1 and 5.3.5.2, so the
  number was the part that was wrong, not the document.
- `ctd-ingestion-service.ts` titled **5.3.3** "Clinical Pharmacology". The record titles it *Reports
  of Human Pharmacokinetic (PK) Studies*; PD reports file at 5.3.4.
- Fixing the first exposed the third: `document-routing.ts` also routed "clinical pharmacology |
  human pk" to **5.3.5** (the efficacy/safety heading) with a description naming three headings at
  once — "BA/BE, PK/PD, dose-response" — and "safety study report" to **5.3.3** (the PK heading).
  All three Module 5 rows named a different heading and all three were wrong. They are now
  5.3.1 *Reports of Biopharmaceutic Studies*, 5.3.3 *Reports of Human Pharmacokinetic (PK)
  Studies*, and one 5.3.5 *Reports of Efficacy and Safety Studies* — efficacy and safety share a
  heading in M4E, so two rows became one. The patterns no longer answer to a bare section number
  for these: a request naming 5.3.1 is asking for biopharmaceutic studies, and now gets them.

One existing test pinned one of the wrong numbers as a **positive control**:
`vault-filing.service.test.ts` asserted `cover letter.pdf → 1.1`. The expectation was the defect.
It now asserts 1.2, with the record cited beside it.

## A hole in the contract itself

The Vault revert-mutation — putting the IB back at 5.3 — **passed**, and should not have.
`violationsFor` began `if (!isModule1(code)) continue`, so a Module 1 document filed *outside*
Module 1 was invisible to every Module 1 check. That is precisely the M5 failure the global
registry's comment describes, and the contract could not see it.

The contract now reports it: a node whose title names a document the FDA record files under a real
Module 1 heading, carrying a Module 2–5 code, fails with *"… is a Module 1 document; it files under
1.14.4.1, not in Module 5"*. Rules whose heading is `null` are excluded — the table of contents is
not a Module 1 section, and CTD 2.1 *is* the Module 2 table of contents, which is right.

## Verified by making the check fail

**Live mutation, on the green tree.** Three production rows were reverted to the literals they
carried before this step — the pyramid's IB binding to `5.3.5.4`, the Vault rule to
`module-5` / `5.3`, the scaffold row to `module-5` / `1.3.3` — and **nine tests across both files
went red**, each naming the row and the heading it belongs under. Restored, and green again. Full
output in `g-m1-placement-from-the-record-red.live-mutation.txt`; it is the reproducible red for
the committed state.

**Red first.** `tests/regulatory/ctd-registry/m1-placement.consistency.test.ts` was written and run
before any production file changed. Its output named seven wrong rows:

```
1.1 "Cover Letter / Form 1571" — cover letter files under 1.2
1.2 "Table of Contents" — table of contents (the backbone is the TOC) is not filed as a Module 1 section in FDA eCTD
1.3.1 "Form 1572" — FDA transmittal form files under 1.1
1.3.3 "Investigator's Brochure" — investigator's brochure files under 1.14.4.1
1.1 "Cover Letter" — cover letter files under 1.2
1.3.1 "Patent Information" — patent information / certification files under 1.3.5
1.5.1 "Risk Management Plan" — REMS / risk management files under 1.16
```

and, for the last two copies:

```
× the Mission Control IND scaffold does not create the IB as a Module 5 artifact
  → expected '{ title: "Investigator\'s Brochure", …' not to contain '\'module-5\''
× the IND pyramid binds the IB task to the IB's own heading, not to the study reports
  → expected '5.3.5.4' not to be '5.3.5.4'
× the IND pyramid cites the IB guideline that is in force, not the one it superseded
  → expected '{"id":"phase5.investigator_brochure",…' not to contain 'E6(R2)'
```

`soleModule1Placement` itself was added together with its tests in one command, so it was never
seen red. That is a discipline failure against this repository's own rule, and it was corrected:
the export was renamed `soleModule1Placement_disabled`, the tests were run (`soleModule1Placement is
not a function`), and the name restored.

**The mutations are permanent, not a one-off run.** `ctd-registry-consistency.test.ts` now holds a
revert-mutation per copy, each putting back that file's *own* former literal — 1.3.3 for the IB,
1.1 for the cover letter, 1.3.1 for patent information, 5.3 for the Vault rule. Each asserts the
mutated copy fails with the named message **and** that the real copy is clean, so the failure is
the mutation and not the copy. A revert of this step — by a merge, by a session that does not know
the record exists, by a well-meant "the number looked close" — is caught and named.

One of those six mutations passed when first written. That is what found the contract hole above,
and the live mutation is what found that the pyramid's registry read the wrong thing.

**One new role in the record.** US 1.20 (General Investigational Plan for Initial IND) carried no
`roles` entry, so nothing could ask the record for it. `general_investigational_plan` was added to
`DOCUMENT_ROLES` and to that node; the pyramid's binding now reads it.

## What this step does not do

- The nine Module 1 bindings fixed here are the IND pyramid's. `ind-amendment-pyramid.ts` and
  `ind-safety-supplement-pyramid.ts` are **not registered and not migrated** — owed.
- EU and JP Module 1 are untouched. The router's three EU rows are registered as their own
  `region: 'EU'` entry, which means its Module 1 is **unchecked, not held** — the comment says so.
- Placements already stored in client databases are not corrected. A document filed at 1.3.3 before
  today stays there.
- `advise_ctd_structure` still answers from five hardcoded modules; two further unmigrated copies
  (`server/src/control-plane/placement-authority.ts:37`,
  `server/services/biostatistics-bridge/filing-placement.ts`) and the absent inventory ratchet
  `scripts/ci/check-ctd-registry-inventory.mjs` remain owed.
- The nine remaining E6(R2) citations in `services/`, and the gate's unscanned tree, remain owed.
