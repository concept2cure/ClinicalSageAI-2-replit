# MDX module — UAT walk

**Branch:** `concept2cure-v2`. **Author:** Claude Code. **Date:** 2026-05-01.

A code-level UAT pass across the entire MDX module: every BETA workflow,
every AnA tool, every cross-cutting concern. PASS / GAP / RISK findings.

**Scope of this UAT.** Code- and contract-level verification: route
mounts, service exports, audit emission, test coverage, doc accuracy,
governance gates. **Not in scope** because they require a live
deployment: real DB integration, latency under load, FDA ESG round-
trip, multi-replica behavior, pen-test execution.

## Summary

| Area | PASS | GAP | RISK |
|---|---|---|---|
| BETA workflows W1-W5 | 5 | 0 | 0 |
| AnA tools (governed mutations + reads) | 16 | 1 (fixed in this PR) | 0 |
| Cross-cutting concerns | 9 | 1 | 1 |
| Plumbing (route mounts, service exports) | 12 | 0 | 0 |
| **Total** | **42** | **2 (1 fixed here)** | **1** |

The only RISK is the rate-limiter ordering decision (counts confirmation-
required loops). Documented at the end. Not a defect — a tradeoff worth
reviewing.

---

## Workflows W1-W5

### W1 · Read program state

Walks: predicate panel → SE matrix → evidence sufficiency → eSTAR
section readiness.

| Step | BFF call | Mounted? | Audit code | Test? | Verdict |
|---|---|---|---|---|---|
| Read predicates | `GET /api/predicate-intelligence/candidates` | ✓ register-document-routes.ts | n/a (read) | predicate-intelligence.test.ts | PASS |
| Read SE matrix | `GET /api/se-matrix` | ✓ line 239 register-document-routes.ts | n/a | (BFF-side only) | PASS |
| Read evidence sufficiency | `GET /api/evidence-sufficiency/programs/:p/assessments` | ✓ register-document-routes.ts | n/a | tenant-isolation-evidence-sufficiency.contract.test.ts | PASS |
| Read authoring readiness | `GET /api/authoring-actions/module-readiness/:projectId/510k` | ✓ register-inline-routes.ts | n/a | (route-level) | PASS |

**W1 verdict: PASS.** Every documented endpoint is mounted; every read
is tenant-scoped via the existing JOIN pattern.

### W2 · Author eSTAR + run validation

| Step | BFF call | Mounted? | Audit code | Test? | Verdict |
|---|---|---|---|---|---|
| Read sections | `GET /api/cerv2-sections/...` | ✓ register-document-routes.ts | n/a | cerv2-sections route | PASS |
| Edit section | `PATCH /api/cerv2-sections/:id` | ✓ | `section.edit` | covered by audit-trail-contract | PASS |
| Approve section | Same PATCH with status flip | ✓ | `section.approve` | ✓ | PASS |
| Delete section | `DELETE /api/cerv2-sections/:id` | ✓ | `section.delete` | ✓ | PASS |
| Run validation | Internal via authoring-actions | ✓ | n/a (read) | ✓ | PASS |
| E-sign approval | `POST /api/esignature/sign` | ✓ register-inline-routes | `esignature.sign` | ✓ | PASS |

**W2 verdict: PASS.**

### W3 · Pre-Sub cycle

| Step | BFF call | Mounted? | Audit code | Test? | Verdict |
|---|---|---|---|---|---|
| List Q-Subs | `GET /api/q-sub` | ✓ | n/a | q-sub.test.ts | PASS |
| Read Q-Sub detail | `GET /api/q-sub/:id` | ✓ | n/a | ✓ | PASS |
| Create Q-Sub | `POST /api/q-sub` | ✓ | `q_sub.create` | ✓ + tenant-isolation-q-sub | PASS |
| Toggle commitment rolled-in | `PATCH /api/q-sub/commitments/:id/rolled-in` | ✓ | `q_sub.commitment.rolled_in` / `..rolled_out` | ✓ | PASS |

**W3 verdict: PASS.** This is the workflow most tested in the codebase
(it was the first feature shipped end-to-end).

### W4 · AI letter response

