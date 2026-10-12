# D2 — the regulatory record: what AnA knows, and what she refuses to guess (2026-10-05 →)

Lane: `…session_017d4r3CzS4BdBo5x7EpLdEt`, row **D2**, claimed in
`docs/work-orders/README.md` §0.

Round 1 is [`../2026-10-04/README.md`](../2026-10-04/README.md). Round 2's depth
fixes are [`../2026-10-04-depth/README.md`](../2026-10-04-depth/README.md). This
round executes the plan those rounds produced:
[`docs/design/ANA_REGULATORY_RECORD.md`](../../../design/ANA_REGULATORY_RECORD.md),
chosen from three independent designs by two judges and then checked by a
completeness critic. Its 26 product decisions are in
[`DECISIONS.md`](DECISIONS.md).

The owner set the scope on 2026-10-04:

> "She must be the all-everything expert across all of that" — FDA, EU and
> Japan, for medicines, devices and diagnostics.

and on 2026-10-05 answered all 26 decisions at once: *"make the best choice for
our niche client base."* They are decided in `DECISIONS.md`, by this lane acting
as product manager, for small and mid-size biotech, medtech and diagnostics
sponsors — who file with FDA first, then EU notified bodies and EMA, then PMDA,
and who mostly have no regulatory-operations department to catch a wrong answer
before it reaches an agency.

## Standing

| | Steps |
|---|---|
| Landed, with evidence on `concept2cure-v2` | **70** |
| Implemented, awaiting review or commit | 8 |
| Not started | 110 |
| **Plan total** | **188** |

Batch 1 is complete (29/29). Batch 2 is at 29/35. The per-step evidence is in
this directory as `<step-id>-red.txt`, `-green.txt` and `-facts.md`: the test
failing against the old code, the same test passing, and every regulator fact
the step relies on with its URL and check date, or labelled `recall`.

## Method

Each step ran as a multi-agent workflow in one checkout, on `concept2cure-v2`,
with no branches (Rule 0):

1. an independent re-verification of the finding;
2. a test written first and run **red** against the old code;
3. the change;
4. green on that test and on every importer's tests;
5. an adversarial review, read-only, with up to three fix rounds;
6. a committer that typechecks and re-runs the tests **before** committing, and
   a reverter that saves the diff and restores the tree when review fails.

Agents never pushed. A step whose review found a blocking issue was fixed or
reverted, never committed. Three steps were reverted this round. Two of them —
the EU MDR/IVDR rule table and the CER/PER validator — were then rebuilt against
the defect class their reviews named, and landed (`963c2167`, `92ac7e0e`). One
is still unshipped and is listed under *Owed*.

## What is now true

### One record, one resolver

The platform held about 150 hand-kept copies of CTD codes and titles, and the
Module 1 misfilings found in round 1 all sat in copies no test enumerated.

| Commit | What is now true |
|---|---|
| `35f036ef` | Every regulatory fact can say whether it was checked against the regulator's own text: one `RegulatoryBasis` type with `regulator-text` (needs a regulator-hosted URL and a check date), `recall`, or `platform-convention`. |
| `aa8d6f3e` | A CSR's "ICH E3" citation links to E3 itself, and each regulator source is declared once. |
| `436794fe` | "What must this section contain" is answered by **one** resolver every path calls, instead of four partial tables. |
| `ca874aa2` | The record knows which Module 2–5 headings ICH M4 actually defines. An invented `4.3.1` is refused. |
| `3ea53fe5` | EU and Japanese Module 1 come from one cited record. An EU eCTD MAA is no longer told its table of contents is missing. |
| `4ac726b0` | NDA, BLA and ANDA gates require Module 1 where FDA files it; the J-NDA outline gains 1.11 draft RMP. |
| `64818b1f` | A registry that names a CTD code wrongly now fails CI against one shared contract. |
| `b92c257d` | Any document outline can be briefed to AnA from data, each statement labelled with its basis. |
| `b97340ba` | AnA says which outlines come from a canonical record and which are still hand-kept lists. |
| `7f3edfc8` | eCTD validation checks an EU MAA and a J-NDA against their own region's required sections, not the FDA set. |

