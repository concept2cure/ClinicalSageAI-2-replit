# Data Processing Addendum

> **DRAFT — FOR LAWYER REVIEW. NOT A BINDING DOCUMENT.**
> Prepared 2026-09-20 by a Claude Code session (workstream W6). No customer
> has signed this. Bracketed items are placeholders. The subprocessor list,
> regions and retention statements below are taken from the code on
> `concept2cure-v2` (`server/services/ai-gateway/providers/placement.ts`,
> `terraform/environments/production`, `docs/operations/`) as of
> 2026-09-20 and must be re-checked at signature. Launch row moved: **D9**;
> several statements are conditional on **D1** and **D6**.

---

This Data Processing Addendum ("**DPA**") forms part of the Pilot Agreement
or Master Subscription Agreement (the "**Agreement**") between
**[CONCEPT2CURE LEGAL ENTITY NAME]** ("**Provider**") and **[CUSTOMER]**
("**Customer**"). It applies to the extent Provider processes Personal Data
on Customer's behalf in providing the Service.

## 1. Definitions and roles

1.1 "**Data Protection Laws**" means, as applicable, the EU General Data
Protection Regulation 2016/679 ("GDPR"), the UK GDPR and Data Protection Act
2018, the Swiss FADP, the California Consumer Privacy Act as amended, and
the US Health Insurance Portability and Accountability Act and its
implementing regulations ("HIPAA").

1.2 "**Personal Data**", "**Controller**", "**Processor**", "**Data
Subject**", "**Processing**", "**Personal Data Breach**" and "**Supervisory
Authority**" have the meanings in the GDPR; "**Protected Health
Information**" ("PHI"), "**Business Associate**" and "**Covered Entity**"
have the meanings in HIPAA.

