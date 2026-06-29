# Global Language Strategy

**Date:** 2026-06-29
**Owner:** Chief Global Language Officer
**Scope:** Selling into Japan, Europe, and Asia; submitting regulatory documents in every
language required by clients and agencies; converting English → Japanese.
**Status:** Strategy + phased plan. No code changed by this document.

---

## 0. TL;DR

We are **not** starting from zero. The platform already has two mature layers:

1. **Product/UI internationalization (~85% built)** — `i18next`, 19 languages with real
   translation bundles, a language switcher, account-persisted preference, CJK fonts,
   Japanese era-calendar + fiscal-year formatting, and an AI assistant (AnA) that already
   answers *in-language* with per-market regulatory awareness.
2. **Regulatory region + language modeling (substantial)** — 12 jurisdictions with
   per-region language mandates, eCTD Module 1 regional rules that enforce Japanese for
   PMDA, and gateways that handle multibyte (Japanese/Chinese/Korean) content.

The **one real gap** is a translation **engine**: today the platform *tracks* translations
(who, method, status, back-translation verified) but does not **produce** a Japanese
version of an English regulatory document. Closing that gap — safely, for a regulated
submission — is the core of this strategy.

**Headline decisions (defaults; revisit with the exec team):**
- **Translation model = Hybrid:** machine/LLM first draft against a *locked* regulatory
  glossary + translation memory, then qualified human / LSP post-edit + back-translation
  before any submission-grade output.
- **Sequencing = Both, sequenced:** finish the Japanese *product experience* now (low risk,
  unlocks Japan sales), then build *submission-grade document translation* over the
  following quarters.

---

## 1. Market posture

| Market | Sell-in language | Submission language reality | Implication |
|---|---|---|---|
| **United States** | English | English (FDA eCTD) | Baseline. Done. |
| **Europe (EU/EMA)** | English (business) | English dossier core; **product information (SmPC/PIL/labelling) in all 24 EU official languages** for a centralised MAA; CTIS Part II (ICF etc.) in member-state languages | English sells; **labelling/PIL translation is the EU obligation**, not the core dossier. |
| **UK / Canada / Australia / Switzerland / Singapore / India** | English | Mostly English; **CA bilingual EN/FR**, **CH DE/FR/IT product info** | English-first; targeted product-info translation. |
| **Japan (PMDA)** | English (business) + **Japanese** | **Japanese** — M1 admin docs, Japanese clinical experience summaries (M1.13), J-RMP (医薬品リスク管理計画), labelling | **The headline build. Full EN→JA document conversion.** |
| **China (NMPA)** | — | **Simplified Chinese** M1 + M3 quality | Second-tier CJK build; same engine, different glossary. |
| **Korea (MFDS)** | — | **Korean** M1 (K-CTD) | Same engine, Korean glossary. |
| **Brazil (ANVISA)** | — | **Portuguese** labelling/bula | Same engine, Portuguese. |

> Source of truth in code: `shared/regulatory/region-profiles.ts`,
> `server/services/market-specs/market-submission-specs.ts`,
> `server/services/ectd/ectd-regional-rules.ts`.

**Strategic read:** "the other markets mostly speak English" is correct for *business
development and the dossier core*, but **every** non-English market still imposes a
**labelling / product-information** translation obligation, and Japan additionally requires
**Japanese dossier content**. So the engine we build for Japan is reused — at lower volume —
for EU labelling, CN, KR, BR, CA(FR), CH.

---

## 2. What we already have (inventory, grounded in code)

### 2.1 Product / UI internationalization — SUBSTANTIAL (~85%)
- **Framework:** `i18next` + `react-i18next` + browser language detection + HTTP backend
  (`package.json`).
- **Coverage:** 19 languages with real bundles —
  `client/public/locales/{cs,da,de,el,en,es,fi,fr,hu,it,ja,ko,nl,pl,pt,ro,sv,zh}/`
  × 4 namespaces (`auth`, `common`, `home`, `settings`).
- **Switcher + persistence:** `client/src/components/i18n/LanguageSwitcher.tsx`,
  `client/src/contexts/LanguageContext.tsx`; 3-tier precedence
  (localStorage `c2c.language` → `navigator.language` → account `users.preferences.language`).
- **CJK rendering:** `:lang(ja|zh|ko)` font stacks + line-height in `client/src/index.css`.
- **Japan formatting depth:** era calendar (和暦) + fiscal year (年度) in
  `client/src/i18n/format.ts`; `Intl`-based date/number/percent/relative-time.