### A section is drafted against what it must contain

| Commit | What is now true |
|---|---|
| `345aac57` | CSR sections are drafted against what ICH E3 says each one contains, not the model's memory of E3. |
| `ecabf4b1` | A section rewritten from the AnA chat is written against what that section must contain. |
| `9b04ea61` | Batch drafts of 2.7.4, 5.3.5.3, the IB and 3.2.P.5 are written against their required content. |
| `23eac90f` | An IND section such as 4.2.3 Toxicology is drafted as the whole section, not as its first sub-section. |
| `788ca613` | AnA is offered the section tool when the turn names a code ("2.7.3", "2.6.2", "5.3.5.3"). |
| `df30b4bb` | The section-requirements, technical-rules and database-lock tools are always offered. |
| `a8c237a9` | Chat SAE narratives ask for every ICH E3 §12.3.2 element, with no invented causality scale. |

### Fail closed, instead of a false "ready"

A false "ready" is the failure that reaches an agency. Each of these refused a
verdict the inputs could not support.

| Commit | What is now true |
|---|---|
| `db4dc657` | An NDA with no Module 5, or an empty IVDR file, is no longer "conditional go". |
| `e6f80d75` | A drug dossier no longer reads as a ready Japanese Shōnin or EU MDR device file. |
| `433200b9` | No 510(k) or De Novo "ready" without labeling, IFU, a truthful-and-accurate statement or a user fee. |
| `5a56280c` | An EU SmPC with no shelf life or container section is not complete. |
| `d4d5264b` | CTIS readiness checks the EU CTR Annex I documents per member state; a US NDA is not CTIS-ready. |
| `963c2167` | `classify_device` no longer calls a pacemaker Class IIb or an IVD self-test Class B, and states no class it cannot support. |
| `c0bc6c6f` | IVDR classify no longer calls every blood-grouping test Class D, nor offers Class B an Annex XI route. |
| `25710c65` | A device whose EU class is **not determined** no longer scores "classification determined"; AnA asks for the missing facts. |
| `92ac7e0e` | CER/PER validation no longer calls a report valid when scope, appraisal, evaluator qualification, PMCF, references or an IVDR performance pillar is missing. |
| `c82ded5a` | A novel device is pointed to De Novo, with no claimed 510(k), exemption or HDE the inputs do not support. |
| `1ac2a348` | The device eSTAR verdict comes from the open project's governed content, not from what the model types. |
| `28e13154` | A 510(k) or De Novo whose device answers contradict its own sections is held back before FDA's technical screening sees it. |
| `b0d43373` | eSTAR filing readiness says when the template on file is not FDA's current version. |
| `c3d838ab` | The IND generation API no longer reports a section as drafted when it was never saved, nor a project as untouched when its sections could not be read. |
| `8d919b1f` | The writing gate no longer passes a document whose structure it did not check. |
| `6d2b4bd1` | The writing gate no longer lets an invented table ground an invented number. |
| `e841291c` | Dataset-package readiness no longer passes a package FDA would reject for missing TS, DM, ADSL or define.xml. |
| `9ccf42b3` | AnA says the platform refuses a secured PDF leaf, from both rule tools. |
| `5f7c5569` | The CSR, IB and protocol rule packs no longer claim a high-confidence ICH M4 basis. |
| `c5c9ab29` | The software documentation summary no longer reports completeness against an assumed Basic level. |

### The regulator's own channel, and nothing sent on an unread rule

