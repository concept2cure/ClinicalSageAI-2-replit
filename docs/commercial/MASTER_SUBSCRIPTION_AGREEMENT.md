# Master Subscription Agreement (GxP edition)

> **DRAFT — FOR LAWYER REVIEW. NOT AN OFFER AND NOT A BINDING DOCUMENT.**
> Prepared 2026-09-20 by a Claude Code session (workstream W6) for founder
> review. No customer has signed this. Bracketed items are placeholders.
> Platform statements describe the code on `concept2cure-v2` as of
> 2026-09-20; statements that depend on a launch row that is not yet green
> (`docs/LAUNCH_DEFINITION_OF_DONE.md`) are conditional and cite the row.
> Launch row moved: **D9**.

---

This Master Subscription Agreement (the "**MSA**") is between
**[CONCEPT2CURE LEGAL ENTITY NAME]** ("**Provider**") and the customer named
on an Order Form that references this MSA ("**Customer**"). It governs every
Order Form the Parties sign. The Data Processing Addendum
(`DATA_PROCESSING_ADDENDUM.md`), the Support Policy (`SUPPORT_POLICY.md`) and
each Order Form (`ORDER_FORM.md`) are incorporated by reference.

## 1. Definitions

- "**Service**" means the Concept2Cure hosted platform, limited to the
  applications listed on the Order Form. At launch the available
  applications are the six in the Launch Catalog (`shared/constants/
  launch-scope.ts`): Projects, Vault, Authoring, Submission Center,
  Submission Readiness and QMS controlled documents.
- "**Customer Data**", "**Governed Record**", "**AI Output**" and "**Users**"
  have the meanings in the Pilot Agreement §1, which apply here mutatis
  mutandis.
- "**Documentation**" means Provider's then-current user and validation
  documentation for the Service.
- "**Order Form**" means an ordering document signed by both Parties that
  references this MSA.
- "**Release**" means any change to the Service's deployed code or
  configuration that reaches Customer's production tenant.
- "**Subscription Term**" means the term stated on the Order Form.
- "**Validation Package**" means the documents in Section 6.1.

## 2. The Service

2.1 **Access.** During the Subscription Term Provider grants Customer a
non-exclusive, non-transferable right for Users to access and use the Service
for Customer's internal business purposes (and, for a consultancy Order Form,
for work on behalf of its named clients) in accordance with the
Documentation.

2.2 **Scope.** Only applications named on the Order Form are licensed. All
other Platform surfaces remain disabled ("not in this release") until an
Order Form adds them. Provider's launch-scope enforcement is server-side and
applies equally to every tenant, including Provider's own.

2.3 **Transmission.** Electronic transmission to a health-authority gateway
is included only if the Order Form says so and only after Provider has
notified Customer that its transport has been accepted by the authority's
test environment (launch row **D7**). Otherwise the Service assembles and
validates sequences and Customer transmits through its own account or vendor.

2.4 **Provider's own use.** Provider may access Customer's tenant only to
provide the Service and support, to investigate a security or integrity
event, or as Customer directs in writing; every such access is recorded in
the audit trail.

2.5 **Restrictions.** Customer will not (a) resell or time-share the Service
except under a consultancy Order Form, (b) reverse-engineer it, (c) use it to
build a competing product or to train a machine-learning model, (d) upload
malicious code, (e) circumvent tenant, launch-scope or entitlement controls,
or (f) upload data it is not permitted to process, including protected
health information without the agreements in DPA §4.

## 3. Customer responsibilities

3.1 Customer is responsible for its Users, its credentials, the accuracy and
lawfulness of Customer Data, its own quality-system procedures, and every
regulatory submission it makes.

3.2 **Human review.** Customer acknowledges that AI Outputs are drafts, that
governed content and figures come from the Service's deterministic engines
and not from a model, and that no AI Output is a Governed Record until a User
has reviewed it and taken the governed action in the Service. The MSA's AI
terms are those in Pilot Agreement §8, incorporated here.

3.3 **Named accountable user.** Customer designates on each Order Form the
regulatory professional accountable for governed actions in the tenant and
keeps that designation current.

## 4. Fees and payment

