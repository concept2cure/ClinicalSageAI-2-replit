# ADR-0014: Launch security and data-protection decisions

## Status

**Accepted**

- Date: 2026-10-01
- Deciders: the D6 security session, acting as product owner and chief security officer under the
  founder's instruction of 2026-10-01 ("make product level decisions as the product owner and chief
  security officer … do what's right by all of our customers and the product").
- Answers: `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §6, items 3, 4, 5 and 9, and
  the open decisions behind P1-2 (the authenticator policy and the breach-corpus lookup), P1-10,
  P1-13, P1-22, P1-25, P1-43 and P2-1.
- Does not answer: anything only the founder can do as a person or an account holder (signatures on
  the policy set and the §11.100(c) letter, the GitHub ruleset, rotation of the historical database
  credential, contracts with a pen-test firm, AWS, Anthropic or counsel). Those are listed at the end.

## Context

The plan left ten decisions with the founder. Several of them block engineering that is otherwise
ready, and two of them are contradictions between what a customer is told and what the code does:

- The Data Processing Addendum says OpenAI and Moonshot are "disabled for a tenant unless its Order
  Form lists them". The code enforces no such thing. An organization with no placement row has
  `allowedProviders = null`, which the gateway reads as *every* provider. The claim is true today only
  because Terraform provisions no OpenAI or Moonshot key. Provision one key for one customer and the
  claim becomes false for all of them.
- The DPA's breach-notification figure is a bracketed `[48]`; the incident-response policy and the
  security questionnaire say 72 hours and say counsel will align the DPA to 72.

The customers are pharmaceutical, biotech and device sponsors in the United States, the European
Union and Japan. Their supplier-qualification questionnaires ask each of these questions by name.
An answer of "the founder has not decided" is an answer of "no".

## Decisions

### 1. Which AI providers may receive a tenant's content in production

1. **Anthropic is the production generation lane.** `ANTHROPIC_API_KEY` is required by the stack
   (P0-11, Terraform half).
2. **OpenAI receives a tenant's content only when that tenant's placement policy names it.** In
   production, an organization whose placement policy is absent or does not list `openai` is never
   routed to OpenAI, for generation, fallback or embeddings. The DPA's sentence becomes code (P1-45).
   When Anthropic is unavailable and the tenant has not elected a second provider, the request fails
   with an honest 503; it is never answered by a provider the tenant did not choose.
3. **Moonshot (Kimi) is not a production lane, for any tenant, under any election.** Production boot
   refuses `KIMI_API_KEY` and `MOONSHOT_API_KEY`, and the gateway drops the `moonshot` routes when
   `NODE_ENV=production` (P1-45). The lane remains for development only. Reasons:
   - **GDPR Chapter V.** China has no adequacy decision. A transfer-impact assessment for health and
     clinical content against PRC law (National Intelligence Law, Art. 7) does not conclude that
     standard contractual clauses can be complied with.
   - **APPI Art. 28.** A transfer of personal information to a foreign third party requires either
     consent given after the data subject is told about that country's regime, or a system that the
     PPC rules recognize as equivalent. Neither is a realistic basis for a sponsor's trial data.
   - **United States, 28 CFR Part 202** (DOJ rule on access to bulk US sensitive personal data by
     countries of concern, in force since 2025-04-08). A vendor agreement with a covered person that
     involves bulk personal health or human 'omic data is a restricted transaction. Whether a
     customer's use falls inside the rule's clinical-investigation exemptions is a legal analysis we
     will not ask a customer to perform in order to use our product.
   - **Procurement.** A PRC sub-processor on the list fails the supplier qualification of most of
     the customers this product exists for, whatever the routing rules say.
   The cost is one inexpensive fallback lane. It is not worth any of the above.
4. **Embeddings follow the same placement decision** (the application half of P0-11 is closed;
   P1-45 extends the election rule to them).
5. **The production embedding lane is self-hosted.** Text embeddings for Vault search and retrieval are produced
   by an OpenAI-compatible embedding server running the open-weight multilingual model BAAI `bge-m3` (MIT
   licence) inside our own network, one per region (`EMBEDDING_PROVIDER=local`, `EMBEDDING_LOCAL_BASE_URL`).
   No tenant text leaves the platform to be embedded, every tenant has search without electing a second vendor,
   residency follows the region, and Japanese and European languages are served by one model. Until that service
   is deployed, an unelected tenant's embedding fails closed with an error that says so, never "no sources found"
   (P1-54).

   **Amended 2026-10-01 (product owner), from the P1-54 build and its review:**
   - *One lane for every tenant.* Embeddings run on the self-hosted lane for every organisation, whatever it
     elected for generation. An OpenAI election covers generation and fallback, not embeddings: a corpus searched
     with one model must be written with that model, and one process-wide lane keeps every corpus one vector space.
   - *Width.* `bge-m3` emits 1024 dimensions; the corpora are `vector(1536)` (and `document_vectors` 3072). The
     embedding seam requests the model's native width and zero-pads to the corpus width. Zero-padding leaves cosine
     and L2 distances between padded vectors exactly unchanged, so no schema change is needed. It is valid only if
     every vector in a column comes from one model, so the corpus policy names the model actually written
     (`bge-m3`, native 1024) and a corpus holding vectors from another model is re-embedded before it is served.
     No tenant has data yet; dedicated 1024-wide columns remain the cleaner design when a second embedding model
     is introduced.
   - *Readiness tells the truth.* The deployment is not ready for search until the lane has embedded one text at
     the corpus width; configuration alone is not a verdict.
   - *Placement.* The in-VPC lane is approved for PII and PHI with zero retention and intended use `embedding`
     (`ai_provider_placement_approvals.local`): no third party receives the text. A self-hosted placement satisfies
     any tenant residency, which is enforced by the region the service runs in.

### 2. Redis is part of the production stack

Production requires a managed Redis (ElastiCache: TLS in transit, an AUTH token, encryption at rest
under a customer-managed key, private subnets only). Boot refuses a production process without a
`rediss://` `REDIS_URL`, and the deploy preflight refuses a task definition without it (P1-46).
`docs/LAUNCH_DEFINITION_OF_DONE.md` row D1 already reads readiness as `redis ok`.