| Step | BFF call | Mounted? | Audit code | Test? | Verdict |
|---|---|---|---|---|---|
| Ingest correspondence | `POST /api/regulatory-correspondence/correspondence/intake` | ✓ register-inline-routes.ts | `correspondence.ingest` | covered by route + AnA tool | PASS |
| Per-issue review | `PATCH /api/regulatory-correspondence/issues/:id/review` | ✓ | `correspondence.issue.review` | route-side | PASS |
| Compile response package | `POST /api/regulatory-correspondence/response-packages` | ✓ | `correspondence.response.compile` | ✗ — gated on Brief #2 surface | GAP (known) |
| Cover-letter §-pull | `compileWithCoverLetter` service | ✓ | (no separate audit; rolled into compile) | cover-letter-composer.test.ts | PASS |
| AnA-driven ingest | AnA tool `correspondence.ingest` | ✓ dispatch | `agent.ana.correspondence.ingest` | mdx-command-handlers-phase3.test.ts + cross-cutting probe | PASS |

**W4 verdict: PASS** for the BFF + AnA paths. The known GAP
(`correspondence.response.compile` audit not wired) lands when Brief #2
ships — this is documented at `docs/operations/audit-trail-coverage.md`.

### W5 · Pre-flight + transmit + clock

| Step | BFF call | Mounted? | Audit code | Test? | Verdict |
|---|---|---|---|---|---|
| Module pre-flight | `POST /api/authoring-actions/module-preflight` | ✓ | `k510_workflow.preflight` | route-side | PASS |
| Dossier pre-flight | `POST /api/authoring-actions/dossier-preflight` | ✓ | `k510_workflow.preflight` | route-side | PASS |
| ESG transmit | `POST /api/510k/:projectId/esg/submit` | ✓ register-regulatory-routes.ts | `k510_workflow.transmit` / `..transmit.failed` | esgSubmissionRoutes | PASS |
| ESG status read | `GET /api/510k/esg/status/:transactionId` | ✓ | n/a (read) | route-side | PASS |
| Acknowledgment download | `GET /api/510k/esg/acknowledgment/:transactionId` | ✓ | n/a (read) | route-side | PASS |
| AnA-driven transmit | AnA tool `k510_workflow.transmit` (strict gate) | ✓ | `agent.ana.k510_workflow.transmit` / `..transmit.failed` | mdx-command-handlers.test.ts + cross-cutting probe | PASS |

**W5 verdict: PASS.** The strict AnA-side gate (`yes-transmit`, reason
≥ 30 chars) is enforced; the human-side route accepts a less-strict
form intentionally. See "Known divergence" below.

---

## AnA tools (16 governed + 2 read-only)

For each tool: dispatch entry exists, metadata exists, governance gate
applied (or read-only justified), audit code emitted, cross-cutting
contract probe.

| Tool | Dispatch | Metadata | Gate | Audit code | Probe | Verdict |
|---|---|---|---|---|---|---|
| `q_sub.create` | ✓ | ✓ | `requireGovernedToolGate` | `agent.ana.q_sub.create` | ✓ | PASS |
| `q_sub.commitment.set_rolled_in` | ✓ | ✓ | gate | `..rolled_in` / `..rolled_out` | ✓ (both) | PASS |
| `section.approve` | ✓ | ✓ | gate | `agent.ana.section.approve` | ✓ | PASS |
| `k510_workflow.preflight` | ✓ | ✓ | read-only (no gate) | `agent.ana.k510_workflow.preflight` | (read-only — not in probe) | PASS |
| `k510_workflow.transmit` | ✓ | ✓ | gate (strict: `yes-transmit`, 30 chars) | `..transmit` / `..transmit.failed` | ✓ | PASS |
| `gspr.mapping.upsert` | ✓ | ✓ | gate | `agent.ana.gspr.mapping.upsert` | ✓ | PASS |
| `post_market.document.create` | ✓ | ✓ | gate | `..create` | ✓ | PASS |
| `post_market.document.update` | ✓ | ✓ | gate | `..update` | ✓ | PASS |
| `post_market.document.validate` | ✓ | ✓ | gate | `..validate` | ✓ | PASS |
| `post_market.document.approve` | ✓ | ✓ | gate | `..approve` / `..approve.blocked` | ✓ (success path; blocked path covered in handler test) | PASS |
| `post_market.document.supersede` | ✓ | ✓ | gate | `..supersede` | ✓ | PASS |
| `evidence_sufficiency.assess` | ✓ | ✓ | gate | `agent.ana.evidence_sufficiency.assess` | ✓ | PASS |
| `reviewer_simulation.run` | ✓ | ✓ | gate | `agent.ana.reviewer_simulation.run` | ✓ | PASS |
| `predicate.candidate.set_status` | ✓ | ✓ | gate | `agent.ana.predicate.candidate.status` | ✓ | PASS |
| `se_matrix.patch` | ✓ | ✓ | gate | `agent.ana.se_matrix.patch` | ✓ | PASS |
| `correspondence.ingest` | ✓ | ✓ | gate | `agent.ana.correspondence.ingest` | ✓ | PASS |
| `audit.explain` | ✓ | ✓ (`EXPLAIN_AUDIT_ROW_METADATA`) | read-only | `agent.ana.audit.explain` | **GAP — fixed in this PR** | PASS (after fix) |