4.1 Customer pays the fees on the Order Form. Unless the Order Form says
otherwise, subscription fees are invoiced annually in advance and
per-submission fees are invoiced [50% on order, 50% on sequence validation];
all invoices are due within 30 days.

4.2 Late amounts accrue interest at the lesser of 1% per month or the maximum
lawful rate. Provider may suspend the Service on 15 days' written notice of
non-payment; audit-trail and export access (Section 10) remain available
during suspension.

4.3 Fees are exclusive of taxes. Provider may increase subscription fees for a
renewal term on 60 days' notice before renewal, by no more than [the greater
of 5% or CPI].

4.4 **Overage.** Usage beyond the limits on the Order Form (users, projects,
storage, AI credits) is charged at the rates on the Order Form or, if none,
blocked with an honest "quota reached" state rather than silently degraded.

## 5. Term and renewal

5.1 This MSA starts on the date of the first Order Form and continues while
any Order Form is in effect.

5.2 Each Order Form renews for successive terms equal to the initial
Subscription Term unless either Party gives [60] days' notice of non-renewal.
A per-submission Order Form ends when its deliverable is accepted and the
access period on the Order Form expires.

## 6. Validated-state commitments (GxP terms)

6.1 **Validation Package.** Provider maintains, and provides to Customer on
request under Section 12 (Confidentiality): a validation master plan;
installation qualification (IQ); operational qualification (OQ) with executed
automated-test evidence; performance qualification (PQ) for the approved
primary drafting model; a risk analysis; a requirements-to-test traceability
matrix generated from the test suite; and a validation summary report.
Provider's current package lives under `docs/validation/`. **Until launch
row D4 is green** the package is unsigned by an independent qualified
reviewer and the PQ for the current primary model version is pending
execution; Provider will state the package's status in writing on request
and will notify Customer when D4 is met.

6.2 **Release notes.** Provider will publish release notes for every Release
to Customer's production tenant, stating the change, the affected
applications, the affected Part 11 controls (if any), and the validation
impact assessment, no later than the day of deployment (and at least [5]
business days before deployment for any change that alters a Governed Record
format, a signature flow, the audit trail, an eCTD packaging rule or a
validation rule).

6.3 **Change control.** Releases follow `docs/RELEASE_GOVERNANCE.md`: a
protected product branch, required CI gates, author/reviewer separation, a
release ledger, and a documented emergency break-glass procedure with
retrospective review. Provider will make the release ledger available to
Customer on request.

6.4 **IQ/OQ evidence per Release.** For every Release Provider generates and
retains IQ/OQ evidence (`scripts/ops/generate-iq-oq-pack.mjs`: environment
verification, automated test execution results, and the traceability delta)
and provides it to Customer on request within [10] business days.

6.5 **Approved-model governance.** Every model the Service can route to is an
entry in Provider's approved-models registry with a pinned version, a
rationale and an evaluation reference. Provider will (a) not change the
primary drafting model for Customer's tenant without [30] days' notice and an
updated PQ reference, (b) provide the registry on request, and (c) record in
the audit trail the model version behind any AI Output that a User acts on.

6.6 **Customer PQ.** Customer performs its own PQ/UAT, SOPs and training.
Provider will provide test scripts and a non-production tenant for that
purpose on request. [Founder: decide whether a sandbox tenant is included in
the subscription or priced separately; it is not provisioned automatically
today.]

6.7 **Part 11 controls.** The Service provides: unique user accounts;
password plus a second factor at login (email one-time code required for all
Users; TOTP available per User); role-based access; a SHA-256-chained,
HMAC-sealed, append-only audit trail; electronic-signature capture with
server-side identity verification; reason-for-change capture on governed
actions; and controlled-document version history. Provider makes no
representation that the Service is "Part 11 compliant" on its own; compliance
is a property of Customer's validated installation.

6.8 **Periodic review.** Provider runs its Part 11 UX, honest-state,
design-system and security auditors against the Launch Catalog on a weekly
cadence and files the reports as periodic-review evidence; Customer may
request the most recent reports [quarterly].

## 7. Audit rights

