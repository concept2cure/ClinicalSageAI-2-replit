# Submission Center — API manifest (UI install guide)

Every endpoint the UI needs, mapped to the seven workspaces (spec §4). All are
RBAC-gated (`regulatory-author`), rate-limited, Zod-validated, tenant-scoped from
the session (org/user never from body), and audited where they mutate. Typed
request/response shapes live in `shared/types/submission-api.ts` — import them in
the UI for end-to-end types. Errors are uniform: `{ error: { code, message?, details? } }`.

Auth: send the session JWT (`Authorization: Bearer …`); `organizationId`/`userId`
come from it. Do not send tenant ids in the body.

## Portfolio + hub
| Method | Path | Request → Response | Notes |
|---|---|---|---|
| GET | `/api/submissions` | → `Submission[]` | portfolio list (tenant-scoped) |
| POST | `/api/submissions` | `CreateSubmissionRequest` → `Submission` | create |
| GET | `/api/submissions/:id` | → `Submission` | hub |

## 1. Planner (`/submissions/:id/plan`)
| POST | `/api/submissions/:id/plan` | `PlanRequest` → `PlanResponse` | Submission Strategist (AI, audited) |

## 2. Builder (`/submissions/:id/builder`)
| GET | `/api/submissions/sequences/:seqId/leaves` | → `SubmissionLeaf[]` | the assembly tree |
| PUT | `/api/submissions/sequences/:seqId/leaves` | `UpsertLeafRequest` → `SubmissionLeaf` | map/move/granularity/lifecycle; refused if sequence frozen |
| POST | `/api/ectd-documents/:id/classify` | `ClassifyRequest` → `ClassifyResponse` | auto-propose leaf placement (Ingestion) |
| POST | `/api/ectd-documents/:id/extract` | `ExtractRequest` → `ExtractResponse` | structure + provenance capture |

## 3. Sequences / Lifecycle (`/submissions/:id/sequences`)
| GET | `/api/submissions/:id/sequences` | → `EctdSequence[]` | sequence timeline |
| POST | `/api/submissions/:id/sequences` | `CreateSequenceRequest` → `EctdSequence` | new sequence |
| POST | `/api/submissions/sequences/:seqId/transition` | `TransitionSequenceRequest` → `EctdSequence` | draft→assembling→validated→frozen→dispatched (rules enforced; freeze stamps `frozenAt`) |

## 4. Validation (`/submissions/:id/validation`)
| POST | `/api/submissions/:id/validation/explain` | `ValidationExplainRequest` → `ValidationExplainResponse` | plain-language causes + fixes (AI; never changes verdicts) |
| — | (deterministic validator) | AnA tool `validate_ectd_package` / `server/services/ectd/ectd4-validator.ts` | structured findings to feed `explain` |
| GET | `/api/submissions/validation-rules?region=fda\|eu\|jp` | → `ValidationRulesResponse` | The named, sourced eCTD validation **rule corpus** (ICH/FDA/EU/JP criteria) with regional severity + enforcement (`dispatch-readiness` rules are floored by the gate; others are packager-guaranteed or agency-validator). A dispatch-readiness finding's `code` equals the rule `id`, so every gate verdict traces to a cataloged rule. Static reference data. |

## 5. Shadow Review — the moat (`/submissions/:id/shadow-review`)
| POST | `/api/submissions/sequences/:seqId/shadow-review` | `ShadowReviewRequest` → `ShadowReviewRunResponse` | run a reviewer-lens pass (RTF/CRL risk) |
| GET | `/api/submissions/sequences/:seqId/shadow-review` | → `ShadowReviewRunResponse[]`-like rows | run history (for the RTF gauge) |
| GET | `/api/submissions/shadow-review/:runId/findings` | → `ShadowFindingResponse[]` | severity-scored findings + fixes |

## Authoring (section-generation, SSE) — surfaced in Builder / an editor
| POST | `/api/submissions/:id/sections/generate` | `GenerateSectionRequest` → **SSE** | streams `event: chunk {text}` … then `event: done` = `GenerateSectionResult` (persisted governed draft id + citations), or `event: error {code,message}`. RAG-grounded; ungrounded points surfaced, never invented. |

## 6. Cross-Region (`/submissions/:id/cross-region`)
| POST | `/api/submissions/:id/cross-region` | `CrossRegionRequest` → `CrossRegionResponse` | Module 1 deltas, bridging (ICH E5), translation, format conversion |

