# Pharma/biotech workflow coverage — project initiation → submission

**Date:** 2026-08-13
**Question asked:** does the platform carry a biotech/pharma client through the
entire workflow, from project initiation to submission, across all formal
regulatory submission types?

**Method:** measured, not read. Every number below came from executing the
platform's own registries and services, not from a design document.

---

## 1. Headline

**The workflow is in substantially better shape than a code-reading would
suggest, and the one real gap was in what is *asserted*, not in what is built.**

Measured across the canonical registry:

| Measure | Value |
|---|---:|
| Registry entries (all segments) | **158** |
| — pharma & biotech | **92** |
| — medical devices | 31 |
| — diagnostics & IVD | 21 |
| — cross-cutting (ICH/QMS) | 14 |
| Authoring readiness: `production_ready` | 13 |
| Authoring readiness: `buildable` | 145 |
| Authoring readiness: `catalog_only` | **0** |
| Submittable (reaches a registered gateway) | **130** |
| Document components (correctly not filed alone) | 28 |
| **Selectable but unsubmittable** | **0** |

The 10-node biotech lifecycle spine — Pre-IND → IND → NDA/BLA, EU CTA → MAA, CA
CTA → NDS, JP CTN → approval — is present and meets its bar, and that is already
enforced by `tests/regulatory/registryCoverage.test.ts`.

## 2. What I expected to find, and did not

Three hypotheses from the tenancy work, all tested and all **wrong here**:

- *"The coverage model is built but not enforced."* It is enforced —
  `registryCoverage` is asserted by a real test that pins the spine, required
  forms and eCTD backbones. Not a report nobody runs.
- *"Gateways cover fewer regions than the registry claims."* They do not. My
  first comparison said US, EU and JP had no gateway; that was **my error** —
  gateway keys are agency codes (`fda`, `ema`, `pmda`), not regions. Every region
  carrying filings resolves through `region-identity` to a registered
  `(slug, gateway)` pair.
- *"A canonical bridge between the two vocabularies is missing."*
  `shared/regulatory/region-identity.ts` is exactly that bridge, and carries
  `gatewaySlug`, `defaultGateway`, `ruleRegion` and `m1Backbone`.

Recording the wrong hypotheses matters as much as the right one: the naive
version of the second would have been a alarming and false finding in a report.

## 3. The real gap — coverage measured only the front half

`registryCoverage`'s readiness tiers are computed from **three** inputs: section
blueprint, task blueprint, required forms. That is the *authoring* half of
"initiation → submission".

Nothing measured the *submission* half — package, validate, transmit. A filing
type could be `production_ready` by the authoring definition and have no path off
the platform at all.

Today the back half is complete. **That is the point.** It holds by diligence and
nothing asserts it keeps holding: add a region to `GLOBAL_REGISTRY` and its
filing types become selectable at project initiation immediately. Without a
`region-identity` entry and a registered gateway there is no way to submit them,
no test notices, and **the customer discovers it at the end of a submission
rather than us at the start of a pull request** — the worst possible place for a
regulatory platform to be wrong.

### Closed by

`server/services/regulatory/registry/submittabilityCoverage.ts` — a pure module
measuring the back half on the same terms as the front, backing both an operator
report and a gate:

| Tier | Meaning |
|---|---|
| `submittable` | Resolves to a registered `(gatewaySlug, defaultGateway)` pair |
| `not_a_filing` | A document component, authored *into* a dossier |
| `no_identity` | Region has no `region-identity` entry — nothing can route it |
| `no_gateway` | Identity names a gateway that is not registered |

**Components are excluded, not counted as failures.** The 22 ICH entries (CSR,
protocol, IB, ICF, SAP, the CTD module definitions) and six device QMS records
(DHF, PCCP, cybersecurity, design controls, DMR, DHR) are authored into a
regional dossier and travel inside it — a DSUR reaches FDA inside an IND sequence
over ESG. A coverage number that counts them as gaps is a number people learn to
ignore.

The exclusion is keyed on application **family**, not a hardcoded id list, so a
new ICH document next year classifies correctly without anyone remembering to
extend a set. `quality_cmc` and `safety_report` are region-dependent: an ICH QOS
is a component, a regional safety report is a filing.

### The exclusion is itself gated

An over-broad exclusion is the only way this gate goes blind — it would report
zero gaps while filings quietly went unroutable. So the test asserts *both*
directions: the ICH set must classify as components, and the marketing-
authorisation spine (`US_IND`, `US_NDA`, `US_BLA`, `EU_CTA`, `EU_MAA`, `CA_NDS`,
`JP_CTN`) must **not**. Components must stay a minority of the registry.

Mutation-verified on both failure modes:

```
MUTATION 1 — a new region's filing type ships with no identity/gateway
  FAIL  NO filing type is selectable but unsubmittable
        MX_NDA (MX) — no_identity

MUTATION 2 — the exclusion rule widens and swallows real filings
  FAIL  does NOT classify the marketing-authorisation spine as components
  FAIL  keeps the component set a small minority of the registry
```

## 4. Verification

| Suite | Result |
|---|---|
| `tests/regulatory/` (incl. the new gate) | 777 passed, 38 files |
| `npm run report:regulatory-coverage` | Prints both halves; ends "Every startable filing type is finishable" |
| `tsc --noEmit`, `eslint` | clean |

## 5. What remains open

Stated plainly rather than padded — most of what I probed was already done.

| # | Gap | Severity | Note |
|---|---|---|---|
| W1 | 79 of 92 pharma/biotech types are `buildable`, not `production_ready` | Medium | They have a real section structure but the shared default task plan. Usable; not a bespoke plan. The prioritised backlog is already produced by `getCatalogOnlyGaps()` and the coverage report. |
| W2 | Submittability proves a gateway is *registered*, not that a transmission *succeeds* | Medium | The gate is structural. End-to-end proof needs an agency test endpoint per region, which is an integration-environment question rather than a code one. |
| W3 | The lifecycle spine asserts 10 nodes; the other 82 pharma/biotech types have no per-type assertion | Low–Medium | Defensible scoping — the spine is the commercially load-bearing path — but it is scoping, not coverage, and worth stating when someone asks "all submission types". |
| W4 | `report:regulatory-coverage` is not run in CI | Low | The *test* is the gate and does run; the report is an operator tool. Noted so nobody assumes the printed report is enforcing anything. |

---

## 6. Operator note

`npm run report:regulatory-coverage` now prints both halves of the workflow. The
line to watch is the last one: **"Every startable filing type is finishable."** If
it ever reads otherwise, a filing type is selectable at project initiation that
cannot reach an agency, and the fix is in `shared/regulatory/region-identity.ts`
plus `server/services/submission-gateways/index.ts` — not in the registry that
surfaced it.
