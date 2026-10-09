# W6 evidence — commercial paper and go-to-market kit, 2026-09-20

**Row moved:** D9 (commercial paper: pilot agreement, subscription
agreement, DPA, order form, pricing page, onboarding runbook, support
policy — "one lawyer review"). **State after this session:** every D9
document exists as a **draft for lawyer review** under `docs/commercial/`.
D9 is **not green**: no lawyer has reviewed anything, no price has been
decided, and no document has been signed. The kit also prepares D10 (the
conversations that produce the first signed pilot) and D8 (the partner
application), neither of which this session moves.

Produced by a Claude Code session (worker W6) under the founder's
account. Documents only; no product code was touched; no git command was
run by this session.

## Deliverables

| # | File | Purpose | Status |
|---|---|---|---|
| 1 | `docs/commercial/PILOT_AGREEMENT.md` | Design-partner pilot: launch-catalog scope, 90-day term, fixed fee (proposal), logo/case-study rights with approval, Part 11 record ownership, retention and export on exit, AI-use disclosure and human-review requirement, no regulatory-outcome warranty, liability cap, termination, governing-law placeholder, milestone exhibit | Draft for lawyer |
| 2 | `docs/commercial/MASTER_SUBSCRIPTION_AGREEMENT.md` | SaaS MSA adapted to a GxP system: validated-state commitments (release notes, change control per `docs/RELEASE_GOVERNANCE.md`, IQ/OQ evidence per release, approved-model notice), audit and inspection-support rights, subprocessors with BAA/ZDR posture, SLA placeholders, data return | Draft for lawyer |
| 3 | `docs/commercial/DATA_PROCESSING_ADDENDUM.md` | GDPR / UK GDPR / HIPAA-aware DPA; placement table from `placement.ts` (regions `us`/`eu`/`apac`/`on_prem`, substrates, ZDR flags); hosting residency us-east-1; TOMs as built per `SECURITY.md`; subprocessor annex | Draft for lawyer |
| 4a | `docs/commercial/ORDER_FORM.md` | Order form template incl. environment, AI placement, PHI gating, transmission (D7) and validation deliverables | Draft template |
| 4b | `docs/commercial/PRICING.md` | Pricing page copy; current tiers from `billing.ts` vs a clearly marked proposal (per-submission wedge $15–40K, platform entry $1,250/mo, pilot $15K); rationale; per-app inclusions; explicit exclusions | Proposal for founder decision |
| 5 | `docs/commercial/ONBOARDING_RUNBOOK.md` | Day 0–30: `install-fresh.mjs` + `db:migrate:deploy` (there is no `db:provision`), `pilot:go-no-go`, `pilot:verify-otp`, first admin and TOTP, launch catalog verification, first project/upload/governed draft/sequence, weekly check-in agenda, export drill, exit | Operational draft |
| 6 | `docs/commercial/SUPPORT_POLICY.md` | Severities and targets sized to a solo founder with AI-run operations; escalation with a stated single point of failure; maintenance windows; incident communication | Draft for founder/lawyer |
| 7 | `docs/commercial/ICP_AND_OUTREACH.md` | ICP (pre-IND/IND sponsors; first-510(k) sponsors with honest scope caveat; boutique consultancies); 13 qualification questions; three email sequences; 15-minute launch-catalog demo script; discovery guide; objection handling | Draft for founder |
| 8 | `docs/commercial/CASE_STUDY_TEMPLATE.md` | Customer-story template in the shape of Anthropic's customer stories; placeholders only; rules on denominators, oversight and safety language; approval record | Template |
| 9 | `docs/commercial/PARTNER_HUB_APPLICATION.md` | Anthropic technology-partner application package: positioning, non-overlap, connector description (D8, not yet built), BAA/ZDR posture (none signed), human-oversight design, asks | Draft; do not submit before D8 evidence |
| 10 | this file | Index and founder actions | — |

## Founder actions required (none of these can be done by a session)