## 7. Dispatch (`/submissions/:id/dispatch`)
| POST | `/api/submissions/:id/dispatch-qc` | `DispatchQcRequest` → `DispatchQcResponse` | final QC gate; hard-fails on open error-severity validation or unacked Shadow criticals. **Does NOT transmit.** |
| — | (transmit) | existing governed tool `transmit_submission` + Part 11 e-sign | the actual wire send stays behind the signature gate |

## Truth Engine (surfaced in Builder + a Provenance view)
| GET | `/api/submissions/:id/provenance?section=2.7.3` | → `ProvenanceResponse` | deterministic provenance graph for a section |
| POST | `/api/submissions/:id/consistency` | `ConsistencyCheckRequest` → `ConsistencyFinding[]` | cross-document consistency (AI; persisted) |
| GET | `/api/submissions/:id/consistency` | → `ConsistencyFinding[]` | stored findings |

---

## AnA (every workspace)
AnA can drive all of the above through her governed tools (tenant from
`ToolContext`, audited): `plan_submission`, `classify_submission_document`,
`extract_submission_document`, `compute_lifecycle_operations`, `generate_stf`,
`check_ectd_cross_references`, `validate_ectd_package`, `run_shadow_review`,
`explain_validation_findings`, `cross_region_gap_analysis`, `dispatch_qc_check`,
`trace_provenance`, `check_consistency`, `assess_pathway_readiness`,
`build_pathway_manifest`, `assess_dispatch_readiness`. The UI's AnA panel passes page context
(`{ submissionId, sectionCode, region }`); the tools supply nothing tenant-related.

## Still server-side TODO before some screens are fully live
- **Publish/assemble bytes**: DONE. `assembleSequence` (eCTD) and
  `assembleTechnicalFileFromCore` (device MDR/IVDR ZIP) both supply the storage
  `resolveFile` and have routes (`POST .../assemble`, `POST .../technical-file/assemble`).
  `capabilities.features.{assemble,deviceTechnicalFile,pathwayManifest}` are now `true`.
- **Wire transmit**: stays behind the governed transmit path + Part 11 e-signature
  (`publishTransmit:false` by design — it is a signature gate, not a missing feature).
- **DB-runtime**: nothing here is runtime-verified — needs `drizzle-kit push` +
  the new `20260605_consistency_findings.sql` migration applied, then live calls.

## Non-negotiable UI rules (CLAUDE.md / README)
Sentence case; no emoji/exclamations; body 13px; Claude orange `#d97757` as the
only strong color (one focal point/screen); 200ms ease-out motion; Lucide icons;
second person; numbers over adjectives. Loading/empty/error states mandatory.

## Region profiles (static metadata — Planner / Builder / Validation / Cross-Region)
| GET | `/api/region-profiles` | → `RegionProfileResponse[]` | all regions: Module 1 structure, forms, pathways, rule-pack size |
| GET | `/api/region-profiles/:region` | → `RegionProfileResponse` | one region (fda \| eu \| jp); 404 on unknown |

## Shared UI constants
`shared/types/submission-constants.ts` — canonical `Choice[]` arrays for every
enum (regions, client/application types, pathways, sequence type/status,
lifecycle ops, severities, finding status, shadow lenses, evidence directions,
consistency status, lifecycle stages) with sentence-case labels + a neutral
`tone` hint (UI maps tone→palette; no hex here) and `SEQUENCE_TRANSITIONS`
mirroring the server's lifecycle rules. Render dropdowns/badges/pills from these.

## Capabilities (feature-gating)
| GET | `/api/submissions/capabilities?environment=` | → `CapabilitiesResponse` | which gateways are configured + which workspaces are server-ready; UI disables/empties screens accordingly. `features.{assemble,deviceTechnicalFile,pathwayManifest}` are `true` (assemble bytes landed); `publishTransmit:false` by design (wire transmit is an e-signature gate, not a missing feature). |

Workspace map + error catalog for nav/error handling: `shared/types/submission-ui.ts`
(`SUBMISSION_WORKSPACES`, `SUBMISSION_ERROR_CODES`, `submissionErrorMessage()`).

