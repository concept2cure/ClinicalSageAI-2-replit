# Design-Partner Pilot Agreement

> **DRAFT — FOR LAWYER REVIEW. NOT AN OFFER AND NOT A BINDING DOCUMENT.**
> Prepared 2026-09-20 by a Claude Code session (workstream W6) for founder
> review. No customer has seen or signed this or any earlier version. Every
> bracketed item is a placeholder. Statements about the platform describe the
> code on `concept2cure-v2` as of 2026-09-20; where a statement depends on a
> launch row that is not yet green (`docs/LAUNCH_DEFINITION_OF_DONE.md`), the
> row is cited and the statement is conditional. Launch row moved: **D9**.

---

**This Design-Partner Pilot Agreement** (the "Agreement") is made on
[DATE] between:

- **[CONCEPT2CURE LEGAL ENTITY NAME]**, a [STATE/COUNTRY] [entity type] with
  its principal place of business at [ADDRESS] ("**Provider**"); and
- **[CUSTOMER LEGAL NAME]**, a [STATE/COUNTRY] [entity type] with its
  principal place of business at [ADDRESS] ("**Customer**").

Provider and Customer are each a "Party" and together the "Parties".

## Background

A. Provider is developing Concept2Cure, a software platform for governed
regulatory document authoring, controlled-document management and eCTD
submission assembly (the "**Platform**"). The Platform has not yet been used
by a paying customer to file a submission on a production environment.

B. Customer is a sponsor or regulatory consultancy preparing [an IND / an
IND amendment / a first 510(k) technical file / other] and wishes to use the
Platform, under the terms below, as one of Provider's first design partners.

C. The Parties intend this pilot to establish whether the Platform is fit for
Customer's regulatory work, and to inform Provider's product and commercial
decisions. It is not a commitment by either Party to a longer relationship.

## 1. Definitions

- "**Launch Catalog**" means the six Platform applications listed in
  Exhibit A, as defined in the Platform's launch-scope registry
  (`shared/constants/launch-scope.ts`). No other Platform surface is in scope.
- "**Customer Data**" means all data, documents, records and content that
  Customer or its Users upload to, create in or generate through the Platform,
  including Governed Records and AI Outputs.
- "**Governed Record**" means any Customer Data that the Platform treats as a
  21 CFR Part 11 electronic record: controlled documents, document versions,
  electronic signatures, audit-trail entries, and assembled submission
  sequences and their manifests.
- "**AI Output**" means any text, structure, summary, check result or
  suggestion produced with the assistance of a large language model routed
  through the Platform's AI gateway.
- "**Named Regulatory User**" means the individual Customer designates under
  Section 5.1 as the accountable regulatory professional for the pilot.
- "**Pilot Environment**" means the single hosted production tenant Provider
  provisions for Customer under this Agreement. (Conditional on **D1**; until
  D1 is green the Pilot Environment is a staging environment and Section 7.6
  applies.)
- "**Users**" means Customer's employees and contractors that Customer
  authorises to access the Pilot Environment, up to the number in Exhibit A.

## 2. Scope of the pilot

2.1 **Launch Catalog only.** Provider grants Customer a non-exclusive,
non-transferable right during the Term for Users to access and use the Launch
Catalog in the Pilot Environment for Customer's internal regulatory work on
the program(s) named in Exhibit A.

2.2 **Out of scope.** Every Platform surface outside the Launch Catalog is
disabled in the Pilot Environment and is not licensed under this Agreement,
including (without limitation) device/IVD eSTAR assembly, CER/PER authoring,
predicate intelligence, global-market planning, prediction-backed forecasting
and pre-mortem reports, and the modules named as out of scope in the Launch
Definition of Done. Customer acknowledges that the Platform will display such
surfaces as "not in this release" and that no upgrade path is offered during
the Term.

2.3 **Submission transmission.** Assembly and validation of eCTD sequences is
in scope. Electronic transmission of a sequence to a health authority gateway
is **not** in scope unless and until Provider notifies Customer in writing
that Provider's FDA ESG transport has been accepted by FDA's test environment
(launch row **D7**). Until then the Platform reports transmission as not
configured, and Customer transmits any sequence through its own ESG account
or its own publishing vendor.

