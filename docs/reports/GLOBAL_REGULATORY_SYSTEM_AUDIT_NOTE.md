# Global Regulatory Document System — Audit Note

**Date:** 2026-03-27

---

## What Was Hardcoded Before

| Area | Hardcoded Pattern | Location |
|------|------------------|----------|
| Submission types | Enum: '510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA', 'IVDR' | ZenSidebar SUBMISSION_BADGE, FirstRunExperience types, project model |
| Project bootstrap | switch/if-else on submissionType to choose sections | ProjectWorkspaceShell, DossierMap DEFAULT_CTD_STRUCTURE |
| Templates | 3 hardcoded: CER, 510(k), CSR | templateRegistry.ts (cerTemplate, fda510kTemplate, csrTemplate) |
| Milestones/tasks | Fixed set per submission type | INDChecklist, CSRWorkflow components |
| Region logic | Fragmented across routes and services | regional-ctd-templates.ts, ind-ectd-sections.ts |
| Readiness validation | Hardcoded completeness engine | validate-completeness-engine.ts |
| DossierMap sections | Static DEFAULT_CTD_STRUCTURE fallback | DossierMap.tsx lines 31-80 |
| SectionWorkspace lookup | Hardcoded SECTION_LOOKUP with static status values | ZenApp.tsx lines 3009-3170 |
| Onboarding types | Fixed arrays: PHARMA_TYPES, DEVICE_TYPES | FirstRunExperience.tsx |
| AnA IND context | IND-only section list in system prompt | chat.ts IND context block |

## What Is Registry-Driven Now

| Area | Registry-Driven Pattern | Location |
|------|------------------------|----------|
| Application types | 70+ entries across 12 regions, 12 agencies | shared/regulatory/global-document-registry.ts |
| Type taxonomy | Typed: Region, Agency, ApplicationFamily, ProductClass, DossierStandard, LifecycleStage | shared/regulatory/document-taxonomy.ts |
| Region profiles | 12 profiles with agency details, currency, language, dossier standards | shared/regulatory/region-profiles.ts |
| Project bootstrap | bootstrapProject(entry) → sections + milestones + requiredArtifacts | shared/regulatory/project-bootstrap.ts |
| Section blueprints | CTD, Device, CER blueprints selected by registry entry | shared/regulatory/project-bootstrap.ts |
| Task blueprints | Milestones selected by registry entry | shared/regulatory/project-bootstrap.ts |
| Readiness matrix | assessReadiness(blueprint, artifacts) — registry-driven | shared/regulatory/readiness-matrix.ts |
| Backward compat | LEGACY_TO_REGISTRY_ID maps old types to new | shared/regulatory/document-taxonomy.ts |
| Project metadata | enrichProjectMetadata() adds .regulatory without migration | shared/regulatory/project-model-integration.ts |
| API | 5 endpoints: registry, regions, search, resolve, by-id | server/routes/regulatory-registry.ts |
| UI picker | ApplicationTypePicker: Region → Type → Summary | ApplicationTypePicker.tsx |

## Coverage

| Region | Country | Agency | Application Types |
|--------|---------|--------|-------------------|
| US | United States | FDA | 14 (IND, NDA, BLA, ANDA, 505(b)(2), DMF, Pre-IND, supplements, 510(k), PMA, De Novo, EUA) |
| EU | European Union | EMA | 13 (CTA, MAA, ASMF, Type IA/IB/II variations, PIP, orphan, RMP, PSUR, renewal, CER, IVDR) |
| UK | United Kingdom | MHRA | 4 (CTA, UK MA, IRP, variations) |
| CA | Canada | Health Canada | 7 (CTA, CTA-A, NDS, SNDS, ANDS, SANDS, MF) |
| JP | Japan | PMDA | 5 (CTN, marketing approval, MF, partial/minor changes) |
| CN | China | NMPA | 4 (CTA, MAA, supplementary, renewal) |
| AU | Australia | TGA | 4 (CTN, CTA, Category 1/2) |
| CH | Switzerland | Swissmedic | 2 (CTA, MA) |
| BR | Brazil | ANVISA | 3 (DDCM, DEEC, MA) |
| IN | India | CDSCO | 7 (CT-04, CT-06, CT-07, CT-11, CT-18, CT-19, CT-21) |
| KR | South Korea | MFDS | 3 (IND, new drug MA, generic MA) |
| SG | Singapore | HSA | 2 (NDA, GDA) |

**Total: 68 application types across 12 regions and 12 agencies.**

## What Still Works (Backward Compatibility)

- Existing projects load unchanged (no migration needed)
- Old submissionType values ('510K', 'IND', etc.) resolve to registry entries
- Existing 510(k), IND, BLA, MAA, PMA flows still function
- Provenance, signatures, review, and work items untouched
- Governed artifact workflow intact
