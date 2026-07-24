# C2C Route / Surface / Caller Matrix

**Work order:** WO-00 (required investigation item 3)
**Base SHA:** `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Evidence standard:** measured from code. Method stated for every figure.

---

## 1. Method, and why it needed three corrections

This measurement was wrong twice before it was right. Recording that, because the
same traps will catch the next audit.

This codebase mounts routes through **three distinct idioms**:

```ts
app.use('/api/x', router)                          // 1. literal
{ path: '/api/x', mod: '../routes/x', name: 'X' }  // 2. declarative table
['/api/x', '../routes/x', 'X']                     // 3. tuple array
```

- Scanning only idiom 1 yielded 244 mounted / 92 dark. **Understated.**
- Adding idiom 2 produced a spurious "37 registry-declared prefixes are unmounted."
- Adding idiom 3, plus a containment test in *both* directions (a declared path
  may be a sub-path of a mounted router, or vice versa), reduced that to **5**,
  of which 2 resolved on inspection.

**Any figure in a prior document derived from a single mount idiom is wrong.**
The repository's own auditor, `scripts/ci/audit-route-mounts.mjs`, is CI-wired
and handles all idioms — prefer it over ad-hoc greps.

### Authoritative counts

| Measure | Value | Source |
|---|---:|---|
| Mount **events** | **323** | `scripts/ci/audit-route-mounts.mjs`, run at this SHA |
| Distinct `/api` **prefixes** | **365** | same entry points, all three idioms |
| Prefixes with no exact literal in `client/src` | **166 (45%)** | literal match |
| Prefixes with neither exact nor last-segment reference | **134 (36%)** | stricter; the defensible floor |
| Registry-declared prefixes | **169** | both `ui-surface-registry` files |
| Declared with no mount coverage | **3** | see §4 |
| Auditor errors / warnings | **8 / 7** | see §5 |

Mount *events* (323) exceed distinct *prefixes* (365)? No — they are different
measures over slightly different scopes; 365 counts distinct prefix strings
including those introduced by all three idioms, 323 counts mount call sites the
auditor recognises. Both are reported rather than reconciled into one number,
because collapsing them would hide the method difference.

**The 36% floor is the honest headline.** Roughly one in three mounted API
prefixes has no discoverable consumer in the client.

---

## 2. The finding that matters most

The capabilities the strategy material identifies as the commercial moat are
**precisely the ones with no client consumer**:

| Dark prefix | What it serves | Named as moat? |
|---|---|---|
| `/api/operating-system` | assumptions + decision records | **yes** |
| `/api/resolution` | correction bundles / resolution plans | **yes** |
| `/api/study-design` | canonical StudyDesign | **yes** |
| `/api/c2c/study-twin` | Study Twin simulation | **yes** |
| `/api/regulatory-digital-twin` | regulator simulation | **yes** |
| `/api/evidence-fabric`, `/api/evidence-sufficiency`, `/api/evidence-management` | evidence layer | **yes** |
| `/api/data-lineage` | provenance | **yes** |
| `/api/regulatory-graph`, `/api/regulatory-precedent-intelligence` | RI graph | **yes** |

This is the structural form of the "trapped capability" problem. It also explains
why C-1 through C-4 survived undetected: **there is no UI exercising these
routes**, and the unit tests mock the database
(`operating-system.test.ts:31`). Nothing in the system — not a user, not a test —
has ever driven the assumption/decision/resolution stack against a real schema.

**Consequence for WO-01:** the golden journeys are the first thing that will
exercise these paths end-to-end. Expect them to surface further defects of the
C-1 class. That is the point of building them, and the schedule should assume it.

---

## 3. Dark prefix inventory (134, strict floor)

Grouped by likely disposition. Classification is **proposed**, requiring
per-prefix caller analysis before any deletion.

### 3.1 Governed capability, no UI — *wire, do not delete* (WO-01/03/08 scope)
`/api/operating-system` · `/api/resolution` · `/api/study-design` ·
`/api/c2c/study-twin` · `/api/c2c/governance` · `/api/c2c/commitments` ·
`/api/evidence-fabric` · `/api/evidence-sufficiency` · `/api/evidence-management` ·
`/api/data-lineage` · `/api/regulatory-graph` · `/api/regulatory-digital-twin` ·
`/api/regulatory-precedent-intelligence` · `/api/regulatory-assessments` ·
`/api/regulatory-intelligence` · `/api/regulatory-submissions` · `/api/ctd` ·
`/api/content-plan` · `/api/protocol-soa` · `/api/protocol-development` ·
`/api/protocol-reviews` · `/api/protocol-templates` · `/api/protocol-export` ·
`/api/qms` · `/api/qc` · `/api/post-market` · `/api/postmarket-surveillance` ·
`/api/real-world-evidence` · `/api/inline-annotations` · `/api/smart-blocks`

### 3.2 eCTD / submission packaging — *classify in WO-05*
`/api/ectd-documents` · `/api/ectd-submissions` · `/api/submission-orchestrator` ·
`/api/packager` · `/api/ind-submissions` · `/api/ind-generation` · `/api/ind-pdf` ·
`/api/ind-templates` · `/api/ind-automation` · `/api/ind-database` ·
`/api/validate-completeness`

### 3.3 Tenant/admin plane — *likely server-to-server; verify before judging*
`/api/tenant-config` · `/api/tenant-users` · `/api/tenant-stats` ·
`/api/tenant-export` · `/api/tenant-ctq-factors` · `/api/tenant-section-gating` ·
`/api/tenant-traceability` · `/api/tenant-quality-validation` ·
`/api/organizations` · `/api/project-hierarchy` · `/api/project-modules` ·
`/api/project-rules` · `/api/pm-settings` · `/api/admin/business` · `/api/admin/master`

### 3.4 Device / IVD — *WO-14, deferred*
`/api/device-classification` · `/api/device-cockpit` · `/api/device-projects` ·
`/api/medical-devices` · `/api/fda510k` · `/api/fda510k-unified` ·
`/api/substantial-equivalence` · `/api/pma-workflow` · `/api/gspr` ·
`/api/udi-ivdr` · `/api/ivd-assessments` · `/api/ivd-knowledge` ·
`/api/ivd-lifecycle` · `/api/companion-diagnostics` · `/api/diagnostics-performance`

### 3.5 Research-administration cluster — *scope question, not a defect*
`/api/irb` · `/api/ibc` · `/api/citi-training` · `/api/effort-certification` ·
`/api/financial-disclosures` · `/api/other-support` · `/api/research-agreements` ·
`/api/research-compliance` · `/api/research-security` · `/api/export-control` ·
`/api/invention-disclosures` · `/api/controlled-substances` ·
`/api/protocol-budget` · `/api/protocol-consent` · `/api/dmsp`

This is a coherent **grants/research-administration** product adjacent to, but
distinct from, the regulatory submission operating system. It is a portfolio
decision (own it, spin it out, or retire it), not an engineering defect. Raising
it because master §2 warns against surface sprawl and this is ~15 mounted
prefixes of it.

### 3.6 Experimental / AI-platform — *candidates for quarantine*
`/api/agent-swarm` · `/api/ana-cortex` · `/api/ana-cortex-ft` ·
`/api/ana-1-0-ri-cortex` · `/api/gcc` · `/api/snowglobe` · `/api/sentinel` ·
`/api/foresight` · `/api/foresight-ai` · `/api/foresight-feedback` ·
`/api/graphrag` · `/api/grdhe` · `/api/biotech-rag` · `/api/mission-control` ·
`/api/innovation` · `/api/learning/horizon` · `/api/predictive-sections` ·
`/api/document-understanding` · `/api/intelligent-docs` · `/api/conversation-health` ·
`/api/escalate` · `/api/field-sync` · `/api/module-integration`

### 3.7 Ops / integration — *expected to be dark*
`/api/demo` · `/api/docs` · `/api/integration-test` · `/api/test-assembly` ·
`/api/firecrawl` · `/api/firecrawl-webhooks` · `/api/csr/jobs` ·
`/api/csr-real-data` · `/api/pdf-tasks` · `/api/authoring-pdf` ·
`/api/cerv2-versions` · `/api/cerv2/ai` · `/api/client-branding` ·
`/api/client-intelligence` · `/api/account-intelligence` · `/api/biosketch` ·
`/api/cdisc-validation` · `/api/charters` · `/api/change-propagation` ·
`/api/cmc/workflows` · `/api/external-evidence` · `/api/external-intelligence` ·
`/api/global-markets` · `/api/spl-fhir` · `/api/unified-tasks` · `/api/ai-assistance`

---

## 4. Registry-declared prefixes without mount coverage

Only **3** survive a correct containment test:

| Prefix | Status |
|---|---|
| `/api/provenance` | No mount found. Registry claims it; needs owner. |
| `/api/shadow` | Only `/api/shadow/health` is served (`startup/inline-endpoints.ts:572`). Route files `shadow-review.routes.ts` and `_ops-predicate-shadow.ts` exist. Partial mount. |
| `/api/submission` | No mount at that exact prefix; `/api/submissions` (plural) is mounted twice. Likely a registry typo — verify before changing. |

Resolved on inspection (mounted via idiom 3, tuple arrays in
`register-inline-routes.ts`): `/api/investigator-brochure` (`:907`),
`/api/labeling-smpc` (`:910`).

**These 3 are the only registry entries pointing at nothing.** The registry is in
far better shape than the dark-route count suggests — the problem is one-directional:
routes without surfaces, not surfaces without routes.

---

## 5. Auditor-reported defects (from the repo's own CI guard)

### Errors — 8, all `duplicate-method-route`
`get:/healthz` · `get:/readyz` · `get:/api/health` · `get:/api/health/full` ·
`get:/api/metrics` · `get:/api/ai-gateway/health` · `get:/api/time` · `get:/api/diag`

Two handlers registered for the same method+path. Express silently serves the
first; the second is dead. All are health/diagnostic endpoints, so the blast
radius is observability rather than regulated data — but a dead `/readyz` handler
can misreport readiness, which matters for WO-16.

### Warnings — 7 `multi-use-prefix`
`/api/ai` · `/api/concept2cure` · `/api/cmc` · `/api/cmc/module3-os` (×3) ·
`/api/submissions` (×2, split across `register-document-routes.ts:140` and
`register-governance-routes.ts:51`) · `/api/v1` (×2) · `/api/mdx` (**×26**)

`/api/mdx` mounted 26 times from `register-inline-routes.ts` alone. Ordering
between those 26 routers determines which handler wins for overlapping paths —
currently implicit. This is a correctness hazard for WO-01 journeys that traverse
MDX surfaces.

`/api/submissions` split across a document router and a governance router is the
one to watch: two different ownership domains serving one prefix.

---

## 6. Surface ↔ registry reconciliation

| Set | Count |
|---|---:|
| `surfaceViews.ts` renderable entries | 97 |
| Registry entries (both files) | 99 |
| Registry `routes-ready` (no typed contract) | 79 |
| Registry `contract-ready` | 5 |
| Registry entries naming a `sharedContract` | 27 |
| Registry entries naming a `discoveryCatalog` | 3 |
| Part 11-gated entries | 68 |

The 97 vs 99 delta is **not** reconciled in this pass — the two sets were counted,
not diffed member-by-member. Assigned to the design stream's UX-00 item 3.

---

## 7. Open items

1. Per-prefix caller analysis for all 134 dark prefixes before any deletion.
   Nothing in §3 is authorized for removal on the strength of this document.
2. Resolve the 8 duplicate-method-route errors (cheap; observability correctness).
3. Establish explicit ordering for the 26 `/api/mdx` mounts.
4. Assign an owner to `/api/provenance`; confirm `/api/submission` is a typo.
5. Portfolio decision on the research-administration cluster (§3.5).
6. Member-by-member diff of `surfaceViews.ts` against the registry.
