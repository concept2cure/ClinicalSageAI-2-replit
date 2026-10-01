# D4 — AnA can audit a reference list against PubMed and Crossref

Row **D4**. AnA local-safe-AI plan **WS7** (`verify_citations` as a thin handler over
`verifyCitations`). Session `…01SuVLo2`, 2026-10-01.

`verifyCitations` (`server/services/citation-verification-service.ts`) resolves each
reference by PMID in PubMed, by DOI in Crossref, else by title search; it reports
retraction status and fields that disagree with the record, and honours the tenant's
public-source egress setting (off → every reference unverifiable). It was reachable only
through `POST /api/citations/verify`. AnA had no tool for it, so "do all the references in
this Module 2.5 resolve?" was answered by a model reading the list.

`verify_citations` is now that tool: at most 50 references, each needing one of raw,
title, doi or pmid; the engine's verdict per reference, counted (verified, retracted, not
found, unverifiable, could not be checked). Register class `read`; launch scope in;
pedigree `external_api_live`; the persona's tool list names it.

| What | Red | Green |
|---|---|---|
| `server/services/ana/__tests__/verify-citations-tool.test.ts` | `red/verify-citations.txt`: 3 of 3 fail at the claim commit (no such tool) | `green/verify-citations.txt`: 3 of 3 with the registry, authorization, launch-scope, pedigree, governed-write and tool-selection suites (961 before the persona line); wide run 4,889 pass — the only failures are `tests/services/document-consequence.test.ts`, failing identically on trunk |
