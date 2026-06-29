# eCTD DTD Vendoring Runbook

Status: **Scaffolding in place; DTD files NOT vendored.**
Owner: Regulatory Operations (license/legal) + Platform (drop-in/CI).
Touched code: `server/services/ectd/dtd-bundler.ts`, `server/services/ectd/ectd-validator-hardening.ts`, `server/services/submission-gateways/regional-packager.ts`.
Path-to-GA reference: `docs/reports/PATH_TO_GA_2026-06-29.md` §C.8.

## What this runbook covers

The eCTD packager emits backbones whose DOCTYPE declarations reference five
DTD files (ICH backbone + four regional). Those DTDs are **licensed agency
artifacts**: they are not in this repository and the platform cannot
redistribute them publicly. A package generated today references DTDs it does
not contain, so it is not self-contained and external validators
(Lorenz / FDA eValidator) will refuse it.

This runbook is the **acquisition + drop-in procedure** to turn that state
green. It is a one-time (per spec-revision) workflow.

## Out of scope

- The structural fallback validator (`validateDtdConformance` in
  `ectd-validator-hardening.ts`) already runs in degraded mode without the
  DTDs. Flipping it to strict DTD-bound parsing happens in a follow-up after
  the DTDs land — do NOT bundle that change into the vendoring PR.
- DTD authoring or extension. Vendor the agency-published file unchanged.

## Required DTDs

The exact filenames are **load-bearing** — see `assets/ectd-dtd/README.md`
for the authoritative table including DOCTYPE references and source URLs.
Summary:

| File | Region | Source |
| --- | --- | --- |
| `ich-ectd-3-2.dtd` | ICH backbone | ICH eCTD Specification |
| `us-regional-v2-01.dtd` | FDA | FDA eCTD Technical Conformance Guide |
| `eu-regional.dtd` | EMA | EMA / HMA eSubmission portal |
| `jp-regional.dtd` | PMDA | PMDA eCTD notification |
| `ca-regional.dtd` | Health Canada | Health Canada eCTD guidance |

Cross-check the **mandated production version** on each agency's canonical
page before each acquisition cycle; do not vendor draft versions.

## Procedure

### Step 1 — Legal review (per DTD)

For every DTD listed above, open a legal review ticket capturing:

- Issuer (ICH, FDA, EMA, PMDA, HC).
- Stated license / redistribution terms (copy the verbatim notice from the
  agency download page).
- Whether bundling inside an outgoing submission to that agency is permitted
  (typically yes for the agency that issued it).
- Whether bundling inside cross-agency submissions or third-party tooling is
  permitted.
- Whether the DTD may be cached at customer sites (typically yes if not
  redistributed further).

Counsel signs off per DTD. **Do not proceed to step 2 until every DTD has a
sign-off.** A partial drop (e.g. ICH only) creates a misleading
"self-contained" signal for the regions whose DTDs are still missing.

Archive the sign-off packet outside this repository (legal sharepoint,
secrets manager, or equivalent), not in `assets/ectd-dtd/`.

### Step 2 — Acquire DTD files

For each approved DTD, download from the agency's canonical source listed in
`assets/ectd-dtd/README.md`. Verify:

