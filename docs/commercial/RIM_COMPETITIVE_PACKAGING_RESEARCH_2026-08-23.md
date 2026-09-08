> **Status:** research input, not a decision record. The decision this fed is
> `db/migrations/20260823_module_catalog_commercial_packaging.sql`.
>
> **Read the methodology statement in §0 before quoting anything from this file.**
> Network egress was blocked for the whole of this research, so every claim comes
> from search-indexed page text, not from a first-party page loaded end to end.
> Claims are marked [VENDOR-PUBLISHED] / [THIRD-PARTY] / [NOT FOUND], and §11 is
> an explicit register of what could not be verified. Dollar figures are the
> least reliable content here; the packaging SHAPE is well evidenced and is what
> the packaging decision actually used.

# RIM + AI Regulatory Authoring — Competitive Packaging & Tiering Research

**Date of research:** 2026-08-23
**Scope:** How incumbents and AI-native challengers *package and tier* — tier names, bundling boundaries, the enterprise wall, pricing axes, device-vs-biopharma differences, and where AI sits in the ladder. Plus what the market says it actually wants.

---

## 0. METHODOLOGY AND HONESTY STATEMENT — READ THIS FIRST

**Hard constraint hit during this research:** this session's network egress policy blocked *all* direct page fetches. `WebFetch` returned `EGRESS_BLOCKED` for every domain attempted (veeva.com, arisglobal.com, g2.com, rfp.wiki, greenlight.guru, en.wikipedia.org, intuitionlabs.ai, regulatory.veevavault.help), and direct `curl` returned `CONNECT tunnel failed, response 403` from the policy proxy. Per the proxy README, 403 = organization egress policy denial, not to be worked around.

**Therefore every claim below is sourced from web *search-result* content — i.e. indexed page text and snippets surfaced by the search tool — not from a first-party page I loaded and read end-to-end.** URLs are given so you can verify. I have marked confidence explicitly:

- **[VENDOR-PUBLISHED]** — the claim traces to a vendor's own pricing/product page as indexed.
- **[THIRD-PARTY]** — analyst, review-site, or consultancy characterization. Directionally useful; treat dollar figures as soft.
- **[NOT FOUND]** — I looked and could not verify. Stated as such, never estimated.

**Dollar figures in this market are the least reliable data.** Almost no life-sciences vendor publishes a rate card. Where I cite numbers they are third-party reconstructions. **The packaging *shape* — which you asked for — is far better evidenced than the prices, which is fortunate.**

---

## 1. THE SEVEN PACKAGING AXES THAT ACTUALLY EXIST IN THIS MARKET

Before the vendor-by-vendor detail, here is the synthesis. Every vendor in this space picks from these seven axes, and most combine three or four:

| Axis | Who uses it | What it does to the buyer |
|---|---|---|
| **Per-named-user, by license *type*** (full / read-only / external) | Veeva, LORENZ, EXTEDO, Greenlight Guru, MasterControl, ComplianceQuest | Punishes breadth of access. Creates the "we can't let QA see it, it's another seat" pathology. |
| **Per-application / per-module** | Veeva (each Vault app separately licensed), ArisGlobal, Ennov, IQVIA, MasterControl, Rimsys | Cross-functional users pay twice. A person needing QMS + RIM needs two licenses. |
| **Platform / environment base fee** | Veeva ("base environment fee" per Vault) | Floor price independent of headcount; kills the 1-2 person virtual biotech. |
| **Per-submission / per-sequence / token** | LORENZ docuBridge ONE, EXTEDO ("per-submission tokens"), outsourced publishing bureaus | The *only* axis that matches a pre-commercial biotech's actual consumption. Rare, and usually only at the low end. |
| **Usage caps as the tier boundary** (studies, sites, countries, regions) | Greenlight Guru Clinical (5 studies / 50 sites), Freyr SUBMIT PRO (per health authority region), EXTEDO (regional validation sets) | Cleanest tiering logic in the market. Under-used. |
| **Volume/consumption** (cases, credits, documents) | ArisGlobal Safety (per case), Veeva AI (usage-based at scale), Notion AI credits | Where AI pricing is converging. |
| **Bundled services as a tier** | Freyr SUBMIT PRO ASSIST (3 licenses + publishing services), QuickVault (5 hrs/mo QA/RA expertise), Certara (software + regulatory writing), Parexel/IQVIA | Tiering by *human hours*, not features. Very effective at the low end where the buyer has no regulatory staff. |

**The single most important structural observation:** in horizontal SaaS the enterprise wall is *administrative* (SSO, SCIM, audit, residency, SLA). In life-sciences SaaS the enterprise wall is *functional* — publishing, registrations, global submissions, design control, CAPA. Compliance features that horizontal SaaS gates (audit trail, e-signature, Part 11) are **table stakes at tier 1** in life sciences, because a product without them is not sellable at all. That inversion is the most important single fact for anyone designing a tier ladder here. (See §8 for the exception that proves it: Regfo gates audit trail.)

---

## 2. VEEVA — THE REFERENCE ARCHITECTURE

### 2.1 Vault RIM: four separately-licensed applications

The Vault RIM suite is **four distinct applications, licensed separately**, that can be run alone or together in one Vault:

1. **Vault Registrations** — global registration/licence tracking, health authority interactions, IDMP compliance
2. **Vault Submissions** — content management, planning, authoring, review/approval of submission content
3. **Vault Submissions Publishing** — compliant published output incl. eCTD; added as a *separate module* in 2019
4. **Vault Submissions Archive** — storage/navigation/search of submitted dossiers

