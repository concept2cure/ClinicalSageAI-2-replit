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
`trace_provenance`, `check_consistency`. The UI's AnA panel passes page context
(`{ submissionId, sectionCode, region }`); the tools supply nothing tenant-related.

## Still server-side TODO before some screens are fully live
- **Dispatch transmit + Publish**: `packageSequenceFromCore` (core→publisher
  bridge) needs a storage `resolveFile` and a route; transmit stays behind the
  e-sign gate.
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
| GET | `/api/submissions/capabilities?environment=` | → `CapabilitiesResponse` | which gateways are configured + which workspaces are server-ready; UI disables/empties screens accordingly. `publishTransmit: false` until the storage resolver lands. |

Workspace map + error catalog for nav/error handling: `shared/types/submission-ui.ts`
(`SUBMISSION_WORKSPACES`, `SUBMISSION_ERROR_CODES`, `submissionErrorMessage()`).

## Pathway readiness (non-eCTD projections — Cross-Region / Dispatch)
| GET | `/api/submissions/sequences/:seqId/pathway-readiness?pathway=&memberStates=` | → `PathwayReadinessResponse` | projects the sequence's canonical leaves onto CTIS \| MDR \| IVDR \| eSTAR (510k/de_novo) and returns a required-slot gap/readiness report. Deterministic, map+gap only — never submits. `memberStates` (comma list) applies to CTIS Part II. |

## Assemble (Publish step — Dispatch workspace)
| POST | `/api/submissions/sequences/:seqId/assemble` | `AssembleRequest` → `AssembleResponse` | Drives the real eCTD publisher off the sequence's canonical leaves (backbone + MD5 + regional m1 + md5.txt). Returns a sanitized package descriptor (sha256/format/size). **Does NOT transmit** — submit/transmit stays behind the governed `transmit_submission` tool + Part 11 e-sign. Content is materialized as-is; PDF/A normalization is a separate gap. |
