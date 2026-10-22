# Reach device preparation through AnA

W1 / D2. [Contract](../../../../design/DEVICE_DOCUMENT_AUTHORING_2026-10-20.md).

## What already exists

`server/services/market-specs/document-preparation.ts` supplies the canonical
preparation topic IDs, regional scope checks, conversation guidance and medicinal
inquiry. `server/services/ana/document-template-tool.ts` already serves paged
outline and preparation references. `builtin-template-reference.ts` already
serves the same UUID-based built-in source as the editor;
`AnaDocumentDraftingService.ts` resolves the actual section drafting prompt.
The saved-template reviewer already binds recorded context and source versions.
These paths were extended, with no new tool, model, provider, editor or transport.

## Result

The existing preparation entry accepts exact device/IVD registry types and device
components, asks source-specific questions using the established topic IDs, and
retains unresolved evidence as unresolved. A pure helper supplies device inquiry
and delivery statements; the existing entry selects it instead of medicinal
questions. FDA, EU, Canadian and Japanese device contexts are preserved. EU
notified-body, national-authority, reference-laboratory and CDx consultation
recipients are distinguished. Canadian and Japanese preparation never claims a
working agency transport. Japan device inquiry does not reuse medicinal PK/PD or
Phase I evidence notices.

The component context helper supplies the existing editor projection with
US/FDA identity for the 510(k) summary, EU/notified-body identity for device
GSPR/PER components, and the unchanged medicinal regional identities. Conflicting
regional components are refused, including outline-only lookups. Device versus
medicinal preparation conflicts remain refused; family-only device preparation
requires an exact document identity. Existing medicinal inquiry and drafting
checks still pass. The shared bridge resolves legacy IVDR aliases to the canonical
IVDR record; the drafting service no longer maps an IVDR key to the MDR framework.

## Evidence

- [Summary](summary.json): exact scope, counts and limits.
- [Pre-fix RED](red.json): 23 intended failures; the
  [exact test source](red-test.ts.txt) matches its recorded hash and
  [source pins](red-source-pins.json).
- [Current replay](current-tests.json): 213/213 across five suites, including
  43 device cases and existing medicinal preparation, drafting and saved-context
  PGlite checks. All 14 source/dependency hashes were stable during that run.
  Root subsequently added sourced `JP_TODOKEDE` registry/bootstrap data. The
  [later root combined replay](../integration.json) supersedes qualification of
  shared dependencies. A later [component compatibility correction](compatibility-scope/README.md)
  extends `document-preparation.ts` and records its own green replay. Root also
  updates the drafting service; the later root replay qualifies its final bytes.
  Later device-only QMS preparation also changes the device inquiry helper.
  These earlier raw receipts qualify their recorded bytes; final root release
  checks supersede current source qualification.
- [Lint](lint.json): at that run, six changed/new preparation, helper, reference
  and test files had zero errors and warnings. The then-current drafting service
  had zero errors and six warnings, matching canonical source linted through stdin.
  Preparation and drafting-service changes after that receipt are qualified by
  the later root release checks.
- [First candidate](candidate.json) retains six test-expectation failures,
  corrected against the existing response contract and expanded scope.
- [Candidate before bridge freeze](candidate-before-bridge-freeze.json) retains
  the two legacy-alias failures and the dependency drift. It is not the final
  qualification. [Initial lint](candidate-lint.json) retains the two complexity
  warnings resolved by the final helper extraction.

Counts overlap with any root combined replay and must not be summed. Raw outputs,
actual process exits and hashes are retained. The tests use deterministic
references and PGlite fixtures; they establish no live provider consumption,
scientific suitability, human acceptance, official artifact validity or agency
transmission. Existing AI eligibility and provider/approval gates are unchanged
by this AnA extension.
