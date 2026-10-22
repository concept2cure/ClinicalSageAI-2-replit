# AI architecture and defensibility research

Research date: 14 October 2026. Scope: read-only research of current primary sources for a life-sciences data room, data catalog and data-management platform serving medicines, biologics, medical devices and diagnostics. Recommendations below are design proposals; they do not assert that current platform capabilities are absent, nor that competitors have never deployed these ideas. Repository capability findings and competitor evidence should be reconciled separately.

## Main recommendation

Build a governed evidence-to-filing system around the existing data room. Its durable advantage should be approved evidence relationships, jurisdiction-specific executable requirements, scientific context, reviewer decisions, connector reliability and validated workflows. Buy interchangeable model capabilities. A chatbot, model choice, embeddings or GraphRAG implementation by itself gives little defensibility.

Keep the shared core product-family neutral, with specialist schemas and pathway packs for pharma/biologics, devices and IVD. A diagnostic performance claim needs specimen, reference method, cutoff, population and intended-use context; a device claim needs design/version, configuration, risk and verification context; a medicine claim needs study, endpoint, population, regimen and statistical context. These are first-class relationships rather than tags appended to generic files.

## Ranked improvements

| Rank | Improvement | Specific client value | Defensibility | Delivery sequence |
| --- | --- | --- | --- | --- |
| 1 | Claim-level evidence graph and immutable submission snapshots | Every important statement or number opens the exact approved source version, page, table cell or dataset transformation | Domain ontology + approved relationships + review history | Foundation, first pilot |
| 2 | Cross-document scientific consistency and change-impact analysis | A revised result or design change identifies impacted claims, labeling, summaries, responses and filings before release | Difficult context-sensitive error corpus + dependency graph | First pilot |
| 3 | Executable jurisdiction/pathway requirements and filing compiler | Explain why evidence is required, what is missing and which exact rule/version failed | Curated rules + interpretation history + agency adapters | One medicines pathway and one device/IVD pathway, then expand |
| 4 | Evidence reuse with explicit eligibility conditions | Reuse approved evidence across products/markets while identifying bridging gaps and exclusions | Approved reuse rationales and specialist applicability models | After graph + rules |
| 5 | Permission-aware retrieval and purpose-aware model gateway | Scientific answers respect tenant, role, project, document status, purpose and processing location | Trust and enterprise adoption; foundational capability rather than exclusive moat | Before production AI |
| 6 | Durable sandboxed specialist workflows | Extraction, gap triage, drafts and quality review survive failures and remain inspectable | Validated orchestration + adapters + operational reliability | Alongside first pilot |
| 7 | Client-approved evaluation and correction loop | New models and prompts improve measured task performance without silently breaking prior work | Licensed, curated domain failures + human labels + validated releases | Start immediately; compounds over time |

Ranks prioritize client and moat potential, not dependency order. Authorization, provenance, dataset contracts and evaluation are prerequisites for all production features.

## 1. Evidence graph: approved meaning with exact source anchors

Suggested common objects: EvidenceAsset, AssetVersion, SourceAnchor, DatasetVersion, TransformationRun, ExtractedObservation, ScientificClaim, RequirementVersion, ProductConfiguration, IntendedUse, StudyPopulation, RiskControl, FilingSnapshot, ReviewDecision and Issue. Link with supports, contradicts, derived-from, verifies, applicable-to, supersedes, satisfies, included-in and requires-review. Preserve proposed versus reviewer-approved relationships as separate states.

For each claim/observation, retain original source hash, native file/version, page and bounding box, table row/column and header path, dataset variable/record lineage, units, denominator, cohort, timepoint, confidence interval, provenance run, extraction model/prompt/schema versions, reviewer and decision timestamp. Never convert a probabilistic extraction into an approved fact automatically. Retain the original alongside machine-readable extraction and reviewer corrections.

Use a bitemporal design: distinguish when a source/rule was effective from when the platform learned or recorded it. A filing snapshot fixes its evidence versions, requirement pack, transformations, approved claims and review decisions. This supports both “what did we submit?” and “what changed since that submission?” Draft, historical and superseded evidence remain available through explicit views without contaminating the current approved context.