1.3 **Roles.** Customer is the Controller (or a Processor acting for its
client, in which case Provider is a sub-processor and Customer warrants it
has the client's authorisation) and Provider is the Processor of Personal
Data contained in Customer Data. Provider is an independent Controller of
account and billing data about Customer's personnel needed to administer the
Agreement.

1.4 **What Personal Data the Service typically holds.** In regulatory work
the Personal Data Provider expects to process is: User account data (name,
work email, role, authentication events); names, roles and signatures of
document authors, reviewers and approvers embedded in Governed Records and
audit trails; investigator, sponsor-contact and manufacturer-personnel
details inside submission documents; and, only where a Customer uploads
them, subject-level clinical data (which may be pseudonymised, and which may
be PHI). Annex I records the actual categories for this Customer.

## 2. Processing instructions

2.1 Provider processes Personal Data only on Customer's documented
instructions, which are: the Agreement, this DPA, Customer's configuration of
the Service, and Users' actions in the Service. Provider will inform Customer
if it believes an instruction infringes Data Protection Laws.

2.2 Provider does not use Personal Data or Customer Data to train or
fine-tune machine-learning models, and does not permit its subprocessors to.

2.3 Provider does not sell, share for cross-context behavioural advertising,
or otherwise use Personal Data for its own purposes.

## 3. Provider obligations

3.1 **Confidentiality.** Provider's personnel and contractors with access to
Personal Data are bound by confidentiality obligations and trained on this
DPA. [Founder: as of 2026-09-20 Provider's personnel is the founder; Claude
Code sessions operating the platform act under the founder's account and are
recorded in the audit trail as such.]

3.2 **Security.** Provider implements the measures in Annex II and will not
materially reduce them during the Agreement.

3.3 **Data Subject requests.** Provider will, within [5] business days,
forward any Data Subject request it receives that relates to Customer's
Personal Data and will provide reasonable assistance (including through the
tenant export and audit export tools) so Customer can respond.

3.4 **Assistance.** Provider will assist Customer with data-protection impact
assessments and prior consultations as reasonably required, at Customer's
cost where the assistance exceeds [8] hours per year.

3.5 **Deletion and return.** On expiry of the export window in the Agreement,
Provider deletes or returns Personal Data as the Agreement provides, except
audit-trail records retained under Provider's audit-log retention policy
(ten years, cold storage) because they evidence regulated actions; those
records are retained under the same security measures and are provided to
Customer on request.

3.6 **Audit.** Provider will make available the information necessary to
demonstrate compliance with Article 28 GDPR and allow audits as the Agreement
provides (MSA §7). Where Provider later holds a SOC 2 or equivalent report
(launch row **D6**), Provider may satisfy an audit request by providing that
report plus a bridge letter, except for-cause audits.

## 4. HIPAA / protected health information

4.1 The Service is built to support HIPAA-regulated workflows (access
control, audit logging, field-level encryption of specific identifiers) but
Provider **does not claim HIPAA compliance** and the application cannot by
itself create that condition (`docs/AI_SENSITIVE_DATA_PLACEMENT.md`).

4.2 Customer will not upload PHI to the Service unless and until (a) a
Business Associate Agreement between Customer and Provider is signed, (b)
Provider has a signed Business Associate Agreement with each AI subprocessor
that will receive PHI (launch row **D6** names the Anthropic BAA as a launch
requirement), and (c) Provider has configured Customer's tenant with a
placement policy that routes PHI only to a placement marked
zero-data-retention and BAA-covered (see §6). Provider will confirm (a)–(c)
in writing before Customer's tenant accepts PHI.

4.3 Where the parties sign a BAA, it controls over this DPA for PHI.

## 5. Subprocessors

5.1 Customer gives general authorisation to the subprocessors in Annex III.
Provider will give [30] days' notice of any addition or replacement; Customer
may object on reasonable grounds and, if the parties cannot resolve the
objection, terminate the affected Order Form.

5.2 Provider imposes data-protection obligations on each subprocessor that
are no less protective than this DPA and remains liable for their
performance.

## 6. AI processing, residency and retention options

6.1 **How the Service routes AI requests.** Every large-language-model
request goes through Provider's AI gateway, which consults a placement
registry describing, for each provider, its substrate (shared frontier API;
frontier model inside a private cloud account; self-hosted), the regions it
can be pinned to, and whether the placement contractually retains no
payloads. A tenant requirement for residency or zero data retention is
enforced before every dispatch, including fallbacks; a request that cannot be
placed compliantly is refused with a stated reason, never silently routed
elsewhere.

6.2 **Placements available at launch** (from `placement.ts`; region codes
are `us`, `eu`, `apac`, `on_prem`; "global" means no residency guarantee):

| Placement | Substrate | Regions | Zero data retention | Notes |
|---|---|---|---|---|
| Anthropic Claude API (default) | Shared frontier API | global | Only when a signed ZDR agreement is in force and the operator sets `ANTHROPIC_ZERO_RETENTION=true`; **not in force as of 2026-09-20** | Primary drafting model. Anthropic's standard commercial API terms do not use API inputs/outputs for model training. [Counsel: cite the current Anthropic Commercial Terms and retention schedule at signature.] |
| Claude on Amazon Bedrock | Frontier model in Provider's (or Customer's) AWS account | `us` by default (us-east-1); otherwise the region the client is deployed to (`AI_BEDROCK_REGION` / `AWS_REGION`). The residency the platform claims is derived from that region, and a production deployment whose declared `AI_BEDROCK_RESIDENCY` disagrees with it refuses to start | Yes by default (no-retention, no-training posture of the private substrate) | The placement for residency- or BAA-constrained tenants. Requires an Order Form line; not provisioned by default. |
| Claude on Google Vertex AI | Frontier model in a GCP project | The region the client is deployed to (`AI_VERTEX_REGION`; `us-east5`, so `us`, by default) | Only when the operator records it (`AI_VERTEX_ZERO_RETENTION=true`) once project-side caching and logging are confirmed off | Available in code; not deployed for launch. |
| OpenAI models on Azure | Frontier model in an Azure tenant | Only as declared (`AI_AZURE_RESIDENCY`); none claimed otherwise | Only when modified abuse monitoring is approved and recorded (`AI_AZURE_ZERO_RETENTION=true`) | Available in code; not deployed for launch; not approved for high-risk regulatory drafting. |
| OpenAI API | Shared frontier API | global | Only with a signed ZDR agreement (`OPENAI_ZERO_RETENTION`) | Fallback lane; not approved for high-risk regulatory drafting. |
| Moonshot AI (Kimi) | Shared frontier API | global | No | Cross-provider fallback only; excluded for any residency- or ZDR-constrained tenant. |
| Self-hosted open-weight models | Self-hosted | `on_prem` | Yes | The only air-gappable lane; not approved for high-risk regulatory drafting until PQ. Not offered for launch. |

