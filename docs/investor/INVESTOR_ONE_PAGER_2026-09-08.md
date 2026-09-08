# Concept2Cure.RI

**A regulated-industry operating system for life-sciences submission work — drug, device, and diagnostic.**

## The question that stops every AI pilot

A sponsor's quality organization asks three things before an AI system goes near a regulatory submission: what did the AI do, what authority permitted it, and what will prove that in an inspection. Those are not procurement preferences. They are 21 CFR Part 11, and a chat transcript does not answer them. A transcript is not attributable, not tamper-evident, and cannot be re-derived six months later when a reviewer asks why a claim was worded that way.

So the work stays where it is: authoring in Veeva Vault, eCTD lifecycle in Certara or Lorenz, intelligence lookups in Cortellis — and the work that actually decides the outcome, the gap register, the pre-IND strategy, the CRL response, in a spreadsheet on a shared drive. What is offered to change that is a chat wrapper over a document store. It produces text nobody can defend, so the sponsor does the work twice.

## We built the kernel instead

Every consequential action is evaluated by a governance kernel — seven services, three domains: governance, security, observability. Each returns allow, review, or deny with a rationale, a timestamp, a regulatory reference such as 21 CFR §11.10(e), and an evidence payload. Decisions are written to immutably hash-chained records. Every model call routes through one AI gateway with provider fallback across Claude, GPT-4, and Kimi and full request and response audit; a bypass would fail lint, fail our design-CI gates, and fail its own kernel decision. The sponsor's evidence lives in our schema, not a vendor's chat history.

## What an inspector can pull

| Inspection question | What the system produces |
|---|---|
| What did the AI do? | Immutable kernel decision record: allow / review / deny, rationale, regulatory reference, evidence hash |
| Who authorized it? | TOTP re-authenticated e-signature, reason-for-change, verified signing authority |
| Where did this sentence come from? | Span-level lineage: model, retrieval set, reviewer, timestamp, cited sources |
| Has the record been altered? | HMAC-sealed, hash-chained audit tables with a scheduled chain-integrity sweep |

## What runs on it

Nine end-to-end workstreams — IND/NDA/BLA, 510(k)/De Novo, EU MDR and IVDR clinical evaluation, CMC Module 3, CSR, deficiency and CRL response, regulatory intelligence, post-market, RIM operations — share one kernel, one memory, one audit chain. Four committed golden-journey suites drive the signed end-to-end path today: CER EU-MDR, 510(k) eSTAR, NDA eCTD, IND authoring.

Two layers above the kernel matter most. Client- and project-scoped memory carries locked facts, decisions, and open questions across users and sessions, with entries superseded through successor pointers rather than deleted. The Submission Twin maps every claim to its evidence and catches drift between the CMC and clinical sections before the regulator does. The twin is trustworthy only because the kernel governs every write into it, and useful only because memory carries what the team decided last quarter.

Underneath: 1,072 server TypeScript files, 596 client React files, 554 versioned migrations, roughly 694 table declarations, fail-closed row-level tenancy on every governed table — `organizationId` appears 735 times in the schema monolith alone — and 2,312 automated test files.

## What we are not claiming

Part 11 features do not confer Part 11 compliance. Validation for intended use stays the sponsor's work; ours is wired so §11.10(a–k) has an answer at every point, which makes that validation an exercise rather than a rewrite. The first production sponsor running all nine workstreams is a near-term milestone, not a fact today. We hold the line by making gates fail on purpose: the CI check that blocks the unsafe way to remove schema ships with a self-test proving it catches the case it exists to catch.

Competitors reach the inspection question and stop. We start there. Every claim above has a file path as its answer.
