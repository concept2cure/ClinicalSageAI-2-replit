# HI-8 — eCTD generation scoping brief

**Date:** 2026-05-29
**Author:** audit remediation (follow-on to FORENSIC_CODE_AUDIT_2026-05-29.md)
**Status:** scoping only — no code change proposed here. Approve a direction before any build.
**Method:** direct file reads + reachability tracing. Comments and the prior audit's HI-8 claim were re-verified against source, not trusted.

---

## Progress (2026-05-29)

Landed on `concept2cure-v2` (canonical generator `ectdExportService.ts`, the one wired to `POST /api/ectd/export`):
- **Version consistency** — `index.xml` was internally mixed (3.2 DTD + `dtd-version="4.0"`, DOCTYPE missing the `util/dtd/` path). Now consistently **v3.2.2**.
- **Region fail-closed** — non-FDA/EMA regions (incl. Health Canada) silently produced a **PMDA/`jp`** regional backbone. Regions now resolve from an explicit `ECTD_REGIONS` map and **throw** on unsupported regions instead of mislabeling a submission.
- **G1 DTD self-containment** — added `bundleVendoredDtds()` (bundles `assets/ectd-dtd/*.dtd` → `util/dtd/` at export) + a documented drop-point (`assets/ectd-dtd/README.md`) + a `validateEctdPackage` warning when DTDs aren't bundled. DTDs are licensed and unreachable from CI (ich.org → 403), so the mechanism is built and **enforced**; the team drops in the licensed files to close G1 fully — no further code change.

**Refined finding on Q1 (canonical generator):** direct reads show `ectdExportService.ts` (live route, DB-hydrated) is actually **lower-fidelity** than `submission-gateways/regional-packager.ts` (which has correct regional DTDs, hl7 namespaces, per-leaf MD5 index, all-region backbones). The right consolidation is to **adopt regional-packager's backbone fidelity inside the live ectdExportService flow**, not to pick one wholesale. Still a team workstream (needs full integration + eValidator).

Still gated externally: real DTD files (procurement), an external eValidator dry-run (Phase E), and real PDF/A leaf rendering (G4). Health Canada generation (ca-regional) remains unbuilt — now fails closed rather than mislabeling.

---

## 0. Headline — the audit's HI-8 finding was overstated

FORENSIC_CODE_AUDIT_2026-05-29.md HI-8 states: *"No real eCTD anywhere — grep for `index.xml|md5|regional|dtd|backbone|leaf` across generators returns nothing."* **That is false for the TypeScript layer.** The audit's grep evidently covered only the Python `services/` stack. The repo contains **three** real, structured eCTD backbone generators in TypeScript:

| Generator | Evidence it is real | Reachable from |
|---|---|---|
| `server/services/ectdExportService.ts` | `generateEctdPackage()` builds a zip with `index.xml` (root ICH M8 backbone), `m1/{us,eu,jp}-regional.xml`, per-module manifests, `util/stf.xml` submission-tracking file, MD5 per leaf, m1–m5 folder hierarchy; content hydrated from DB (`ectdModules`/`ectdGranules`/`document_versions`). Records to `ectd_compilations`. | `POST /api/ectd/export/:submissionId` (`routes/ectd-export.ts`) — **LIVE**; also `pdev-ectd-compile.ts`, `audit-services.ts` |
| `server/services/submission-gateways/regional-packager.ts` | `buildFdaBackbone`/`buildEmaBackbone`/`buildPmdaBackbone` emit `us/eu/jp-regional.xml` with correct DTD DOCTYPEs, hl7 namespaces, application/sequence/submission blocks; `buildIndexXml` groups m2–m5 leaves with `operation` attrs; `buildMd5Index` writes sorted `util/index-md5.txt`. | `submission-gateways/index.ts`, `ana/AnaToolExecutor.ts` — **LIVE** |
| `server/src/services/reg/{indexXml,packager}.ts` | `buildIndexXml()` queries `reg_sequence_files`, computes `crypto md5` per leaf, emits `ectd:leaf` with `@operation`/`@checksum`/`@href` under `urn:hl7-org:ectd`; `packageSequenceZip()` archives + persists checksums. | **Reachability unconfirmed** — `packageSequenceZip` has no caller found in `server/`. Possibly orphaned. |