2.4 **No professional services.** Provider does not provide regulatory advice,
medical writing, or submission strategy under this Agreement. Any guidance
Provider's personnel give during check-ins is product support, not regulatory
counsel.

## 3. Term

3.1 The pilot begins on the Effective Date and runs for **[90] days** (the
"**Initial Term**").

3.2 The Parties may extend once by written agreement for up to **[90]**
further days (together with the Initial Term, the "**Term**"). Any further
use requires a subscription agreement.

3.3 The Term ends automatically if Customer has not accessed the Pilot
Environment for [45] consecutive days, subject to Section 7.4 (export).

## 4. Fees

4.1 Customer pays Provider a fixed pilot fee of **US$[15,000]** (the "**Pilot
Fee**"), invoiced on the Effective Date and payable within 30 days.

4.2 The Pilot Fee is non-refundable except as stated in Section 15.4.

4.3 If Customer enters into a subscription agreement or a per-submission order
with Provider within 30 days after the end of the Term, [100]% of the Pilot
Fee is credited against the first invoice under that agreement.

4.4 Fees exclude taxes. Customer is responsible for applicable sales, use,
VAT or similar taxes other than taxes on Provider's income.

> Pricing note for founder: the Pilot Fee is a **proposal**, not a figure in
> code. The Platform's self-serve tiers are $499/month (Startup Biotech) and
> $1,499/month (Growth). See `PRICING.md` §3 for the rationale for a fixed
> pilot fee above the self-serve entry tier and the credit mechanism.

## 5. Customer obligations as a design partner

5.1 **Named Regulatory User.** Customer designates one qualified regulatory
professional as the Named Regulatory User. This person holds the account that
signs governed actions during the pilot and is the person launch row **D10**
refers to.

5.2 **Reasonable engagement.** Customer will (a) attend a weekly 30-minute
check-in (agenda in the Onboarding Runbook), (b) complete the onboarding
milestones in Exhibit B on a reasonable-efforts basis, and (c) report defects
and usability issues through the support channel in the Support Policy.

5.3 **Feedback.** Customer grants Provider a perpetual, irrevocable,
royalty-free licence to use feedback, suggestions and usage observations to
improve the Platform. Feedback never includes Customer Data or Customer
Confidential Information.

5.4 **Compliance.** Customer is responsible for (a) its Users' compliance with
this Agreement, (b) its own quality-system procedures, SOPs and training that
govern how Users operate the Platform, and (c) the accuracy and regulatory
adequacy of anything it submits to a health authority.

## 6. Logo and case-study rights

6.1 **Logo.** Subject to Section 6.3, Customer grants Provider the right to
display Customer's name and logo on Provider's website and in investor and
sales materials as a design partner, from the date the Named Regulatory User
first signs a Governed Record in the Pilot Environment.

6.2 **Case study.** Subject to Section 6.3, Customer will cooperate in good
faith in the preparation of one written case study using the template in
`CASE_STUDY_TEMPLATE.md`. The case study will contain only facts that both
Parties can substantiate, with denominators stated for every quantified
outcome, and will describe human review of AI Outputs accurately.

6.3 **Approval.** Provider will not publish Customer's logo, name, any quote
attributed to Customer or its personnel, or any case study without Customer's
prior written approval of the specific material. Customer will respond to an
approval request within [10] business days and will not unreasonably withhold
approval of factually accurate material. Customer may withdraw approval of a
logo placement on 30 days' written notice; withdrawal does not apply to
materials already printed or distributed.

6.4 Nothing in this Section obliges Customer to disclose the identity of its
product, indication, or the content of any submission.

## 7. Data handling

7.1 **Ownership.** As between the Parties, Customer owns all Customer Data,
including every Governed Record and every AI Output. Provider claims no right
in Customer Data other than the limited licence in Section 7.2.

7.2 **Licence to Provider.** Customer grants Provider a licence to host,
process, transmit, display and back up Customer Data solely to provide the
Platform and support under this Agreement and the Data Processing Addendum.

7.3 **Part 11 records.** Provider will maintain Governed Records in the Pilot
Environment with the Platform's audit trail (a SHA-256-chained, HMAC-sealed,
append-only log; `server/services/auditService.ts`) and electronic-signature
capture for the Term and the retention period in Section 7.5. Provider does
not alter, back-date or delete Governed Records except as instructed in
writing by Customer's authorised representative and recorded in the audit
trail.