Reason: without a shared store, every rate limiter and the revocation tier are per task. Two tasks
double the password-guessing allowance per account; a token revoked on one task is honoured on the
other until the database tier is consulted. Part 11 §11.300(d) and HIPAA §164.312(a)(2)(iii) both
assume the limit is one limit.

### 3. Detection and the alert receiver

- **Server errors** go to Sentry through the existing scrubber; **alarms** (5xx rate, authentication
  failures, RDS health, audit-chain sweep failure) go from CloudWatch to an SNS topic whose
  subscribers are the founder's e-mail and phone (P1-10). The on-call rota is one person until it is
  two; the policy says so rather than implying otherwise.
- **Browser session replay is off.** A replay is a recording of a regulated screen. Masking reduces
  what it shows; it does not change that a third party receives a recording of a user's work in a
  GxP system. Error reporting stays; recording goes (DP-26; implemented with this ADR).
- **A WAF on CloudFront: yes.** AWS managed rule groups (Common, KnownBadInputs, AmazonIpReputation,
  SQLi) and a rate-based rule, seven days in count mode, then block (P1-10).

### 4. Second factor: who must use an authenticator app

A second factor at sign-in is already mandatory for everyone (an e-mailed code, or the authenticator
when one is enrolled). That stays. In addition, **in production, owners and administrators, and
anyone applying a governed electronic signature, must use an authenticator app**; an e-mailed code is
not accepted for them (P1-2b). An organization may extend the requirement to all members. It may not
lower it.

Reasons: NIST SP 800-63B §5.1.3.1 does not accept e-mail as an out-of-band authenticator, and the
platform's MFA code already claims AAL2; the HIPAA Security Rule proposal of 2025-01 makes MFA
mandatory; Annex 11 §12.1 and the PMDA ER/ES guideline ask for identity binding proportionate to
risk, and a signature and an administrative change are the highest-consequence actions in the
product. The cost is two minutes of enrollment for a signer, once.

### 5. Breach notification to a tenant: 48 hours

The tenant receives a first notice **without undue delay and no later than 48 hours** after we become
aware of a confirmed or reasonably suspected breach of its data, with supplements as facts arrive.
The DPA's bracket becomes 48; POLICY-IR-004 and SIG-Lite G.4 move from 72 to 48 (implemented with
this ADR; counsel reviews the DPA's wording, not the number).

Reasons: our notice starts the customer's own clocks: GDPR Art. 33(1) gives the controller 72 hours
for the supervisory authority, and APPI Art. 26's preliminary report to the PPC is due "promptly"
(the PPC guidelines read this as about three to five days). A processor that uses all 72 hours leaves
its controller none. Pharma master service agreements commonly ask for 24 to 48 hours. Forty-eight
hours is what one responder can meet with a first notice that says what is known and what is not.

### 6. Retention of governed records

By default, a governed record and its audit trail are kept for **25 years** from the record's
finalization, the longest common GxP horizon (EU Clinical Trials Regulation Art. 58 for the trial
master file). An organization may set a longer period, or a shorter one with a recorded reason that
names the governing rule. A legal hold always overrides deletion. At offboarding the tenant's
export transfers the obligation to the tenant, as the DPA states (P1-22).

