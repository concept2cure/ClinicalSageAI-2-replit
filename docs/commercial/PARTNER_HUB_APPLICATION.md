# Anthropic Technology Partner application — draft package

> **DRAFT — FOR FOUNDER REVIEW BEFORE SUBMISSION.** Prepared 2026-09-20 by
> a Claude Code session (workstream W6). This is the content the founder
> would paste into or attach to Anthropic's partner application; the exact
> form fields and programme criteria must be read from Anthropic's current
> partner page at submission time and are not reproduced here. Every
> statement about the product describes the code on `concept2cure-v2` as of
> 2026-09-20. The Claude connector this application describes (launch row
> **D8**) **does not exist yet**: `server/mcp/` is not in the tree. The
> application must not be submitted until D8's evidence exists, or it must
> be submitted as an intent with the dates stated. Launch row moved: **D9**;
> the application itself is filed under **D8**.

---

## 1. Company

| | |
|---|---|
| Legal name | [CONCEPT2CURE LEGAL ENTITY NAME] |
| Product | Concept2Cure — governed regulatory documents and eCTD submissions for life-sciences sponsors and consultancies |
| Stage | Pre-revenue; no customers as of 2026-09-20; design-partner pilots in progress [update at submission] |
| Founder | [Name, email] |
| Website | [URL] |
| Location | [ ] |
| Current Anthropic relationship | Claude API customer (commercial API terms) [confirm plan / organisation id]; Claude Code used for engineering and operations |

## 2. Positioning

**Claude drafts; Concept2Cure governs, validates and submits.**

Concept2Cure is the system of record between a regulatory team's data and
a health-authority submission. Claude is the drafting and explanation
model. Everything a regulator would rely on — figures, verdicts, validation
results, readiness — comes from deterministic engines in the platform: an
eCTD packager, validators, conformance checkers, clocks, rule packs. The
model calls those engines, renders their results and adds language; a tool
that asks the model for a figure is treated as a defect.

The buyer is a one-to-three-person regulatory team at a pre-IND or
IND-stage biotech, a first-510(k) device sponsor, or the boutique
consultancy serving them — teams that cannot afford enterprise RIM and
today assemble submissions in Word and hand them to a publisher.

## 3. Non-overlap statement

Concept2Cure does not compete with Claude, Claude.ai, Claude Code, Claude
for Enterprise, or Anthropic's own connectors. It is a regulated-industry
application that consumes Claude through the API and exposes its governed
capabilities back to Claude clients through a connector. Specifically:

- It does not offer general-purpose chat, coding, or document assistance;
  its conversational surface (AnA) is scoped to the regulatory workspace
  and its tools.
- It does not train, fine-tune or host models. Its "multi-model" gateway is
  a governance mechanism (an approved-models registry with pinned
  versions, rationale and evaluation references; residency and retention
  placement enforced per tenant), not a marketplace. In the connector and
  all Anthropic-facing material, Claude is the named model; Claude Opus 5
  is the approved primary for regulatory drafting, with Claude fallbacks.
- Its value is the governed layer around the model — audit trail,
  electronic signature, controlled documents, eCTD compilation and
  validation — which Anthropic does not provide and does not plan to, as
  far as public material shows.

## 4. Integration description (the connector — launch row D8)