| Commit | What is now true |
|---|---|
| `3e4c1f3f` | EU filings name their real EMA channel: centralised eCTD is build-only via the eSubmission Gateway; orphan/PIP/PRIME/advice go via IRIS; never CESP. |
| `c72a02f2` | An e-signed centralised MAA sequence is refused at transmit and never posted to CESP. |
| `b086d6fe` | The EU datasheet, AnA's MAA submit step and the SOP generator name the eSubmission Gateway; the US datasheet no longer presents eCTD v4.0 as the format. |
| `cbe8cd03` | A new Japanese application in eCTD v3.2.2 is blocked at dispatch. |
| `62ff3edc` | Nothing is sent to PMDA over an unsourced protocol, and Japan devices no longer show as transmittable. |
| `6becd3fd` | A US sequence's Study Tagging Files are named `stf-<study-id>.xml`, point at `index.xml` leaf IDs, and refuse a dataset tag FDA rejects (TRC 1735). |

### Japan

| Commit | What is now true |
|---|---|
| `c4e663ff` | AnA no longer tells a client Japan requires bridging data, a Japanese comparator or a Japanese QT study. PMDA consultations are named as PMDA names them. |
| `f1ebbf3f` | A correct new-format Japanese package insert is ready; 慎重投与/原則禁忌 drafts are refused. |
| `d5b83cf4` | Japanese programme answers describe conditional approval and the paediatric plan as amended in 2025, labelled unverified. |

### Devices, diagnostics and combination products

| Commit | What is now true |
|---|---|
| `a81811bf` | Design controls cite ISO 13485 §7.3 under the QMSR; a missing independent reviewer no longer blocks a DHF. |
| `46a80385` | `assess_qms` maps every ISO 13485 clause to the QMSR in force, and no longer claims the QMSR keeps the DMR. |
| `496fd7e7` | The combination-product cGMP plan states the QMSR-era 21 CFR 4.4(b)(1) call-outs: 21 CFR 820.10 and the ISO 13485:2016 clauses. |
| `553887bf` | An IVDR GSPR checklist cites IVDR Annex I numbering (§1–8, §9–19, §20), not the MDR's. |
| `f997a5e8` | Device labeling lists the FDA IVD (809.10) and investigational (812.5) elements and checks authored labeling for them. |
| `708b2fa3` | IVD knowledge names FDA's three PCCP components and dates the De Novo rule correctly (effective 2022-01-03). |
| `e97611d9` | Device reviewers ask for FDA's Basic/Enhanced software Documentation Level, not the retired Level of Concern. |
| `46dd613f` | New PMA projects scaffold an outline whose C.4 asks for that Documentation Level. |
| `11270d6a` | EU device clients are told risk must be reduced as far as possible (AFAP), not ALARP, with no cost justification. |
| `c4928da8` | Reviewing an EU risk management file, AnA gets the EU AFAP rule from the RMF tool itself. |
| `4f8a253c` | The device plan stops demanding the retired Form 3514 for 510(k) and De Novo filings. |
| `c5e871a0` | The filing catalog and AnA treat the 2024 LDT rule as void, and cite the QMSR rather than 21 CFR 820.30. |

### Meetings, lifecycle and post-market

| Commit | What is now true |
|---|---|
| `55e2ba67` | The generic FDA meeting package gives every meeting type's deadline, stops calling every request "Type B", and marks Type C's 47 days as recall. |
| `5d68ed78` | AnA cites 314.50(d)(5)(vi)(b) for the 120-day safety update, 314.60 for IR replies, and the iPSP's real deadline. |
| `4731c78e` | The post-market status API states EU obligations per regulation: IVDR B owes a PMS report, C/D an SSP. |
| `4b793d04` | A PSUR is authored one way, as the program's post-market document; the parallel builder is retired. |

### The dossier's own numbers

| Commit | What is now true |
|---|---|
| `ec1184cc` | The arithmetic check no longer flags version numbers, European decimals or another population's arm list, and says what is wrong. |
| `59919d38` | HARMONIZE flags references that do not exist, and stops warning on ones it cannot check. |
| `c479a62e` | The database-lock plan no longer counts a SAP as the CSR, and sees a CSR filed at 5.3.5 or in Module 5. |
| `78e81575` | The Vault read for the submission plan also returns document ids, from the one shared query. |