7.1 **Customer audit.** Once per contract year, on [30] days' written notice,
Customer (or an independent auditor bound by confidentiality) may audit
Provider's compliance with Sections 6, 8 and the DPA by document review and
remote interview during business hours. Provider's obligation is limited to
[two] business days of personnel time per audit unless the audit follows a
security incident or a regulatory finding, in which case it is unlimited for
that matter.

7.2 **Regulatory inspection support.** If a health authority or notified body
inspects Customer and requests information about the Service, Provider will
respond to Customer's reasonable requests within [5] business days, provide
the Validation Package, release ledger and audit-trail exports, and make a
knowledgeable person available by video call at no charge for up to
[8] hours per inspection.

7.3 **Provider audit.** Provider may verify Customer's use against the Order
Form limits using the Service's own metering; it does not access Customer
Data for that purpose.

## 8. Security

8.1 Provider will maintain the technical and organisational measures in DPA
Annex II and will not reduce them during a Subscription Term.

8.2 **Posture disclosure.** Provider's current posture is published in
`SECURITY.md` and includes stated gaps. As of 2026-09-20 Provider holds no
SOC 2 report and has not completed a third-party penetration test (launch
row **D6**). Provider will notify Customer within [10] business days of
completing each D6 item and will provide the resulting reports under
Section 12. Nothing in Customer's security questionnaire responses may state
a control Provider does not have.

8.3 **Incident notice.** Provider will notify Customer without undue delay,
and within [48] hours, of a confirmed security incident affecting Customer
Data, with the information required by DPA §7.

## 9. Service levels

> Placeholders. Provider is a solo-founder company operating with AI-run
> operations; the Support Policy states response targets honestly. Counsel and
> founder to set the SLA only at a level Provider can evidence.

9.1 **Availability target.** [99.5]% monthly availability of the Service,
measured at Provider's `/readyz` endpoint, excluding scheduled maintenance
announced under the Support Policy and excluding causes outside Provider's
control.

9.2 **Service credits.** If availability in a month is below the target,
Customer may claim a credit of [5]% of that month's subscription fee for each
full [0.5]% below the target, capped at [25]% of the monthly fee. Credits are
Customer's sole remedy for availability shortfalls short of the termination
right in 9.3.

9.3 **Chronic failure.** If availability is below [97]% in any [two]
consecutive months, Customer may terminate the affected Order Form on notice
and receive a pro-rata refund of prepaid fees.

9.4 **Backups and recovery.** Provider's production database is configured
with automated daily backups retained for 35 days and multi-AZ replication
(`terraform/modules/rds`). Provider's disaster-recovery drill procedure
exists (`docs/operations/database-disaster-recovery.md`); production RPO/RTO
targets are [TBD — founder approval required] and will be stated on the
Order Form once approved.

## 10. Data return and deletion

10.1 During the Subscription Term and for [60] days after it ends, Customer
may export Customer Data at any time through the Service (Vault documents in
native formats; sequences and manifests; the tenant JSON export; the audit
trail export with its HMAC attestation report), and Provider will assist on
request.

10.2 After the export window Provider deletes Customer Data from the active
environment within [30] days and from backups within the backup rotation
(35 days), except audit-trail records retained under Provider's audit-log
retention policy (ten years, cold storage) which Provider will provide to
Customer on request at any time during retention.

10.3 On request Provider will certify deletion in writing.

## 11. Subprocessors

11.1 Customer authorises the subprocessors listed in DPA Annex III. At launch
these are, at minimum: **Anthropic, PBC** (large-language-model inference via
the Claude API — primary drafting model) and **Amazon Web Services** (hosting,
managed database, object storage, key management; and, where ordered, Claude
via Amazon Bedrock inside a region Customer selects). Billing, error
monitoring, transactional email and uptime monitoring providers are listed in
the same Annex.

11.2 **BAA / zero-data-retention posture.** Provider's Anthropic engagement is
[a standard commercial API agreement / a signed zero-data-retention
agreement / a signed business associate agreement] as of the Order Form date.
The Service's placement registry marks the shared Anthropic API as
zero-data-retention only when a signed agreement is in force and the operator
has set the corresponding flag (`ANTHROPIC_ZERO_RETENTION`); it is not assumed.
A tenant that requires zero data retention or a specific region is served
only by a placement that contractually provides it (Claude on Amazon Bedrock
in the chosen region, or a self-hosted lane), and the Service never fails
over across that boundary. Launch row **D6** names the signed Anthropic BAA
as a launch requirement; until it is signed, no PHI may be processed.

