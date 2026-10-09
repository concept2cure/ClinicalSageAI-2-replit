# Customer story template

> **DRAFT TEMPLATE — placeholders only.** Prepared 2026-09-20 by a Claude
> Code session (workstream W6). There is no customer and no case study;
> every bracket is a placeholder and nothing in this file may be published
> until a design partner has approved the specific text under Pilot
> Agreement §6.3. Written to the shape of Anthropic's published customer
> stories (short headline result, "how [customer] uses Claude", quantified
> outcomes with denominators, explicit human oversight and safety language)
> so that an approved story can be offered to Anthropic without rework.
> Launch row moved: **D9** (a published story would be **D10** evidence).

---

## Rules for filling this in

1. **Every number has a denominator and a period.** "[N] documents signed
   in [period]", "[X]% of validation findings resolved before the sequence
   left the tenant, out of [N] findings across [M] sequences". A number
   without a denominator is removed.
2. **Numbers come from the audit trail or the customer's own records**, not
   from estimates. Cite the source in the working draft; strip the citation
   only in the approved public version.
3. **The customer's product, indication and submission content are never
   named** unless the customer asks for it in writing.
4. **Human oversight is stated as a fact of the workflow**, not as a
   disclaimer: who reviewed, who signed, what the model did and did not do.
5. **No claims the code does not support.** No "validated", "certified",
   "compliant", "approved by FDA", "FDA-accepted" unless the specific event
   happened and is documented (a test-environment acceptance under **D7** is
   "accepted by FDA's ESG test environment", nothing more).
6. **Claude is named as the model**, consistent with the launch rule for
   Anthropic-facing material; the platform is named as the system of record.
7. **Quotes are verbatim and approved by the person quoted.**

---

# [Customer] files [its first IND sequence / its first amendment] from a governed system of record with Claude-drafted, human-signed documents

**[One-sentence result with a denominator: e.g. "[N] Module 2 sections
drafted with Claude, reviewed and signed by [role], and compiled into a
validated eCTD sequence, with [X] of [Y] validation findings resolved
inside the tenant before hand-off."]**

| | |
|---|---|
| Company | [Customer] — [stage, e.g. Series B biotech; headcount; therapeutic area only if approved] |
| Team | [N] regulatory staff; [N] consultants |
| Submission | [IND original sequence 0000 / amendment / annual report] |
| Applications used | [Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents — delete any not used] |
| Model | Claude [Opus 5 — pinned version from the approved-models registry at the time] via the Concept2Cure AI gateway |
| Period | [start] – [end] |

## Key results

- **[Metric 1 with denominator]** — e.g. "[N] governed documents created and
  signed in [period], each with reason-for-change and a server-verified
  electronic signature."
- **[Metric 2 with denominator]** — e.g. "Sequence [0000] compiled and
  validated [N] times before hand-off; [X] of [Y] findings closed in the
  tenant."
- **[Metric 3 with denominator]** — e.g. "[N] cross-document inconsistency
  findings surfaced by the readiness check; [M] confirmed and corrected by
  the regulatory lead."
- **[Time or cost comparison only if the customer's own baseline is
  documented]** — e.g. "against the customer's prior quote of [$] for
  outsourced publishing of an equivalent sequence" (cite the quote in the
  working draft).

## The challenge

[Two paragraphs. The customer's situation before: team size, the
submission and its date, where documents lived, how review happened, what
the alternative was (consultant/publisher quote, Word and email). Use the
customer's words where approved.]

## Why [Customer] chose Concept2Cure

[One paragraph. The specific reasons, in order of weight: system of record
with a Part 11 audit trail; drafting with citations; the sequence compiled
and validated before hand-off; no per-seat fee; the published posture
including its gaps. Include the customer's view of the risk of a new vendor
and how the pilot terms addressed it.]

## How [Customer] uses Claude in Concept2Cure

**System of record.** [Describe: one project for the program; controlled
documents in Vault; SOPs in QMS controlled documents; every action in the
SHA-256-chained, HMAC-sealed audit trail.]

**Drafting.** [Describe: which sections Claude drafted from which sources;
that every draft carried citations; that figures in the draft came from
source documents or deterministic engines, and that the model produced no
regulatory verdicts.]

**Human review and signature.** [Describe: who reviewed each draft, what
they changed (with an approved example), reason-for-change capture, the
electronic signature with server-side identity verification, and that no
draft became a governed record before that step.]

**Compilation and validation.** [Describe: the dossier map, the compiled
sequence, the validation report, the readiness verdict, and how findings
were resolved. State plainly how the sequence was transmitted — through the
customer's own ESG account or vendor unless **D7** transmission was in
scope and used.]

> "[Verbatim quote from the named regulatory user about the review
> workflow, approved by them.]"
> — [Name, Title, Customer]

## Results

[Two or three paragraphs expanding the key results, each with its
denominator and source. Include what did not work or was out of scope, in
one sentence, if the customer agrees; a story with no friction reads as
marketing.]

## Safety, oversight and governance

- Claude drafts, frames and explains; it does not produce figures, verdicts
  or validation results. Those come from Concept2Cure's deterministic
  engines.
- Every AI draft is reviewed and signed by a named, qualified person before
  it becomes a governed record. The audit trail records the model version
  behind each draft.
- Models are pinned in an approved-models registry with a rationale and
  evaluation reference; only the approved primary model and its validated
  fallbacks serve regulatory drafting.
- Customer data is not used to train models. [State the data-retention
  posture in force during the period exactly: standard API terms / signed
  zero-data-retention agreement / BAA. Do not overstate.]
- [State the validation-package status in force during the period exactly:
  "unsigned" or "signed on [date] by [roles]".]

## What's next

[One paragraph. The next sequence, the lifecycle subscription if signed,
anything the customer asked for that is "not in this release" — stated as
not in this release.]

## About [Customer]

[Approved boilerplate.]

## About Concept2Cure

Concept2Cure is a governed system of record for regulatory documents and
eCTD submissions at small sponsors and the consultancies that serve them:
controlled documents, drafting assistance from Claude with citations, a
Part 11 audit trail on every action, and sequence compilation and
validation before hand-off. [Founder: keep to what is true on the
publication date.]

---

## Approval record (internal, not published)

| Item | Approved by | Date | Evidence |
|---|---|---|---|
| Logo use | | | Pilot Agreement §6.1 |
| Each quote | | | Email from the person quoted |
| Each metric | | | Audit-trail export / customer record cited |
| Final text | | | Pilot Agreement §6.3 written approval |
| Anthropic co-marketing (if offered) | | | Customer consent to share with Anthropic |
