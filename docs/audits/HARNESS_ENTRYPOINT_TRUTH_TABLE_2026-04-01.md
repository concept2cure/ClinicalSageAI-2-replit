# HARNESS ENTRYPOINT TRUTH TABLE — 2026-04-01

## Scope and method

This truth table is route-backed and code-backed against current repository state.

Classification:

- **governed and safe**: path resolves governed context and validates contract before artifact mutation.
- **governed but incomplete**: governed artifact consequences exist, but customer-shaping enforcement is partial.
- **bypass path**: path writes regulated or quasi-regulated artifact content without canonical governed contract resolution.
- **fake/dead path**: path appears user-facing but is disabled/stubbed/dead.

## Table

| Entry point | File/route | Classification | Evidence |
|---|---|---|---|
| Project artifact create | `POST /api/concept2cure/projects/:projectId/artifacts` in `server/routes/concept2cure.ts` | governed and safe | Uses `resolveGovernedContext(...)`, blocks `GOVERNED_CONTRACT_INVALID`, stores resolved harness metadata and gate checks. |
| Project artifact update | `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId` in `server/routes/concept2cure.ts` | governed and safe | Uses `resolveGovernedContext(...)` for amendment flow, blocks on invalid contract. |
| Conversation promotion | `POST /api/concept2cure/conversations/:conversationId/promote` in `server/routes/concept2cure.ts` | governed and safe | Newly wired through `resolveGovernedContext(...)`, blocks invalid combinations and emits governed metadata. |
| Knowledge upload convergence artifact | Upload route in `server/routes/concept2cure.ts` around `insert(concept2cureArtifacts)` for `source_document` | governed but incomplete | Creates governed artifact consequence but still bypasses canonical governed resolver in this slice. |
| Audit report export artifact creation | audit report export route in `server/routes/concept2cure.ts` around `insert(concept2cureArtifacts)` | governed but incomplete | Export consequence exists with provenance/audit; canonical customer-shaped resolver not yet applied in this slice. |
| HAQ session artifact create/update | `PUT /api/concept2cure/projects/:projectId/haq-session` in `server/routes/concept2cure.ts` | bypass path | Inserts/updates artifacts directly as JSON session store without governed resolver. |
| Knowledge-base artifact writes | `server/routes/knowledge-base.ts` artifact inserts | bypass path | Multiple direct `insert(concept2cureArtifacts)` writes without canonical governed resolver. |
| Authoring actions artifact updates | `server/routes/authoring-actions.ts` artifact updates | bypass path | Multiple direct artifact updates without canonical governed resolver call. |
| AI/provider orchestration | `server/services/aiProviderRouter.ts` | governed but incomplete | Routing/audit/trace exists; not all upstream callers guarantee governed artifact consequence on output. |
| Session-B ingestion/search/workflow spine | `tikaClient`, `grobidClient`, `opensearchClient`, `temporalBridge` | governed but incomplete | Feature-gated support stack present; harness integration exists in places but not yet canonical across all entry points. |
| Disabled feature-gated routes | e.g. regulatory correspondence disabled flags | fake/dead path | Feature-flag blocked; intentionally not reachable live. |

## Immediate bypass removals/blocks completed in this build slice

1. **Conversation promote bypass removed**  
   Promoted conversation artifacts now require canonical governed context resolution and contract validity.

## Remaining bypass inventory (must be routed in follow-up slice)

1. `server/routes/concept2cure.ts` knowledge upload convergence artifact write
2. `server/routes/concept2cure.ts` audit report export artifact write
3. `server/routes/concept2cure.ts` HAQ session artifact write/update
4. `server/routes/knowledge-base.ts` artifact write paths
5. `server/routes/authoring-actions.ts` artifact update paths

## Canonical authority used in enforced paths

- Shared contract validation: `shared/types/document-contract.ts`
- Context/placement/rules/export-gate authority: `server/services/concept2cure/governedDocumentContractService.ts`
- Track packs: `server/services/concept2cure/rules/rulePacks.ts`
- Persona overlays: `server/services/concept2cure/rules/personaOverlays.ts`
- Document class semantics: `server/services/concept2cure/authority/documentClassSemantics.ts`
- Rule resolver: `server/services/concept2cure/rules/ruleResolver.ts`

