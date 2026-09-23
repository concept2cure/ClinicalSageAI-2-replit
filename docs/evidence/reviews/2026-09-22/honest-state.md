# Honest-state lens: launch catalog, 2026-09-22

Auditor: `honest-state-auditor`, read-only. Its report is condensed here with every
finding and file:line kept. Surface resolution was checked against
`client/src/concept2cure/v2/surfaceViews.ts`. See the scope correction in `README.md`.

## Method

- Read every launch surface's fetch and render logic end to end: success and
  catch branches, empty-vs-unassessed logic, fixture imports.
- `npm run ci:internals-in-copy`: clean, 0 baselined.
- `npm run check:microcopy`: clean, 378 files.
- `client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx`, run with
  `PROBE_ONLY` limited to the 23 launch surface ids: **24/24 passed**. TaskBoard
  registers under two ids. The probe mounts each surface against seven hostile
  payload shapes and fails on any throw.

## Findings by app

| App | Critical | High | Medium | Low |
|---|---|---|---|---|
| Projects (incl. Tasks → `TaskBoard.tsx`) | 0 | 0 | 0 | 0 |
| Vault (`v2/surfaces/Vault.tsx`, `ArtifactsCenter`) | 0 | 0 | 0 | 0 |
| Authoring | 0 | 0 | 0 | 0 |
| Submission Center | 0 | 0 | 0 | 0 |
| Submission Readiness | 0 | 0 | 0 | 0 |
| QMS | 0 | 0 | 0 | 0 |
| *Adjacent: MDX `VaultSurface.tsx` (`device-vault`, not in `LAUNCH_APPS`)* | *1* | 0 | 0 | 0 |

### Adjacent finding: outside the launch catalog, same defect class

**`client/src/concept2cure/mdx/surfaces/VaultSurface.tsx:363-381`: fabricated audit
rows.** When a document is selected, the drawer always renders a
"Recent audit · sample" block of three hardcoded rows (`A-9924812`, `A-9924809`,
`A-9924801`). Two of those rows splice the real `sel.author` and `sel.updated` in
beside invented entries ("SHA-256 verified · system · 2m ago", "Uploaded · … · 6d
ago"). Every document gets the same entries on every render. The block is not
gated by the page's own `useSampleRows` boundary (`:117-120`), and it is not
disabled in production. The page subtitle promises a "21 CFR Part 11 audit trail
· SHA-256 chained". Only a small "· sample" suffix in the section header discloses
it. Re-verified by the control tower at `:367-379`. The comment above it
(`:362-365`) calls the rows "kit sample copy until the per-artifact audit endpoint
ships". The auditor rated this critical. The control tower rates it **high**: it
is disclosed in the header, but it is ungated in production and puts real
author/date values into invented rows. The surface is reachable only via
`device-vault`, which is outside `LAUNCH_APPS`, so it does not count against D2.
The device stream is paused under RULE 2, so this is recorded here rather than
fixed.

## Evidence that the launch surfaces pass

- **No fixture reachable as live.** The ledger-L44 `useLive`/`<SampleTag>` API is
  gone from `v2/dataConnect.tsx`. `<SampleTag` now appears only in comments and in
  `*NoFixtures.test.tsx` assertions. Launch surfaces use `useLiveData` /
  `useLiveRows` / `liveGetOrNull`, which have no fixture argument, or
  `useSampleRows`, which is gated by `sampleModeAvailable()`
  (`client/src/concept2cure/mdx/lib/sampleMode.ts:35-41`, hard `false` when
  `import.meta.env.PROD`).
- **Projects.**
  - `Projects.tsx:924-935`: KPIs render `'—'` on `loading || error` rather than
    dividing by `projects.length || 1`.
  - `ProjectHome.tsx:145-171`: the `Anchored<T>` wrapper orders every panel
    loading → error → empty → real.
  - `BiopharmaJourney.tsx:339-340,451-452`: `typeof rec.readiness === 'number'`,
    so a genuine 0% renders.
  - `TaskBoard.tsx:706`: `critDesignated` stops "critical path is clear" from
    being shown over zero designated tasks.
- **Vault.**
  - `v2/surfaces/Vault.tsx:1068-1123`: `pendingStore` distinguishes "no store
    provisioned" from "nothing filed yet".
  - `:543-631`: never claims "Recorded in the audit trail" on a refused write.
  - `ArtifactsCenter` (`AdminSurfaces.tsx:2346-2357,2452`) publishes a read
    failure as a failure and disables export on empty or error.
- **Authoring.**
  - `DocumentAuthoring.tsx:61-90`: `docsState` is tracked separately from the
    `docs` array.
  - `Review.tsx:546-576`: `boardRead = Array.isArray(board?.queue)` separates
    "unread" from "read, empty".
  - `ProtocolDev.tsx:50-125`: `loading && !doc` / `error && !doc` are checked
    ahead of `!doc`.
- **Submission Center.**
  - `EctdCompile.tsx:356-360,821`: `validationFailed` stops "No findings" being
    shown over an errored POST ("This is NOT a clean result").
  - `GatewayTransmittals.tsx:325-346`: platform records download as
    `…-NOT-AN-AGENCY-ACK.txt`.
- **Submission Readiness.**
  - `DispatchReadiness.tsx:229-355`: consumes the server's gate verbatim.
    `gateState` distinguishes evaluating / error / no-program / no-submission /
    no-sequence / evaluated.
  - `Orchestration.tsx:909-947`: separate copy for not-assessed and
    assessed-clear.
  - `Inconsistency.tsx:313`: `neverScanned` comes from positive evidence.
- **QMS.**
  - `ChangeControl.tsx:162-175`: a null summary renders "unavailable", never zeros.
  - `QmpWorkspace.tsx:89-98`: the full response shape is required before render.

Note on the Part 11 lens: one attribution defect it found, `Inconsistency.tsx:269`
(`resolvedBy: 'AnA + you'`), is an honest-state failure as well. The honest-state
pass did not flag it because the surface discloses on screen that the write is not
wired (`:784`). It is counted once, under Part 11.