**Planned, not yet built.** The connector is a remote MCP server in
`server/mcp/` (streamable HTTP transport, OAuth 2.1 with PKCE against the
platform's identity layer) exposing **15–20 hand-curated tools**, each with
an exact scope, a "governed" flag and MCP annotations (read-only /
destructive / idempotent). Tools will be drawn from the Launch Catalog only.
Candidate set (final list to be filed with D8 evidence):

| Group | Tools (candidate) | Governed? |
|---|---|---|
| Projects | list projects; get program journey; list filings; list tasks | read-only |
| Vault | search documents; get document version; get audit trail for a document | read-only |
| Authoring | list templates; draft section (returns a draft with citations for human review); get review status | draft creation only; never signs |
| Submission Center | get dossier map; compile sequence (dry run); get validation report | compile is idempotent; no transmission tool |
| Readiness | get dispatch readiness; get inconsistency findings | read-only — this is the tool the D8 transcript will exercise |
| QMS | list controlled documents; get controlled document | read-only |

What the connector will never expose: electronic signature; deletion;
transmission to a gateway; any tool outside the Launch Catalog; any tool
that returns a figure the model computed rather than an engine.

Supporting deliverables filed with D8: privacy policy, connector
documentation, support contact, a public skills pack, submission to the
Connectors Directory, and a transcript of a second machine's Claude client
calling the readiness tool against staging.

## 5. BAA, zero-data-retention and placement posture

Stated exactly as it is on 2026-09-20:

- **Anthropic API:** standard commercial terms. **No zero-data-retention
  agreement and no Business Associate Agreement are in force.** The
  platform's placement registry marks the shared Claude API as
  zero-data-retention only when an operator sets
  `ANTHROPIC_ZERO_RETENTION=true` after a signed agreement; it is not
  assumed. Launch row **D6** names a signed Anthropic BAA as a launch
  requirement.
- **Claude on Amazon Bedrock:** supported in the gateway as the placement
  for residency- or BAA-constrained tenants (region pinned per deployment;
  no-retention, no-training posture of the private substrate); not
  deployed for launch.
- **Claude on Google Vertex AI:** supported in code; not deployed.
- **Sensitive-data placement:** a fail-closed policy
  (`AI_PROVIDER_PLACEMENT_APPROVALS`) decides, before every dispatch and
  every fallback, which provider in which region under which retention
  posture may receive which data class. Production refuses to start
  without it. No PHI is accepted until the BAAs exist.
- **No training on customer data**, at the platform and by contract with
  subprocessors.

## 6. Human-oversight design

- Every model output is a draft. A named, qualified user reviews it,
  records reason-for-change, and signs (server-side password and MFA
  verification) before it becomes a governed record.
- The audit trail (SHA-256-chained, HMAC-sealed, append-only) records the
  model version behind any draft a user acts on.
- Engines decide; the model narrates. Deterministic validators, packagers
  and checkers produce every figure and verdict; when an engine lacks data
  it reports that rather than a value.
- Honest states are a product rule enforced in CI: no fixture data in
  production routes, no simulated responses outside development, an error
  is never rendered as an empty result.
- Approved-model governance: every routable model is pinned with a
  rationale and an evaluation reference; a model swap trips a CI drift
  gate and requires re-validation. Only PQ-passed models serve high-risk
  regulatory drafting (PQ for the current Opus 5 pin is pending execution
  and is stated as such in the registry).
- Part 11 controls: unique accounts, second factor at every login, RBAC,
  e-signature, controlled-document versioning. The platform does not
  describe itself as "Part 11 compliant"; compliance is a property of the
  customer's validated installation.

## 7. Traction and evidence (fill at submission — do not overstate)

| Item | State on 2026-09-20 | Update at submission |
|---|---|---|
| Customers | None | [ ] |
| Signed design-partner pilots | None | [ ] |
| Production environment | Not yet green (**D1**) | [ ] |
| Validation package | Exists, unsigned (**D4**) | [ ] |
| Security | No SOC 2, no external pen test (**D6**) | [ ] |
| Connector | Not built (**D8**) | [ ] |
| Customer story | Template only | [ ] |

## 8. What we ask of Anthropic

1. **Agreements:** a path to a zero-data-retention agreement and a Business
   Associate Agreement for the Claude API at our stage, or confirmation
   that Claude on Amazon Bedrock is the intended path for BAA-covered
   workloads and that our design (placement enforced per tenant, no
   cross-boundary failover) is consistent with Anthropic's guidance.
2. **Connector review:** technical review of the MCP connector design in
   §4 against Anthropic's connector guidelines before we submit to the
   Connectors Directory, and listing once D8's evidence exists.
3. **Partner listing:** a technology-partner listing under life sciences /
   regulated industries, with the positioning in §2, once at least one
   design partner has signed (**D10**).
4. **Co-marketing:** consideration of an approved customer story
   (`CASE_STUDY_TEMPLATE.md`) for Anthropic's customer-story programme,
   after the customer approves it.
5. **Technical contact:** a named partner-engineering contact for questions
   about model pinning, version deprecation timelines and evaluation
   practice, so our approved-models registry tracks Anthropic's schedule
   rather than discovering it.
6. **Nothing that requires Anthropic to endorse regulatory outcomes.** We
   will not ask Anthropic to make, and will not make on Anthropic's behalf,
   any claim that Claude or the platform is validated, certified or
   accepted by a regulator.

## 9. Statements we will not make in Anthropic-facing material

No customer names without approval; no metrics without denominators and
sources; no "SOC 2", "HIPAA compliant", "Part 11 compliant", "FDA
validated" or "FDA accepted"; no implication that transmission to a
health authority is live before **D7**; no implication that the connector
exists before **D8**.

---

**Prepared by:** Claude Code session (W6), 2026-09-20.
**Approved for submission by founder:** ______________________ Date: ______