Plus a real validation layer: `ectd/ectd4-validator.ts` (section completeness, 2-6-2 filenames, MD5 length, lifecycle ops, duplicates), `ectd/ectd-regional-rules.ts` (FDA ESG 4 GB / EMA CESP 600 MB / PMDA 1 GB limits, app-number formats, regional-XML presence), `ectd/ectd-validator-hardening.ts`.

**What the audit got right:** the Python eCTD stack *is* dead. `server/startup/services.ts` `startPythonBackend()` is a no-op (`return Promise.resolve(null)`); `services/ectd_generator.py` only emits a single Module-2.7.3 DOCX and has no Node caller. That stack should be deleted, not wired.

**Net:** this is not a from-scratch build. It is a **consolidate-and-finish** job on a substantially-real capability. The honest readiness estimate is roughly **60–75% of an agency-submittable generator**, with a small number of concrete, nameable gaps.

---

## 1. The real gaps to an agency-acceptable sequence

Each is evidence-backed and independently closable.

**G1 — DTDs are referenced but never bundled. (BLOCKER)**
Every backbone declares e.g. `<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">`, but **no `.dtd` file exists anywhere in the repo** (`find -iname '*.dtd'` → empty) and **no generator writes `util/dtd/` into the package**. Result: every package points at DTDs that aren't there, so it is not self-contained and will fail DTD-based validation. This is the highest-priority, lowest-ambiguity fix.

**G2 — Three parallel generators with divergent conventions.**
`ectdExportService.ts` puts regional XML at `m1/us-regional.xml`; `regional-packager.ts` puts it at `m1/us/…` with DTD path `../util/dtd/`. They disagree on folder layout and DTD relative paths — at most one can be spec-correct. Having three live paths means three places to keep correct and three chances to diverge from spec. Consolidate to one canonical generator.

**G3 — No external validator dry-run.**
The internal validators are good but self-referential. Nothing runs the output through FDA eValidator / Lorenz eValidator / the EU eValidator. Until a generated package passes a real validator, "compliant" is asserted, not proven.

**G4 — Leaf content is placeholder, not submission-grade.**
`reg/indexXml.ts` stages leaves as `.txt`; `ectdExportService.ts` falls back to structured "PENDING" text for missing authoring content. Agency submissions require finalized **PDF/A-1b** (or granted formats). The DOCX/PDF runtime exists in the repo (`workers/artifact-compute`) and is credited as real by the audit — it needs wiring into the leaf-rendering step.

**G5 — STF is generated but not cross-linked.**
`util/stf.xml` is written, but per the FDA STF spec it must tag the specific M4/M5 study leaves. Currently it is an envelope only.

**G6 — Possibly-orphaned third path.**
`server/src/services/reg/packager.ts` has no found caller. Either wire it intentionally or delete it — a dead third generator is debt.

**G7 — Dead Python stack.**
Delete `services/ectd_generator.py`, the orphaned Celery/FastAPI files, and the `startPythonBackend` no-op (or the whole `startup/services.ts` Python branch). None of it is reachable; its presence implies a capability that does not run.

---

## 2. Recommended direction

1. **Pick one canonical generator.** Recommend `ectdExportService.ts` — highest fidelity, DB-backed, already wired to the live `/api/ectd/export` route and to PDEV. Fold `regional-packager.ts`'s region-specific backbones into it as the regional-XML strategy; retire `reg/packager.ts` if G6 confirms it's orphaned.
2. **Make packages self-contained (G1).** Vendor the ICH eCTD 3.2.2 DTD set + FDA/EMA/PMDA regional DTDs into `util/dtd/` source assets and write them into every generated zip. (ICH DTDs are publicly redistributable; confirm per-agency regional DTD redistribution terms — see open questions.)
3. **Render real PDF/A leaves (G4).** Wire the existing artifact-compute runtime so leaves are finalized PDF/A, not `.txt`/PENDING.
4. **Add an eValidator gate (G3).** A pre-submission/CI step that runs the package through an external validator and fails closed on errors. This is the objective proof of acceptability.
5. **Cross-link STF (G5)** and **delete the dead Python stack (G7).**

---

## 3. Phased plan (suggested order; each independently shippable)