1. **Lawyer review** of items 1–4a and 6, in that order. Items flagged for
   counsel inside the documents: liability carve-outs for data-handling
   breach; insurance statement; governing law and venue; Anthropic
   commercial-terms citation for the no-training statement; SCC/UK
   Addendum completion; whether to add source-code escrow.
2. **Pricing decision** on `PRICING.md` Part 2.3: adopt, amend or reject
   the proposal; decide the fate of the free tier and of the per-user
   `PRICING` table (two pricing surfaces for the same tier ids; Professional
   priced below Standard per user; feature strings naming non-launch
   modules). Any adoption is a code change to `billing.ts` and the
   licensing fixture under a separate session.
3. **First ten conversations** using `ICP_AND_OUTREACH.md`: log each under
   `docs/evidence/W6/<date>/conversations.md` (identity redacted unless
   consented) with the submission date, quote, named regulatory user,
   signer and objections. D10 needs one signed pilot with a fee and logo
   rights.
4. **Name the placeholders** the documents could not: legal entity, support
   email/domain, SMTP and uptime-monitoring providers (DPA Annex III),
   backup contact (Support Policy §4), coverage hours, RPO/RTO.
5. **Do not submit** `PARTNER_HUB_APPLICATION.md` until `server/mcp/`
   exists and the D8 transcript is filed.

## Facts the documents rest on (checked in the tree on 2026-09-20)

- Tier ids and prices: `server/services/billing.ts` (`DTC_PRICING`:
  free $0, standard $499/mo, professional $1,499/mo, enterprise custom;
  `PRICING` per-user by archetype; `BUNDLE_DISCOUNTS`).
- Launch catalog: `shared/constants/launch-scope.ts` (six apps, 41
  surfaces, 21 modules; W1 evidence: 86 cards, 20 on, 66 not in release).
- AI placement: `server/services/ai-gateway/providers/placement.ts`;
  approved models: `server/services/ai-governance/approved-models.ts`
  (Opus 5 primary, PQ pending).
- Security posture and stated gaps: `SECURITY.md` (no SOC 2, TOTP opt-in,
  field-level encryption only, RLS not yet fully enforced).
- Infrastructure: `terraform/environments/production` (us-east-1, RDS
  35-day backups, S3 Object Lock 7 years on the evidence bucket).
- Retention: `docs/operations/audit-log-retention-policy.md` (10 years).
- Export: `server/routes/tenant-export.ts`, `/api/audit/exports`.
- Provisioning and gates: `scripts/db/install-fresh.mjs`,
  `scripts/db/deploy-migrate.mjs`, `scripts/ops/pilot-go-no-go.mjs`,
  `scripts/ops/verify-otp-delivery.mjs`, `scripts/seed-founder.mjs`,
  `ops:provision-launch-modules`, `audit:verify:full`.
- Not yet true, stated conditionally throughout: D1 (production), D3
  (isolation proven), D4 (signed validation package), D5 (KMS keys), D6
  (SOC 2 window, pen test, Anthropic BAA), D7 (ESG transport accepted),
  D8 (connector), D10 (customer).

## Where the session was unsure, and how it phrased it

- **Anthropic's current commercial terms and retention schedule** were not
  fetched; the no-training statement is phrased as the platform's rule
  plus "engaged under terms under which API data is not used to train",
  with a counsel note to cite the current terms at signature.
- **Moonshot AI's processing location** is not known; left as a bracket in
  DPA Annex III.
- **Whether cross-provider fallback is active for a default tenant** was
  not traced through the gateway ladder; the documents make Anthropic-only
  placement a recorded Order Form choice rather than asserting a default.
- **SMTP and uptime-monitoring vendors** are configured by environment
  variables, not named in code; left as brackets.
- **Sandbox tenant for customer PQ** is not provisioned automatically;
  offered as an Order Form line with a founder decision note.
- **Third-party pricing figures** (Veeva bands, consultant project ranges)
  are quoted only from the repo's own research files and labelled
  indicative.
- **Anthropic partner-programme criteria and form fields** were not
  fetched; the application is written as content to paste, not as the
  form.
