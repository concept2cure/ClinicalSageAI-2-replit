# C2C market-context brief (as of 2026-09-29)

**Sourcing.** fda.gov, ema.europa.eu and most vendor sites could not be fetched, so every claim below comes from a search-engine extract of the cited URL (accessed 2026-09-29). Re-open the page before using a claim in a contract or pitch. Tags: **[C]** primary source · **[R]** secondary · **[A]** analysis · **[Rec]** recommendation.

## 1. Market reality

- **Incumbents are putting AI agents inside systems buyers have already validated.**
  - Veeva AI agents became available in Dec 2025 [C](https://www.veeva.com/resources/veeva-ai-agents-now-available-to-increase-productivity-and-customer-centricity/).
  - Falcon was announced 2026-05-27 [C](https://ir.veeva.com/news/news-details/2026/Veeva-Announces-Falcon-an-Agentic-Platform-and-Standard-Agents-to-Deliver-Agentic-Labor-in-Drug-Development/default.aspx); per the 2026-08-26 8-K it has "five early adopters" and initial go-lives this year [C](https://www.sec.gov/Archives/edgar/data/1393052/000139305226000032/veev-20260731xex991.htm).
  - Agentic Authoring is expected late 2027 [R](https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/).
  - IQVIA.ai (Mar 2026) claims 150+ agents, used by 19 of the top 20 pharma [C](https://www.iqvia.com/newsroom/2026/03/iqvia-unveils-iqvia-ai-a-unified-agentic-ai-platform).
- **AI-native writing tools are well funded and are moving into publishing.**
  - Weave Bio: $36M raised [C](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-$20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform), its own eCTD builder and Publishing V3 [C](https://www.weave.bio/resources/weave-february-2026-release-notes/), Parexel as exclusive CRO design partner [C](https://www.globenewswire.com/news-release/2025/09/30/3158679/0/en/Parexel-Announces-AI-Partnership-with-Weave-Bio-to-Accelerate-Regulatory-Submission-Processes.html).
  - Collate: $95M Series B near a $1B valuation [R](https://www.forbes.com/sites/innovationrx/2026/06/03/ai-startup-collate-raises-95-million-to-automate-life-sciences-paperwork/).
  - Peer AI $12.1M [C](https://getpeer.ai/press/peer-ai-raises-12m-funding-accelerate-drug-approvals); Biolevate €30M on 2026-09-22 [C](https://www.biolevate.com/news/series-a-2026).
- **Software for small sponsors costs $10k–$60k a year, and implementation fees are disappearing.**
  - Kivo publishes $24k/yr + $5k setup, CSA validation included [C](https://kivo.io/pricing); Veeva Basics has no implementation fee and 100+ emerging biotechs [C](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/).
  - Greenlight Guru median ~$44k [R](https://www.vendr.com/marketplace/greenlight-guru); outsourced eCTD publishing $5k–$25k+ per sequence [R](https://intuitionlabs.ai/articles/ectd-software-pricing-guide).
  - About two-thirds of H1 2026 venture rounds went to clinical-stage companies [R](https://www.biopharmadive.com/news/biotech-venture-capital-funding-2026-first-half/824881/).
- **AI drafting is the least-regulated part of the workflow, provided a human owns each output.**
  - FDA's AI credibility guidance (draft, 2025-01-07) excludes AI used for "drafting/writing a regulatory submission" as an operational efficiency [C](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological); still draft in Sept 2026 [R](https://bipartisanpolicy.org/issue-brief/fda-oversight-understanding-the-regulation-of-health-ai-tools/).
  - FDA and EMA issued 10 Good AI Practice principles on 2026-01-14 [C](https://www.ema.europa.eu/en/documents/other/guiding-principles-good-ai-practice-drug-development_en.pdf).
  - Draft EU GMP Annex 22 bars LLMs from critical GMP applications [C](https://health.ec.europa.eu/document/download/5f38a92d-bb8e-4264-8898-ea076e926db6_en?filename=mp_vol4_chap4_annex22_consultation_guideline_en.pdf); not adopted as of Aug 2026 [R](https://intuitionlabs.ai/articles/eu-gmp-annex-22-ai-compliance-pharma-2).
- **The US format is unchanged; AI distribution channels are opening.**
  - US production is eCTD v3.2.2 via ESG NextGen (launched 2025-04-14; REST API with OAuth) [C](https://www.fda.gov/industry/electronic-submissions-gateway-next-generation-esg-nextgen). v4.0 is optional with no mandatory date [C](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd). eSTAR is mandatory for 510(k)s [C](https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/premarket-notification-510k).
  - MCP alone no longer differentiates: Kivo shipped one in May 2026 [C](https://www.biospace.com/press-releases/kivo-launches-headless-gxptm-to-power-compliant-agentic-ai-in-drug-development). Claude Marketplace launched 2026-09-23 [C](https://claude.com/blog/claude-marketplace).

## 2. Table-stakes checklist

| Capability | Why buyers assume it | Pilot? | GA? | Sets the bar |
|---|---|---|---|---|
| **eCTD v3.2.2 assembly:** sequence lifecycle (new/replace/append/delete), cumulative view, US Module 1 forms (1571/356h/3674) | It is FDA's production format; v4.0 is optional [C](https://www.federalregister.gov/documents/2024/09/16/2024-20897/electronic-common-technical-document-data-standards-center-for-drug-evaluation-and-research-and) | Yes, one real sequence | Yes | Veeva Submissions Publishing [C](https://www.veeva.com/products/veeva-submissions-publishing/); LORENZ; EXTEDO; Kivo |
| **Validation before transmission** against the current FDA criteria, naming the TCG and Data Standards Catalog versions applied | Publishing tools validate continuously while the submission is built | Yes | Yes | LORENZ eValidator; Veeva; DnXT [R](https://www.dnxtsolutions.com/compare/extedo/) |
| **PDF publishing** to FDA PDF spec v4.1: embedded fonts, bookmarks, checked links | Required by the FDA spec [C](https://www.fda.gov/media/76797/download) | Yes | Yes | LORENZ docuBridge [C](https://www.lorenz.cc/solutions/whats-new/docuBridge/); Veeva |
| **ESG NextGen transmission** with acknowledgment tracking | It is the only gateway, and it needs a Non-Repudiation Letter signed by an officer [C](https://www.fda.gov/industry/getting-started-esg-nextgen/letters-non-repudiation-agreement) | Test endpoint only | Yes, with credentials the customer owns | Veeva; outsourced publishers |
| **eSTAR output for 510(k) and De Novo**, with a refuse-to-accept pre-check | eSTAR is mandatory [C](https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program) | No | Only if selling to medtech | IQVIA RIM Smart [C](https://www.iqvia.com/solutions/safety-regulatory-compliance/regulatory-compliance/smartsolve-rim); Complizen [C](https://www.complizen.ai/platform/submission-builder) |
| **Tracking of health-authority correspondence and commitments** | Standard RIM function | No | Yes | ArisGlobal [C](https://www.arisglobal.com/media/press-release/newest-version-of-lifesphere-regulatory-platform-allows-organizations-to-leverage-latest-genai-technology/); Weave HAQ Manager; Veeva |
| **Controlled-document lifecycle:** periodic review, SOP-to-training link | Basic QMS function | Demo | Yes | Veeva QualityDocs; MasterControl; Qualio; Kivo |
| **Part 11 e-signatures:** name, date/time and meaning shown; re-authentication; bound to the record | Required by 21 CFR 11 | Only if the pilot creates records the customer relies on | Yes | MasterControl; Veeva |
| **Immutable audit trail** recording who, when, why and old→new values, with filterable PDF/CSV export | Part 11 Q&A [C](https://www.fda.gov/media/166215/download); draft Annex 11 [R](https://www.guidegxp.com/blogs/data-integrity-csv/eu-gmp-annex-11-revision-2025) | Yes, visible | Yes | All incumbents |
| **Identity and access:** SSO, MFA, RBAC, SCIM | Enterprise IT norm | SSO and MFA | Plus SCIM | Weave [C](https://www.weave.bio/data-security-privacy-weave-bio/) |
| **Vendor validation pack:** intended use, risk assessment, IQ/OQ evidence, Part 11 assessment, release notes | The final CSA guidance lets buyers rely on supplier evidence [C](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-system-software) | Summary | Full | Veeva [C](https://www.veeva.com/medtech/resources/streamlining-medtech-validation-a-risk-based-strategy-for-veeva-vault/); MasterControl VxT [C](https://www.mastercontrol.com/validation/); Kivo |
| **SOC 2** (ISO 27001; ISO 42001 emerging) | It is the category norm | Type I, or a readiness letter | Type II | Harvey [C](https://www.harvey.ai/security); Weave; Greenlight Guru ISO 42001 [C](https://www.greenlight.guru/blog/greenlight-guru-achieves-iso-42001-ai-certification) |
| **Cited AI drafting:** human review enforced, no training on customer data, zero data retention | This is the buyer's first AI question | Yes | Yes | CoAuthor [C](https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/); Ritivel [C](https://www.ycombinator.com/launches/PJn-ritivel-ai-native-platform-for-regulatory-document-submission); Weave |
| **Word round-trip** | Writers work in Word | Export | Native editing in Word | CoAuthor (280+ templates) |
| **Fixed price and go-live in weeks** | Veeva Basics and Kivo include implementation | Yes | Yes | Kivo; Veeva Basics |

## 3. Vendor-qualification checklist

"Pilot" assumes no GxP records of approval are created; if they are, most production items move into the pilot. Timing is industry practice [R/A], not regulation.

| Item | Pilot | Production | Notes |
|---|---|---|---|
| Security/quality questionnaire (SIG Lite, CAIQ) | Required | Yearly | GAMP 5 2nd ed. supplier assessment [C](https://ispe.org/publications/guidance-documents/gamp-5-guide-2nd-edition); draft Annex 11 §3 [R] |
| Supplier audit (QMS, SDLC, change control, CAPA SOPs) | Remote, if GxP data | Required, periodic | FDA may inspect IT providers with regulatory duties [C](https://www.fda.gov/media/166215/download) |
| SOC 2 | Type I or readiness + bridge letter | Type II or ISO 27001 | Type II tests operation over a period [R](https://drata.com/grc-central/soc-2/type-1-vs-type-2); start its window at pilot kickoff [A] |
| Penetration test | Summary <12 months old | Annual + remediation | [R] |
| Validation pack | Intended use; risk by function (drafting, checks, records, transmission); test summary | Trace matrix, specs, IQ-equivalent hosting evidence, OQ, Part 11/Annex 11 controls matrix; customer PQ | Customer validates its intended use on vendor evidence [C](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-system-software) |
| MSA, NDA, DPA | Required | Required | |
| Quality agreement / SLA | If GxP data | Required | Part 11 Q&A recommends it |
| Change-control notice | Release notes | Contractual notice, validation tenant, per-release impact assessment | |
| Data residency | Disclose regions | Contractual region; DPF/SCCs for EU data | DPF upheld 2025-09-03, appealable [R](https://iapp.org/news/a/european-general-court-dismisses-latombe-challenge-upholds-eu-us-data-privacy-framework) |
| Subprocessors incl. LLM provider | Required | + right to object | GDPR Art. 28(2) [C](https://eur-lex.europa.eu/eli/reg/2016/679/oj) |
| Continuity and exit | Export demo with audit trails | Tested DR, exit clause, single-founder continuity plan | Record retention |
| Breach-notice window | Required | Required | |
| Gateway credential custody | Excluded or test endpoint | Key vault, customer-owned, two-person rule | Issued to the sponsor [C](https://www.fda.gov/media/194410/download) |
| Model ID, pinned version, rationale, function mapping | Required | + model change log | FDA–EMA principles [C](https://www.fda.gov/media/189581/download) |
| No training on customer data, flowed down; retention stated | Required | Contractual ZDR | Anthropic API terms [C](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) |
| Enforced human review; prompt/output log tied to user, Vault version, accepted text | Required | Retained, exportable | Draft Annex 22 non-critical condition [C](https://health.ec.europa.eu/document/download/5f38a92d-bb8e-4264-8898-ea076e926db6_en?filename=mp_vol4_chap4_annex22_consultation_guideline_en.pdf) |
| Eval evidence per context of use; re-eval on model change | Summary | + drift monitoring | FDA 7-step draft [C](https://www.fda.gov/media/184830/download); ISPE GAMP AI Guide [C](https://ispe.org/news/ispe-announces-availability-ispe-gampr-guide-artificial-intelligence) |
| Deterministic/generative boundary documented | Architecture doc | Validation pack | [A] |
| EU AI Act position (not high-risk; Art. 50 marking) | EU buyers only | EU deployments | Counsel review [A] |

## 4. Regulatory calendar 2026–2029

| Date | Event | Grade | Source |
|---|---|---|---|
| Since 2024-09-16 | FDA accepts eCTD v4.0 optionally, for new applications only; no forward compatibility | C | [FDA](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd-v40) |
| 2025-09-24; updated 2026-02-03 | FDA CSA guidance final (device and QMS software, not drug CGMP); update aligns with QMSR | C / R | [FDA](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-system-software), [Metron](https://metroneng.com/fda-csa-guidance-february-2026-update-validation-team.html) |
| 2025-10-01 | eSTAR mandatory for De Novo (for 510(k) since 2023-10-01) | R | [Emergo](https://www.emergobyul.com/news/us-fda-announces-de-novo-final-guidance-and-estar-implementation-date) |
| 2025-12-22 | EMA accepts eCTD v4.0 optionally for new centralised MAAs | R | [EMA newsroom](https://ec.europa.eu/newsroom/ema/items/918307/en) |
| 2026-01-14 | FDA–EMA Good AI Practice principles | C | [EMA](https://www.ema.europa.eu/en/documents/other/guiding-principles-good-ai-practice-drug-development_en.pdf) |
| 2026-02-02 | QMSR effective (incorporates ISO 13485) | C | [FDA](https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr) |
| Apr 2026 | PMDA accepts only v4.0 for new applications (described as "planned") | C | [PMDA](https://www.pmda.go.jp/files/000278140.pdf) |
| 2026-08-02 | AI Act Art. 50 transparency obligations apply; Commission enforcement powers over GPAI begin | R / C | [CSA Labs](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article50-watermarking-deadline/), [AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu/en/ai-act/faq/commissions-enforcement-powers-related-ai-act-obligations-providers-most-advanced-models) |
| Fall 2026 | FDA forward compatibility goes into production (unverified) | R | [FDA action plan, via search only](https://www.fda.gov/media/190369/download) |
| Q4 2026 (target) | Final Annex 11, Chapter 4 and Annex 22 text sent to the Commission; no effective date or transition period announced | R | [ECA](https://www.gmp-compliance.org/gmp-news/ema-plans-for-the-next-three-years), [Sakara](https://sakaradigital.com/blog/ema-annex-22-implementation-timeline-may-2026/) |
| 2026-12-02 | Art. 50(2) machine-readable marking becomes due for systems placed on the market before 2026-08-02 | R | [CSA Labs](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article50-watermarking-deadline/) |
| Q1 2027 | EMA "strongly recommends" v4.0 for new centralised MAAs | R | [EXTEDO](https://www.extedo.com/blog/ema-updates-the-ectd-v4-timeline-what-has-changed-and-what-it-means-for-regulatory-affairs) |
| 2027-12-02 | AI Act Annex III high-risk obligations apply (moved by Reg. 2026/1744) | R | [White & Case](https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act), [Law & Technology](https://lawandtechnology.eu/en/digital-omnibus-on-ai-official-journal-regulation-2026-1744/) |
| Q1 2028 | EMA v4.0 mandatory for new centralised MAAs (planned) | R | [EXTEDO](https://www.extedo.com/blog/ema-updates-the-ectd-v4-timeline-what-has-changed-and-what-it-means-for-regulatory-affairs) |
| ~2028 | Health Canada v4.0 mandatory (low confidence) | R | [IntuitionLabs](https://intuitionlabs.ai/articles/health-canada-ectd-submission-guide) |
| 2028-08-02 | AI Act Annex I (product-embedded) high-risk obligations apply | R | [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/eu-digital-omnibus-on-ai-enters-into-force) |
| ~2028–29 | FDA accepts v4.0 only: an industry forecast; FDA promises advance notice and has set no date | R | [IntuitionLabs](https://intuitionlabs.ai/articles/fda-ectd-requirements-guide) |
| Open | Final FDA AI credibility guidance; CDER guidance on CSA for AI (on its 2026 agenda) | C (draft) / R | [FDA](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological), [RAPS](https://www.raps.org/resource/cder-plans-new-guidance-on-ai-electronic-safety-report-submissions-and-more.html) |

## 5. Differentiation

**Can claim, once the pilot proves each:**
1. **Evidence → draft → deterministic readiness → eCTD sequence → ESG in one system.** AI writers (Peer, Collate, Yseop) stop at the draft; publishers (LORENZ, EXTEDO, DnXT) don't author; only Weave overlaps [A].
2. **Per-output provenance:** each drafted claim traces to Vault document version and page, pinned model version and eval reference, exportable with the audit trail. None found publishing per-output model pinning [A].
3. **Deterministic, version-pinned verdicts; the model narrates.** Each check cites the TCG/Catalog/PDF-spec version it enforces; LORENZ verifAI, by contrast, is a generative validator [C](https://www.lorenz.cc/Solutions/verifAI/).
4. **Published price, paid fixed-scope pilot** (only Kivo publishes numbers).
5. **MCP plus native authoring and publishing** — not MCP alone.

**Must NOT claim:**
- "Part 11 certified", "FDA-validated", "validated system" — FDA does not pre-evaluate systems; the customer validates. Say "Part 11 controls; validation evidence supplied."
- "Annex 11/22 compliant" — neither is adopted; draft Annex 22 excludes LLMs from critical GMP use.
- "EU AI Act compliant/not high-risk" before counsel review.
- "First/only regulatory MCP" (Kivo) or "only AI-native end-to-end" (Weave).
- "eCTD v4.0-ready", "EU/Japan-ready", "drug and device" until that output passes validation.
- Others' efficiency figures (Parexel 50%, Weave's 97% preprint [C](https://arxiv.org/abs/2509.09738)) as C2C results.
- SOC 2, a "Verified" Claude connector (auto-escalated; "isn't a security audit" [C](https://claude.com/docs/connectors/verification)) or an Anthropic partnership before they exist.
- Anything implying the model produces figures or verdicts.

## 6. Recommended pilot shape and pricing [Rec]

**Buyer**
- A US venture-backed biotech with 10–150 staff, preclinical to Phase 2, with an FDA filing dated 3–9 months out, not yet on Veeva Basics.
- Prefer funded clinical-stage companies.
- Run a parallel channel pilot with a boutique regulatory consultancy (5–30 people, 10 or more sequences a year).
- Defer top-20 pharma and medtech.

**Shape**
- 90 days, one program, one real deliverable: the scoped Module 2/3 sections, plus a v3.2.2 sequence that passes FDA validation, plus an ESG NextGen *test* transmission under the customer's own account.
- Review with the partner every two weeks, and end on a dated go/no-go meeting with the named signer ([BVP](https://www.bvp.com/atlas/design-partners-the-pre-launch-edge-most-ai-founders-ignore), a VC's opinion).

**Out of scope**
- QMS e-signatures used as GxP approval records.
- Production sends through ESG.
- eCTD v4.0.
- EU and Japan.
- eSTAR.
- Veeva integration beyond file import.

**Success criteria, written into the SOW**
- First-draft time falls by at least 50% against the customer's own baseline. Parexel reports 50% with Weave's AutoIND [C](https://www.globenewswire.com/news-release/2025/09/30/3158679/0/en/Parexel-Announces-AI-Partnership-with-Weave-Bio-to-Accelerate-Regulatory-Submission-Processes.html).
- Every factual statement resolves to a Vault citation, and the model generates no figures.
- The sequence has zero high-severity FDA validation errors on the first pass.
- ESG acknowledgments are received.
- QA signs off the supplier assessment.

**Pricing**
- **Pilot fee:** $15k–$25k fixed, fully credited to year 1 if the customer signs within 30 days of the pilot ending.
  - This sits at or above the usual 10–30% of annual contract value [R](https://www.getmonetizely.com/articles/how-to-structure-enterprise-pilot-program-pricing-effective-proof-of-concept-strategies).
  - It is justified because the deliverable replaces an outsourced sequence costing $5k–$25k+ [R](https://www.dnxtsolutions.com/2026/07/28/ectd-publishing-costs-in-2026-what-you-actually-pay/).
- **Year 1:** $36k–$60k per active program, for about 10 users, with a published AI-usage allowance plus overage.
  - That is a list price of $60k–$96k less a 40% discount locked for 24 months. Design-partner discounts typically run 30–50% [R](https://dowhatmatter.com/guides/design-partner-agreement).
- **Comparables:**
  - Kivo: $24k plus $5k setup [C].
  - Veeva RIM for 1–3 RA users: $15k–$45k, plus $15k–$30k for validation [R](https://intuitionlabs.ai/articles/veeva-vault-rim-cost-small-biotech).
  - Freyr SUBMIT PRO: $26.4k for 3 users [R](https://intuitionlabs.ai/articles/ectd-software-pricing-guide).
  - Greenlight Guru: median about $44k [R].
- **Consultancy variant:** a $24k–$48k/yr platform fee plus a fee per client program.
- **Terms:** logo rights, one reference call and an anonymised case study.

## 7. Top three competitive threats

1. **Veeva.**
   - **Threat:** Veeva is the validated system of record. Basics has no implementation fee [C]. Falcon's health-authority correspondence agent reaches early adopters in late 2026 [C](https://www.veeva.com/eu/resources/veeva-summit-previews-falcon-and-the-path-to-agentic-biopharma/), and Agentic Authoring is expected in late 2027 [R].
   - **Counter:**
     - Sell to sponsors that are not on Basics and have a filing due before Agentic Authoring ships.
     - Win on per-output provenance and deterministic verdicts.
     - Position C2C as a complement to Veeva, not a replacement: file import now, and later the Direct Data API, which is included with Vault Platform at no extra licence fee [C](https://www.veeva.com/resources/veeva-direct-data-api-now-included-with-vault-platform-to-enable-ai-innovation/).
     - The window is roughly 12–15 months [A].
2. **Kivo.**
   - **Threat:** Kivo sells to the same buyer, covers RIM, eCTD, QMS and eTMF, publishes its pricing, includes CSA validation, has a live MCP layer, and has CRISPR Therapeutics as a reference [C](https://www.biospace.com/press-releases/kivo-and-crispr-therapeutics-to-present-52-day-qms-modernization-at-dia-2026-in-philadelphia).
   - **Counter:**
     - Kivo exposes its records to *external* AI and routes proposed actions back for signature. C2C offers native drafting grounded in Vault evidence, plus deterministic readiness checks, in one chain.
     - Match Kivo's price transparency and included validation.
     - Do not lead with MCP.
3. **Weave Bio.**
   - **Threat:** AI-native authoring from IND through NDA, plus CTA and health-authority questions. It has its own eCTD builder, SOC 2 Type II and the Parexel exclusive.
   - **Counter:**
     - Reproducible readiness verdicts, each citing its rule.
     - Controlled documents and QMS in the same system.
     - Model pinning and eval evidence for every output. No Part 11 statement was found for Weave.
     - Sell through boutique consultancies, because the large-CRO channel is taken.

**Wildcards**
- **Collate:** $125M raised [R].
- **Claude for Life Sciences:** it names drafting and responding to agency queries as use cases [C](https://www.anthropic.com/news/healthcare-life-sciences). Generic drafting is being commoditised, so the unit C2C defends is the filing-ready sequence, not the draft.

## 8. Contested / unverified claims

- **Veeva AI pricing: the sources conflict, so this brief does not use it.**
  - One source says Veeva AI is "included in the Vault licence" [R](https://intuitionlabs.ai/articles/veeva-ai-roadmap-crm-bot-agents-2026).
  - Veeva says it is "licensed at the Vault level with a simple and reasonable subscription fee" [C](https://www.veeva.com/resources/announcing-veeva-ai/).
  - Neither the general availability of Veeva's regulatory agents nor the planned Aug 2026 release across all Vault applications has been confirmed.
- **Harvey pricing:** about $1,200/seat/month per [one source](https://claudeforlawyers.com/blog/harvey-ai-pricing); other reports differ. Not used.
- **Weave pricing:** $499–$1,499/month, from a [single comparison site](https://thebrightbyte.com/playbook/expertise/regfo-vs-weave-bio). Not used.
- **FDA eCTD v4.0:** FDA has set no mandatory date; 2028–29 is an industry forecast. Forward compatibility in "Fall 2026" appears in only one search extract.
- **EMA eCTD v4.0:** one earlier source said v4.0 becomes mandatory in 2027. EXTEDO's account of the EMA roadmap gives Q1 2027 as recommended and Q1 2028 as mandatory. Neither was checked on ema.europa.eu. Existing v3.2.2 lifecycles follow a separate path that has not been announced.
- **Health Canada** eCTD v4.0 dates are low confidence. **PMDA** letting ongoing dossiers continue in v3.2.2 is reported only.
- **Annex 11 and Annex 22:** one source said the final text would come in mid-2026, but other sources say nothing final had been published by late July 2026 [R](https://mflrc.com/article/eu-gmp-annex-22-annex-11-chapter-4-ai-2026). Treat both as not adopted.
- **Final FDA AI guidance:** secondary sources say it is still a draft. Confirm on fda.gov.
- **Secondary sources only:**
  - The content of the Feb-2026 CSA update.
  - The De Novo eSTAR date.
  - The Art. 50(2) grace date.
  - The Omnibus dates (the Official Journal was not opened).
  - Collate's valuation.
  - A roughly 2× price increase at Greenlight Guru [R](https://openregulatory.com/articles/greenlight-guru-price).
- **Not verified at all:** the current revision number of the v3.2.2 TCG.