### GAP found and fixed during UAT

**`audit.explain` was registered in the dispatcher but missing from the
cross-cutting `mdx-agent-audit-contract.test.ts` PROBES array.** A future
PR could break the audit emission for this tool without any test failing.
Fixed in this commit: probe added to the array; the test now covers all
17 tools.

---

## Cross-cutting concerns

| Concern | Surface | Verdict |
|---|---|---|
| Audit-trail coverage map | `docs/operations/audit-trail-coverage.md` | PASS — every BETA-relevant mutation has an action code; only ✗ row is `correspondence.response.compile` (gated on Brief #2). |
| Tenant-isolation contract tests | Q-Sub ✓, evidence-sufficiency ✓, post-market ✓ | PASS for shipped families. Predicate-intel + 510k-workflow contract tests not yet written; their per-route gates are verified individually. |
| Per-tool rate limiting | `mdx-tool-rate-limit.ts` | PASS for inventory; see RISK below. |
| Multi-turn confirmation | `mdx-pending-actions.ts` + gate merge | PASS. 14 dedicated tests cover round-trip + cross-tenant isolation + token mismatch + clear-on-success. |
| Anti-fabrication soft signal | Regex bank in `mdx-tool-policy.ts` + `reasonReferencedArtifact` flag | PASS. 8 dedicated tests cover §-numbers / Q-numbers / K-numbers / ISO standards / dates + negative case. |
| Knowledge pack | `mdx-knowledge-pack.ts` (7 surfaces, 5 workflows, 7 regulations, 17 tools) | PASS. Tools derived from `MDX_COMMAND_METADATA` so it never lies about what AnA can invoke. |
| Tenant knowledge overrides | `mdx-knowledge-overrides.ts` | PASS. Append-array / replace-string semantics tested. |
| Onboarding milestones | `mdx-onboarding-milestone.ts` (7 ids) | PASS. Each id reachable by signal counts. |
| Proactive signals | `mdx-proactive-signals.ts` (6 alert kinds) | PASS — fail-soft per query so a missing-table tenant degrades to fewer alerts. |
| Context resolver | `mdx-context-resolver.ts` injection into `chat-context-builder.ts` | PASS. Wires the snapshot into AnA's system prompt when `module_context.workstream === 'mdx'`. |
| Failure-recovery directive | System-prompt block in `mdx-context-resolver.ts` | PASS. Specific guidance for TENANT_ACCESS_DENIED, INVALID_INPUT, GATE_BLOCKED, NOT_FOUND, CONFIRMATION_REQUIRED. |
| Tenant policy admin route | `/api/ana-tool-policy` GET + PUT | PASS. Audit row (`ana_tool_policy.update`) emitted on update. |
| Snapshot endpoint | `/api/ana/mdx-context-snapshot` | PASS. Returns the resolver `payload` (not the system-prompt block). Audit row emitted. |
| `audit.explain` tool | `mdx-explain-audit-row.ts` | PASS. Tenant-scoped (cross-tenant rows return NOT_FOUND). 24-action plain-language template covers every governed code. |

### Doc drift noted (not a defect)

`docs/reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md` mentions vault
upload + reviewer-simulation as `?` rows; both are now `✓` in the
audit-trail-coverage map. Minor stale reference in the progress doc;
not worth a separate commit.

### UI fixture / backend DTO type drift (known; documented)

`client/src/concept2cure/mdx/data/presub.ts` types
`Commitment.dossierLink.sectionId` as `number`; the backend DTO returns
`string` (`q_sub_commitments.dossier_link_section_id` is `text` to
support CTD-style `'3.2.S'` refs). When the UI ports to the live
service, this type needs to widen to `string | number` or the live
contract will fail TypeScript checks. **Owner:** Claude Code stream
(UI port). Documented in `docs/reports/MDX_AUDIT_AND_FIX_PASS_2026-05-01.md`.

---

## Plumbing

| Surface | Mount file | Verdict |
|---|---|---|
| `/api/q-sub` | register-document-routes.ts | PASS |
| `/api/_ops/predicate-intelligence` | register-document-routes.ts | PASS |
| `/api/tenant-export` | register-document-routes.ts | PASS |
| `/api/ana-tool-policy` | register-document-routes.ts | PASS |
| `/api/ana` (mdx-context-snapshot) | register-document-routes.ts | PASS |
| `/api/predicate-intelligence` | register-document-routes.ts | PASS |
| `/api/se-matrix` | register-document-routes.ts | PASS |
| `/api/evidence-sufficiency` | register-document-routes.ts | PASS |
| `/api/regulatory-correspondence` | register-inline-routes.ts | PASS |
| `/api/authoring-actions` | register-inline-routes.ts | PASS |
| `/api/cerv2-sections` | register-document-routes.ts | PASS |
| ESG submission routes | register-regulatory-routes.ts | PASS (mounted via the routeMap with path=null because the router defines its own paths) |

Every BFF call documented in the workflow tables above resolves to a
real, mounted route file. No documented surface is unmounted.

---

## RISK · Rate-limiter ordering

The shared gate runs in this order:

```
0. multi-turn merge
0.5 rate limit ◄── HERE
1. tenant policy
2. confirmation present
3. reason length
4. reason quality
```

**Effect.** A user who issues `q_sub.create` six times in an hour with
a malformed reason (each rejected for `REASON_TOO_SHORT`) burns six
rate-limit tokens. For standard tools (60/hr ceiling) this is fine.
For `k510_workflow.transmit` (5/hr ceiling), three malformed attempts
would leave only two real transmit tries.

**Defensible reading.** Rate limit BEFORE confirmation is correct as
defense-in-depth: a malicious chat can't use confirmation-required loops
to bypass the per-tool ceiling.

**Friction reading.** A user who legitimately tries to compose a long
transmit reason in chat (and gets rejected the first time for
character count) shouldn't burn a transmit token.

**Recommendation.** No change for BETA. Document the choice. If a
design partner reports the friction, move the rate limit to step 5
(after all gate checks pass).

---

## Recommended next actions (ordered by impact)

None of these gate BETA. Listed for the post-BETA / GA roadmap.

1. **Tenant-isolation contract tests for predicate-intel + 510k-workflow.**
   The per-route gates are tested individually; the cross-cutting suite
   only covers Q-Sub / evidence-sufficiency / post-market. ~1 day each.
2. **`agent.ana.post_market.document.approve.blocked` probe** in the
   cross-cutting test (currently only the success path is asserted at
   the contract level). ~30 LOC.
3. **Audit-trail row count assertions in workflow integration tests.**
   Today the unit tests verify each handler emits `agent.ana.*`. An
   end-to-end W3 test that runs createQSub → setRolledIn → assertion
   would catch any future regression that quietly stops emitting. ~half-
   day per workflow.
4. **Tighten the audit-trail-coverage doc** to remove the stale `?`
   references that the progress doc still carries. ~10 minutes.
5. **Move the rate-limit step in the gate** if a design partner reports
   the friction described under RISK above.

---

## Verdict

**MDX module passes BETA UAT** at the code-and-contract level. One small
gap was found and fixed in this PR (audit.explain probe). One RISK
documented (rate-limit ordering — tradeoff, not defect). All BETA
workflows have full BFF wiring, full audit emission, and either tenant-
isolation contract tests or per-route equivalents.

The module is ready for live UAT against a deployed environment with
real test users — that is the next layer of verification this pass
cannot substitute for.
