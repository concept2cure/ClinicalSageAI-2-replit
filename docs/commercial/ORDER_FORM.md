# Order Form

> **DRAFT TEMPLATE — FOR LAWYER REVIEW. NOT AN OFFER.**
> Prepared 2026-09-20 by a Claude Code session (workstream W6). Prices shown
> as examples are the **proposed** launch prices from `PRICING.md` Part 2.3
> and are not implemented in code; the prices in code today are $499/mo
> (`standard`) and $1,499/mo (`professional`). Replace every bracket before
> use. Launch row moved: **D9**.

---

**Order Form No.** [C2C-OF-YYYY-NNN]  **Date:** [DATE]

This Order Form is governed by the Master Subscription Agreement dated
[DATE] (or, for a pilot, the Design-Partner Pilot Agreement dated [DATE])
between **[CONCEPT2CURE LEGAL ENTITY NAME]** ("Provider") and the Customer
below, and by the Data Processing Addendum. Capitalised terms have the
meanings in those documents.

## 1. Customer

| | |
|---|---|
| Legal name | [ ] |
| Address | [ ] |
| Industry archetype (`organizations.industry_mode`) | [virtual_biotech / biotech / pharma / cro / regulatory / medical_writing / medtech / academic] |
| Billing contact | [name, email] |
| Technical/admin contact (first administrator) | [name, email] |
| Named accountable regulatory user | [name, title, email] |
| Consultancy order? | [No / Yes — named clients: ___ ] |

## 2. Services ordered

| # | Item | Tier id | Quantity / limits | Term | Fee |
|---|---|---|---|---|---|
| 1 | [Design-partner pilot / Platform — Standard / Platform — Professional / Platform — Enterprise / Submission — original / Submission — lifecycle] | [`standard` / `professional` / `enterprise` / n/a] | [Users: 5; Projects: 10; Storage: 25 GB; AI credits per month: deep research 50, builder 10] | [90 days / 12 months / 6 months access] | [US$ ___ ] |
| 2 | [Sandbox tenant for customer PQ] | — | 1 | co-terminous | [included / US$ ___ ] |
| 3 | [Claude on Amazon Bedrock placement, region ___] | — | 1 | co-terminous | [US$ ___ ] |
| 4 | [Inspection-support hours beyond MSA §7.2] | — | [hours] | — | [US$ ___ /hour] |

Applications licensed: the Launch Catalog only — Projects, Vault,
Authoring, Submission Center, Submission Readiness, QMS controlled
documents. No other Platform surface is licensed by this Order Form.

Program(s) in scope (per-submission orders): [product code, submission
type, sequence number].

## 3. Fees and payment

| | |
|---|---|
| Total fees | US$ [ ] |
| Billing frequency | [Annual in advance / 50% on order + 50% on sequence validation / one-off] |
| Payment terms | Net 30 |
| Currency | USD |
| Credits applied | [Pilot Fee credit US$ ___ per Pilot Agreement §4.3 / Submission fee credit US$ ___ ] |
| Overage | [Blocked at limit (default) / Additional users at US$ ___ /user/mo / Additional storage at US$ ___ /GB/mo] |
| Renewal | [Auto-renews for 12 months unless 60 days' notice / Does not renew] |
| Price protection | Renewal increase capped at [greater of 5% or CPI] |

## 4. Environment and AI configuration

| Setting | Value |
|---|---|
| Environment | [Production tenant, AWS us-east-1 (requires D1 green) / Staging tenant (Pilot Agreement §7.6 applies)] |
| Launch-scope enforcement | On (server-side) |
| Second factor | Email one-time code at every login (required); TOTP [required for named accountable user / optional] |
| SSO | [None / SAML via identity console — IdP: ___ ] |
| AI provider placement | [Anthropic Claude API (shared, residency global, ZDR: no) — default / Claude on Amazon Bedrock, region ___ , ZDR: yes] |
| Cross-provider fallback | [None (recommended) / listed providers: ___ ] |
| Approved primary drafting model | Claude Opus 5 (pinned per approved-models registry); fallbacks per registry |
| PHI permitted | [No / Yes — BAA between Customer and Provider dated ___ ; Provider–Anthropic BAA dated ___ ; placement above is BAA-covered] |
| Gateway transmission | [Not included / Included — Provider's D7 acceptance notice dated ___ ] |
| Outcome-data programme (MSA §13.2) | [Opted out (default) / Opted in] |

## 5. Support and service levels

| | |
|---|---|
| Support tier | [Standard / Priority (Professional and above)] |
| Support channel | [email: support@ ___ ; shared channel: ___ ] |
| Response targets | Per `SUPPORT_POLICY.md` §3 |
| Availability target | [99.5]% monthly at `/readyz`, per MSA §9 |
| RPO / RTO | [TBD — pending founder approval; MSA §9.4] |
| Maintenance window | Per `SUPPORT_POLICY.md` §6 |

## 6. Validation deliverables

| Deliverable | When |
|---|---|
| Validation Package (current status stated) | Within 10 business days of signature |
| Release notes | Each Release; 5 business days' notice for Part 11-affecting changes |
| IQ/OQ evidence per Release | On request within 10 business days |
| Approved-models registry | On request; 30 days' notice before primary model change |
| PQ test scripts for Customer's own PQ | Within 10 business days of request |

## 7. Special terms

[e.g. logo rights per Pilot Agreement §6; case study; pilot milestones
(Pilot Agreement Exhibit B); any deviation from the MSA — must be listed
here to have effect.]

## 8. Signatures

By signing, each Party agrees to this Order Form and the agreements it
references.

**Provider:** ______________________ Name / Title / Date

**Customer:** ______________________ Name / Title / Date
