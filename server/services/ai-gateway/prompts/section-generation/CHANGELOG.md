# section-generation — CHANGELOG

## v1.0 — 2026-06-05
- Initial (template pinned). RAG-grounded authoring of CTD summaries/overviews with mandatory citations; ungrounded claims surfaced, never invented. Streaming + governed-artifact persistence wired with the authoring route.

## v1.1 — 2026-10-04
- The section's canonical requirements are now supplied. The service sends `requirements` (the platform's brief for the section, rendered by `renderSectionBrief` from `CTD_AUTHORING_GUIDANCE` in `server/services/ind/ctd/`) and `requirementsSource` (`exact` | `ancestor` | `parent` | `none`). Why: v1.0 Instruction 3 asked the model to flag "any required sub-point you could not ground" while the user message carried only `{ sectionCode, evidence, productContext }`, so every required sub-point came from the model's recall (D2 round 2, b2-drafting-requirements; evidence `docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b2-drafting-requirements-*`).
- A code with nothing indexed is said to be unindexed in `ungrounded`, never briefed from memory; a container code is not briefed as its first child.
- Register: the impersonal third person of a regulatory document, past tense for completed studies, replacing "second person where addressing the reader". Labelled in the prompt as a platform convention, not a regulator requirement (ICH M4 prescribes structure and content, not voice).
- The citations rule, the trailer format and the guardrails are unchanged. v1.0 is retained as it was.