| Phase | Scope | Risk | Notes |
|---|---|---|---|
| **A** | Delete dead Python eCTD stack (G7) + retire/wire `reg/packager` (G6) | Low | Mostly deletion + routing; clears the "implied but dead" capability the audit flagged |
| **B** | Bundle DTDs into the package (G1) | Low–Med | The single biggest acceptability win; no schema change |
| **C** | Consolidate to one canonical generator (G2) | Med | Behavioral; needs golden-package regression tests before/after |
| **D** | Real PDF/A leaf rendering (G4) | Med–High | Depends on authoring content being finalized; wires existing runtime |
| **E** | External eValidator dry-run gate (G3) + STF cross-linking (G5) | Med | Turns "asserted compliant" into "validated compliant" |
| **(F)** | Real ESG transport (AS2/SFTP) | High | **Separate from generation** — this is CR-1's residual; generation can be GA-validated while transmission stays manual |

A defensible GA bar for *generation* is **Phases A–C + E** (self-contained, single-source, externally validated). D can trail if content finalization is gated elsewhere. F (transmission) is a distinct workstream.

---

## 4. Resolved decisions (2026-05-29)

**Q2 — eCTD version: target v3.2.2. RESOLVED.** Investigation showed there was never a deliberate two-standard design:

- **There is effectively one live generation standard already — v3.2.2 XML.** `ectdExportService.ts` + `submission-gateways/regional-packager.ts` produce 3.2.2 backbones (`<!DOCTYPE ... ich-ectd-3-2.dtd>`, `dtd-version="3.2"`).
- **The "v4.0" is mostly a misnomer + dead code.** `server/services/ectd/ectd4-validator.ts` is named "ectd4" but its *validation* functions (`validatePackage`, `validateFilename`, `computeChecksum`) are reused generically as the structural validator — they're re-exported by `ectd-validator-hardening.ts` (`validatePackage as validateStructural`) and reach the submission orchestrator. Only its **v4.0-specific `generateBackbone` (JSON M8) is genuinely v4.0 — and it has zero callers anywhere** (grep: defined at `:347`, never invoked). The `dtd-version="4.0"` strings elsewhere are on the **STF** (submission-tracking file uses its own versioning) and in comments, not a v4.0 package generator.
- **A fourth path, `server/src/services/reg/{indexXml,packager}.ts` + `src/services/ectd.ts`, appears orphaned** (no route wiring found).
- **Why two seemed to exist:** every eCTD file landed in a single omnibus commit (`eb1751d`, 2026-05-25, message "Add real DB-backed adapter methods…" — which also dropped the ectd_coauthor UI kits and agent files). It bulk-authored overlapping implementations (two live 3.2.2 generators + a v4.0 validator/backbone + an orphaned reg path) without consolidating them. No one chose a dual standard; a batch drop left duplicates.
- **Why v3.2.2 is correct for GA:** it is the standard FDA, EMA, PMDA, and Health Canada all accept today. eCTD v4.0 (HL7 RPS) is voluntary/limited (FDA accepts it optionally; EMA in transition; not mandated by PMDA/HC). v4.0 is a roadmap item, not a GA requirement.
- **Action implied:** target v3.2.2 as the one; **delete the dead `generateBackbone` (v4.0 JSON)**; **rename `ectd4-validator.ts` → structural-validator** (or similar) to remove the misleading "4"; **delete or wire** the orphaned `src/services/ectd.ts` + `reg/` path; then consolidate the two live 3.2.2 generators (G2).

**Q3 — Regions in GA scope: FDA + EMA + PMDA + Health Canada (all four). RESOLVED.** This scales B (four DTD sets to vendor), C (four regional backbones to keep correct), and E (four validators / regional rule sets). HC is currently the least-developed in code (rules referenced in `ectd-regional-rules.ts`, but no `ca-regional.xml` generator yet) — it needs a `buildHcBackbone` added to whichever generator becomes canonical.

## 5. Still-open questions (need a decision before building)

1. **Canonical generator:** confirm `ectdExportService.ts` as the one (recommended — highest fidelity, DB-backed, wired to the live route), or `regional-packager.ts` for its cleaner per-region backbones? (They must merge; pick the base.)
2. **DTD vendoring:** OK to commit agency DTD files into the repo (subject to redistribution terms), or must they be fetched at build time?
3. **Transmission scope:** is "generate an externally-validated package, transmit manually" acceptable for GA, deferring real ESG (Phase F / CR-1)? Or is automated transmission a GA requirement?

---

*No files were modified to produce this brief. It supersedes the "no real eCTD anywhere" framing in FORENSIC_CODE_AUDIT_2026-05-29.md HI-8 (see the correction note added there).*