11.3 Provider gives [30] days' notice of a new subprocessor; Customer may
object on reasonable data-protection grounds and, if unresolved, terminate the
affected Order Form with a pro-rata refund.

## 12. Confidentiality

As in Pilot Agreement §13, applied to the MSA and every Order Form.

## 13. Intellectual property

13.1 Provider owns the Service and all improvements, templates, rule packs
and engines. Customer owns Customer Data, including AI Outputs. Anonymised,
aggregated usage data that cannot identify Customer or any Customer Data is
Provider's.

13.2 **Outcome data (optional programme).** Customer may, by separate written
election on the Order Form, opt into a consent-based programme under which
de-identified submission-outcome data (e.g. the category of an information
request and how it was resolved) is pooled to improve the Service's rule
packs. Participation is off by default and never includes document content.

## 14. Warranties

14.1 Provider warrants that (a) the Service will perform materially in
accordance with the Documentation, (b) it will provide the Service with
reasonable skill and care, and (c) it will not materially decrease the
Service's core functionality or Part 11 controls during a Subscription Term.

14.2 Customer's remedy for breach of 14.1(a) is repair, replacement, or, if
Provider cannot do so within 30 days of notice, termination of the affected
Order Form with a pro-rata refund.

14.3 **No regulatory-outcome warranty.** Provider does not warrant any
health-authority outcome, the accuracy or completeness of any AI Output, or
that the Service is "validated", "certified" or "compliant" as a standalone
product. Except as stated in this Section, the Service is provided as is and
all implied warranties are disclaimed.

## 15. Indemnities

15.1 **By Provider.** Provider will defend Customer against third-party claims
that the Service, as provided by Provider, infringes a patent, copyright or
trademark or misappropriates a trade secret, and pay resulting damages and
costs finally awarded or agreed in settlement, excluding claims arising from
Customer Data, Customer's modifications, or combinations not supplied by
Provider. Provider may procure a licence, modify the Service, or terminate the
affected Order Form with a refund.

15.2 **By Customer.** Customer will defend Provider against third-party claims
arising from Customer Data, Customer's regulatory submissions, or Customer's
breach of Section 2.5, and pay resulting damages and costs.

15.3 Standard procedure: prompt notice, control of defence, reasonable
cooperation, no settlement admitting fault without consent.

## 16. Limitation of liability

16.1 No indirect, consequential, special or punitive damages; no lost profits,
revenue, or regulatory delay.

16.2 Each Party's aggregate liability under this MSA and all Order Forms is
limited to the fees paid or payable by Customer in the [12] months before the
event giving rise to the claim.

16.3 Exclusions: death or personal injury from negligence; fraud; breach of
Section 12; indemnity obligations; [breach of DPA obligations up to a
separate cap of [2×] fees — counsel to decide].

## 17. Termination

17.1 Either Party may terminate this MSA or an Order Form for uncured
material breach (30 days) or insolvency.

17.2 On termination or expiry, Section 10 applies. Customer pays fees accrued
to the termination date; if Customer terminates for Provider's breach,
Provider refunds prepaid fees for the unexpired term.

17.3 Sections 6.1 (as to records already provided), 7.2 (for [2] years as to
records of the Subscription Term), 10, 12, 13, 14.3, 15, 16, 17 and 19
survive.

## 18. Insurance

[State what Provider actually carries at signature — technology E&O, cyber —
with limits. Do not state coverage not held.]

## 19. General

Governing law **[STATE/COUNTRY]**; venue **[VENUE]**; assignment only with
consent or to a successor on notice; force majeure; independent contractors;
notices in writing (email to [ADDRESS] for operational notices); no waiver;
severability; counterparts and electronic signature; export compliance;
entire agreement with order of precedence Order Form → DPA → MSA → Support
Policy → Documentation; purchase-order terms rejected; amendments in writing.

---

**Signed for Provider:** ______________________ Name/Title/Date

**Signed for Customer:** ______________________ Name/Title/Date
