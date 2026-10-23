# Complete formatted Authoring PDFs through the canonical Word converter

Authorized continuation of the company-document work, 2026-10-23. W1 / D2:
complete the existing Authoring download, working-copy and File to Vault flows.
Evidence: `docs/evidence/D2-AUTHORING-PDF/2026-10-23/`. Only
`concept2cure-v2`; no new dependency, renderer, surface or version policy.

## What already exists

| Existing path | Current responsibility and confirmed gap |
| --- | --- |
| `server/services/authoring/authoring-export.ts` | One saved-source/section/citation/image/signature parse for all exports. Its `renderDocx` creates the rich Word document. Company correspondence already converts that document through strict LibreOffice. Ordinary PDFs instead call the optional HTML renderer. |
| `server/services/pdf-converter.ts` | Canonical DOCX-to-PDF conversion, strict LibreOffice option, isolated profiles, conversion limits, structural PDF validation and exact delivered-byte hash. Reuse it unchanged. |
| `server/export/renderers.ts` | Legacy HTML PDF renderer, including an explicitly labelled plain-text fallback when optional Puppeteer is unavailable. Other callers still need it; this work only converges Authoring onto its existing Word converter. |
| `server/services/authoring/authoring-file-to-vault.ts` | Canonical render/admit/place/record and byte-bound approval carryover. Correctly refuses a plain-text fallback. Thus ordinary PDF filing can remain unavailable despite an installed Word converter. |
| `server/routes/authoring.router.ts` | Existing controlled export, uncontrolled working copy and Vault filing routes, current-source reservations and audit/outcome checks. Keep those gates and expose a definite, safe conversion refusal before admission/delivery. |
| `client/src/concept2cure/v2/editor/FileToVaultDialog.tsx`; `surfaces/AuthoringCreateExport.tsx` | Existing file/export outcome classifiers preserve uncertain writes. Their generic 503 treatment currently hides the new definite pre-write conversion refusal and prevents a deliberate retry. Complete these classifiers without changing the global mutation classifier or adding controls. |
| `server/services/company-documents/correspondence-rendering.ts` | Resolves immutable company presentation identity. Keep retained stationery and prevent substitution with current branding. |
| `server/export/authoring-blocks-to-docx.ts` | Rich tables, numbering, images, references, footnotes and real Word revision marks. The generated PDF must preserve their review meaning, rather than silently settle pending changes. |
| `Dockerfile.optimized` | Already installs LibreOffice Writer and fonts. The locked application has `puppeteer-cluster` without a direct Puppeteer driver. No dependency installation is needed. |

Code and route searches covered Authoring render/export/working-copy/File to
Vault, the converter, HTML renderers, company correspondence and existing tests.
`git log --all --diff-filter=D` covered authoring export, PDF renderer and PDF
converter names; it found no competing removed Authoring converter to restore.
The separate re-filing TODO is real, but historic hash-version labels are
deliberately refused by the numeric Vault version policy. That policy and pinned
leaf semantics are not changed by this PDF completion.

## Implementation boundary

All Authoring PDFs use the existing rich DOCX builder and strict canonical
converter, as company correspondence already does. Remove only Authoring's
parallel HTML-PDF branch. No plain-text PDF can be reported as formatted or filed.
DOCX/XML behavior, saved-source admission, controlled-export signatures,
uncontrolled-copy banners and retained company presentation remain authoritative.

Conversion failure yields the existing `PDF_RENDERER_UNAVAILABLE` code with HTTP
503 and a useful statement that no PDF was delivered/filed. Do not send process
paths or internal converter messages to the client. Do not classify an uncertain
receipt/COMMIT as a definite failure, and do not admit bytes or retain a success
export record after failed conversion. Existing source/permission failures keep
their own semantics. Canonical conversion-capacity refusals keep
`CONVERTER_BUSY`, their retry delay and existing response behavior; they are not
wrapped as renderer failures. Capture failures before edits and qualify the real
output.

Manual documents without saved source links use the existing `work(pool)`
reservation path, which does not create a transaction. Their EXPORT audit must
therefore run after successful rendering and before export-history recording;
conversion failure must not leave a misleading success event. Source-linked
exports keep their existing reserved transaction and rollback behavior.

The existing Authoring UI may recognize the specific, readable pre-write
`PDF_RENDERER_UNAVAILABLE` / `CONVERTER_BUSY` 503 refusals. It must continue to
hold unknown network/body/receipt outcomes, contradictory data, and explicit
`OUTCOME_UNKNOWN`; recorded/delivery outcomes take precedence. Keep the shared
Submission mutation policy unchanged. Extend the existing dialog and export
recovery tests; introduce no layout or alternative workflow. Searches covered
the existing `mutationUnconfirmed`, `exportFailureKind`, receipt and recovery
helpers and deleted export-error/outcome/conversion-refusal names; no prior
shared Authoring conversion-refusal helper was found.

## Verification and ownership

Root owns this contract, evidence, actual LibreOffice artifact review, combined
build/compiler, synchronization, commits and mandatory push hooks. Renderer
worker owns `authoring-export.ts`, its focused converter tests and narrow
File-to-Vault conversion handling. Route worker owns `authoring.router.ts`,
its failure helper and affected route/filing fixtures; coordinate fixture scope
before edits. The route worker also owns the two existing client outcome
classifiers and their narrow recovery regressions. Workers do not mutate Git
or run global gates.

Tests must prove ordinary PDFs use real Word input, strict conversion and actual
delivered hashes; conversion refusal prevents ingestion/delivery and rolls back
controlled export recording. Check actual multi-page PDFs for tables, figures,
citations/references, footnotes, signatures and banners. Pending revisions must
remain visibly unresolved; if real conversion cannot preserve that meaning,
refuse that output explicitly while keeping editable Word available. Preserve
native company-original PDF bypass and all existing approval/source checks.

Run focused regression suites, build, full compiler and mandatory repository
checks. This qualifies local artifacts and branch delivery; it does not establish
agency acceptance, remote CI or production deployment.