W3C PROV-O supplies interoperable concepts for entities, activities, agents, derivation, revision and responsibility; specialize them for this domain instead of inventing all provenance vocabulary. [W3C PROV-O](https://www.w3.org/TR/prov-o/). OpenLineage supplies job/run/dataset lineage, version and quality facets for structured-data pipelines, complementing document and scientific-claim provenance. [OpenLineage object model](https://openlineage.io/docs/spec/object-model/).

Implementation suggestion: immutable object storage + transactional relational source of truth + typed edge tables + derived full-text/vector/graph indexes. Start with PostgreSQL/recursive queries if they meet measured requirements; introduce a specialized graph database only when justified. Indexes, summaries and embeddings are rebuildable projections, not the source of truth.

## 2. Structured multimodal extraction and consistency review

Parse native tables/spreadsheets and source datasets before asking a model to interpret rendered documents. Combine layout/OCR/table extraction with multimodal review for scans, difficult merged headers, diagrams and figures. Docling offers a unified document representation including tables, hierarchical structure and provenance; its technical report describes dedicated layout and table models. These are useful commodity components to evaluate, not guarantees of scientific accuracy. [Docling document model](https://docling-project.github.io/docling/concepts/docling_document/), [Docling technical report](https://arxiv.org/abs/2408.09869).

Use schema-constrained model output, followed by independent domain validation. Schema validity does not establish factual correctness. The current OpenAI structured-output documentation supports typed schemas and describes refusals and semantic mistakes; handle both explicitly. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

A valuable pilot is a claim and number checker across an approved source report, summary and intended labeling. Find denominator mismatches, unit conversions, sign/rounding mistakes, confidence-interval transcription, switched groups, obsolete design/version references, changed cutoff values, specimen mismatches and inconsistent populations/timepoints. Deterministic calculations verify arithmetic; language/vision models propose context alignment and explanation; expert review resolves scientific applicability. Compare like contexts before declaring contradictions. Different cohorts or configurations may explain apparently different values.

Expose two separate questions: “Did we copy/recalculate the source correctly?” and “Does the source support this claim for this intended use?” The second often requires expert judgment and cannot be reduced to a numeric confidence score.

## 3. Requirements as versioned executable specifications

Create a typed intermediate filing model. Models can propose structured evidence-to-requirement mappings and drafts; deterministic code checks required sections/fields, lifecycle operations, allowed values, cross-references, identifiers, file constraints and packaging. Generate each jurisdiction/pathway artifact through a versioned adapter. Reuse the common scientific core while keeping different submission formats and legal applicability separate.

Each requirement record should carry official authority URL/source version, jurisdiction, product family, pathway, applicability expression, effective/transition dates, rule severity, evidence obligation, test cases, reviewer, exceptions and interpretation notes. Distinguish mandatory requirements, agency guidance, local reviewer interpretation, client commitments and company policies. Have domain experts approve rules and applicability rather than allowing retrieval or an LLM to silently rewrite policy.

Use symbolic validators for hard constraints and explicit “unknown” outcomes for scientific gaps. Avoid a single uncalibrated “regulatory readiness” percentage. Show separate missing, unreadable, inaccessible, outdated, contradictory, not-applicable and pending-review statuses. A document the user cannot access must not be labeled absent.

The FDA’s January 2025 draft AI guidance proposes credibility assessment tied to a particular context of use for drug/biological product regulatory decisions. It remains listed as draft on the researched official page; it is not a worldwide mandatory rule and should not be automatically applied to every administrative AI task. Nonetheless, task-specific intended-use definitions and validation evidence are a useful design principle. [FDA draft AI credibility guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological).

## 4. Stronger differentiating hypotheses to test

These are opportunities inferred from the architecture, not verified claims that the market has never implemented them.

1. **Evidence reuse with a reviewable proof of eligibility.** When a client wants to reuse a study, produce a structured compatibility record covering indication/intended use, population, specimen/assay or device configuration, manufacturing/design version, methods, geography and evidence limitations. Show the accepted rationale, exclusions and needed bridge. Do not present portability across agencies as automatic acceptance.
2. **Counterfactual filing impact.** A proposed change to assay cutoff, supplier, manufacturing process, device software, intended population or primary endpoint creates a temporary graph branch. Traverse dependencies to identify impacted scientific claims, risk controls, labeling, verification work and current/past/planned filings. Explain every impact edge; allow the reviewer to accept, reject or narrow it before changing the approved graph.
3. **Evidence-gap planner with value of information.** Rank proposed evidence collection by which unresolved claims/requirements it would address, its dependencies, expected effort and reviewer-assigned materiality. A task that satisfies several critical gaps may outrank drafting another narrative. Avoid invented probabilities of agency approval.
4. **Agency-question learning within authorized boundaries.** Connect actual, client-authorized questions and responses to the evidence gaps and requirements involved. Turn accepted reviewer rationales into client-specific retrieval/evaluation cases. Share public or explicitly licensed/de-identified patterns only; do not pool proprietary correspondence by default.
5. **Time-capsule review.** Recreate the exact source/rule/model-output context of a prior submission, then compute a governed diff to the present. This combines audit usefulness with faster lifecycle maintenance and reduces accidental use of revised values in an older filing narrative.

GraphRAG research supports graph-based retrieval for broad questions across private text corpora. Use it as an optional retrieval strategy; LLM-extracted graphs and community summaries are not an approved evidence system. Microsoft now describes GraphRAG/LazyGraphRAG as available through its scientific research platform, underscoring that the method alone is not exclusive. [Microsoft GraphRAG research](https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/), [Microsoft project status](https://www.microsoft.com/en-us/research/project/graphrag/).

## 5. Authorization and model gateway

Enforce tenant boundaries and ACL/ABAC before full-text/vector retrieval, graph traversal, context assembly and model invocation. Apply the same policy to citations, previews, counts, aggregates, embeddings, derived summaries, exports, caches and background jobs. Bind caches to principal/policy version/source versions; invalidate on permission revocation. Reauthorize before a write or export. Service identities carry only the scope needed for a specific run.

OPA’s data-filtering guidance demonstrates translating policy into query constraints, which supports enforcement in the data layer rather than prompts. Cedar provides schema-validated authorization policies for principals, actions, resources and context. Choose an approach compatible with existing authorization, and test deny/revocation semantics. [OPA data filtering](https://www.openpolicyagent.org/docs/filtering), [Cedar policy validation](https://docs.cedarpolicy.com/policies/validation.html).

A model gateway should resolve allowed provider, model/version, feature/endpoint, processing region, retention, approved purpose, tool access, content sensitivity, budget and evaluation eligibility before dispatch. Fallback must preserve these requirements; an outage never authorizes sending restricted material to another geography/provider. Keep source payloads and traces minimized and access-controlled.

Current OpenAI documentation distinguishes no-training defaults from retention and endpoint eligibility. Hosted Agents and vector stores are listed as not Zero Data Retention eligible; residency and tool restrictions vary. Therefore, do not promise “no retention” merely because API data is not used for training. Evaluate approved configuration per customer/workflow and retain a verified contract matrix. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## 6. Durable, bounded specialists

Prefer a small workflow of typed specialists: extraction, applicability, consistency review, gap analysis, draft and validation. Give each only its needed tools and a scoped source snapshot. Use deterministic workflow orchestration with non-deterministic model/I/O calls in recorded activities, idempotency keys, explicit timeouts, cancellation, retry policies and approval states. Persist artifacts in controlled storage rather than giant workflow histories. Temporal documents durable model/tool activities, human approval and claim-check patterns; equivalent existing infrastructure can provide the same controls. [Temporal AI cookbook](https://docs.temporal.io/ai/cookbook).

Execute code in short-lived sandboxes with read-only source mounts, isolated tenant storage, restricted egress, no ambient credentials and approved packages. Expose explicit typed operations such as propose_mapping or create_draft; approval, publication and filing submission are separate authorized actions. Prefer APIs over browser automation; computer use can assist legacy tasks only with captured evidence and bounded authority.

Treat documents, retrieved pages, emails and tool outputs as untrusted data. Prompt-injection defenses need structural separation, scoped capabilities, policy enforcement and evaluation; a model classifier or instruction warning alone is insufficient. [OpenAI prompt-injection design](https://openai.com/index/designing-agents-to-resist-prompt-injection/). Current Anthropic architecture distinguishes the append-only session, harness and sandbox; this is a useful separation independent of provider choice. [Anthropic managed-agent architecture](https://www.anthropic.com/engineering/managed-agents).

Important distinction: replaying stored activity results recreates recorded workflow state. Calling a hosted LLM again does not guarantee identical output, even with similar parameters. Freeze the approved generated artifact and record its provenance; do not promise regeneration is exact. Sign/hash manifests for integrity, while recognizing that cryptographic integrity is not scientific truth.

## 7. Data contracts and an evaluation moat

For incoming datasets/connectors, version contracts for schema, meaning, controlled vocabulary, units, identifiers, owner, source, quality rules, freshness, consent/allowed purpose, retention and expected update behavior. Quarantine breaking drift and generate an impact report before downstream claims update. Open Data Contract Standard includes schema, data quality, stakeholders/roles and service levels; extend it with domain and policy attributes. [ODCS official specification repository](https://github.com/bitol-io/open-data-contract-standard).

Create an initial expert-labeled benchmark from representative permitted client artifacts and real failure modes. Include pharma, device and IVD cohorts; born-digital and scanned tables; multilingual material; contradictions that are real versus contextual; inaccessible evidence; obsolete versions; unsupported claims; prompt injection; revoked permissions; malformed output; tool failure; workflow retries and duplicate execution. Separate training/tuning examples from held-out acceptance cases, and record dataset rights.

Measure source-span/cell correctness, extraction precision/recall by field, unsupported-claim rate, critical-gap recall, scientifically false contradiction rate, reviewer override rate/time, end-to-end artifact correctness, leakage failures, reproducibility of approved artifacts, processing time and cost. Evaluate the workflow’s actual final state, not only fluent text. Use deterministic graders for arithmetic/schema/ACL assertions, qualified humans for science/regulatory interpretation, and calibrated model graders as supplements. Repeat high-risk tasks to quantify consistency, and show slices rather than a single overall score. [Anthropic agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

Use a provider-neutral local/CI evaluation harness and controlled result store. Do not initiate a new dependency on OpenAI Agent Builder or its hosted Evals product: the official AgentKit announcement was updated on 3 June 2026 to say both are winding down, with Agent Builder scheduled to shut down on 30 November 2026. Evaluation as an engineering practice remains essential. [OpenAI lifecycle update](https://openai.com/index/introducing-agentkit/).

## Modern coding techniques to apply

1. **Executable domain specifications.** Keep schemas, domain invariants, rule fixtures, acceptance cases and pathway adapter contracts in version control; generate typed clients/UI forms from contracts where useful. Experts define scientific intent and acceptance criteria; agents implement bounded changes.
2. **Agent-readable engineering harness.** Maintain a short AGENTS.md pointing to architecture, data dictionary, domain rules, task specs and known failures. Enforce dependency boundaries and input parsing with linters and CI. Give coding agents isolated worktrees, a bootable application, anonymized fixtures and trace/browser inspection. OpenAI’s February 2026 account supports these harness techniques, but its speed claims and loose merge-gate practice should not be generalized to regulated client workflows. [OpenAI harness engineering](https://openai.com/index/harness-engineering/).
3. **Independent verification.** Have one agent implement a feature and another inspect risks, but use independent held-out acceptance evidence and human domain review for material changes. Agent-generated tests that mirror the implementation are not proof of intended behavior.
4. **Property/state-machine testing for invariants.** Test permission revocation, tenant isolation, supersession, retry idempotency, snapshot immutability and allowed status transitions using generated operation sequences. Hypothesis demonstrates stateful tests that choose actions and values, useful for finding order-dependent bugs. [Hypothesis stateful testing](https://hypothesis.readthedocs.io/en/latest/stateful.html).
5. **Change-impact and staged release.** Tie code, prompt, model, schema and rule changes to affected benchmark slices; shadow/canary test permitted artifacts, review material regressions, then release with rollback. Use feature flags and small vertical increments.
6. **Build and artifact attestations.** Record code commit, build dependencies, configuration and generated-artifact hashes in manifests. SLSA gives a software-build provenance pattern; adapt the idea without claiming regulatory certification from a manifest. [SLSA build provenance](https://slsa.dev/spec/v1.2/provenance).

FDA’s current computer-software-assurance guidance was issued in February 2026 and supersedes September 2025 guidance. Its scope concerns device production/QMS software, so applicability depends on each client’s intended use. It supports risk-based assurance; it is not permission to omit evidence for critical workflow behavior. [FDA computer software assurance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-management-system-software).

## Concrete pilot and gates

Run two bounded pilots: one medicines evidence-to-summary consistency workflow and one device/IVD intended-use/performance or design-verification workflow. Use existing client-approved source packs and a qualified reviewer to establish baseline effort and defects. Initial scope is source anchors, structured claims, consistency findings, requirement mapping, approved corrections and immutable export. Add reuse and counterfactual planning after those foundations work.

Set numerical performance/effort targets with baseline data; do not invent savings. Every critical drafted claim must have resolvable approved source provenance; no unauthorized content should reach model context or outputs; unresolved critical findings block release; retries must not create duplicate approved records; approved exports must be reconstructible from their manifest and stored artifacts. These are proposed acceptance criteria, not claims of achieved results.

Build/buy boundary: buy OCR/layout/base models, storage/search and generic durable orchestration when suitable; own evidence semantics, reviewed relationships, requirement packs, approval experience, adapters, correction/evaluation corpus and validated end-to-end workflows. The moat comes from accumulated authorized use and measurable trust, not model branding or claims of universal regulatory acceptance.