6.3 **Recommended pilot configuration** (founder decision; record on the
Order Form): Anthropic Claude API only, no cross-provider fallback, residency
"global", zero-data-retention "no" until the Anthropic agreement is signed.
Tenants that need EU residency or ZDR are served on Claude via Amazon Bedrock
in the required region once that placement is deployed; Provider will not
accept such a tenant until it is.

6.4 **Hosting residency.** Provider's launch production environment is a
single AWS environment in **us-east-1** (`terraform/environments/
production/main.tf`); launch row **D1** is not yet green. EU or other-region
hosting is not available at launch. Customers requiring it should not sign
until Provider offers it in writing.

6.5 **What is sent to the model.** Only the content needed for the action a
User requested (for example, the section being drafted and the retrieved
source passages). The Service's sensitive-data detector classifies content
before dispatch; in production, dispatch of a detected sensitive data class to
a provider not approved for that class is blocked (`AI_PROVIDER_PLACEMENT_
APPROVALS`, fail closed).

## 7. Personal Data Breach

7.1 Provider will notify Customer without undue delay and within [48] hours of
becoming aware of a Personal Data Breach affecting Customer's Personal Data,
providing the nature of the breach, categories and approximate numbers of
Data Subjects and records, likely consequences, measures taken, and a
contact point, supplementing as information becomes available.

7.2 Provider will cooperate with Customer's notifications to Supervisory
Authorities and Data Subjects and will not notify them itself unless required
by law.

## 8. International transfers

8.1 Provider processes Personal Data in the United States. For transfers of
EU/EEA, UK or Swiss Personal Data, the parties incorporate [the EU Standard
Contractual Clauses (Module 2 controller-to-processor / Module 3
processor-to-processor), the UK International Data Transfer Addendum, and
the Swiss amendments], completed as in Annex IV. [Counsel: confirm whether
Provider will certify to the EU-US Data Privacy Framework instead of or in
addition to SCCs.]

8.2 Provider will inform Customer if it can no longer comply with the
transfer mechanism.

## 9. Liability and precedence

Liability under this DPA is subject to the limitations in the Agreement,
subject to any carve-out the Agreement states for data-protection breaches.
In a conflict, this DPA prevails over the Agreement on data-protection
matters; a signed BAA prevails over both for PHI.

---

## Annex I — Details of processing

| Item | Detail |
|---|---|
| Subject matter | Provision of the Concept2Cure Service (Launch Catalog applications) |
| Duration | The Agreement term plus export window and retention periods in §3.5 |
| Nature and purpose | Hosting, storage, retrieval, drafting assistance, validation, audit logging and export of regulatory documents and records at Customer's instruction |
| Categories of Data Subjects | Customer's Users; authors, reviewers and approvers named in records; investigators and site staff; sponsor and manufacturer contacts; [clinical-trial subjects — pseudonymised / PHI — only if §4 conditions met] |
| Categories of Personal Data | Identification and contact data; professional data; authentication and activity logs; electronic signatures; [health data — only if §4 conditions met] |
| Special categories | [None / Health data under §4] |
| Frequency | Continuous during the term |
| Retention | Per Agreement §10 and §3.5 |

## Annex II — Technical and organisational measures (as built, 2026-09-20)

Stated as implemented; where a control is partial it says so, consistent
with `SECURITY.md`.