Sources: [Veeva RIM Overview (Vault Help)](https://regulatory.veevavault.help/en/gr/30696/) · [IntuitionLabs Vault RIM guide](https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2) · [Veeva 150-companies RIM release](https://www.veeva.com/resources/more-than-150-companies-adopt-veeva-vault-rim-applications-to-streamline-regulatory-processes/)

**[VENDOR-PUBLISHED, via indexed help docs]** Publishing being a separate app from Submissions is the single most-quoted packaging fact about Veeva RIM. It means a company can own "Veeva RIM" and still not be able to produce an eCTD.

### 2.2 The licensing model: base environment fee + per-named-user, by license type

- Every Vault deployment starts with a **base environment fee** covering core platform infrastructure. **[THIRD-PARTY]**
- On top: **per-named-user licences differentiated by access level** — **Full User** (read/write), **Read Only**, **External User** (limited, role-based). Source: [IntuitionLabs Veeva pricing overview](https://intuitionlabs.ai/articles/veeva-systems-pricing-overview-complete-guide-to-costs-and-licensing)
- **A single employee needing both Vault QMS and Vault RIM requires two separate named-user licences, one per module.** **[THIRD-PARTY]** — same source. This is the most commonly cited pricing grievance in the whole category.
- Volume tiering exists; large enterprises can negotiate flat-fee ELAs.
- A Veeva support community post confirms customers requesting that **Submissions Archive add Read Only and External User license types** — evidence the license-type matrix is not uniform across applications. [support.veeva.com post](https://support.veeva.com/hc/en-us/community/posts/360016263173-Submissions-Archive-add-Read-Only-and-External-User-License-Types)

**Dollar figures:** third-party reconstructions only — ~$50–$200/user/month, or ~$600–$2,400/user/year; small biotech (1–3 RA users) ~$15K–$45K/yr, growing (3–8 users) ~$45K–$120K/yr. **[THIRD-PARTY — treat as indicative]** ([IntuitionLabs Vault pricing 2026](https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown), [IntuitionLabs small biotech RIM cost](https://intuitionlabs.ai/articles/veeva-vault-rim-cost-small-biotech))

### 2.3 What is ALWAYS included in Veeva (the horizontal-SaaS wall does NOT exist here)

- **SSO / SAML** — supported at the platform level from API v12+; the auth rate limit explicitly does not apply to SAML/SSO or OAuth. Domain-level settings incl. SSO are part of sandbox config. Not a paid gate. ([Vault API reference](https://developer.veevavault.com/docs/api/v15/), [Vault: API/SSO/SDK support](https://support.veeva.com/hc/en-us/sections/360007943774-Vault-API-SSO-SDK))
- **Sandboxes** — one sandbox domain + one production domain per customer; sandbox *sizes* (Small / Full, legacy "Large") govern data volume. ([Administering Sandbox Vaults](https://platform.veevavault.help/en/lr/48988/))
- **API** — included, with published **daily and 5-minute burst limits** (auth burst = 20 calls/min). Rate limits, not price gates. ([Veeva burst limit article](https://support.veeva.com/hc/en-us/articles/115000250373-Can-the-API-Burst-Limit-Be-Exceeded-During-a-Vault-CRM-Synchronization-))
- **Validation package** — Veeva performs and documents **IQ and OQ for every major release** and gives every customer a full validation package: validation project plan, requirements docs, test protocol, IQ/OQ, traceability matrices, validation summary report. Customer owns **PQ/UAT** using Veeva-supplied scripts and the sandbox. ([Veeva Vault Validation features brief](https://www.veeva.com/resources/veeva-vault-validation-product-brief/), [Veeva CSV whitepaper PDF](https://www.veeva.com/wp-content/uploads/2025/04/Veeva-Professional-Services-Project-_Computer-Systems-Validation-CSV-whitepaper.pdf))
- **Vault Direct Data API** — positioned as up to 100× faster than the traditional API, and made available to AI partners. ([Veeva AI Partner Program](https://www.veeva.com/meet-veeva/partners/ai/))

**Note the separate product:** *Vault Validation Management* is a distinct **validation-lifecycle-management application** (managing IQ/OQ/PQ protocols and execution for the customer's own systems) — not the same thing as the validation package Veeva ships with Vault. Whether it is separately licensed: **[NOT FOUND]** — no source confirms.

### 2.4 The Veeva down-market ladder: Basics / Essentials / QuickVault

This is Veeva's answer to "you're too expensive for small companies," and it is the most instructive packaging move in the sector.

**Veeva Basics** (announced 16 May 2024; >100 emerging biotechs adopted by late 2025):
- **Pre-configured, pre-validated, fixed-price editions.** "Zero implementation and maintenance costs." No professional-services fee (which on full Vault "can easily reach 6–7 figures" per third-party analysis).
- Named editions found: **eTMF Basics, CTMS Basics, QualityDocs, Training Basics, Submissions (RIM Basics: Submissions), Submissions Archive Basics, MedComms Basics, Vault CRM Basics**.
- **RIM Basics: Submissions Archive is explicitly an *optional add-on* to RIM Basics: Submissions.** ([Veeva Basics Help — RIM Basics Submissions Archive](https://regulatory.vaultbasics.help/en/gr/30705/))
- Upgrade path: "graduate to full Vault, no migration required" — same platform underneath. **[THIRD-PARTY]** ([IntuitionLabs Basics vs Full Vault](https://intuitionlabs.ai/articles/veeva-vault-basics-vs-full-vault))
- Sources: [Veeva Basics site](https://veevabasics.veeva.com/) · [Veeva introduces Vault Basics](https://www.veeva.com/resources/veeva-introduces-vault-basics-for-biotechs/) · [Veeva Basics 100+ biotechs, PR Newswire](https://www.prnewswire.com/news-releases/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations-302603762.html) · [Clarkston Consulting on Vault Basics](https://clarkstonconsulting.com/insights/veeva-vault-basics-for-biotech/)

**What is gated OUT of Basics:** the enumerated Basics regulatory editions are Submissions and Submissions Archive. **Registrations** and **Submissions Publishing** do not appear in the Basics edition list. **[MODERATE CONFIDENCE — inferred from the published edition list, not from a Veeva statement of exclusion.]** Note a countervailing indexed phrase — "RIM Basics: Submissions Archive **with Publishing** is kept up-to-date … once you turn on continuous publishing" — which suggests publishing may be attachable to Basics in some form. **I could not resolve this contradiction without page access. Verify directly before relying on it.**

Third-party framing that supports the gate: "Full Vault is not limited to core modules and can include advanced functions like **global submissions planning** … [becoming] a unified platform for clinical, regulatory, quality, manufacturing, safety, and marketing." ([IntuitionLabs](https://intuitionlabs.ai/articles/veeva-vault-basics-vs-full-vault))

**"Vault RIM Essentials"** — a distinct Veeva product page exists ([veeva.com/ap/products/vault-rim-essentials/](https://www.veeva.com/ap/products/vault-rim-essentials/)). Indexed content emphasizes **pre-built cross-application Connections** (RIM↔Clinical Operations, RIM↔Quality, RIM↔PromoMats) as part of the offer. Whether "Essentials" is a marketing alias for the Basics regulatory bundle or a genuinely separate SKU: **[NOT FOUND]** — could not disambiguate without page access.

**QuickVault by Veeva** — a *separate brand and separate motion* for MedTech startups ([quickvault.veeva.com](https://quickvault.veeva.com/)):
- **QuickStart startup package**: fully validated pre-configured eQMS (FDA/ISO/GxP best practice), pre-built SOPs/templates/training materials, **plus 5 hours/month of dedicated QA/RA expertise**. ([QuickStart startup package](https://quickvault.veeva.com/quickstart-startup-package/))
- **Monthly credit-card billing**, explicitly positioned against "long-term contracts that escalate over time."
- Modules added over time: **Regulatory & Submission Management** ([announcement](https://quickvault.veeva.com/resources/quickvault-launches-new-regulatory-submission-functionality/), [Quality Digest coverage](https://www.qualitydigest.com/inside/fda-compliance-news/quickvault-veeva-launches-regulatory-and-submission-management)), **Equipment Management**, **Supplier Management**.

**This is the clearest device-vs-biopharma packaging divergence in the market:** Veeva runs a *separate brand, separate pricing motion (credit card, monthly), and separate bundled-services model* for small MedTech, while emerging biopharma gets fixed-price pre-configured Vault editions under the Veeva Basics brand.

### 2.5 Veeva Clinical and Quality — same architecture

- **Vault Clinical Suite**: Vault eTMF, Vault CTMS, Veeva Site Connect, Vault Payments, Vault Study Start-up, Vault Study Training, Vault EDC, Veeva CDB, Veeva RTSM, Veeva ePRO. **Each licensed separately.** Pricing "may factor in study metrics as well." **[THIRD-PARTY]** ([Vault Clinical datasheet PDF](https://www.veeva.com/wp-content/uploads/2018/09/Veeva-Vault-Clinical-Datasheet.pdf), [Vault Clinical Operations product sheet](https://www.veeva.com/wp-content/uploads/2023/07/Veeva-Product-Sheet-Vault-Clinical-Operations.pdf))
- **Veeva Quality Cloud**: QMS, QualityDocs, Product Surveillance, Training, Validation Management, Station Manager (mobile, manufacturing-floor doc viewing), LIMS. ([Veeva Quality overview](https://www.veeva.com/products/quality-cloud/), [Quality Vault Help](https://quality.veevavault.help/en/lr/34812/))
- **MedTech-specific functionality inside QMS**: Field Actions and Recall Management, linked to complaints/CAPAs/change orders. ([Veeva MedTech QMS](https://www.veeva.com/medtech/products/quality/quality-management-system/), [Veeva QMS for MedTech features brief](https://www.veeva.com/medtech/resources/veeva-vault-qms-for-medical-devices-and-diagnostics-product-brief/))

### 2.6 Where AI sits in Veeva's ladder — **entry hook now, premium moat later (stated intent)**

This is the single best-documented AI-packaging data point in the sector.

- **Veeva AI Agents**: first release **December 2025** for Vault CRM and PromoMats; clinical, regulatory, safety, quality, medical agents rolling through **2026**; clinical data targeted 2027. ([Veeva AI Agents to be released across all applications](https://www.veeva.com/resources/veeva-ai-agents-to-be-released-across-all-veeva-applications/), [PR Newswire](https://www.prnewswire.com/news-releases/veeva-ai-agents-to-be-released-across-all-veeva-applications-302582730.html), [Veeva AI Agents now available](https://www.veeva.com/resources/veeva-ai-agents-now-available-to-increase-productivity-and-customer-centricity/))
- **Packaging statement**: the first release "will be **licensed at the Vault level with a simple and reasonable subscription fee** to encourage industry adoption that is both broad and thoughtful." ([Announcing Veeva AI](https://www.veeva.com/resources/announcing-veeva-ai/))
- Reported model: **usage-based pricing for AI at scale, while bundling standard agents into existing Vault licensing** to maximize adoption during the CRM migration window. **[THIRD-PARTY]** ([IntuitionLabs Veeva AI roadmap](https://intuitionlabs.ai/articles/veeva-ai-roadmap-crm-bot-agents-2026))
- **Pricing for the general release (targeted 2027) is not yet determined.** **[VENDOR-ACKNOWLEDGED via indexed text]**
- Early adopters report initial agentic AI at **no extra cost during pilot**. **[THIRD-PARTY]**
- **Vault AI is a named platform product**: agentic AI in the Vault Platform + application agents. ([Vault AI product page](https://www.veeva.com/products/vault-ai/)); MedTech has its own Veeva AI page ([veeva.com/medtech/products/veeva-ai](https://www.veeva.com/medtech/products/veeva-ai/))
- **Veeva AI Partner Program**: gives select partners Vault + **Direct Data API** access, training, support. **Certara joined**, so CoAuthor customers can work across CoAuthor and Veeva RIM without manual imports. ([Veeva launches AI Partner Program](https://www.veeva.com/resources/veeva-launches-ai-partner-program/), [Certara joins](https://www.certara.com/announcement/certara-joins-veeva-ai-partner-program-to-simplify-and-expedite-regulatory-submissions-for-life-sciences/))

**Read:** Veeva is deliberately pricing AI as a *land* motion (cheap, Vault-level, bundled) with an explicit intent to move to consumption at scale. They are treating AI as **adoption fuel for the platform**, not as the enterprise wall. A challenger who prices AI as a premium add-on is fighting the market leader's giveaway.

**Scale context:** Veeva Q2 FY2026 revenue $789.1M (+17% YoY), subscription $659.2M (+17%). ([Veeva Q2 FY2026 results](https://www.veeva.com/resources/veeva-announces-fiscal-2026-second-quarter-results/), [PR Newswire](https://www.prnewswire.com/news-releases/veeva-announces-fiscal-2026-second-quarter-results-302540372.html), [10-K FY2026](https://www.sec.gov/Archives/edgar/data/1393052/000139305226000014/veev-20260131.htm))

---

## 3. ARISGLOBAL LIFESPHERE

**Structure:** an interoperable modular SaaS suite spanning **Safety, Regulatory, Quality, Medical Affairs, Clinical**. ([arisglobal.com](https://www.arisglobal.com/), [LifeSphere](https://www.arisglobal.com/lifesphere/), [Modular](https://www.arisglobal.com/modular/))

**LifeSphere Regulatory** — five named modules ([ArisGlobal Regulatory platform PR](https://www.prnewswire.com/news-releases/arisglobal-announces-the-all-new-lifesphere-regulatory-platform-bringing-game-changing-efficiency-to-regulatory-information-management-301071094.html), [ArisGlobal media release](https://www.arisglobal.com/media/press-release/cloud-platform-lifesphere-regulatory-bringing-game-changing-efficiency-information-management-process/)):
1. **RIM** — product information, planning, tracking, data management
2. **Products Compliance** — medicinal product data through submission/post-submission/post-approval per IDMP
3. **Documents** — single content repository, templates, workflows, rendering, permissions
4. **Submission Management & Publishing** — create/compile/publish in any format
5. **Labeling** — end-to-end labeling change management and compliance tracking

**Plus a deliberate wedge SKU:** **LifeSphere IDMP** — a **standalone module that integrates with an existing non-IDMP-compliant RIMS**. This is a textbook "sell the compliance gap into the incumbent's install base" play — sell one module into a competitor's account rather than requiring rip-and-replace.

**LifeSphere Clinical:** eTMF, CTMS, EDC, SUSAR Reporting. ([spotsaas ArisGlobal review](https://www.spotsaas.com/product/arisglobal))
**LifeSphere Medical Affairs:** Medical Information among named components. ([Medical Affairs platform](https://www.arisglobal.com/lifesphere/medical-affairs/), [Medical Information](https://www.arisglobal.com/lifesphere/medical-affairs/medical-information/))
**LifeSphere Safety / MultiVigilance:** expanded to medical devices. ([MultiVigilance device support PR](https://www.arisglobal.com/media/press-release/lifesphere-multivigilance-expands-to-support-medical-devices/))

**Pricing axis:** custom pricing, tailored to team size/needs. One source indicates **Safety/PV is priced on number of cases**. **[THIRD-PARTY, partially paywalled]** ([RFP.wiki ArisGlobal cost drivers](https://www.rfp.wiki/specialty-industries/healthcare-life-sciences/life-sciences-software/arisglobal), [spotsaas](https://www.spotsaas.com/product/arisglobal))

**AI packaging — NavaX.** LifeSphere **NavaX** is the GenAI/cognitive engine; named capabilities include Dynamic Data Extraction, Narrative Generation, **NavaX Translation**, **XDI NavaX Data Intelligence** and three new agents. Marketed via a run of "Nth global pharma company selects NavaX" releases, with customers processing 150K–400K adverse-event cases/year. ([Fifth global pharma selects NavaX](https://www.arisglobal.com/media/press-release/fifth-global-pharma-company-selects-lifesphere-navax-to-drive-ai-powered-case-processing/), [Seventh](https://www.arisglobal.com/media/press-release/seventh-global-life-sciences-company-selects-lifesphere-navax-for-genai-driven-case-processing/), [XDI NavaX + 3 agents + Translation](https://www.prnewswire.com/news-releases/arisglobal-announces-xdi-navax-data-intelligence-three-new-agents-and-navax-translation-302684836.html), [NavaX Translation launch](https://www.arisglobal.com/media/press-release/arisglobal-launches-navax-translation-to-eliminate-manual-translation-in-global-pharmacovigilance/))

**NavaX is sold as a named, separately-selected premium layer** — customers "select NavaX" as a discrete decision, distinct from adopting LifeSphere Safety. **Whether it carries a separate price line vs. a tier upgrade: [NOT FOUND].** But the marketing treats it as a premium moat, the opposite of Veeva's bundle-to-adopt approach. Given per-case Safety pricing, a consumption model for NavaX would be structurally natural — **but I could not verify it.**

---

## 4. CERTARA

**Portfolio:** Simcyp PBPK, Phoenix PK/PD (WinNonlin), Pinnacle 21 (data standards), **Certara.AI**, D360, CoAuthor, GlobalSubmit, Certara IQ (QSP, launched Oct 2025), Phoenix Cloud with first module **TFL Studio** (late 2025). ([IntuitionLabs Certara software guide](https://intuitionlabs.ai/articles/certara-drug-development-software-guide), [Certara.AI](https://www.certara.com/certara-ai/))

### CoAuthor
- GenAI regulatory/medical writing: life-science-specialized **client-specific GPT** + structured content authoring + eCTD templates, **fully integrated with Microsoft Word**. Next-gen launched 17 June 2024. Covers Modules 1–5. eTemplates auto-populate content/headings/styles via the **Certara.AI generative AI plugin**. ([Certara CoAuthor launch PR](https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/), [IR release](https://ir.certara.com/news-releases/news-release-details/certara-launches-next-generation-coauthortm-generative-ai), [CoAuthor product page](https://www.certara.com/coauthor/))
- **Packaging signal (the one that matters):** "Certara clients have the flexibility to work with CoAuthor **as part of a comprehensive regulatory writing solution, at the program level, and across the enterprise**." Three commercial altitudes: **bundled-with-services → per-program → enterprise**. ([Certara CoAuthor launch PR](https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/))
- Certara also sells **Regulatory Writing Services** as a service line ([certara.com/regulatory-science/regulatory-writing/](https://www.certara.com/regulatory-science/regulatory-writing/)) — so software and human writing are two ends of one continuum. **This is the most important AI-authoring packaging insight in the report: the incumbent AI-authoring vendor sells the AI as an accelerant inside a services envelope, not as a seat.**
- **Exact tier names / list prices: [NOT FOUND].**

### Phoenix / Simcyp
- Phoenix WinNonlin: subscription or licence-fee based, **not publicly disclosed**; academic and regional discounts exist. Phoenix 8.5+ moved to a Certara Admin (CAD) account-based licensing system, away from Sentinel activation codes. ([Certara Forums — new licensing system](https://support.certara.com/forums/topic/1874-phoenixs-new-licensing-system-with-85-httpsmycertaranet/), [Phoenix licensing FAQs PDF](https://onlinehelp.certara.com/phoenix/8.3/responsive_html5_!MasterPage!/Faq.pdf))
- **Simcyp Access** — a **company-size-segmented tier**: cloud-based licensing for trained individuals at **pharma companies with fewer than 500 employees**, aimed at those who need the simulator "on a specific project for a limited time period." ([Certara launches Simcyp Access](https://www.certara.com/pressrelease/certara-launches-simcyp-access-to-expand-simulator-availability/), [Drug Discovery News](https://www.drugdiscoverynews.com/certara-launches-simcyp-access-11458))
- **Academic licences** as a separate free/discounted tier for centres of excellence. ([Certara academic licences](https://www.certara.com/brochure/academic-licenses/))
- **Simcyp Access pricing: [NOT FOUND].**

**Certara's tiering logic is unusual and worth copying:** they tier on **customer size (headcount threshold), project duration, and program count** — not on feature gates. A <500-employee company gets a genuinely different SKU, not a crippled one.

---

## 5. THE eCTD PUBLISHING SPECIALISTS — where per-submission pricing actually lives

### 5.1 LORENZ docuBridge — **the cleanest seat-count tier ladder in the sector**

Three scaled editions named for seat count: **docuBridge ONE / TWO / FIVE**.
- **ONE** — single-user, one-region eCTD, **pay-per-submission licensing**
- **FIVE** — configurable modular multi-user publishing for mid/large companies with 5+ users compiling eCTD and other formats across regions; also sold to regulatory agencies
- Generally **per-seat licensing with separate charges for modules like the validator**
- eLearning included; **technical support included; functional support purchased via support tokens**
- Pricing by quote only
- Scale: **1,050+ installations across 38 countries** — largest eCTD publishing vendor by install count **[THIRD-PARTY]**

Sources: [docuBridge ONE](https://www.lorenz.cc/solutions/docubridge-one/) · [docuBridge FIVE](https://www.lorenz.cc/Solutions/docuBridge-five/) · [IntuitionLabs docuBridge guide](https://intuitionlabs.ai/articles/lorenz-docubridge-ectd-guide) · [dnxt LORENZ comparison](https://dnxtsolutions.com/compare/lorenz/) · [dnxt RIM vendors guide](https://dnxtsolutions.com/rim-software-vendors/)

**Three separately-monetized things worth noting: seats, the validator module, and support tokens.** The entry tier is metered per submission — matching a small company's actual consumption — and the ladder converts to seats as you grow. That is a genuinely well-designed ramp.

### 5.2 EXTEDO — **regional validation sets as the tier axis**

- **eCTDmanager** + **EURSvalidator** (used by 35+ authorities incl. EMA) + **EXTEDOpulse Submission Management Hub**. ([eCTDmanager product info PDF](https://www.extedo.com/hubfs/Documents/Flyers/EXTEDO_eCTDmanager_Product_Information.pdf?hsLang=en), [EURSvalidator](https://www.extedo.com/software/submission-management-hub/submission-validation), [EXTEDOpulse Submission Publishing](https://www.extedo.com/software/submission-management-hub/submission-publishing), [EXTEDOpulse product info PDF](https://www.extedo.com/hubfs/Documents/Flyers/EXTEDOpulse_Product_Information.pdf?hsLang=en))
- **Packaging mechanic:** "**Regional subscriptions** are available, including **validation sets** for the country or region you want to file within. **Different validation set packages can be combined within a single subscription.**" **[VENDOR-PUBLISHED]**
- Deployment: cloud or on-premise, **per-user/module pricing**. **[THIRD-PARTY]** ([dnxt EXTEDO comparison](https://www.dnxtsolutions.com/compare/extedo/))
- Also offers **per-submission tokens** and enterprise licensing alongside per-user subscription. **[THIRD-PARTY]** ([Assyro eCTD software cost guide](https://www.assyro.com/blog/ectd-software-cost-guide))
- EXTEDO publishes its own thought-leadership on the in-house-vs-outsource publishing decision — i.e. they sell against their own software. ([EXTEDO in-house vs outsourced blog](https://www.extedo.com/blog/comparing-in-house-vs.-outsourced-regulatory-document-publishing-whats-right-for-your-company))

**Geography as the metering unit is the most under-used good idea in this market.** A one-region company pays for one region. It maps perfectly to how a biotech's regulatory footprint actually grows.

### 5.3 Freyr SUBMIT PRO — **the most transparent price list in the category**

Freyr appears to actually publish a pricing plan at [ectdtool.com/ectd-pricing-plan](https://www.ectdtool.com/ectd-pricing-plan). Figures reported through search (**[THIRD-PARTY reconstruction of a vendor page — verify before quoting]**):

| SKU | Reported price | Shape |
|---|---|---|
| SUBMIT PRO (standard) | ~$4,125 / user / year, **one health authority included**; **+~$1,450 per extra region** | per-seat + per-region |
| SUBMIT PRO Starter Pack | ~$4,125 / user / year | entry |
| SUBMIT PRO GEO | ~$3,750 / user / year; **3 months $1,925 / 6 months $3,025** | **sub-annual terms** |
| SUBMIT PRO ASSIST | ~$24,000/yr usage-based; a variant at ~$26,400/yr = **3 user licences + professional publishing services (1 large + 10 small submission projects)** | **software + human services bundled, metered in submissions** |

Sources: [ectdtool pricing plan](https://www.ectdtool.com/ectd-pricing-plan) · [Freyr SUBMIT PRO product page](https://www.freyrdigital.com/products/submission-management/submit-pro) · [freya fusion SUBMIT PRO](https://www.freyafusion.com/products/freyr-submit-pro) · [IntuitionLabs eCTD pricing guide](https://intuitionlabs.ai/articles/ectd-software-pricing-guide)

**Four things Freyr does that almost nobody else does: publishes prices; meters by health-authority region; sells sub-annual terms (3 and 6 months — matching a single filing campaign); and sells a tier where the unit is "submission projects delivered by humans."** Freyr also runs `freyafusion.com` as an "AI-first regulatory cloud" brand alongside `freyrdigital.com` — a brand-level AI repositioning.

### 5.4 Outsourced publishing bureaus — the true floor of the market

CROs and niche publishers **charge per dossier — a flat fee per submission, commonly cited at $5K–$20K depending on complexity and region**. **[THIRD-PARTY]** ([IntuitionLabs eCTD pricing guide](https://intuitionlabs.ai/articles/ectd-software-pricing-guide))

Per-sequence pricing is a recognized named cost model in the category ([PharmaRegulatory.in — licence vs subscription vs per-sequence](https://www.pharmaregulatory.in/cost-model-license-vs-subscription-vs-per-sequence-pricing-for-us-publishing-teams-in-year/)). Vendors: [Celegence](https://www.celegence.com/services/regulatory-publishing-ectd-submissions/), [Pearl Pathways](https://www.pearlpathways.com/ectd/), [G&L Scientific](https://gandlscientific.com/case-studies/cmc-strategy-authoring-ectd-publishing-outsourcing), [Parexel global regulatory submissions & outsourcing](https://www.parexel.com/solutions/approval-and-access/global-regulatory-submissions-and-outsourcing).

**This is your real competitive floor for small biotech.** A pre-IND company's alternative to your software is not a cheaper platform — it is paying a consultant $8K to publish the sequence. Any platform priced above ~$15–20K/yr must beat that, not beat Veeva.

### 5.5 Ennov and Instem

**Ennov** — modular suite: **Ennov Doc, Ennov Dossier, Ennov RIM, Ennov IDMP, Ennov Process**; "Ennov Regulatory suite combines Ennov Doc + Ennov Dossier + Ennov Process." Each solution "works on its own or integrates with others." Cloud or on-premise. Spans Regulatory, Quality, PV, Clinical, Commercial. ([Ennov RIM](https://en.ennov.com/solutions/regulatory/rim/), [Ennov Regulatory suite](https://en.ennov.com/solutions/regulatory/), [Ennov RIM product brief PDF](https://en.ennov.com/wp-content/uploads/2020/11/Ennov-Product-Brief-RIM.pdf), [Ennov med-device RIM+QMS](https://en.ennov.com/insider/regulatory/compliance-without-compromise-med-device-rim-qms/)). **Pricing/licensing model: [NOT FOUND].**

**Instem** — **Samarind RMS** is the RIM product, "well known across the **Medical Device** industry"; includes EDMS for submission content, dossier management, version and template control, HA interaction and change management, dashboards. ([Instem Samarind RMS](https://jp.instem.com/solutions/samarind-rms/index.php), [samarindrms.com](https://samarindrms.com/)). Broader Instem: Provantis (preclinical), Centrus (translational/modeling), Climb (non-GLP study management, via RockStep acquisition). **Taken private by ARCHIMED for £203M in 2023** ([ARCHIMED announcement](https://www.archimed.group/news/archimed-concludes-successfully-its-203-million-take-private-bid-for-drug-development-software-leader-instem/), [BusinessWire](https://www.businesswire.com/news/home/20231127890042/en/Instem-Now-Part-of-ARCHIMED-to-Further-Accelerate-Growth-and-Impact)). **Pricing/packaging: [NOT FOUND].**

---

## 6. eQMS / DEVICE QUALITY — the tier ladders that ARE published

This is where the sector actually publishes tiers, so the evidence is much better.

### 6.1 Greenlight Guru — device-only, and the cautionary tale of 2026

**Quality product — five named tiers/packages:** Quality, Product Development, Software Development, Quality Events, Medical Device Consultant Services. All quote-only. ([Greenlight Guru pricing](https://www.greenlight.guru/pricing), [checkthat.ai Greenlight pricing](https://checkthat.ai/brands/greenlight-guru/pricing), [ERP Research](https://www.erpresearch.com/erp-add-ons/healthcare/greenlight-guru))

- **Entry (Quality)** covers: document management, change management, training, supplier and parts management.
- **Higher tiers unlock:** **design controls, risk management, software release management, SBOM management, CAPA workflows**. ([checkthat.ai](https://checkthat.ai/brands/greenlight-guru/pricing))
- Note that Greenlight sells **consulting services as a listed tier** alongside software tiers.

**Greenlight Guru Clinical — a separate product with its own three tiers and, crucially, usage caps:** **Essentials / Plus / Professional**, **capped at 5 studies and 50 sites maximum**. Features: eCRF, ePRO/eCOA, randomization, AE/SAE tracking, PMCF surveys, 40+ languages. Positioned as "the only EDC designed specifically for Medical Devices & Diagnostics" — PMCF, PMPF, clinical investigations, clinical performance studies. Reported: Essentials ~$12–15K/yr up to 5 users; Plus ~$30K/yr+ before add-ons. **[THIRD-PARTY]** ([Greenlight Guru Clinical pricing](https://www.greenlight.guru/clinical-pricing), [clinical EDC page](https://www.greenlight.guru/clinical-electronic-data-capture-software), [checkthat.ai](https://checkthat.ai/brands/greenlight-guru/pricing))

**The 2026 repackaging — the most instructive negative example in this report.** Per OpenRegulatory (Dec 2025 / Jan 2026): Greenlight Guru executed a **"package separation"** — customers who previously bought *one* package (QMS + technical documentation) now must buy **three separate packages containing the exact same features**, with at least one documented case of a **100% price increase and no new functionality**. Entry-level pricing for a 5–10 person startup reported at **$25K–$35K/yr covering only ~3–5 full seats and ~3–5 view-only seats**. **[THIRD-PARTY — OpenRegulatory is a partisan source (a competitor/consultancy); the 100% claim is explicitly not independently verified or acknowledged by Greenlight Guru.]** ([OpenRegulatory Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price), [OpenRegulatory Greenlight alternative](https://openregulatory.com/articles/greenlight-guru-alternative))

### 6.2 Qualio — the seat-type split done well

Three plans: **Foundation / Growth / Scale**. ([Qualio pricing on G2](https://www.g2.com/products/qualio/pricing), [TrustRadius](https://www.trustradius.com/products/qualio/pricing), [PricingSaaS Qualio history](https://pricingsaas.com/companies/qualio))

- **Foundation** — core doc control, training compliance, basic workflow automation. **5 "edit" users.**
- **Growth** — market-ready orgs; unlimited resource integration; **AI-assisted quality processes**. **10 "edit" users.**
- **Scale** — mature enterprises; advanced workflows, broader access, deeper integrations. **Explicitly "custom pricing."**
- **All plans: unlimited "basic" (read-only) users.** **[THIRD-PARTY]**
- Setup fee reported €8K–€20K. Third-party reconstruction: ~$12K base + ~$3K/user → ~$36K/yr for 10 users. **[THIRD-PARTY]** ([OpenRegulatory Qualio price](https://openregulatory.com/articles/qualio-price))

**Two things to steal from Qualio:** (a) **unlimited read-only users at every tier** — this directly neutralizes the #1 complaint about Veeva and Greenlight; (b) **AI lands on the middle tier (Growth), not the top** — same shape as Notion.

### 6.3 MasterControl

- Public stance: "packaging and pricing options … for companies of all sizes — **from startup to enterprise, from pre-configured to custom**." ([mastercontrol.com/pricing](https://www.mastercontrol.com/pricing/)). No figures on the vendor page. **[VENDOR-PUBLISHED — the *shape* statement is the useful part: pre-configured vs. custom is the axis.]**
- Suites: **Quality Excellence, Manufacturing Excellence, Clinical Excellence, Supply Chain Excellence** — integrating with each other. ([Quality](https://www.mastercontrol.com/quality/), [Manufacturing Excellence](https://www3.technologyevaluation.com/solutions/54315/mastercontrol-manufacturing-excellence))
- Base plan reported: document control + training; advanced plans add audit management, CAPA, supplier management. Third-party: ~$25K/yr Basic (analytics, doc management, BI, change control). **[THIRD-PARTY]** ([Capterra](https://www.capterra.com/p/148577/MasterControl/pricing/), [ITQlick](https://www.itqlick.com/mastercontrol-quality-management-system-qms-software/pricing), [GetApp](https://www.getapp.com/operations-management-software/a/mastercontrol/))
- **Validation packaging is explicit and worth noting:** the patented **Validation Excellence Tool (VxT)** and **Validation on Demand (VoD)** are **included**, with **additional validation training and support as an optional purchase**. **[THIRD-PARTY]** — i.e. validation artifacts included, validation *help* monetized.
- AI: "purpose-built AI that delivers safe, practical benefits" inside Quality Excellence — framed as bundled. **Tier placement: [NOT FOUND].**
- Recurring reviewer complaint: complexity, steep learning curve. ([Capterra Greenlight vs MasterControl](https://www.capterra.com/compare/140578-148577/greenlight-guru-vs-MasterControl))

### 6.4 Dot Compliance

Three named editions found: **QMS Xpress, Compliance Xpand, Enterprise Xact**. Built on Salesforce; **pre-built and pre-validated** with a **comprehensive validation package** included. No published prices. Third-party comparison places the category at $20K–$60K/yr with 1–3 year minimum commitments. **[THIRD-PARTY]** ([Dot Compliance](https://www.dotcompliance.com/), [Salesforce-based eQMS](https://www.dotcompliance.com/salesforce/), [Enterprise QMS](https://info.dotcompliance.com/enterprise-qms), [OpenRegulatory Dot Compliance price](https://openregulatory.com/articles/dot-compliance-price)) **What differentiates the three editions: [NOT FOUND] — one source explicitly says the differentiation "isn't entirely clear."**

### 6.5 Matrix Requirements — published prices, explicit feature gates, and PE-driven inflation

**Three tiers, publicly priced** ([matrixreq.com/pricing/compare](https://matrixreq.com/pricing/compare), [TrustRadius](https://www.trustradius.com/products/matrixrequirements-matrixalm/pricing)):

| Tier | Reported price |
|---|---|
| Team Plus | €710/mo (~$920/mo) |
| Company Plus | €1,090/mo (~$1,390/mo) |
| Enterprise Plus | from €2,600/mo (~$3,390/mo) |

**The named feature gates that trigger an upgrade:** advanced configuration options, **review workflows**, **variants and labels**, **QMS features like CAPA and complaint management**, and **dedicated expert support**. **[THIRD-PARTY]** — this is one of the few explicit gate lists available in the sector.

**Products:** MatrixALM (ALM/design control/requirements for devices) + MatrixQMS.

**The market signal:** Matrix **scrapped the entry-level Essential plan (€390/mo)** entirely — "for early-stage startups, they no longer offer realistic pricing options any more" — after being **sold to a private equity firm**, and has since layered a **5% automatic annual increase** plus 10–20% raises in May 2026 (Enterprise €2,130 → €2,240/mo). **[THIRD-PARTY — OpenRegulatory, partisan]** ([Matrix Requirements pricing 2026](https://openregulatory.com/articles/matrix-requirements-pricing), [Matrix got sold](https://openregulatory.com/articles/matrix-requirements-got-sold-heres-what-you-need-to-know))

### 6.6 The vendors that reject seat-based pricing outright

This is a live, differentiated counter-position and it is winning attention:

- **ZenQMS** — "all-inclusive licensing model and **unlimited users**"; **non-seat-based**; **free access to validation materials**; **validated per GAMP 5 Category 4**. Reported $18K–$35K for small orgs. ([Capterra ZenQMS](https://www.capterra.com/p/138691/ZenQMS/), [SimplerQMS best-QMS roundup](https://simplerqms.com/best-qms-software-life-sciences-small-business/))
- **SimplerQMS** — minimum ~$17,500/yr covering **up to 15 users**; **all plans include** QMS modules, full implementation, **validation**, unlimited training, cloud hosting, templates, data migration, 24/7 support — "no hidden fees"; validation **continuously maintained through updates**. ([simplerqms.com/pricing](https://simplerqms.com/pricing/), [OpenRegulatory SimplerQMS pricing](https://openregulatory.com/articles/simplerqms-pricing))
- **Kivo** — "**Unapologetically Simple Pricing**": **every subscription includes eTMF, RIM, QMS and eCTD**; "all features included … **no separate charges or hidden fees**"; **no implementation fees, support fees, validation fees, or maintenance fees**. Priced on modules + users. Examples cited: ~$24K/yr for DMS + QMS & Training with a $5K one-time setup; ~$85K/yr for 100 enterprise users with implementation/migration from $25K. Separate **Kivo GO** low-end DMS SKU for emerging life sciences. ([kivo.io/pricing](https://kivo.io/pricing), [Kivo GO](https://kivo.io/go-dms), [Kivo eTMF](https://kivo.io/etmf), [Kivo RIM](https://kivo.io/solutions/regulatory-submission-software))
- **ComplianceQuest** — publishes a **$30/user/month starting price**, and explicitly says pricing includes "quality teams, approvers, **read-only users**, and suppliers, with costs calculated based on role complexity." ([compliancequest.com/qms-software-pricing](https://www.compliancequest.com/qms-software-pricing/), [qhsetech review](https://qhsetech.com/software/compliancequest))
- **Scilife** — tiers **Free / Essential / Core / Core+**; Essential = doc control + training; Core adds CAPA, change control, quality events. Reported from ~$1,000/mo. Serves pharma, biotech, ATMP, device, cannabis, **CROs and CMOs**. ([Scilife device QMS pricing](https://www.scilife.io/pricing-qms-for-medical-device), [SelectHub](https://www.selecthub.com/p/quality-management-software/scilife/))

**Kivo's "all four applications in every subscription" is the single sharpest anti-Veeva packaging position in the market**, and it exists precisely because per-application licensing is the market's loudest grievance.

### 6.7 Rimsys — device RIM

Modules: **Registrations, Submissions, UDI, Standards, Intelligence, Impact Assessments** — all on one structured data model. Registrations covers **250 countries**; Standards covers **200+ SDOs**. Validated to ISO 13485:2016, 21 CFR Part 11, ISO 27001. **G2 lists 5 pricing editions; a free trial is available; edition names and prices are not published.** ([Rimsys platform](https://www.rimsys.io/products/rimsys-platform), [Rimsys UDI](https://www.rimsys.io/products/udi), [rimsys.io/pricing](https://www.rimsys.io/pricing), [G2 Rimsys pricing](https://www.g2.com/products/rimsys/pricing))

Reference deployment: **Philips runs four Rimsys modules across 250 countries and 30+ business units.** **[THIRD-PARTY]**

**Device-RIM packaging tell:** the natural metering units are **countries/registrations, product families, and standards coverage** — not users. Rimsys's "flexible pricing that scales with your success" language points that way but **the actual axis is [NOT FOUND].**

---

## 7. IQVIA AND THE CRO/SERVICE-LED PLAYERS

**IQVIA RIM Smart** — "a single solution optimized for **both pharmaceutical and MedTech**," covering pharma, device and **combination products** in one lifecycle. Subscription pricing based on **selected modules, features, and user access levels**; implementation/support fees vary by service level. Differentiates on **software + data services + regulatory intelligence + outsourced consulting access**. ([IQVIA RIM Smart fact sheet](https://www.iqvia.com/library/fact-sheets/iqvia-rim-smart-regulatory-information-management), [IQVIA SmartSolve RIM](https://www.iqvia.com/library/fact-sheets/iqvia-smartsolve-rim), [Gartner Peer Insights IQVIA RIM Smart](https://www.gartner.com/reviews/product/iqvia-rim-smart)). IQVIA also distributes the **Gartner Market Guide for Life Science RIM Solutions** ([IQVIA analyst report page](https://www.iqvia.com/analyst-reports/report/gartner-market-guide-for-life-science-regulatory-information-management-solutions)).

**Note IQVIA is the one major vendor with a single SKU spanning pharma AND MedTech** — the opposite of Veeva's separate-brand approach.

**Parexel — ParexelAI (launched 18 May 2026)** — "a proprietary suite of **human-led AI services and capabilities**." Packaging is *services*, not seats:
- **Regulatory submissions: working with Weave Bio, reducing IND and NDA authoring timelines by 60%.**
- First CRO to adopt **Palantir AIP** as the backbone of AI-enabled clinical operations.
- Acquired **Vitrana** (AI-enabled end-to-end PV platform, Apr 2026).
- Claimed effects: 50% reduction in site-selection timelines, 30% reduction in CSR medical writing, 20% reduction in safety literature screening.
Sources: [ParexelAI](https://www.parexel.com/solutions/parexelai) · [Parexel launch PR](https://newsroom.parexel.com/news-releases/news-release-details/parexel-launches-parexelaitm-delivering-ai-innovation-accelerate) · [HIT Consultant](https://hitconsultant.net/2026/05/18/parexel-launches-parexelai-clinical-development-suite/) · [Vitrana acquisition](https://www.globenewswire.com/news-release/2026/04/29/3284206/0/en/parexel-adds-new-technology-capabilities-in-patient-safety-solutions-with-acquisition-of-vitrana.html)

**Strategically the most important line in this report:** the CRO does not resell Weave Bio's seats — it **absorbs the AI into a service price**. AI-native regulatory vendors are finding their fastest channel is *inside a CRO's service margin*, invisible to the end sponsor. That is a distribution model, not just a packaging one.

---

## 8. AI-NATIVE CHALLENGERS

### Weave Bio — enterprise ACV, module-shaped
- Founded 2022, SF. **$20M Series A (16 Oct 2025)**, led by USVP; $36M total; $10M seed May 2024. ([BusinessWire Series A](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-$20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform))
- Explicit target segments: **pharma, biotech, CROs, and regulatory consultants**.
- Named modules: **AutoIND** (flagship — auto-drafts IND sections from company data + public data + current guidance), **Submission Builder** (eCTD assembly), **HAQ Manager** (health-authority question drafting/organizing/review), **AutoReview** (AI-assisted dossier review, Feb 2026), **Publishing V3**. 2026 releases added **NDA submission support** (Apr), **dossier document import** (May), **global submissions from a single source of truth** (Jun). ([Weave platform](https://www.weave.bio/platform/), [Submission Builder](https://www.weave.bio/platform/platform-submission-builder/), [Feb 2026 release notes](https://www.weave.bio/resources/weave-february-2026-release-notes/), [AutoIND release notes](https://www.weave.bio/resources/autoind-april-2025-product-release-notes/), [Global submissions PR](https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth))
- **Pricing: not published.** Third-party estimate: **$100K+ ACV, six figures annually, multi-month implementation, with implementation fees + user-tier seat costs + integration scoping.** **[THIRD-PARTY, and from a competitor's comparison page — treat cautiously]** ([regfo comparison](https://regfo.com/compare/weave-bio), [thebrightbyte](https://thebrightbyte.com/playbook/expertise/regfo-vs-weave-bio))
- **Key read:** the best-funded AI-native regulatory company chose to price like an incumbent, and reaches small companies through Parexel rather than through a self-serve tier.

### Regfo — the only AI-native regulatory tool with a fully public price ladder
**Free (limited) / Pro $399 per month / Team $999 per month.** 20% off annual. **No setup fees, no implementation contracts.** ([Regfo blog](https://regfo.com/blog/best-fda-compliance-software-biotech), [Capterra Regfo](https://www.capterra.com/p/10041981/Regfo/))
- **Pro** = unlimited document uploads, unlimited workspaces, priority support.
- **Team** = adds **10 team members, audit trail, custom onboarding, multiple programs.**
- Positioning: AI regulatory gap analysis — checks preclinical study packages against ICH/FDA requirements, produces a compliance score with guideline citations. Targets **Series A–C biotechs, 10–50 employees, preparing INDs**.

**Two gate choices worth studying:** (1) **multiple programs** is the Team gate — program count is a superb metering unit for a biotech, because it tracks pipeline value directly; (2) **audit trail is gated to the paid team tier.** That is the *only* case in this research of a regulatory vendor putting audit trail behind a wall — and it is only viable because Regfo is an analysis tool, not a system of record. **Do not copy this if you are the system of record.**

### Yseop — automation packs as the unit
Yseop Copilot: "**automation packs** consist of packaged components and configurations specific to a use case or document" — packs exist for **clinical study reports, clinical trial narratives**, and non-life-science domains. GxP compliance, data privacy, model explainability, embedded automated compliance checks; integrates into daily medical writing tools. Sold via **AWS Marketplace** listing among other channels. ([Yseop life sciences](https://yseop.com/solutions/life-sciences/), [Yseop Copilot](https://yseop.com/automate-medical-regulatory-authoringworkflows/), [regulatory document automation](https://yseop.com/regulatory-document-automation/), [AWS Marketplace listing](https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi))
**Prices / pack pricing: [NOT FOUND].** But **"per document type" is the packaging unit** — a genuinely distinct axis, and one that maps to how medical writing groups budget.

### Faro Health
**Study Designer** — digitally native trial design; modular "building blocks"; structured digital representation of trials for downstream integration. ([Faro Study Designer](https://farohealth.com/study-designer/), [farohealth.com](https://farohealth.com/)). **Pricing, tiers, per-study/per-program packaging: [NOT FOUND]. No product named "Ariadne" was found — I could not confirm that name exists.**

### Trialize, Unlearn, AutoCruitment
- **Trialize** — "has not provided pricing information." ([G2 Trialize pricing](https://www.g2.com/products/trialize/pricing)) **[NOT FOUND]**
- **Unlearn.ai** — digital twins / Digital Twin Generators; claims 25%+ reduction in enrollment and trial timelines. ([unlearn.ai/digital-twins](https://www.unlearn.ai/digital-twins), [digital twin generators](https://www.unlearn.ai/digital-twin-generators), [Drug Discovery Trends](https://www.drugdiscoverytrends.com/unlearn-ceo-digital-twins-could-slash-clinical-trial-patient-enrollment-by-25-or-more/)). **Pricing model (per trial or otherwise): [NOT FOUND].**
- **AutoCruitment** — **[NOT FOUND]**. No pricing or packaging information surfaced in any search.
- **Assyro** — emerged from Antler accelerator early 2026, early-access; **no public pricing, all contracts by direct contact.** ([Assyro insights](https://www.assyro.com/insights/best-rim-software))
- **"Sedaro-type" startups** — no relevant life-sciences regulatory analogue found. **[NOT FOUND]**

### Where AI sits in the ladder across the sector — the summary answer to your question

| Vendor | AI placement | Read |
|---|---|---|
| Veeva | **Entry hook** — Vault-level "simple and reasonable" fee, standard agents bundled; usage-based only at scale; 2027 GA pricing undecided | Land motion |
| ArisGlobal (NavaX) | **Premium moat** — separately named, separately "selected," marketed as a distinct decision | Upsell |
| Certara (CoAuthor) | **Neither** — the AI *is* the product, sold at program or enterprise altitude, or inside a services engagement | Services wrapper |
| Qualio | **Middle tier** — AI-assisted quality on Growth, not Foundation, not Scale-only | Mid-tier upgrade lever |
| Notion (analogue) | **Middle tier** — full AI moved to Business; agents add $10/1,000 credits | Mid-tier + consumption |
| Regfo | **The whole product**, free tier included | Free tier as acquisition |
| MasterControl | **Bundled** into Quality Excellence | Table stakes |
| Weave Bio | **The whole product**, enterprise-priced, no free tier | Enterprise-only |

**The market has not settled.** But the two largest players (Veeva, MasterControl) are both **bundling AI in**, and the pure-plays are the ones charging premiums. Historically, when the platform incumbent bundles a capability, it stops being a moat within about two product cycles.

---

## 9. HORIZONTAL SaaS — TIER SHAPE ONLY

You asked specifically how these players decide what is free/entry vs. enterprise-only. The answer across all six is remarkably consistent: **the enterprise wall is built entirely from identity, audit, governance, residency, and SLA — never from core product capability.** Nobody withholds the actual work-doing feature.

### Vercel
Hobby / Pro / Enterprise. **Enterprise-only:** audit logs, audit log drains, SCIM directory sync, private networking, priority support SLAs, dedicated success engineers, compliance coverage (SOC 2, ISO 27001, HIPAA, PCI). **SAML SSO is Enterprise *or* a Pro add-on at $300/mo; SCIM is $150/mo on Pro** → $450/mo regardless of team size. Enterprise reported to start ~$20–25K/yr, contact-only. ([vercel.com/pricing](https://vercel.com/pricing), [Vercel Enterprise docs](https://vercel.com/docs/plans/enterprise), [Vercel SAML docs](https://vercel.com/docs/saml), [Stitchflow on Vercel SCIM](https://www.stitchflow.com/scim/vercel))
**The interesting move: SSO/SCIM as flat-fee *add-ons* to the mid tier.** It lets a 6-person regulated team buy compliance without buying Enterprise — and it monetizes the compliance need without holding the product hostage. **This is directly transferable to a life-sciences entry tier.**

### Linear
Free / Basic $10 / Business $16 / Enterprise (custom, reported $20–30/user/mo). **Enterprise-only:** SAML SSO, SCIM, audit logs, IP restrictions, **HIPAA compliance**, advanced API rate limits, custom security reviews, dedicated migration assistance, SLA-backed support. Free/Basic/Business get only **Google SSO** — noted by one analyst as "thinner than most regulated buyers expect at that price point." ([Linear pricing on G2](https://www.g2.com/products/linear/pricing), [usecarly Linear pricing](https://www.usecarly.com/blog/linear-pricing/), [costbench](https://costbench.com/software/developer-tools/linear/))
**Note that HIPAA itself is the enterprise gate.** The regulated-compliance posture *is* the SKU.

### Notion
Free / Plus $10 / Business $20 / Enterprise (custom). **Enterprise-only:** SCIM provisioning, **full audit logs**, unlimited page history, DLP/SIEM connections, advanced security & content controls, **zero-data-retention AI**, dedicated CSM. **Business** carries: full Notion AI (Agent, AI Meeting Notes, Enterprise Search), **SAML SSO**, granular database permissions, private teamspaces, 90-day page history. **Autonomous Custom Agents add $10 per 1,000 monthly credits on top.** ([Notion pricing analyses](https://www.usecarly.com/blog/notion-pricing/), [gend.co](https://www.gend.co/blog/notion-pricing), [aiproductivity.ai](https://aiproductivity.ai/blog/notion-pricing/))
**Two moves to copy:** (a) **SAML at Business, SCIM at Enterprise** — splitting the identity stack across two tiers doubles the ladder's monetizable steps; (b) **zero-data-retention AI is an Enterprise feature.** For a GxP product, "your data never touches the model provider" is exactly the kind of thing that justifies an enterprise SKU without crippling lower tiers.

### Figma — **seat-type tiering, the most relevant model for RIM**
Two dimensions: **plan** (Professional / Organization / Enterprise) × **seat type** (Full / Dev / Collab).
- Professional: Full $16, Dev $12, **Collab $3**
- Organization: Full $55, Dev $25, Collab $5
- Enterprise: Full $90, Dev $35
- **What pulls you up:** "**SSO and Code Connect pull a team to Organization; SCIM and workspaces pull it to Enterprise.**"
- **Library/design-system analytics: Organization + Enterprise; the Analytics *API*: Enterprise only.**
- Organization and Enterprise are **annual-billing only**; Professional monthly costs 25% more.
Sources: [usecarly Figma pricing](https://www.usecarly.com/blog/figma-pricing/), [stackscored](https://www.stackscored.com/pricing/graphic-design/figma/), [comparedge](https://comparedge.com/tools/figma/cost-guide), [Figma design system analytics blog](https://www.figma.com/blog/introducing-design-system-analytics/)

**Figma is the closest structural analogue to a RIM product.** A regulatory platform has exactly the same population shape: a few authors (Full), a moderate number of reviewers/approvers (a "Dev"-equivalent), and a large tail of read-only/inspection users (Collab, $3). **A $3-equivalent read-only seat is the mechanism that lets a platform be adopted org-wide without a headcount fight — and it is precisely what Veeva's Read Only license does not appear to achieve at price.** Also note: **"the feature the cheap seat loses" is specified precisely** (Collab gets only basic Dev Mode inspection). Vague seat definitions are a sales-cycle tax.

### Datadog — the anti-pattern
"Does not sell a single subscription but sells **around two dozen products, each metered in its own unit.**" Most core products come in **Free / Pro / Enterprise**. Infra: Pro $15/host/mo annual ($18 on-demand); Enterprise $23/host/mo, lifting allotments to 200 custom metrics + 10 containers/host and adding **ML alerts and a governance console**. APM: $31 (Pro) / $40 (Enterprise) per host **on top of** infrastructure. Logs metered twice — **per GB ingested ($0.10) and per million events indexed ($1.70 15-day / $2.50 30-day)**.
**Documented consequence:** "Most teams find their actual bill runs **2 to 3×** higher than initial estimates"; "**product sprawl** — Infrastructure plus APM plus Logs plus RUM plus Synthetics stacks into a per-host figure several times the headline rate before anyone notices"; a single high-cardinality tag can generate thousands of custom metrics overnight.
Sources: [Finout Datadog pricing](https://www.finout.io/blog/datadog-pricing-explained), [OpsLyft](https://www.opslyft.com/blog/datadog-pricing), [costbench](https://costbench.com/software/observability/datadog/), [VendorBenchmark](https://www.vendorbenchmark.com/blog/datadog-pricing-benchmark-per-host-module.html), [OneUptime real cost](https://oneuptime.com/blog/post/2026-03-18-the-real-cost-of-datadog/view)

**Datadog is Veeva's pricing structure with the mask off, and the reputational cost is documented.** Per-module × per-unit metering produces unbudgetable bills and becomes the single thing buyers say about you. **Note that Datadog's Enterprise tier gates a *governance console* and ML alerts — governance-as-enterprise-feature is the pattern that does transfer.**

### Atlassian
Free (≤10 users) / Standard (~$8.15/user/mo annual, 1–10 users) / Premium (~$16) / Enterprise (custom).
- **Premium gates:** advanced permissions, **audit logs** (comprehensive user-initiated activity logging), unlimited automation, advanced analytics, 24/7 support, **1 sandbox**.
- **Enterprise gates:** **multi-instance**, **99.95% SLA**, **advanced audit**, **data residency**, dedicated support, unlimited storage, **5 sandboxes allocatable across sites**.
- **Atlassian Guard** is sold as a *separate security product* with its own Standard/Premium editions — security unbundled from the core plan entirely.
- Atlassian raised prices ~15% in 2025.
Sources: [Jira pricing](https://www.atlassian.com/software/jira/pricing), [Confluence pricing](https://www.atlassian.com/software/confluence/pricing), [Atlassian sandboxes](https://support.atlassian.com/organization-administration/docs/what-are-sandboxes/), [audit log activities](https://support.atlassian.com/security-and-access-policies/docs/accessing-audit-log-activities/), [Redress Enterprise vs Premium](https://redresscompliance.com/atlassian-enterprise-vs-premium), [Atlassian Guard guide](https://us.seibert.group/blog/atlassian-guard-guide)

**Two directly transferable mechanics: (a) audit at Premium, *advanced* audit at Enterprise — the same capability split into two saleable grades; (b) sandbox *count* as a tier lever (1 vs 5).** For a validated GxP product, sandbox count maps exactly onto how many validation/UAT environments a customer can run — a natural and defensible gate.

### Cross-cutting conclusion on the enterprise wall

**What is enterprise-only in horizontal SaaS, ranked by consistency across all six:**
1. **SCIM / directory sync** — Enterprise in Vercel, Linear, Notion, Figma. The most consistent single gate in SaaS.
2. **Audit logs** — Enterprise in Vercel, Linear, Notion; Premium+ in Atlassian with "advanced audit" reserved for Enterprise.
3. **Data residency** — Enterprise (Atlassian).
4. **SLA guarantees** — Enterprise (Atlassian 99.95%, Linear, Vercel).
5. **SAML SSO** — *splits*: Enterprise in Linear; Business in Notion; Organization in Figma; Enterprise-or-$300/mo-add-on in Vercel. **The most commonly monetized-below-Enterprise item.**
6. **API access / advanced API rate limits** — Enterprise in Linear and for Figma's Analytics API; *never fully withheld*.
7. **Multi-instance / multi-org** — Enterprise (Atlassian multi-instance; Figma workspaces).
8. **Governance consoles** — Enterprise (Datadog).

**And the inverted lesson for your market:** in horizontal SaaS, audit trail is a premium feature. In a 21 CFR Part 11 product, **audit trail, e-signature, and versioned immutable history are the product** and cannot be gated. What you *can* gate, using the same instincts: **SCIM, data residency, sandbox count, multi-org/multi-sponsor isolation, advanced/exportable audit and SIEM streaming, SLA, and the validation-documentation package's depth.**

---

## 10. WHAT THE MARKET ACTUALLY DEMANDS IN 2025–2026

### 10.1 Analyst framing

- **Gartner covers this as a Market Guide, not a Magic Quadrant.** "Best Life Science Regulatory Information Management Solutions (**Transitioning to** Life Science Regulatory Information Management Systems)" on Peer Insights — the market category itself is mid-rename. ([Gartner Peer Insights RIM market](https://www.gartner.com/reviews/market/life-science-regulatory-information-management-solutions), [Gartner Market Guide via IQVIA](https://www.iqvia.com/analyst-reports/report/gartner-market-guide-for-life-science-regulatory-information-management-solutions), [ectd247 on the Market Guide](https://ectd247.com/gartner-market-guide-for-life-science-regulatory-information-management-solutions/)). **I could not access the Market Guide's contents. [NOT FOUND].**
- Named vendor set per market research: Veeva, Kalypso (Rockwell), DDi, Körber, ArisGlobal, PhlexGlobal, AmpleLogic, Ennov, MasterControl, Rimsys, Ithos Global (Cordance), LORENZ, IQVIA, EXTEDO. Market sized at **$2.50B (2025) → $5.11B (2033), 9.10% CAGR**. **[THIRD-PARTY]** ([Grand View Research RIM market](https://www.grandviewresearch.com/industry-analysis/regulatory-information-management-rim-system-market-report))

### 10.2 Gens & Associates World Class RIM — the industry-standard benchmark

The 2025 Operational Excellence and World Class RIM study (published ~15 Apr 2026), **47th cycle**, **59 organizations** across pharma, biologics, medtech and gene therapy:

- **"Only one life sciences company in 59 is genuinely prepared for the period of disruption ahead."**
- New **Future Readiness Indicator (FRI)**, measuring core process, organizational, data and digital capability.
- Identifies a **"confluence of change"** landing inside a **2–3 year window**: AI, **cloud-based regulatory spaces**, **data aggregation platforms**, **structured data mandates**, and **workforce transformation**.
- **The headline is explicitly: the "secret recipe" for future readiness "has little to do with AI."**

Sources: [PharmiWeb — Gens 2025 study, "secret recipe"](https://www.pharmiweb.com/press-release/2026-04-15/gens-associates-new-world-class-rim-study-identifies-secret-recipe-for-regulatory-functions-future-readiness-and-it-has-little-to-do-with-a) · [Gens World Class RIM research](https://gens-associates.com/world-class-rim-research/) · [study launch PR](https://www.prweb.com/releases/gens--associates-launches-latest-world-class-rim-study--the-largest-yet--to-define--hone-industry-standard-practice-301946722.html)

**This is the most important market-demand finding in the report, and it cuts against AI-first positioning.** The industry's own benchmark says data governance, process and organizational capability — not AI features — separate leaders from laggards. **Sell AI, but do not sell *only* AI to this buyer; sell the data model and the governance underneath it.**

### 10.3 The structural driver: documents → structured data

- **eCTD 4.0 is arriving on a hard clock:** EMA has accepted voluntary eCTD 4.0 since **December 2025**; **Japan's mandate landed April 2026**; **mandatory EMA use expected by 2027**. ([Vigilare eCTD trends 2026](https://www.vigilarebp.com/blogs/ectd-trends-in-2026-essential-updates-for-cmc-pv-clinical-teams/), [Cloudbyz eCTD FAQ](https://blog.cloudbyz.com/faq/frequently-asked-questions-electronic-common-technical-document-ectd), [IntuitionLabs eCTD v4.0 guide](https://intuitionlabs.ai/articles/ectd-publishing-software-comparison))
- "Regulatory work is shifting from managing documents to **managing structured data**"; eCTD 4.0 requires "an overhaul of authoring, publishing and submission."
- **Structured Content Authoring** claims: unlocks the **65% of regulatory data already sitting inside documents**; content reuse can cut authoring time **up to 50%**. ([NNIT structured content authoring](https://www.nnit.com/our-solutions/regulatory-affairs/structured-content-authoring), [Docuvera AI-SCA and eCTD 4.0](https://docuvera.com/blog/ai-sca-and-the-digital-regulatory-roadmap/), [ScienceDirect on CMC structured content](https://www.sciencedirect.com/science/article/pii/S0022354921005323))
- **IDMP / SPOR / PMS** redefine how product data is generated and shared, cascading into other EMA services.
- Key analyst prescription: "treat **eCTD compliance as an upstream design constraint** — submission structure and metadata requirements reach CMC, PV and clinical teams **before content authoring begins**."

**Commercial implication for packaging:** structured data mandates create a *compliance-gap SKU* opportunity — the ArisGlobal LifeSphere IDMP play (a standalone module that plugs into a non-compliant incumbent RIMS). A challenger can sell one small, urgent, deadline-driven module into a Veeva account without asking anyone to rip out Veeva. **That is the highest-probability wedge in this market.**

### 10.4 AI adoption reality — the demand is real, the readiness is not

- **72% of 30+ drug manufacturers surveyed (HexaData, 2026) say their data are not ready for AI.** Cited causes: fragmented systems, no unified reference data, no data governance as a formal function.
- **A Veeva study found 67% of companies abandon AI initiatives due to poor data quality and fragmentation.**
- **Only 8% of AI pilot projects reached full-scale deployment.**
- Primary obstacles: poor input data quality, and **not knowing how to integrate AI with GxP processes**.
- "Regulators currently **lack unified benchmarks for what constitutes 'sufficient explainability'**, creating ambiguity for firms and inconsistency across audits." Lack of regulatory clarity is cited as a top barrier.
- Trust and regulatory uncertainty are the main barriers to full AI adoption in clinical research.

Sources: [GxP News — most pharma unprepared for AI](https://gxpnews.net/en/2026/07/most-pharma-companies-unprepared-for-ai-adoption-survey-finds/) · [EY — GxP and AI tools: compliance, validation, trust](https://www.ey.com/en_ch/insights/life-sciences/gxp-and-ai-tools-compliance-validation-and-trust-in-pharma) · [Zamann — AI in clinical trials trust crisis](https://zamann-pharma.com/2026/06/03/ai-in-clinical-trials-faces-trust-crisis-regulatory-uncertainty-grows/) · [ISPE — digital compliance in an AI-driven GxP landscape](https://ispe.org/pharmaceutical-engineering/ispeak/digital-compliance-building-trust-ai-driven-gxp-landscape) · [IntuitionLabs — barriers to AI adoption](https://intuitionlabs.ai/articles/ai-adoption-life-sciences-barriers)

**Packaging implication:** the paid product is not "AI." The paid product is **AI you can defend in an inspection** — provenance, traceability, explainability, human-in-the-loop evidence, and validation documentation for the AI itself. **That is a legitimate and defensible premium tier**, and unlike raw AI capability, it will not be commoditized by Veeva bundling agents into Vault.

### 10.5 Small/virtual biotech vs. large pharma — what each actually needs

**Small/virtual biotech — three named obstacles** ([dnxt biotech regulatory software buyer's guide](https://www.dnxtsolutions.com/biotech-regulatory-software/)):
1. **Cost structure** — "enterprise pricing assumes enterprise budgets; **first-year TCO often exceeds what a biotech has allocated for all regulatory operations**."
2. **Implementation timeline** — "12–18 month implementations don't work when submission deadlines are sooner; even 'accelerated' enterprise implementations rarely complete in under nine months."
3. **Scope complexity** — "configuring a system built for global pharmaceutical operations to support a biotech's simpler needs **still requires configuring the system**, and that complexity translates to cost and time."

Also: "Most regulatory software was built for big pharma; **biotechs need tools that scale up with them — not implementations that take a year and cost more than their headcount.**" And on Veeva specifically: "implementation timelines of 12–18 months and **per-seat licensing models that make total cost difficult to predict**"; rollout "often requires Veeva or third-party implementation partners"; ongoing operation "often demands a **dedicated Vault administrator** rather than a quality team managing the system themselves." ([dnxt RIM vendors](https://dnxtsolutions.com/rim-software-vendors/), [trialtrack on Vault alternatives](https://trialtrack.net/blog/veeva-vault/))

**So the small-biotech requirement set is: predictable total cost, sub-90-day time-to-value, zero admin headcount, pre-validated out of the box, and no configuration project.** Note that **three of those five are not features — they are packaging and delivery decisions.** Veeva Basics, QuickVault, Dot Compliance, ZenQMS, SimplerQMS and Kivo all compete on exactly these, not on capability.

**Large pharma needs (from the same and adjacent sources):** global submissions planning, multi-region publishing, IDMP/SPOR data compliance, cross-application connections (RIM↔Clinical↔Quality↔PromoMats), enterprise data governance and aggregation platforms, deep configurability, and the ability to absorb a 12–18 month implementation and a dedicated admin team. Gens adds: **data governance practices and data aggregation platforms** as the current differentiators of leaders.

**One compliance driver hits small companies disproportionately:** "a small company planning global submissions now faces **IDMP-related data entry or risk non-compliance**, and purchasing Veeva Registrations (part of Vault RIM) to handle IDMP may be necessary." **[THIRD-PARTY]** ([IntuitionLabs small biotech RIM cost](https://intuitionlabs.ai/articles/veeva-vault-rim-cost-small-biotech)) — i.e. a structured-data mandate forces a small company to buy an *enterprise* module. **That is a packaging failure by the incumbent and a direct opening.**

### 10.6 What CROs need that sponsors don't

**Verified requirements:**
- **Sponsor/investigator separation is a regulatory requirement, not a preference.** Sponsor TMF and investigator TMF (ISF) "must be kept separate" for subject confidentiality and investigator control, with segregation "especially important for restricting access to files containing randomization codes or unblinded pharmacovigilance details." ([TFS — what is a TMF](https://tfscro.com/resources/what-is-a-trial-master-file-tmf/))
- **Multi-CRO oversight:** "when multiple CROs are involved, the sponsor should define expectations for document creation, management, and retention"; a single source of TMF documentation "simplifies the use of multiple CROs." ([Egnyte CRO collaboration playbook](https://www.egnyte.com/guides/life-sciences/cro-collaboration-playbook-clinical-trial-data), [Agatha shared eTMF](https://en.agathalife.com/improve-cro-and-sponsor-collaboration-with-a-shared-etmf/))
- **Handoff is a named compliance failure mode:** CRO→sponsor TMF handoff has documented "compliance gaps before inspection." ([Montrium on CRO→sponsor handoff](https://blog.montrium.com/blog/cro-to-sponsor-tmf-handoff-closing-compliance-gaps-before-inspection), [Kivo — why sponsors shouldn't leave the TMF with their CRO](https://kivo.io/news/why-sponsors-shouldnt-leave-the-tmf-with-their-cro))
- **Veeva's CRO answer is a partner *program*, not a product SKU:** the Vault CRO Partner Program has **three tiers based on Veeva product experience, training achievement, and verified customer satisfaction** — i.e. Veeva tiers its *CROs*, not its CRO pricing. ([Veeva CRO Partner Program](https://www.veeva.com/meet-veeva/partners/cro/), [directory](https://www.veeva.com/meet-veeva/partners/cro/partner-directory/), [Veeva enables CROs with Vault EDC](https://www.veeva.com/resources/veeva-enables-cros-to-build-studies-faster-with-vault-edc/))
- Structurally: "a sponsor or CRO purchases a **Vault environment (often one per major clinical application)** and then buys user licences." **[THIRD-PARTY]** — which means a CRO serving N sponsors faces environment fees multiplied by isolation requirements.
- **Scilife explicitly lists CROs and CMOs as target segments** in a published-tier product ([Scilife](https://www.scilife.io/pricing-qms-for-medical-device)); **Weave Bio explicitly names CROs and regulatory consultants** as target customers.

**[NOT FOUND — and this is a significant gap I want to flag clearly]:** I could not find **any** vendor publishing a CRO-specific commercial model — no per-client billing, no multi-sponsor tenancy SKU, no chargeback/rebilling feature, no sponsor-count metering. I searched for it directly and repeatedly. Either it does not exist as a published offer, or it is entirely inside enterprise negotiations.

**If that absence is real, it is the clearest white space identified in this entire research effort.** The requirement is regulatorily mandated (sponsor/ISF separation), the workflow pain is documented (handoff gaps), the buyer is identifiable, and **nobody is selling to it as a packaging construct.** A CRO SKU metered in *active sponsor programs*, with hard tenant isolation and per-client cost attribution built in, has no visible incumbent.

### 10.7 The most common complaint about incumbent pricing/packaging

Ranked by how often and how independently it recurred across sources:

1. **Per-module × per-user multiplication.** "A single employee accessing both Vault QMS and Vault RIM requires **two separate named-user licences**." This is the #1 cited grievance and the thing challengers position against most directly (Kivo: "every subscription includes eTMF, RIM, QMS and eCTD"). ([IntuitionLabs](https://intuitionlabs.ai/articles/veeva-systems-pricing-overview-complete-guide-to-costs-and-licensing), [kivo.io/pricing](https://kivo.io/pricing))
2. **Unpredictability / unbudgetable TCO.** "Per-seat licensing models that **make total cost difficult to predict**"; "quotes are typically built around enterprise contracts, implementation services and per-module fees that are **hard to budget against**." Datadog's documented 2–3× overshoot is the same disease in a market where it has been quantified. ([dnxt](https://dnxtsolutions.com/rim-software-vendors/), [trialtrack](https://trialtrack.net/blog/veeva-vault/), [Finout](https://www.finout.io/blog/datadog-pricing-explained))
3. **Implementation and validation services dwarfing the licence.** Full-Vault professional services "can easily reach 6–7 figures"; Qualio setup €8K–€20K; Kivo implementation from $25K. Vendors that win at the low end are the ones that **zero this out** (Veeva Basics, Dot Compliance, ZenQMS, SimplerQMS, Kivo all advertise it). ([IntuitionLabs Basics vs Full](https://intuitionlabs.ai/articles/veeva-vault-basics-vs-full-vault))
4. **Seat scarcity for reviewers.** Greenlight entry pricing reported as **only ~3–5 full seats + ~3–5 view-only seats for $25–35K/yr**. This is the complaint Qualio (unlimited read-only), ZenQMS (unlimited users) and ComplianceQuest (read-only users priced into the model) all explicitly answer. ([OpenRegulatory](https://openregulatory.com/articles/greenlight-guru-price))
5. **Repackaging as a covert price rise.** Greenlight's "package separation" — same features, three packages, up to 100% increase. Matrix removing its €390/mo entry plan post-PE-acquisition, plus automatic 5%/yr escalators and 10–20% raises. Atlassian's 15% 2025 rise. **[THIRD-PARTY, partisan sources for the first two]** ([OpenRegulatory Greenlight](https://openregulatory.com/articles/greenlight-guru-price), [OpenRegulatory Matrix](https://openregulatory.com/articles/matrix-requirements-pricing), [Matrix got sold](https://openregulatory.com/articles/matrix-requirements-got-sold-heres-what-you-need-to-know))
6. **Opacity itself.** Almost no vendor publishes anything. Even MasterControl's own `/pricing` page "contains none of these figures, so prospective customers are left to piece together various pricing reports from comparison websites." An entire cottage industry (OpenRegulatory, IntuitionLabs, dnxt, Assyro, PricingSaaS, ITQlick) exists solely to reverse-engineer these prices. **The existence of that industry is itself the evidence.** ([OpenRegulatory MasterControl pricing](https://openregulatory.com/articles/mastercontrol-pricing))
7. **Admin burden as a hidden cost.** Ongoing operation "demands a dedicated Vault administrator rather than a quality team managing the system themselves."

**Second-order market dynamic worth naming:** **private equity is consolidating this sector and raising prices while removing entry tiers.** Instem → ARCHIMED (£203M take-private, 2023). Matrix Requirements → PE, entry plan scrapped, escalators added. Greenlight Guru → package separation. **The low end of the device/biotech market is being actively abandoned by the incumbents right now.** That is a timing observation, not just a packaging one.

---

## 11. EXPLICIT "NOT FOUND" REGISTER

Stated plainly, per your instruction, rather than estimated:

| Question | Status |
|---|---|
| Veeva published rate card, any product | **NOT FOUND** — Veeva publishes no pricing |
| Whether Vault Submissions Publishing is available in Veeva Basics | **CONTRADICTORY / UNRESOLVED** — Basics edition list omits it; one indexed Basics help phrase mentions "Submissions Archive with Publishing." Verify directly. |
| Whether "Vault RIM Essentials" is a distinct SKU or an alias for Basics regulatory | **NOT FOUND** |
| Whether Veeva Validation Management is separately licensed | **NOT FOUND** |
| Veeva AI general-release pricing (2027) | **NOT DETERMINED — by Veeva's own statement** |
| ArisGlobal published pricing; whether NavaX is a separate price line or tier upgrade | **NOT FOUND** |
| ArisGlobal full module name list for MedComms | **PARTIAL** — Medical Affairs / Medical Information confirmed; full list not found |
| Certara CoAuthor tier names or prices; Simcyp Access pricing; Phoenix tiers | **NOT FOUND** |
| Ennov licensing model / pricing | **NOT FOUND** |
| Instem / Samarind RMS pricing or packaging | **NOT FOUND** |
| Rimsys edition names (G2 says 5 exist) and metering axis | **NOT FOUND** |
| Dot Compliance — what differentiates QMS Xpress / Compliance Xpand / Enterprise Xact | **NOT FOUND** (one source says the differentiation "isn't entirely clear") |
| Greenlight Guru official confirmation of the 2026 "package separation" and 100% increase | **NOT INDEPENDENTLY VERIFIED** — single partisan source, explicitly flagged as unverified there too |
| Yseop automation-pack pricing | **NOT FOUND** |
| Faro Health pricing/tiers; any product named "Ariadne" | **NOT FOUND** — "Ariadne" could not be confirmed to exist |
| Trialize pricing | **NOT FOUND** — vendor has not provided any |
| Unlearn.ai pricing model | **NOT FOUND** |
| AutoCruitment pricing/packaging | **NOT FOUND** — nothing surfaced at all |
| Any "Sedaro-type" life-sciences regulatory startup analogue | **NOT FOUND** |
| Gartner Market Guide for Life Science RIM — actual contents/commentary | **NOT FOUND** — exists, paywalled, inaccessible |
| Forrester commentary on RIM specifically | **NOT FOUND** — no Forrester RIM/regulatory-platform report surfaced |
| Reddit r/pharma, r/regulatoryaffairs practitioner threads on pricing | **NOT FOUND** — repeated targeted searches returned only vendor/analyst content, no forum threads |
| Verbatim G2/Capterra/Gartner Peer Insights reviewer quotes on Veeva RIM cost | **NOT FOUND at quote level** — review sites were unreachable; only aggregator paraphrases obtained |
| **Any vendor publishing a CRO multi-sponsor / per-client billing commercial model** | **NOT FOUND — flagged in §10.6 as the clearest white space in this research** |
| Whether device/IVD RIM is metered per-registration, per-country or per-product-family by any vendor | **NOT FOUND** — the *capability* is country-scoped (Rimsys: 250 countries) but no vendor's metering unit was confirmed |

---

## 12. TEN THINGS TO TAKE INTO A PACKAGING DECISION

1. **Per-application licensing is the incumbent's most-hated design choice.** It is also Veeva's revenue architecture, which means they cannot easily abandon it. Bundling all applications into one subscription (Kivo's move) is a real, currently-under-exploited wedge.
2. **In life sciences, compliance is not the enterprise wall — it is the entry ticket.** Audit trail, e-signature, Part 11, versioned history must be in tier 1. Gate SCIM, residency, sandbox count, multi-org isolation, SIEM streaming, SLA, and validation-package depth instead.
3. **Copy Figma's seat-type ladder, not Datadog's module ladder.** Author / reviewer-approver / read-only, with the cheap seat's limitations specified precisely. This directly answers the loudest complaint in the market.
4. **Meter on something the buyer already budgets for.** Programs, submissions, health-authority regions, studies, sponsors. Not seats — seats are the thing everyone is angry about. Freyr (per region, sub-annual terms), EXTEDO (regional validation sets, submission tokens), LORENZ ONE (per submission), Greenlight Clinical (studies/sites) and Regfo (programs) all prove this can be done.
5. **Your real floor competitor at the low end is a $5K–$20K-per-dossier consultant, not a cheaper platform.** Price and package against that.
6. **Zero out implementation and validation fees at the entry tier and say so loudly.** Every low-end winner in this research does exactly this. It is the fastest of the three small-biotech obstacles to eliminate, and it is a packaging decision, not an engineering one.
7. **Do not build AI capability as your enterprise moat — build *defensible* AI as the moat.** Veeva is bundling agents at "a simple and reasonable subscription fee." Raw AI will be commoditized. Provenance, traceability, explainability evidence, human-in-the-loop audit records, and validation documentation *for the AI itself* will not be — and 72% data-unreadiness plus 8% pilot-to-production says that is exactly where the unmet need sits.
8. **Sell the compliance-gap wedge module.** ArisGlobal's standalone LifeSphere IDMP into non-compliant incumbent RIMS is the template. eCTD 4.0 (EMA voluntary since Dec 2025, Japan mandatory Apr 2026, EMA mandatory expected 2027) and IDMP/SPOR create deadline-driven, single-module purchases inside Veeva accounts that require no rip-and-replace.
9. **Package device/IVD as a separate motion, not a separate feature flag.** Veeva runs QuickVault as a different brand with credit-card monthly billing and bundled QA/RA hours. Greenlight and Rimsys are device-only companies. Only IQVIA runs one SKU across both — and its natural metering (registrations, countries, standards, UDI records) is genuinely different from biopharma's (submissions, programs, regions).
10. **Build the CRO SKU nobody has built.** Sponsor/ISF separation is regulatorily mandated; multi-CRO oversight and handoff gaps are documented failure modes; CROs are named as target customers by Weave, Scilife and Freyr — and **no vendor publishes a multi-sponsor tenancy or per-client billing model.** Metering on active sponsor programs, with isolation and cost attribution as first-class product concepts, has no visible incumbent to displace.