- **AI assistant localization:** `server/services/ana-ri/locale-overlays.ts` — 19 language
  overlays + 19 cultural/market overlays + 11 market briefs; **never translates regulatory
  identifiers** (21 CFR, ICH, eCTD, M1–M5, FDA/EMA/PMDA, evidence labels).
- **Guards:** `scripts/ci/check-i18n-integrity.mjs`, `client/src/i18n/__tests__/*`.

### 2.2 Regulatory region + language modeling — SUBSTANTIAL
- **12 region profiles** with `language`, `currency`, M1 sections, regional forms, validation
  rule packs (`shared/regulatory/region-profiles.ts`,
  `server/services/region-profiles/region-profile-service.ts`).
- **Language mandates encoded per region** (`market-submission-specs.ts`):
  `translationRequired`, `productInfoLanguages`, plus PMDA/NMPA/MFDS rules in
  `ectd-regional-rules.ts` (e.g. PMDA-004 Japanese M1.13 summaries; NMPA Simplified Chinese;
  MFDS Korean; HC bilingual EN/FR).
- **Gateways handle multibyte:** `server/services/submission-gateways/pmda-gateway.ts`
  (UTF-8 BOM for Japanese filenames/titles), `nmpa-gateway.ts` (bilingual ZH/EN metadata).
- **Workspace contract** surfaces `translationMandate` (`shared/regulatory/workspace-config.ts`).

### 2.3 Translation governance — PARTIAL (tracking only, labeling-scoped)
- `labeling_translations` table (`shared/schema.ts`): `language`, `translator`,
  `translationMethod` (`human` / `mt_postedited` / `machine`), `status`,
  `backTranslationVerified`, `approvedAt`, `artifactId`.
- UI: `client/src/concept2cure/labeling/surfaces/Translations.tsx` +
  `useLabeling` hooks; coverage endpoint `GET /api/mdx/labeling/:id/coverage`.
- **This is metadata, not an engine.** "machine" is a status label; nothing converts content.
  Scope is **labeling documents only**, not the whole dossier.

---

## 3. The gap

| Capability | State | Notes |
|---|---|---|
| UI in 19 languages | ✅ Built | Finish coverage + native QA. |
| In-language AI assistant | ✅ Built | Strong; market-aware. |
| Per-region language mandates | ✅ Modeled | Enforced at validation gates. |
| Translation **tracking / governance** | 🟡 Partial | Labeling only; needs to span the dossier. |
| **EN→JA (and →ZH/KO/PT/FR) content translation engine** | ❌ Missing | No MT/LLM service, no glossary/TM, no segment pipeline. |
| **Regulatory terminology lock (glossary/TM)** | ❌ Missing | MedDRA, CTD section names, INN/drug names, identifiers must NOT be freely translated. |
| **Certified / back-translation evidence in the submission record** | 🟡 Partial | Flag exists for labeling; not a dossier-wide, auditable artifact. |
| **Bilingual rendering for CJK dossiers** | 🟡 Partial | Gateways handle bytes; authoring/preview side not built. |

---

## 4. Strategy — four workstreams

### Workstream A — Finish the Japanese (and EU) product experience *(now; weeks)*
Low risk, unlocks Japan/EU sales while the regulated engine is built.
1. **Native linguistic QA** of `ja`, `de`, `fr`, `zh`, `ko`, `pt` bundles by qualified
   reviewers (not just CI key-parity). Track sign-off per language.
2. **Coverage sweep:** the 4 namespaces cover auth/common/home/settings — extend i18n
   coverage to the high-traffic regulated surfaces (Submission Center, authoring, labeling)
   so a Japanese user never hits raw English in the core workflow.
3. **Locale-correct formatting everywhere** (dates/numbers/currency/era) via the existing
   `format.ts` — audit server-rendered surfaces and exports.
4. **Pseudo-localization CI check** to catch hard-coded strings before they ship.

### Workstream B — Translation platform foundation *(quarter 1–2; the core build)*
The reusable engine. Built once, used for JA first, then ZH/KO/PT/FR(CA)/DE-IT(CH)/EU-labelling.
1. **Translation domain model** (generalize `labeling_translations` → dossier-wide):
   `translation_projects`, `translation_segments` (source seg → target seg, per language),
   `translation_memory`, `glossary_terms`, linked to documents/sections and the submission
   record. Tenant-scoped, audit-trailed (21 CFR Part 11), e-signature on approval.
2. **Regulatory glossary + Translation Memory (TM):**
   - **Do-not-translate (DNT) list:** regulatory identifiers, INN/drug names, codes, eCTD
     module labels — mirror the AnA overlay rule that already protects these.
   - **Locked terminology:** MedDRA terms, CTD section titles (we already store `titleLocal`
     in `regional-ctd-templates.ts` — promote that to the glossary), agency-preferred wording.
   - TM accrues from every approved human post-edit → cost drops over time.
