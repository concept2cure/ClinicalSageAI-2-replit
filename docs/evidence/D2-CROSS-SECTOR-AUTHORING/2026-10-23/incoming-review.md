# Incoming canonical compatibility review

Reviewed `aa09f55f` → `0a7abf3146aeb8cd2fd6965740446c01c013120b`
on 2026-10-23 while the root's current 38-suite cross-sector regression was
running. This is a static review of incoming Git objects, not a post-sync test
result. No tests, production/test edits, checkout, fetch, merge or Git mutation
were performed for this review. The only write is this report.

## What already exists

- The cross-sector contract is `docs/design/CROSS_SECTOR_AUTHORING_2026-10-23.md`.
  Its exact four RI outlines reuse the existing builtin, preparation, assembly
  and saved-review paths. They remain internal work products with null module,
  empty package families, no filing route and no evidence/readiness inference.
- `server/services/authoring/authoring-export.ts` already owns the shared source,
  citation, figure and signature parse for Word/PDF/XML and File to Vault.
  Incoming work completes ordinary PDFs through the same strict Word converter
  already used by company correspondence; it does not introduce another editor.
- `server/services/ana/turn-record-loop.ts` already records the three native
  loop hosts. The gateway already reports model-response observations and the
  canonical recorder/author qualification already accepts per-call metadata.
  Incoming work connects those existing observations to that existing record.
- Incoming contracts reviewed: `docs/design/AUTHORING_PDF_CONVERGENCE.md` and
  `docs/evidence/D2-NATIVE-MODEL-CALL-PROVENANCE/2026-10-23/CONTRACT.md`.

## Findings

**No blocking compatibility finding.** Line references below refer to incoming
commit `0a7abf3146aeb8cd2fd6965740446c01c013120b`.

1. The six cross-sector production files are unchanged in this incoming diff:
   `shared/regulatory/global-document-registry.ts`, builtin templates, template
   library, document preparation, shared-planning preparation and builtin
   template reference. There is no incoming change to the exact four-entry
   admission predicate, five headings, manual eligibility, null module, empty
   families, market/route distinction, ICH limitation, evidence flags or paging.
   Assembly/source manifests and saved-template review implementations are also
   untouched. No internal-planning-to-filing-authority conversion was found.
2. `authoring-export.ts:537–553` renders the existing rich Word document before
   invoking the strict converter. It catches only conversion-stage failures,
   preserves capacity errors and wraps other conversion failures in the safe
   pre-delivery refusal. Source/workflow checks still precede rendering at
   `:557–577`. The renderer has no medicinal default or requirement for a CTD
   module; it consumes the supplied existing sections. Word/XML paths remain
   independent of PDF availability, and the delivered-byte hash is still
   computed from the actual returned bytes (`:578–589`).
3. `authoring.router.ts:6298–6319` admits the two definite converter refusals
   only before export recording can be attempted or confirmed. The EXPORT audit
   now follows successful rendering (`:6436–6455`); receipt/delivery uncertainty
   remains authoritative after a record attempt. Existing sealed/signature gates
   are intact. File to Vault returns rendering refusal before ingestion
   (`authoring-file-to-vault.ts:472–485,529–545`); existing compensation and
   byte-bound approval carry remain in place. Native-original PDF handling and
   filing/submission policy are not changed.
4. `authoringPdfRefusal.ts:10–38` requires an actual coherent 503 refusal body,
   a readable message, consistent codes and a valid busy retry delay. It rejects
   returned data and contradictory success. Existing receipt/unknown precedence
   remains in `FileToVaultDialog.tsx:127–142` and
   `AuthoringCreateExport.tsx:381–387`; this does not weaken the generic mutation
   classifier or confer permissions.
5. Incoming native provenance retains each returned model's primitive metadata
   in observation order (`turn-record-loop.ts:61–67`), replays it through the
   existing canonical `addServed` (`:94–96`) and retains organization/user/project
   binding, raw tools and the final answer (`:122–150`). All three host changes
   only connect that observer and list: chat `send-message.ts:486,857`, agent
   `ana-intelligence.ts:579,607`, realtime `ana-realtime.ts:158,181`. Unknown or
   earlier unqualified authors remain visible to the existing served-model
   qualification reader. There is no new model approval, evidence verification,
   RI scope inference or agency authorization. Missing later inputs and tool
   round assignments remain explicitly stated limits.
6. Current actor/program read contracts and both owned assembly UI test files
   are unchanged by the incoming diff. The corrected scoped-read assertions
   remain applicable. Both owned Workbench fixtures mock `AuthoringCreateExport`
   and do not invoke File to Vault, so this incoming change supplies no reason
   to alter those fixtures or rerun them independently. The existing template
   search fixture does render the real `AuthoringCreateExport`, so include it
   in the small integration cohort below.

## Bounded post-sync verification

Root should preserve the current pre-sync regression result and pins, sync only
after that run completes, and qualify the actual combined bytes. No whole-repo
or automatic repeat of all 38 cross-sector suites is requested by this review.
The existing cross-sector registry/preparation/assembly/review inputs are
unchanged; the relevant incoming seams are export/Vault behavior, the real
template-search host, and native author provenance.

Recommended post-sync cohort: **15 suites**. The first two are the precise
overlap with the local 38-suite work; the other 13 cover the changed incoming
contracts and their existing safety consumers.

```text
server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts
client/src/concept2cure/v2/__tests__/authoringTemplateSearch.test.tsx
server/services/authoring/__tests__/ordinary-authoring-pdf.test.ts
server/routes/__tests__/authoringExportPdf.test.ts
server/routes/__tests__/authoringExportHistory.test.ts
server/routes/__tests__/authoringWorkingCopy.test.ts
server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts
server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts
client/src/concept2cure/v2/__tests__/fileToVaultContinuity.test.tsx
client/src/concept2cure/v2/__tests__/workbenchExportRecovery.test.tsx
server/services/ana/__tests__/turn-record-loop-model-calls.test.ts
server/services/ana/__tests__/turn-record-loop-model-hosts.test.ts
server/routes/chat/__tests__/send-message-model-calls.test.ts
server/services/ana/__tests__/turn-record-loop.test.ts
server/services/authoring/__tests__/turn-served-models.pglite.test.ts
```

The incoming `authoringSavedSourcesExport` fixture now mocks strict Word
conversion and adds genuine converter refusal/withdrawn-source cases. These are
the correct contracts after convergence; do not restore the old optional HTML
renderer mock. The current request-owned DB seam and scoped actor fixtures need
no further allowance or identity changes.

The upstream PDF packet records 522 passing cases across its selected 38 suites,
and its supplemental combined-source record separately records the three new
native provenance suites (43 cases). The native provenance packet records 330
passing cases across its selected 34 suites. Those are incoming retained claims,
not tests performed by this reviewer and not additional cross-sector passes.
They support the bounded selection; they do not replace root's final combined
source pins, compiler/build and mandatory publication checks.

No new browser, live provider, agency, remote-CI or deployment result is claimed.