### 7. Regions

United States `us-east-1`; European Union `eu-central-1` (Frankfurt), with `eu-west-1` as its
recovery region; Japan `ap-northeast-1` (Tokyo), with `ap-northeast-3` (Osaka) as its recovery
region. A tenant's region is chosen on the order form; its content, backups, logs and keys stay in
that jurisdiction, and AI placement for an EU or Japanese tenant uses an in-region lane (P2-1).

### 8. Records the product keeps for its customers' inspections

- **Periodic user-access review** (P1-43): an organization's owner or QA reviews members, roles and
  signing authority each quarter; each decision (keep, change, remove) and the reviewer's signature
  are one governed record; an overdue review appears in Compliance reports. SOC 2 CC6.2–6.3, HIPAA
  §164.308(a)(4), Annex 11 §12, ISO 27001 A.5.18.
- **Audit-trail review** (P1-25): the tenant's QA records a periodic review of the audit trail (scope,
  period, findings, outcome), signed through the ceremony, and reports list it. Annex 11 §9, FDA data
  integrity guidance (2018) Q7, PIC/S PI 041.

### 9. Passwords that are already public

**No online breach-corpus lookup.** New, reset and changed passwords are already checked against a
list bundled in the image (`server/data/common-passwords.txt`, P1-2: the ten thousand most common
passwords and the long entries of the NCSC's hundred-thousand list) and against the account's own
words. That list stays the control. A k-anonymity range query would send a prefix of every chosen
password's hash to a third party on every change, for a marginal gain over the bundled list at the
length the platform already requires; for a regulated customer that is a new sub-processor of
credential material, and we decline it. NIST SP 800-63B §5.1.1.2 asks for a comparison against
known-compromised values; it does not require that comparison to be made online.

### 10. The connector for Claude (D8)

The connector stays in the launch catalog. **An organization's owner or administrator enables it for
that organization**; until then consent and token use are refused for its members (P1-47). The
administrator is named because the product has no separate owner role in `organization_users` (sign-up
and first-run setup make an organization's creator its administrator), and the administrator is the
customer's highest in-product role, so the customer still decides (amended 2026-10-01, IAM-25). A
connector is a new path for tenant content to leave the platform to a client the customer controls, and
the customer, not the vendor, decides to open it. The two switches compose: product decision P-2
(`docs/LAUNCH_DEFINITION_OF_DONE.md`) turns the connector on for the deployment, with
`MCP_ENABLED=true` and Claude's origins as the only registration origins, and each organization stays
closed until its owner or administrator turns it on at `PUT /api/tenant-config/:id/claude-connector`, a
change that is audited and is read on every request, so turning it off also refuses tokens already
issued.

## Consequences

### Positive

- The DPA, the trust statement and the code say the same thing about where content goes.
- A US, EU or Japanese supplier-qualification questionnaire can be answered on each of these points
  from a file, not an intention.
- Each decision names the plan item that implements it, so each can be shown failing first.

### Negative

- Losing the Moonshot lane and gating OpenAI means an Anthropic outage is an outage for tenants that
  have elected no second provider. That is the honest consequence of their placement choice, and the
  503 says so.
- Redis and the WAF add running cost; signers and administrators enroll an authenticator.
- A 48-hour commitment is tighter than the 72 hours the policy draft carried.

## Implementation

| Item | What | Where it is tracked |
|---|---|---|
| P1-45 | Production provider election (OpenAI only when named; Moonshot never) | plan §2 |
| P1-46 | ElastiCache in the stack; boot and preflight require `rediss://` | plan §2 |
| P1-47 | Per-organization enablement of the connector | plan §2 |
| P1-54 | Self-hosted embedding lane; an embedding refusal is reported, not rendered as no results | plan §2 |
| P1-2b | Authenticator required for owners, administrators and signers | plan §2, P1-2 |
| P1-10 | Alarms, SNS receiver, WAF | plan §2 |
| P1-22, P1-25, P1-43, P2-1 | Retention default, audit-trail review, access review, regions | plan §2, §3 |
| DP-26 | Browser session replay removed | done with this ADR |
| INF-07 | 48-hour breach notice in the DPA, IR-004 and SIG-Lite | done with this ADR |

## Still the founder's

Signatures on the eight policies, the trust statement, the SIG-Lite and the §11.100(c) letter to FDA;
the GitHub ruleset and secret scanning (P0-14); rotation of the historical Neon credentials (P0-17);
the AWS account, DNS and the first `terraform apply`; contracts and BAAs with AWS and Anthropic; the
pen-test firm (P1-15); EU and Japanese counsel (P2-2, P2-3).