- **Access control.** Unique accounts; bcrypt (cost 12) password hashing;
  email one-time-code second factor required at login for every User; TOTP
  second factor available per User (opt-in, not enforceable org-wide today);
  role-based access; JWT session tokens with short expiry and rotation-aware
  verification; SSO/SAML configurable per domain (`identity-console`).
- **Tenant isolation.** Application-layer organisation scoping on every
  request, with a CI gate that blocks tenant-trust regressions; Postgres
  row-level-security policies exist on tenant-keyed tables and are enforced
  when the runtime connects as the non-superuser application role with
  `RLS_ENFORCE=on` — the state launch row **D3** requires and which is not
  yet proven on staging.
- **Encryption.** TLS at the ingress (AWS ALB/CloudFront). Managed Postgres
  (RDS) volume encryption and KMS-managed keys in the production Terraform;
  application-level AES-256-GCM encryption of TOTP secrets and stored
  integration credentials; a general field-encryption helper exists but is
  not yet applied to PII/PHI columns.
- **Integrity.** Append-only audit trail with SHA-256 hash chain and HMAC
  seal; chain verifier; signed audit exports with offline-verifiable
  attestation; compliance-evidence S3 bucket with Object Lock in COMPLIANCE
  mode, 7-year default retention.
- **Availability and recovery.** RDS multi-AZ, automated daily backups
  retained 35 days, deletion protection; documented restore drill; RPO/RTO
  targets not yet approved.
- **Monitoring.** Sentry error monitoring; external uptime monitoring;
  readiness endpoint `/readyz` reporting schema, AI, cache and worker state.
- **Application security.** Security headers (Helmet), CSRF double-submit,
  Redis-backed rate limiting (per-process fallback without Redis), Zod input
  validation, parameterised queries, dependency and secret scanning in CI.
- **Change control.** Protected product branch, required CI gates, release
  ledger, break-glass procedure (`docs/RELEASE_GOVERNANCE.md`).
- **Organisational.** Solo founder with AI-assisted operations; background
  checks and formal security training programme [not yet in place — founder
  to state]; incident-response procedure in `SUPPORT_POLICY.md`.
- **Not yet in place** (launch row **D6**): SOC 2 examination; third-party
  penetration test; published per-tenant retention and residency statement
  (this DPA is the draft of that statement).

## Annex III — Subprocessors (launch)

| Subprocessor | Purpose | Location of processing | Basis / posture |
|---|---|---|---|
| Anthropic, PBC | LLM inference (Claude) for drafting, framing, summarising | United States (global API) | Commercial API terms; no training on API data; ZDR agreement [not yet signed]; BAA [not yet signed — D6] |
| Amazon Web Services, Inc. | Hosting (ECS Fargate), managed Postgres (RDS), object storage (S3), key management (KMS), CDN, and, where ordered, Claude via Amazon Bedrock | us-east-1 (launch); other regions only where ordered | AWS DPA and, where PHI, AWS BAA [founder to execute] |
| Stripe, Inc. | Subscription billing and payment processing (Customer's billing contact data only; no Customer Data) | United States | Stripe DPA |
| Functional Software, Inc. (Sentry) | Application error monitoring (stack traces and request metadata; content scrubbing configured) | United States | Sentry DPA |
| [SMTP provider — founder to name] | Transactional email: login one-time codes, notifications (recipient email address and code only) | [region] | [DPA] |
| [Uptime monitoring provider — founder to name, e.g. UptimeRobot] | External availability probes (no Customer Data) | [region] | [terms] |
| OpenAI, L.L.C.; Moonshot AI | Present in the gateway as fallback lanes; **disabled for a tenant unless its Order Form lists them** | United States; [Moonshot — founder to confirm] | Only with the tenant's written election |

## Annex IV — Transfer mechanism details

[Module selection, Annex I.A/I.B/I.C of the SCCs, competent Supervisory
Authority, UK Addendum tables, governing law and forum for the clauses —
counsel to complete.]