- The file extension is `.dtd`.
- The header comment matches the agency's version banner (e.g. `<!-- ICH eCTD
  v3.2.2 -->`).
- The file is UTF-8 (or, where the agency uses another encoding, matches the
  agency's declared encoding).
- The SHA-256 matches the digest the agency publishes alongside the file (if
  any). Cross-check by downloading on a second network if no digest is
  published.

Do **not** open the DTD files in a tool that may auto-reformat them (LibreOffice,
some IDE auto-formatters). Treat them as byte-perfect artifacts.

### Step 3 — Drop into place

```
cp ich-ectd-3-2.dtd        assets/ectd-dtd/
cp us-regional-v2-01.dtd   assets/ectd-dtd/
cp eu-regional.dtd         assets/ectd-dtd/
cp jp-regional.dtd         assets/ectd-dtd/
cp ca-regional.dtd         assets/ectd-dtd/
```

Or, if the team policy is to keep licensed artifacts outside the working
tree, set `ECTD_DTD_DIR` to a directory the deploy can read (e.g.
`/etc/c2c/ectd-dtd/`). `resolveDtdDir()` in `dtd-bundler.ts` reads that
env var and falls back to `assets/ectd-dtd/`.

The `.gitignore` in `assets/ectd-dtd/` keeps `*.dtd` files out of the commit
even if you forget — they are local-only by policy.

### Step 4 — Update the checksum manifest

```
cd assets/ectd-dtd && sha256sum *.dtd
```

Paste the output into `assets/ectd-dtd/checksums.txt`, replacing the
`<sha256>` placeholders. Preserve the two-space separator (`sha256sum`'s
native format). Keep the comments at the top of the file intact.

### Step 5 — Run the integration tests

```
npm test -- ectd-validator-hardening
npm test -- dtd-bundler
```

The validator unit tests consume `assets/ectd-dtd/fixtures/index-valid.xml`
and `index-invalid.xml`. With the DTDs vendored, the readiness assertions in
`dtd-bundler.test.ts` should report `selfContained: true` for all four
regions, and the validator should accept the valid fixture with zero DTD
findings while still flagging every intentional violation in the invalid
fixture.

If any of these tests fail, **do not commit** — the most common causes are:

- A filename typo (e.g. `us-regional-v2-1.dtd` instead of `us-regional-v2-01.dtd`).
  The filenames in `dtd-bundler.ts` `REGIONAL_DTD` are case-sensitive on
  Linux; match them exactly.
- A copy-paste corruption (e.g. saving the DTD as UTF-8 with BOM when the
  agency ships it without one). Re-download from the canonical source.

### Step 6 — Run a packager smoke test against a real eValidator

For each region with a vendored DTD:

```
npm run ectd:package -- --region fda  --fixture sample/ind123456
npm run ectd:package -- --region ema  --fixture sample/eumarketing
npm run ectd:package -- --region pmda --fixture sample/jp-sample
npm run ectd:package -- --region ca   --fixture sample/hc-sample
```

(Use whichever sample submissions are wired in this repo at the time of the
drop.) Open the resulting zips and confirm `util/dtd/<name>.dtd` is present
inside each. Then submit each through an external validator
(Lorenz eValidator / FDA eValidator) — pre-transmission spec adherence is
the gate.

### Step 7 — Open the PR

The PR diff should contain:

- `assets/ectd-dtd/checksums.txt` — placeholders replaced with real digests.
- Any test snapshot updates produced by step 5.
- **Nothing else.** The `*.dtd` files themselves MUST NOT appear in the
  diff (the `.gitignore` in that directory enforces this; double-check
  `git status` shows them as ignored, not staged).

PR title: `chore(ectd): vendor agency DTDs and update checksum manifest`.

PR description must include:

- Confirmation that legal sign-off is archived (link to the sign-off packet
  location, NOT the packet itself).
- The spec versions vendored, per region.
- Output of `sha256sum assets/ectd-dtd/*.dtd` for reviewer cross-check
  against the manifest.
- Test run output from step 5.

### Step 8 — Post-merge follow-up

After the vendoring PR lands, schedule the **strict-mode flip** of
`validateDtdConformance` as a separate change:

- Swap the current regex-based structural check for a full DTD-bound parser
  (`libxmljs2` or equivalent) reading from `resolveDtdDir()`.
- Wire `ECTD_REQUIRE_DTD=true` into the production deploy environment.
- Add a CI step that re-runs `sha256sum *.dtd | diff - <(grep -v '^#' checksums.txt)`
  before any production packager run.

Keeping these two changes in separate PRs preserves a clean rollback point
if a vendored DTD turns out to be the wrong version.

## Rollback

If a vendored DTD turns out to be the wrong version after merge:

1. Remove the affected `.dtd` file from `assets/ectd-dtd/` (or
   `$ECTD_DTD_DIR`) on every deploy target.
2. Revert the corresponding line in `assets/ectd-dtd/checksums.txt`.
3. With `ECTD_REQUIRE_DTD=true`, production packager runs for the affected
   region will fail closed (`assessDtdReadiness` returns `cleared: false`),
   which is the intended safe state.
4. Restart the acquisition cycle from step 1 with the correct version.

## Common pitfalls

- **Filename drift.** The agency may publish updates under a new filename
  (e.g. `us-regional-v3-3.dtd`). Treat that as a code change too — update
  `REGIONAL_DTD` in `dtd-bundler.ts`, the DOCTYPE in
  `regional-packager.ts`'s region builder, and this runbook. Do NOT rename
  the file to match the old name; downstream validators read the DOCTYPE.
- **Mixed-version drops.** Don't ship FDA v2.01 alongside an EMA file that
  was last updated when FDA was on v1.x. Audit all five at once.
- **Forgetting the checksum update.** Without it, the strict-mode CI check
  (step 8 follow-up) refuses to run. Tests in step 5 will still pass
  because they don't enforce the manifest yet.
- **Treating fixtures as licensed.** The XML fixtures in
  `assets/ectd-dtd/fixtures/` are NOT licensed — they are our own
  hand-written test inputs that happen to reference the DTD by name. They
  stay committed regardless of the DTD status.

## Related documents

- `assets/ectd-dtd/README.md` — drop-point file listing + filename contract.
- `HI_8_ECTD_SCOPING_BRIEF.md` — broader eCTD GA-readiness scope.
- `docs/reports/PATH_TO_GA_2026-06-29.md` §C.8 — GA-1 dependency this runbook unblocks.
- `docs/runbooks/esg-production-setup.md` — adjacent runbook for the FDA ESG transport (DTDs are bundled into the zip the ESG runbook ships).
