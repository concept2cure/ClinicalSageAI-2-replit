# Concept2Cure.RI

**A governed operating system for regulatory submission work in life sciences.**

## The question that stops every AI pilot

A sponsor's quality organization asks three things before an AI system goes near a regulatory submission: what did the AI do, what authority permitted it, and what will prove that in an inspection. Those are not procurement preferences. They are 21 CFR Part 11, and a chat transcript does not answer them. A transcript is not attributable, not tamper-evident, and cannot be re-derived when a reviewer asks why a claim was worded that way.

So the work stays where it is: authoring in Veeva Vault, eCTD lifecycle in Certara or Lorenz, and the gap register, pre-IND strategy and CRL response in a spreadsheet on a shared drive. What is offered to change that is a chat wrapper over a document store. It produces text nobody can defend, so the sponsor does the work twice.

## Engines decide; the model narrates

Numbers, verdicts and governed content come from deterministic engines — the eCTD packager, validators, regulatory clocks, conformance checkers, rule packs. The model frames, drafts and explains, and a tool that asks a model for a figure is treated as a defect. Only entries in an approved-models registry can serve drafting or review, each with a pinned version, a rationale and an evaluation reference; content from an unapproved model is refused before it is stored.

## What an inspector can pull

| Inspection question | What the system produces |
|---|---|
| What did the AI do? | A retrieval-run record of inputs, outputs, model and decision trace, with content digests |
| Who authorized it? | One signing ceremony that re-verifies every signer — standing, lockout, password, enrolled second factor — and records what it checked |
| Where did this sentence come from? | Span-level lineage: the machine author of each accepted range, and every cited source with its checksum at citation time |
| Has the record been altered? | One HMAC-sealed, sequence-ordered audit chain per tenant, checked by a verifier |

## What ships first, and the evidence behind it

The launch release is six apps: Projects, Vault, Authoring, Submission Center, Submission Readiness and QMS controlled documents. The wider tree covers device, EU MDR, CSR, post-market and RIM work; it stays behind a flag that is off in production until launch is done.

Launch is defined in writing as ten rows, each with named evidence. The validation package is drafted and executed on a clean install in the production posture: installation qualification 12 pass, 0 fail, 3 deviations; operational qualification 101 pass, 0 fail, 2 deviations of 103, across one protocol per launch app. Tenant isolation is proven by a two-tenant contract run as the non-superuser database role with row-level security enforcing, and each leak it found was shown failing before its fix. A connector for Claude exposes 19 tools, each carrying its scope and a governed flag, over OAuth 2.1 with PKCE.

Underneath: 4,180 server TypeScript files, 554 migrations — 261 on the deploy applier — and 2,299 product test files.

## What we are not claiming

Part 11 features do not confer Part 11 compliance; validation for intended use is the sponsor's work, and ours is built to make it an exercise rather than a rewrite. The platform is not yet hosted in production. No model has yet passed performance qualification, so high-risk drafting in production waits on it. The first production sponsor is the next milestone, not a fact today. Every claim above has a file path, and the launch rows name the evidence still owed.