3. **Translation provider abstraction** (`TranslationProvider` interface) so we can swap:
   - LLM/MT engine for first drafts (glossary-constrained),
   - external LSP / certified-translation vendor for human post-edit + back-translation,
   - human-only for the highest-risk segments.
4. **Hybrid workflow engine:** MT draft → human post-edit → back-translation →
   reconciliation → approval (e-signed) → certified-translation evidence attached to the
   submission. States extend the existing `pending/in_progress/review/approved/rejected`.

### Workstream C — Submission-grade Japanese document conversion *(quarter 2–3; PMDA path)*
1. Wire Workstream B into the **eCTD / Submission Center** pipeline for PMDA:
   M1 admin docs, Japanese clinical experience summaries (M1.13), J-RMP, labelling.
2. **Bilingual authoring + preview** (EN source ↔ JA target side-by-side), powered by
   `translation_segments`; reviewers verify in context.
3. **PMDA validation integration:** the regional rules already flag Japanese requirements —
   make them *block* submission until the required Japanese artifacts + back-translation
   evidence exist (move from advisory to gating).
4. **PDF/A with embedded CJK fonts** for output (NMPA already demands this; build it for JP too).

### Workstream D — Extend to the rest *(quarter 3+; same engine)*
NMPA (zh), MFDS (ko), ANVISA (pt), Health Canada (fr), Swissmedic (de/fr/it), and
**EU centralised labelling in 24 languages** — each is a glossary + TM + reviewer-pool
addition on top of the Workstream B engine, not a new build.

---

## 5. Guardrails (non-negotiable for a regulated platform)
- **No raw machine translation in a submission.** MT is a *draft accelerator*; a qualified
  human post-edit + back-translation is mandatory before submission-grade status.
- **Never translate identifiers.** Enforce the DNT list mechanically; reuse the AnA
  "translate meaning, not identifiers" principle already in `locale-overlays.ts`.
- **Full provenance.** Every segment: source hash, engine/version, post-editor, reviewer,
  back-translation result, e-signature, timestamp — Part 11 auditable, tenant-isolated.
- **Human accountability of record.** The translator/LSP and reviewer of record are named
  and signed; "machine" alone can never reach `approved` for submission artifacts.

## 6. Sequencing & "what to do first"
1. **Now:** Workstream A (Japanese/EU product polish + native QA) — sell into Japan sooner.
2. **Q1–Q2:** Workstream B (translation domain model + glossary/TM + provider abstraction +
   hybrid workflow) — the reusable core.
3. **Q2–Q3:** Workstream C (PMDA submission-grade EN→JA, bilingual authoring, gating).
4. **Q3+:** Workstream D (ZH/KO/PT/FR/EU-labelling) as incremental glossary/reviewer adds.

## 7. Open decisions for the exec team
1. **Translation model** — confirm Hybrid (MT draft + human post-edit) vs LSP-only vs
   AI-first. *Recommended: Hybrid.*
2. **LSP / certified-translation vendor** — which provider(s) for human post-edit and
   certified back-translation? (Drives the `TranslationProvider` integration list.)
3. **MT/LLM engine** — Claude/LLM vs dedicated MT (e.g. domain-tuned). *Recommend
   glossary-constrained LLM for draft, benchmarked against a dedicated MT baseline.*
4. **EU labelling scope** — do we commit to all-24-language SmPC/PIL generation now, or
   defer behind Japan/CJK?
5. **Native-reviewer staffing** — in-house linguists vs vendor for the Workstream A QA pass.

---

### Appendix — key files referenced
- i18n: `client/src/i18n/*`, `client/public/locales/*`, `client/src/contexts/LanguageContext.tsx`,
  `client/src/components/i18n/LanguageSwitcher.tsx`, `scripts/ci/check-i18n-integrity.mjs`
- AI localization: `server/services/ana-ri/locale-overlays.ts`
- Regions/markets: `shared/regulatory/region-profiles.ts`,
  `server/services/region-profiles/region-profile-service.ts`,
  `server/services/market-specs/market-submission-specs.ts`,
  `shared/regulatory/workspace-config.ts`
- eCTD/submission: `server/services/ectd/ectd-regional-rules.ts`,
  `server/services/regional-ctd-templates.ts`, `server/services/submission-gateways/*`
- Translation tracking (to be generalized): `shared/schema.ts` (`labeling_translations`),
  `client/src/concept2cure/labeling/surfaces/Translations.tsx`