### Tools that tell the truth about themselves

| Commit | What is now true |
|---|---|
| `d68ab20b` | Two IND tools that returned an authentication error on every call are gone; IND drafting goes to the authoring document. |
| `e20999e3` | The US label format rules fit AnA's result budget with room for the next rule. |
| `ab582250` | A chat on an NDA or BLA is told what it is; an IND chat is told the IB is required. |

## The cross-document clinical figure engine

Decision 19 first withdrew it, after four review rounds each found a new class
of false result in ordinary CSR wording. The product owner overrode that on
2026-10-05 (`68c4e8c1`):

> "I disagree with this decision: 'The clinical figure lexicon was deliberately
> not shipped' figure out how to and do it."

It was rebuilt on the one idea that makes it converge: **a figure becomes a
claim only when its whole frame is identified** — measure, population, arm,
scope, timepoint, effect type, CI level and sidedness, and the value with its
precision as written. Two claims are compared only when their frames are
identical; anything else is `not_compared` **with its reason**, never a conflict
and never "consistent". A document is never summarised as consistent unless at
least one pair was actually compared.

Its specification is an adversarial corpus, not a prose spec. Its state and
evidence are `clinical-claims-corpus.md` and `clinical-claims-{red,green}.txt`.
The integration onto `reconcile_dossier_numbers`, `figure-consistency` and
`check_dossier_consistency` — which deletes the three unframed regex readers
rather than adding a fourth — is batch 8 of the plan.

## Owed, and limits stated plainly

- **110 plan steps are not started**, mostly batches 4–7: the acceptance-rule
  corpus fold, the remaining device and EU content, the study-data path, and the
  engine integration.
- **8 steps are implemented and awaiting review or commit.** Their work is
  preserved in the session scratchpad. Four of the ten passed adversarial review
  before their run hit a weekly model limit; two of those four are now landed
  (`2c9699b3` the chat CER/PER projection, `fc025c5a` the EU dated facts), each
  re-verified against the current trunk rather than trusted — the patches still
  applied, their tests still passed, and every dated EU fact was re-checked
  against the date of landing. The remaining eight are:
  `g-k510-denovo-pack-v1-1` and `g-ctd-registry-inventory-ratchet` (reviewed,
  not yet re-verified), `g-combination-product-one-engine`, `g-csr-copies-onto-e3`
  and `g-stf-1789-fail-closed` (implemented, never reviewed),
  `g-document-reference-matcher` (fixed once, not re-reviewed), and
  `g-classify-medical-device-mapper` and `g-section-basis-default` (incomplete).
  None is on trunk, so none is claimed above.
- **One step is reverted and deliberately not shipped:** the writing-register
  follow-ups. Three review rounds each found it turning ordinary ICH E3
  disposition, exposure and adverse-event-outcome wording into a high-severity
  "over-claim" finding — the same false-positive class the gate exists to avoid.
  Its diff is kept in the session scratchpad. The two other reverts this round
  were rebuilt and landed: the EU MDR/IVDR rule table (`963c2167`) after it
  silently dropped qualifier facts and under-classified an X-ray generator, and
  the CER/PER validator (`92ac7e0e`) after loose keyword matching kept calling
  non-conforming reports valid — it now requires a heading, per framework.
- **Primary regulator sites are blocked for direct fetch in this environment**
  (`fda.gov`, `ema.europa.eu`, `pmda.go.jp`, `ecfr.gov`, `database.ich.org`),
  and the Lawstronaut connector needs re-authorisation. Facts marked
  `regulator-text` rest on search extracts of regulator-hosted pages, each with
  its URL and check date. Verbatim re-reads are owed, listed per step in
  `<step-id>-facts.md`.
- **Nothing here is a claim about FDA's Elsa.** FDA has published no acceptance
  criteria for it, so "passes Elsa" is not a claim this platform makes. What is
  defended is meeting FDA's own written technical rules.