7.4 **Export on exit.** For **[60] days** after the end of the Term Customer
may, and on request Provider will, export: (a) all documents and document
versions in the Vault in their native formats; (b) assembled sequences and
their manifests; (c) the tenant data export (`/api/tenant-export`, JSON) and
the audit-trail export with its attestation report (`/api/audit/exports`,
`/api/tenant-export/attestation`), which Customer can verify offline. Provider
will assist with a reasonable number of export runs at no charge.

7.5 **Retention and deletion.** After the export window, Provider will delete
Customer Data from the active Pilot Environment within [30] days and from
backups within [35] days thereafter (the production database's automated
backup retention is 35 days), **except** that audit-trail records are retained
in cold storage under Provider's audit-log retention policy
(`docs/operations/audit-log-retention-policy.md`: ten years for the central
and tamper-proof audit surfaces) because those records document actions that
Customer's own Part 11 obligations may require it to evidence. On written
request Provider will provide a copy of the retained audit records at any time
during the retention period.

7.6 **Staging environments.** If, during the Term, the Pilot Environment is a
staging environment rather than a production environment (launch row **D1**
not yet green), Provider will say so in writing before Customer uploads any
Customer Data, and Customer will not rely on that environment as its system
of record for any Governed Record. Any Governed Record created on staging will
be migrated to production by Provider, with its audit trail, or re-created by
Customer on production, before it is relied on.

7.7 **Security posture, stated plainly.** As of the Effective Date Provider
holds no SOC 2 report of any type, has not completed a third-party penetration
test, and encrypts specific secret fields (not all data) at the application
layer; whole-database encryption at rest, multi-AZ and automated backups are
properties of the AWS RDS deployment. Provider will notify Customer when each
item in launch row **D6** is completed. Customer's security questionnaire, if
any, will be answered against this posture and not against any aspirational
one.

7.8 The Data Processing Addendum in `DATA_PROCESSING_ADDENDUM.md` forms part
of this Agreement. Where Customer Data includes protected health information,
Section 4 of that Addendum applies and no such data may be uploaded until a
business associate agreement is in force between the Parties and between
Provider and its AI subprocessor (launch row **D6**).

## 8. AI-use disclosure and human review

8.1 **Disclosure.** The Platform uses large language models to draft, frame,
summarise and explain. The primary model for regulatory drafting is Claude
(Anthropic), accessed through Provider's AI gateway. Every model the Platform
can route to is an entry in Provider's approved-models registry
(`server/services/ai-governance/approved-models.ts`) with a pinned version,
a rationale and an evaluation reference. Provider will give Customer the
current registry on request and will notify Customer before changing the
primary drafting model during the Term.

8.2 **Engines decide; the model narrates.** Numbers, verdicts, validation
results, readiness scores and other governed content are produced by
deterministic engines in the Platform (eCTD packager, validators, conformance
checkers, rule packs). The model does not produce those figures. Where an
engine has insufficient data it reports that condition rather than a value.

8.3 **AI Outputs are drafts.** Every AI Output is a draft for a qualified human
to review. No AI Output becomes a Governed Record, is signed, is placed in a
sequence, or is treated as submittable until a User has reviewed it and taken
the governed action (with reason-for-change capture and, where configured,
electronic signature) in the Platform. Customer is solely responsible for the
review and for the content it submits to any health authority.

8.4 **No training on Customer Data.** Provider does not use Customer Data to
train or fine-tune any model. Provider's AI subprocessors are engaged under
terms under which Customer Data submitted through the API is not used to
train their models. [Counsel: confirm against the current Anthropic Commercial
Terms and the zero-data-retention posture in the DPA before signature.]

