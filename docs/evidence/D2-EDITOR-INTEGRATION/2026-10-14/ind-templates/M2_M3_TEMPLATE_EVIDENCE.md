# Modules 2–3 and saved-template HTTP coverage

W1 / D2 under
[`IND_TEMPLATE_EDITOR_EXPANSION_2026-10-14.md`](../../../../design/IND_TEMPLATE_EDITOR_EXPANSION_2026-10-14.md).
The intake session owns the Module 2–3 outline builder, its narrow tests and
`indTemplateEditor.pglite.integration.test.ts`. The control tower owns the
catalogue, provider, creation/guidance integration and overall release checks.

## Meaningful failures before expansion

The new outline suite first called the existing catalogue constructor. Both
Module 2 and Module 3 checks failed because canonical section entries had no
editor-loadable `template.id`: [coverage red](m2-m3-coverage-red.txt). This was
an actual missing-capability assertion, not a missing import or fixture schema.

The recorded Nonclinical Overview expert-report headings were separately
tested before adding local outline reuse. That test failed because 2.4 had
only its root body: [outline red](m2-m3-outline-red.txt).

## Source-backed outlines

`buildModule2Or3Outline` preserves all 50 canonical Module 2–3 section types and
the complete existing guidance for 34 Module 2 and 53 Module 3 records. Every
row begins with empty authored content and separate source-backed instructions,
checklist/data expectations, pitfalls and reference identity. Guidance explicitly
requires assessment of the product and current IND stage; it does not add
required filing sections or declare readiness.

The selected root remains first. Only recorded descendants enter its scope,
ordered by the existing CTD comparator (substance, product, appendices, regional
information). The QOS includes its recorded substance/product leaves and
regional guidance. Written/tabulated nonclinical summaries, clinical components,
substance controls and pharmaceutical development retain their deeper records.
Unknown, malformed or mismatched module scopes produce no invented outline.

Where no recorded CTD child exists but an exact document outline exists, the
builder reuses that outline with explicit `:work:` identifiers. This supplies
all six Nonclinical Overview headings under 2.4, including within the complete
Module 2 working outline, without assigning new CTD filing positions or copying
marketing-application required flags. Module 2 has 58 working rows including
its root; Module 3 has 56. Returned arrays do not mutate the reference records.

[Outline green](m2-m3-green.txt): **62 passing tests**. These include every
canonical section boundary, all 87 guidance records, the six local headings,
loadable catalogue references, order, empty content and independent arrays.
[Outline ESLint](m2-m3-eslint.txt): **zero errors or warnings**.

## Existing HTTP/editor-store path

[HTTP green](http-templates-green.txt): **15 passing integration tests**, using
actual JWT verification, HTTP routes, canonical migrations/authoring services
and PGlite. Only the database gateway is redirected to the test database;
authorization, creation, evidence and guidance services are real.

The suite verifies:

- All **200** builtins are returned by the existing template endpoint, with
  unique IDs and complete references for 102 sections, 93 deliverables and five
  modules.
- Every builtin creates through the existing `POST /authoring/docs`, then
  reopens its saved sections. The run created **2,725** empty sections. Module
  null stays null for unbound preparation; every copy remains DRAFT, unbound,
  `source: template`, and `governedWrite: unverified`.
- Exact template identity/version/digest/kind/limitations are retained as
  document provenance. Every section has its genesis revision and CREATE
  audit, including the exact template-guidance snapshot. No signature appears.
- Sampled saved guidance for M1–M5 returns the actual template snapshot and
  excludes unrelated organization-template instructions with the same code.
  Revoked current project access refuses even a previously created owner copy.
- Wrong module, foreign project, unknown template, revoked membership and a
  current reader role refuse without adding authoring evidence. A real global
  template works while active and refuses after deprecation.
- A database trigger fails a later section insert after the first section,
  revision and audit have been written. The document and all authoring evidence
  roll back together.

[HTTP ESLint](http-templates-eslint.txt): **zero errors or warnings**. A numeric
probe in the test log records counts and elapsed time; it is not a deployment
latency claim or a performance pass/fail threshold. Guidance was already fixed
when the HTTP fixture ran, so no separate pre-fix guidance failure is claimed.

The owned suites total **77 passing tests**. They do not establish native
PostgreSQL concurrency, production RLS, browser behavior or live model output.
The control tower supplies the combined type/build/design/browser/release checks.
