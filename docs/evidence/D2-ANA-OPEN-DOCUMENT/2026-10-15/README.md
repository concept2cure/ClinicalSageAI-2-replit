# D2 — the open document's type and what it must contain reach AnA's turn (2026-10-15)

Lane `…session_01SuVLo2`. Founder-directed, 2026-10-08: *"enhance her acumen, intelligence, and abilities across the board … protocols, SOPs, IND documentation, BLA"*. This is the planned row "AnA knows the type of the document open in front of her", claimed 2026-10-15.

## Before (measured at `823056961`)

A read-only map of the seam was made by four parallel readers, and a critic re-verified their six load-bearing claims against the code; all six were confirmed. It found:

- **The client never sends the document type.** `document_context` is `{section, module}` only (`useAnaChat.ts:1600-1605`), and `AuthoringContextPack` has no type field (`shared/types/authoring-context.ts:59`).
- **The editor's recorded template identity reaches only `module_context`.** It was added there on 2026-10-14 (`DocumentWorkbench.tsx:1815`, `4c5546cec`), and the stream route never reads `module_context` (`stream.ts:736-756`).
- **The template is chosen from the words of the message alone** (`orchestrator.ts:431`). Asking "what is missing?" in an open Investigator's Brochure got no IB structure.
- **A client `documentContext.documentType` was written into the cached system prefix unvalidated and unfenced** (`persona.ts:669`). Section and module were treated the same way.
- **Tool selection always got an undefined document type.** It was given `asStr(document_context)`, and `document_context` is an object (`stream.ts:2084`).

`red/open-document-turn.txt`: **7 of 7** cases red on that tree.

## After

`server/services/ana-ri/open-document.ts` resolves the open document. It takes the type from, in order:

1. **The saved document's recorded template.** `authoring_documents.template_id` and `provenance.templateSource` are read for the tenant only and parsed by the one recorded-template parser (`shared/authoring/recorded-template-source.ts`). `registry:<id>` names the type directly, and `component:<id>` maps back through the template library's registry map. A template that does not verify is reported as unverified and is never read as a type.
2. **A type the surface states**, accepted only when it resolves to a registry id (`GLOBAL_REGISTRY`).

Anything else gives no type, never a guess. What the type must contain is the registry outline the platform already holds (`getRegistryDocumentTemplate`). That outline carries its basis label, so a recall or platform-convention outline reads as such. For example:
- `ICH_PROTOCOL` gives the ICH M11 outline;
- `ICH_IB` gives E6(R3) Appendix A;
- `ICH_CSR` gives ICH E3;
- `ICH_DSUR` gives E2F;
- the ICF, SAP and IND outlines come from the project blueprints.

The block is capped at 3,200 characters. Past the cap it points to `get_document_template` for the remaining sections.

**How the block reaches the turn.**
- **The route prefetch** (`chat-context-builder.ts`) resolves the type under the same 3-second optional-context deadline as its other reads. A read that fails or times out appears in the unavailable-context list, and the block says the type could not be read.
- **`orchestrate()`** appends the block ahead of the template guessed from the message, so every caller of `orchestrate()` that passes it gets it.
- **The persona's document lines** print only a registry id, plus a section and module that are codes. No free text reaches them.
- **The stream route** passes the block through, and gives tool selection the resolved type's name.

## The gate

`server/services/ana-ri/__tests__/open-document-turn.test.ts`, 12 cases. It covers:
- **the saved IB:** its outline and Appendix A reach the prefetch, and the record is read with `[document, org]`;
- **an unverifiable recorded template:** stated, and not used as a type;
- **a failed read:** stated, and listed as unavailable;
- **a stated `ICH_PROTOCOL`:** gives the M11 outline;
- **a stated type the registry does not hold:** gives no type, and its text never appears;
- **injection:** `orchestrate()` injects the block, and a hostile client document type is not printed;
- **the route lines:** the two stream lines that carry the type, pinned.

`green/open-document-turn.txt`: 12/12. Every suite that calls `orchestrate()`, reads the persona prompt or loads the prefetch (70 files) passes, except `report-os/compute-run-regional.test.ts`. That suite fails 1 of 3 on the trunk tree without this change too, and is recorded below. Typecheck shows 0 errors, and the lint ratchet shows no file gaining a warning.

## The security review

An independent security review of the diff found these problems, all fixed before push. Each fix has a test case, red on the first commit (`red/review-findings.txt`, 3 of 3) and green after:

- **Medium: client text still reached the cached prompt** through "Current Focus" (`detectCurrentFocus` returned the raw section or type). It is now one sanitized line, and a type appears only as the registry states it.
- **Low-medium: a document type was dropped without saying so** on the `/api/chat` path, where the type is not a registry id, along with sections such as "Introduction/Background". The persona now prints a registry type as id and name. A non-registry type is said to be "stated by the client, not a platform registry type", and the client's text is never printed. Section and module are printed as one sanitized line, at most 80 characters.
- **Low: the saved record could be overridden.** A saved record with no registry template fell back to the type the surface stated. Once the record is found it decides the type. A record with no recorded template, or with a non-registry template, is a stated problem.

The review found tenant isolation clean:
- the read uses `tenant_id = organizationId`, as other authoring reads do;
- it goes through the instrumented, tenant-scoped pool;
- a missing org skips the read.

It found prompt injection clean on the new path, and failure honesty clean.

It noted two limits, both recorded and not fixed:
- **Same-tenant type lookup.** A caller holding another same-tenant document's UUID learns only its registry type and the platform outline. Binding the read to the turn's program (`client_program_id`) would close that.
- **Timed-out reads keep running.** A timed-out read is not cancelled, as with every other prefetch read.

## Not done, recorded

- **Surfaces with no saved record do not state their type yet:** Protocol Development, QMS, the IB surface, the CSR board and Submission Center. The server accepts `authoring_context.documentType` as a registry id; the client half sets it. `useAnaChat.ts` and `DocumentWorkbench.tsx` were changed by another author within 24 hours of this commit.
- **`send-message.ts`** (the non-stream path) still builds `documentContext` from a `clientCtx.documentType` that no client sends. Its prompt now prints that only as a registry id.
- **Duplicate template registry.** The message-text template registry (`ana-ri/document-templates.ts`) still duplicates the canonical one (`market-specs/document-template-library.ts`). The open document now outranks it; retiring it is owed.
- **Trunk red, not this lane's:** `server/services/report-os/__tests__/compute-run-regional.test.ts` ("retains a supplied declaration and refuses its wrong region") fails on the trunk tree without this change.