8.5 **Data sent to models.** Customer Data is sent to the AI subprocessor only
as needed to perform the action the User requested. The Platform's placement
policy (`AI_PROVIDER_PLACEMENT_APPROVALS`) governs which provider, in which
region and under which retention posture, may receive which data class, and
fails closed when the configuration is missing. The pilot configuration is
stated in the Order Form.

8.6 **Transparency in the record.** The audit trail records which model
version produced an AI Output that a User later acted on, so that Customer can
answer a health-authority question about AI involvement from its own records.

## 9. Validated state

9.1 Provider maintains a validation package for the Platform (validation
master plan, IQ, OQ, PQ, risk analysis, traceability matrix and summary
report under `docs/validation/`). As of the Effective Date that package is
**not** signed by an independent qualified reviewer and the PQ for the
current primary model version is pending execution. Launch row **D4**
defines the signed state.

9.2 Provider will (a) supply Customer with release notes for every release
deployed to the Pilot Environment, (b) operate change control under
`docs/RELEASE_GOVERNANCE.md`, and (c) provide IQ/OQ evidence for each release
on request (`scripts/ops/generate-iq-oq-pack.mjs`).

9.3 Customer is responsible for its own performance qualification, user
acceptance testing, SOPs and training. Provider will supply test scripts and
a sandbox on request to support Customer's PQ.

9.4 Nothing in this Agreement is a representation that the Platform is
"Part 11 compliant", "validated" or "certified". Part 11 compliance is a
property of Customer's validated installation and quality system.

## 10. No warranty on regulatory outcome

10.1 Provider does not warrant, and Customer does not rely on any statement
that, use of the Platform will result in acceptance, filing, clearance,
approval or any other outcome from any health authority, notified body or
other regulator, or that any AI Output is accurate, complete, or suitable for
submission without review.

10.2 The Platform is provided during the pilot **"as is"**. To the maximum
extent permitted by law Provider disclaims all implied warranties, including
merchantability, fitness for a particular purpose and non-infringement.
Provider does warrant that it will provide the Platform and support with
reasonable skill and care and will comply with Sections 7 and 8.

## 11. Limitation of liability

11.1 Neither Party is liable for indirect, consequential, special, punitive or
exemplary damages, or for lost profits, lost revenue, loss of data (other than
as caused by breach of Section 7), or regulatory delay, however arising.

11.2 Each Party's total aggregate liability under this Agreement is limited to
the Pilot Fee paid or payable.

