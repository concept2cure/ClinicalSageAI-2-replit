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
| Knowledge upload convergence artifact | Upload route in `server/routes/concept2cure.ts` around `insert(concept2cureArtifacts)` for `source_document` | governed and safe | Upload now resolves governed context before artifact insertion and fails closed with `400` + `GOVERNED_CONTRACT_INVALID` when contract validation fails. |
| Audit report export artifact creation | audit report export route in `server/routes/concept2cure.ts` around `insert(concept2cureArtifacts)` | governed and safe | Uses `resolveGovernedContext(...)` and returns `GOVERNED_CONTRACT_INVALID` on failure before insert. |
| HAQ session artifact create/update | `PUT /api/concept2cure/projects/:projectId/haq-session` in `server/routes/concept2cure.ts` | governed and safe | Both create and update call `resolveGovernedContext(...)`, block on invalid contract, and persist harness metadata. |
| Knowledge-base artifact writes | `server/routes/knowledge-base.ts` artifact inserts/updates | governed and safe (artifact mutation) | Module 3 save, save-docx-as-artifact, IND autodraft artifact saves, and vault connector versioning updates are now governed before mutation. |
| Authoring actions artifact updates | `server/routes/authoring-actions.ts` artifact updates | governed and safe | Promote/approve/lock/submission-ready paths run `resolveGovernedContext(...)` before mutation and now return normalized `400` + `GOVERNED_CONTRACT_INVALID` envelopes on governed-validation failures. |
| Service-layer AnA guidance artifact creation | `server/services/ana-guidance-executor.ts` (`executeArtifactCreation`) | governed and safe | Guidance-created artifacts now resolve/validate governed context before transactional insert and persist harness metadata. |
| Service-layer contradiction consequence memo | `server/services/contradiction-consequence-service.ts` (`createContradictionMemo`) | governed and safe | Contradiction memo creation now resolves/validates governed context before insert and persists harness metadata; no synthetic fallback IDs on failure. |
| AI/provider orchestration | `server/services/aiProviderRouter.ts` | governed but incomplete | Routing/audit/trace exists; not all upstream callers guarantee governed artifact consequence on output. |
| Session-B ingestion/search/workflow spine | `tikaClient`, `grobidClient`, `opensearchClient`, `temporalBridge` | governed but incomplete | Feature-gated support stack present; harness integration exists in places but not yet canonical across all entry points. |
| Disabled feature-gated routes | e.g. regulatory correspondence disabled flags | fake/dead path | Feature-flag blocked; intentionally not reachable live. |

## Immediate bypass removals/blocks completed in this build slice

1. **Conversation promote bypass removed**  
   Promoted conversation artifacts now require canonical governed context resolution and contract validity.
2. **Knowledge upload convergence artifact path governed**  
   Convergence artifact creation now validates via `resolveGovernedContext(...)` before insert.
3. **Audit export artifact path governed**  
   Audit export insert now fails closed with `GOVERNED_CONTRACT_INVALID`.
4. **HAQ artifact persistence governed**  
   HAQ create/update now run canonical governed validation before mutation.
5. **Knowledge-base artifact mutations governed**  
   Module3/save-docx/IND-autodraft/vault-versioning paths now resolve governed context before write.
6. **Service-layer artifact bypasses removed**  
   `ana-guidance-executor` and contradiction memo creation now call canonical governed authority before insert.

## Remaining bypass inventory (must be routed in follow-up slice)

1. Continuous hygiene: any newly added `insert/update concept2cureArtifacts` outside canonical harness paths must be blocked in CI/audit.

## Canonical authority used in enforced paths

- Shared contract validation: `shared/types/document-contract.ts`
- Context/placement/rules/export-gate authority: `server/services/concept2cure/governedDocumentContractService.ts`
- Track packs: `server/services/concept2cure/rules/rulePacks.ts`
- Persona overlays: `server/services/concept2cure/rules/personaOverlays.ts`
- Document class semantics: `server/services/concept2cure/authority/documentClassSemantics.ts`
- Rule resolver: `server/services/concept2cure/rules/ruleResolver.ts`