## Pathway readiness (non-eCTD projections — Cross-Region / Dispatch)
| GET | `/api/submissions/sequences/:seqId/pathway-readiness?pathway=&memberStates=` | → `PathwayReadinessResponse` | projects the sequence's canonical leaves onto CTIS \| MDR \| IVDR \| eSTAR (510k/de_novo) and returns a required-slot gap/readiness report. Deterministic, map+gap only — never submits. `memberStates` (comma list) applies to CTIS Part II. |
| GET | `/api/submissions/sequences/:seqId/pathway-manifest?pathway=&memberStates=` | → `PathwayManifestResponse` | Universal assembled table-of-contents for ANY non-eCTD pathway (eSTAR 510k/de_novo \| CTIS \| MDR \| IVDR \| PMDA Shōnin): uniform ordered entries with group label (annex / eSTAR / CTIS part+state / STED), deterministic paths, present/missing status, and source leaves. Maps + reports gaps, never invents. |
| GET | `/api/submissions/sequences/:seqId/technical-file?regulation=mdr\|ivdr` | → `TechnicalFileResponse` | The device assemble structure (mdx/ivd): the assembled EU MDR/IVDR Annex II/III technical-file table-of-contents — ordered sections with deterministic paths, annex refs, present/missing status, and source leaves. The device equivalent of the eCTD index. Maps + reports gaps, never invents. |

## Assemble (Publish step — Dispatch workspace)
| POST | `/api/submissions/sequences/:seqId/assemble` | `AssembleRequest` → `AssembleResponse` | Drives the real eCTD publisher off the sequence's canonical leaves (backbone + MD5 + regional m1 + md5.txt), rendering each leaf to a genuine PDF. Returns a sanitized package descriptor (sha256/format/size). **Does NOT transmit** — submit/transmit stays behind the governed `transmit_submission` tool + Part 11 e-sign. Faithful text PDF rendering; PDF/A-1b conformance is a separate gap. |
| POST | `/api/submissions/sequences/:seqId/technical-file/assemble` | `TechnicalFileAssembleRequest` → `TechnicalFileAssembleResponse` | The DEVICE assemble (mdx/ivd): materializes the MDR/IVDR technical file into a real ZIP — Annex II/III folder tree + `manifest.json` table-of-contents + MD5 checksum index, each leaf rendered to a genuine PDF. Returns a sanitized descriptor (sha256/size/fileCount/ready/skipped). **Does NOT transmit.** |

## Dispatch readiness + governed SUBMIT (assemble→validate→submit)
| GET | `/api/submissions/sequences/:seqId/dispatch-readiness` | → `DispatchReadinessResponse` | **Deterministic, server-computed** hard-gate verdict. Computes `validationErrors` from the canonical leaves (empty sequence / unresolvable doc refs / invalid lifecycle op are hard errors; missing-required-section is a non-blocking warning) and counts open critical Shadow Review findings from the DB, then runs the dispatch gate. Tamper-proof counterpart to the AI `dispatch-qc` advisory. Read-only — never transmits. |
| POST | `/api/submissions/sequences/:seqId/freeze` | `GovernedTransitionRequest` → `EctdSequence` | The SUBMIT step. Two-step governed: first `POST /api/c2c/actions/sign` with target `ectd-sequence:<seqId>` (re-auth + separation-of-duties + Part 11 ledger), then pass the returned `signatureActionId` here. The service verifies the e-signature AND a clear dispatch gate **atomically** before applying `validated→frozen` (stamps `frozenAt`). Blocked gate → `422 DISPATCH_BLOCKED`; missing/invalid signature → `403 GOVERNED_REQUIRED`. |
| POST | `/api/submissions/sequences/:seqId/dispatch` | `GovernedTransitionRequest` → `EctdSequence` | Same governance as freeze, applying `frozen→dispatched` (sets `dispatchStatus='pending'`). Records dispatch intent. |
| POST | `/api/submissions/sequences/:seqId/transmit` | `TransmitRequest` → `TransmitResponse` | The final step. Requires the sequence be `dispatched` + a Part 11 e-signature on `ectd-sequence:<seqId>` + a clear dispatch gate (defense in depth). Assembles the package bytes, selects the regional gateway (`fda→esg`, `eu→cesp`, `jp→pmda_gateway`) and transmits via the real transport (AS2 / OAuth2 / mTLS+HMAC); the gateway persists `submission_transmittals`. **Honest:** transmits only when the org has gateway credentials for the chosen `environment` — otherwise `{ transmitted:false, reason:"gateway_not_configured" }`. Maps the gateway status onto `dispatchStatus`. |