11.3 Sections 11.1 and 11.2 do not limit liability for (a) death or personal
injury caused by negligence, (b) fraud, (c) a Party's breach of Section 13
(Confidentiality), or (d) any liability that cannot be limited by law.
[Counsel: consider whether Provider's breach of Section 7 (data handling)
should sit inside or outside the cap given Provider's stage.]

## 12. Intellectual property

12.1 Provider retains all right, title and interest in the Platform, its
documentation, templates, rule packs, engines and any improvements, and in
anonymised, aggregated usage data that does not identify Customer or contain
Customer Data.

12.2 Customer retains all right, title and interest in Customer Data. AI
Outputs are Customer Data as between the Parties; Provider makes no claim to
them and gives no warranty as to their protectability.

12.3 No implied licences. Customer will not reverse-engineer the Platform,
access it to build a competing product, or use it to develop or train a
machine-learning model.

## 13. Confidentiality

13.1 Each Party will hold the other's Confidential Information in confidence,
use it only for this Agreement, and protect it with at least reasonable care,
for the Term and five years after (indefinitely for trade secrets and
Customer Data).

13.2 Customer Data, the identity of Customer's product and program, and the
content of any submission are Customer Confidential Information. The
Platform's non-public features, roadmap, pricing and this Agreement are
Provider Confidential Information.

13.3 Standard exclusions (public through no fault, independently developed,
rightfully received from a third party, required by law with notice) apply.

## 14. Insurance

[Counsel/founder: state what Provider carries at signature — e.g. technology
E&O and cyber — and the limits. Do not state coverage Provider does not hold.]

## 15. Termination

15.1 Either Party may terminate for convenience on [30] days' written notice.

15.2 Either Party may terminate immediately on written notice if the other
materially breaches and fails to cure within 15 days of notice, or becomes
insolvent.

15.3 Provider may suspend access immediately where continued access would
create a security risk to the Platform or other tenants, and will restore
access as soon as the risk is addressed.

15.4 If Provider terminates for convenience, or Customer terminates for
Provider's uncured breach, Provider refunds the Pilot Fee pro rata for the
unexpired portion of the Initial Term.

15.5 Sections 6.3 (approval), 7.4–7.5 (export, retention), 10, 11, 12, 13 and
17 survive termination.

## 16. Governing law and disputes

This Agreement is governed by the laws of **[STATE / COUNTRY]**, without
regard to conflict-of-laws rules. The Parties submit to the exclusive
jurisdiction of the courts of **[VENUE]**. [Counsel: consider a mediation
step before litigation, and whether arbitration is preferable given Provider's
size.]

## 17. General

17.1 **Entire agreement.** This Agreement, its Exhibits and the Data
Processing Addendum are the entire agreement on the pilot and supersede prior
discussions. Purchase-order terms do not apply.
17.2 **Assignment.** Neither Party may assign without consent, except to a
successor in a merger or sale of substantially all assets, on notice.
17.3 **Independent contractors.** No partnership, agency or joint venture.
17.4 **Notices.** In writing to the addresses above; email to [ADDRESSES]
suffices for operational notices.
17.5 **Publicity.** Other than Section 6, neither Party will issue a press
release about this Agreement without the other's consent.
17.6 **Severability; waiver; counterparts; electronic signature.** Standard.
17.7 **Order of precedence.** Exhibit A, then the DPA, then this body, then
the Onboarding Runbook and Support Policy (which are operational documents
and not warranties).

---

**Signed for Provider:** ______________________ Name/Title/Date

**Signed for Customer:** ______________________ Name/Title/Date

---

## Exhibit A — Pilot scope

| Item | Value |
|---|---|
| Program(s) in scope | [e.g. "one IND for [product code], original submission (sequence 0000)"] |
| Launch Catalog applications | Projects; Vault; Authoring; Submission Center; Submission Readiness; QMS controlled documents |
| Surfaces per application | As enumerated in `shared/constants/launch-scope.ts` (Projects: projects, project-home, program-journey, filings-catalog, tasks. Vault: vault, artifacts-center. Authoring: document-authoring, authoring-engine, template-library, review, regulatory-workspace. Submission Center: submission-center, dossier-map, ectd-compile, ectd-coauthor, ectd-publishing, gateway-transmittals. Submission Readiness: dispatch-readiness, orchestration, inconsistency. QMS: quality, qmp.) |
| Users | Up to [5] named Users, including the Named Regulatory User |
| Named Regulatory User | [NAME, TITLE, EMAIL] |
| Pilot Environment | [Production tenant on Provider's AWS environment (D1 green) / Staging tenant — see §7.6] |
| AI placement for this tenant | Provider: Anthropic (shared API); residency: [global]; zero-data-retention: [no — pending signed agreement / yes]; fallback providers: [none / list] |
| Transmission | Not in scope (§2.3) unless D7 notice given |
| Pilot Fee | US$[15,000] |
| Term | [90] days from [DATE] |

## Exhibit B — Pilot milestones and success criteria

| Week | Milestone | Evidence |
|---|---|---|
| 0 | Tenant provisioned; Named Regulatory User logs in with email OTP; launch catalog visible | Provider's onboarding checklist (Onboarding Runbook day 0) |
| 1 | First project and first Vault upload | Audit-trail entries |
| 2 | First governed draft reviewed and signed | Audit-trail entry with signature |
| 4 | First sequence assembled and validated in Submission Center | Readiness report; validation report |
| 6–12 | [One] governed document filed into a sequence by the Named Regulatory User | Audit-trail entry (this is the D10 evidence) |
| 12 | Export test: tenant export and audit attestation verified offline | Export receipt; attestation verification output |
| Any | Weekly check-in held | Provider's check-in notes, shared with Customer |

Success for the pilot means every row above is met **or** the Parties have
documented why a row is not achievable in this Term. A row that is not met is
reported as not met, never as met.
