# Design request — submission transmit surface

> **To:** Claude design (this design system — `CLAUDE.md`, `HANDOFF.md`, `ui_kits/`)
> **From:** Claude Code (implementation)
> **Status:** backend ready / **UI not designed — this surface is yours**
> **Why this doc:** the transmit action initiates an **irreversible** submission to a real agency gateway (FDA ESG, EMA CESP, EUDAMED, PMDA). Per the no-invent rule, implementation will not build this affordance until it ships in `ui_kits/`. This brief is the request.

---

## 1 · What exists now (so you know what you are designing against)

The agency-transmission layer is fully wired on the server. The **only** missing piece is the UI trigger.

- **Server-side governance: complete** (merged, PR #623). `transmit` is a high-risk governed action — it requires a reason-for-change and re-authentication (password + TOTP), and writes a Part 11 signature record to the mutation-primitives ledger (`audit_logs` + `c2c_ana_actions`, sha256-chained).
- **Bundle pipeline: built** (branch `claude/transmit-pipeline`). A package's eCTD bundle is now assembled from its sections, persisted to storage, hashed (bundle-level sha256), and bound to the package. `transmit` consumes that stored bundle.
- **Built submission surfaces today** (`client/src/concept2cure/submission/surfaces/`): `Overview`, `Transmittals`, `Validation`. These are **read** surfaces (transmittal list, ACK chains, pre-flight findings). There is **no** "transmit now" affordance, and `submission/App.tsx` notes plainly: *"no kit."*

## 2 · The data contract you can rely on

> Exact endpoint names/shapes are verified against the pipeline branch (`claude/transmit-pipeline`, see §6); the shape below is the contract.

1. **Assemble** — `POST /api/submission-ops/packages/:packageId/assemble`
   Produces and persists the eCTD bundle for a **locked** (published) package; returns a descriptor: `{ path, sha256, sizeBytes, format, leafCount, assembledAt }` (stored on the package at `metadata.bundle`). Body is all-optional: `{ region?, format?, sequence?, reason? }` — region/format are derived from the package family if omitted. Idempotent (re-assembling overwrites). 409 if the package is not locked.
2. **Pre-flight / validation** — existing `Validation` surface + `GET .../gateways/transmittals/:id/findings`-style data. Pre-flight findings should gate transmit in the UI (no transmit with open critical/high findings).
3. **Transmit** — `POST /api/mdx/gateways/:region/:gateway/transmit`
   When a `packageId` with a stored bundle is supplied, the UI does **not** assemble the bundle itself — the server uses the stored descriptor. The UI supplies: `region`, `gateway`, `environment` ('staging' | 'production'), `submissionType`, `reason` (required), and `reauth` (password, optional TOTP). Returns the transmittal record (transaction id, status).
4. **Status / ACK** — existing `GET .../gateways/transmittals/:id/status` and `.../ack`.

## 2b · Backend limitations you must design around (important)

The pipeline is real but **not yet production-grade eCTD packaging**. This changes what the UI may safely allow:

- **Leaves are now real PDFs at ICH module paths.** Each section is rendered to a PDF via pdfkit and placed at an ICH module path via `mapSectionToECTDPath` (e.g. `m2/2-3.pdf`, `m1/<region>/..`); empty sections become PDFs whose body is an explicit `[EMPTY SECTION]` marker (no fabricated content). Remaining caveats keep this short of agency-grade: **(a)** the section→module mapping is heuristic — derived from a `moduleN` prefix (`module3_cmc` → m3), an ICH-numeric leading digit (`2.3` → m2), or content keywords (`labeling` → m1, `cmc` → m3, `clinical` → m5); keys matching none default to m1 (regional), so unusual keys can still be misplaced; **(b)** the PDFs are basic pdfkit renders with no eCTD technical-conformance validation, hyperlinks, or bookmarks. **A production transmit would still likely be rejected on technical validation.**
- **Storage is local-first, optionally durable.** The bundle is always written to local disk (`SUBMISSION_BUNDLE_DIR` or `uploads/submission-bundles`), and is now *optionally* persisted to durable S3 storage when `SUBMISSION_BUNDLE_S3_BUCKET` is set (env-gated; falls back to local-only on any upload failure, so a durable-archive failure never fails assembly). When a durable copy exists, transmit rematerializes the local file from S3 if a container recycle lost it — so the bundle survives multi-node/serverless deploys. With the env unset (default), behavior is unchanged local-disk.
- **The bundle is now run through an internal eCTD structural validator at assemble.** Findings (media-type, PDF magic-byte, empty-section, module-1-presence, bundle-empty checks) are stored on the bundle descriptor (`metadata.bundle.validation` — `errorCount`/`warningCount`/`infoCount`/`findings`) and the counts are returned in the assemble response for pre-flight display. Transmit **hard-blocks** (422, with findings) when any error-severity finding exists; warnings inform but do not block. **This is INTERNAL structural validation only — it is NOT the agency validators (FDA eValidator / EMA / PMDA).** It is necessary-but-not-sufficient: passing it does not mean a real agency submission would pass technical conformance.

**Design implication:** treat **staging** as the only honest destination today. Even with real PDFs at ICH module paths, optional durable storage, and internal structural validation, the bundle still lacks *agency* eCTD technical-conformance validation, so production transmit should remain visibly gated/disabled — the surface can present production as "not yet available" rather than a live, dangerous button.

## 3 · The flow to design

A linear, high-friction path. Each step is a gate:

1. **Pick a package** — only `locked`/published packages are transmittable.
2. **Bundle review** — show the assembled bundle descriptor: format, size, leaf count, sha256 (truncated, copyable), assembled-at. Offer "re-assemble" if stale.
3. **Pre-flight** — surface validation/pre-flight findings; **block** transmit while critical/high findings are open (numbers, not adjectives).
4. **Destination** — region + gateway + **environment selector**. See §4 — production is the dangerous one.
5. **Sign and transmit** — `EsignModal` (the shared Part 11 modal already used by spec approval and batch release): meaning = submission, **reason required**, **re-auth required**. On confirm → transmit.
6. **Result** — land on the transmittal's status/ACK view.

## 4 · Hard safety constraints (non-negotiable for this surface)

Transmit is **irreversible** and outward-facing to a regulator. The UI must make a production send hard to do by accident:

- **Environment is an explicit, deliberate choice.** Default to `staging`. `production` should require a distinct, unmistakable confirmation — this is sending to the FDA/EMA/PMDA for real — and per §2b should be **disabled** until real PDF packaging ships.
- **No one-click transmit.** The e-sign step (reason + re-auth) is mandatory and already enforced server-side; the UI must not imply success before the server returns.
- **Show exactly what is being sent** (the bundle sha256 + size) and **where** (region/gateway/environment) on the confirmation step. The signer is attesting to that specific bundle.
- **Pre-flight findings gate the action**, not just inform it.
- Respect the system non-negotiables (`README.md`): sentence case, no emoji, no exclamation marks, Claude orange as the single focal point used sparingly, 200ms ease-out, Lucide icons, second person, numbers over adjectives.

## 5 · Open questions for you

1. **Where does the trigger live** — a new step on the existing `Transmittals`/`Overview` surface, or a dedicated transmit surface in the submission workstream?
2. **Staging vs production** — do we ship staging-only first (lower risk) and gate production behind a later release, or design both now with production behind an extra confirmation?
3. **Bundle review depth** — is the descriptor (format/size/sha256/leaf count) enough, or do you want a leaf/section preview before signing?
4. **Re-assemble UX** — when is a bundle considered stale, and how prominent is re-assemble?

## 6 · Pointers

- Server contract: `server/routes/mdx-submission-gateway.ts` (transmit), `server/routes/submission-ops.ts` (assemble), implemented on branch `claude/transmit-pipeline` (commit `48d2970`).
- Shared e-sign modal to reuse: `client/src/concept2cure/_shared/components/EsignModal.tsx`.
- Governance pattern already shipped on two surfaces to mirror: spec approval (`cmc/surfaces/Specifications.tsx`) and batch release (`cmc/surfaces/Batch.tsx`).

When this surface ships in `ui_kits/`, implementation will mirror it 1:1 — the backend is ready and waiting.
