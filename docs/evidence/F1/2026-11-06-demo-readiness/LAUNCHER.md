# Codespaces demo rehearsal — 2026-11-06

Plan: F1. Workstream W1, row D2. Deadline: one hour from the founder request (about21:00UTC). Current source: `9c047a1ff919981d8b6e13f2a4c383294fb8a745`. Scope: existing startup, sign-in, project/source/CSR preparation and one-editor actions. No model/agency/deployment call or new surface is authorized by this rehearsal.

## What already exists

- `.devcontainer/post-create.sh` and `post-start.sh` automate local PG16/pgvector, app-role runtime, demo users, canonical app on5000 and CDISC CSR preparation. These and Codespaces doctor files remain held by the Codespace setup owner.
- `scripts/startup.sh` and `scripts/ops/codespaces-doctor.mjs` gate existing npm dev; `server/config/load-env-files.ts` ignores checked-out dotenv files in Codespaces.
- `docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk*.cjs` prepare the existing public CDISC pilot through real project intake, Vault upload/review/approval and the existing CSR editor. `DEMO_PREPARE_UNTIL=freeze` stops before paid drafting.
- `scripts/cre/fetch-cdisc-pilot-adam.mjs` pins original public CDISC files, outside Git. No raw rows or dataset extracts are committed here.
- `DocumentCanvas/DocumentWorkbench/RichSectionEditor` remain the one editor/canvas; no UI layout is changed.
- Current operator instructions are `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`; existing Codespace proof is under HUMAN-TEST/CODESPACE/2026-11-06. Neither proves a live provider.

Searches: current code, script/package names, Git history and current coordination. Runtime authoring/CSR code was not duplicated. Initial inspection finds an operational stale-server risk after a pull: post-start retains a healthy process when keys match. The existing documented forced restart is sufficient for this demo; held scripts remain unchanged.

## Rehearsal status

The launcher source is accepted on canonical; the full local CSR/editor rehearsal passed. This executor is a local replica, not the founder's GitHub Codespace. It has no provider keys; no live AnA/complete CSR readiness is claimed. Current API secret setup was asked of the founder; credentials are never requested in chat.


## Observed startup blocker

Actual `npm run dev` with Codespaces flags and the non-owner local runtime role passes the real database/auth/RLS doctor and selects port5100, then exits before serving: `bash: line1: tsx: command not found` (`npm-dev-red.log.gz`, outer rehearsal exit1). Both `dev` and `dev:local` wrap the command in a login shell (`bash -lc`), which discards npm's local executable PATH on this host. Complete those existing launch commands with a non-login shell, preserving the same preflight, command, inspector and warning flags. No dependency or runtime policy changes.


## Launcher verified

The real six-case launcher regression is RED2/4controls before the change and GREEN6/6 afterwards. Tests use a tiny preflight fixture to isolate shell/PATH behavior and the real repositorytsx/Node executable; they do not claim database-policy coverage. Both preflight source23 andmain17 refusals still stop the server. Combined current launch/doctor suite is46/46.

Actual `npm run dev` with Codespaces flags, `app_service` only, RLSon, generated signing secrets and the real Codespaces doctor now serves the existing nativefixture on5100 (`startup-green`,23.893s). In realChromium, actualDemo access signs in `ana.author@concept2cure.pro` and Projects opens (two cases,9.823s). This is a local Codespaces replica; the founder's actual GitHub session/secrets are not accessible through the repository integration. Database/schema/storage are ready; AnA is503/no_provider here.

Normal direct publication pending. The launcher fix changes only `bash -lc` to `bash -c` in dev/dev:local; lock/dependencies, inspector, warnings, preflight and productUI are unchanged. Full CSRpreparation will be rehearsed after the urgent source push.


## Canonical convergence

The setup owner separately landed the current-revision restart check and stricter CSR qualification in the same evidence directory. Its README/DELIVERY/native/qualifiers records stay independent. Our launcher proof is retained here; do not add overlapping test counts. `demo-source-bridge.json` names the exact two changed startup inputs and rerun current combined cases.


## Accepted source and completed rehearsal

Normal direct push accepted `7d771e124a4dba820fbbd26d8919c7c69cd1a9d4` with every hook enabled and zero named-input drift. Typecheck correctly reported skipped: this change alters script commands and test/evidence files only. No TypeScript or dependency field changed. `launcher-accepted-source.json` binds all75 named current startup inputs to actual accepted Git blobs. Initial failed transports and the exact canonical startup-source bridge remain retained.

The merged current Node cases pass **60/60** (overlapping the earlier40/46 and setup-owner45/54 runs; counts are not added). Actual npm startup passed with Codespaces flags, app_service only and RLSon. Actual Demo access→Projects passed two browser cases. The exact existing CSR preparation then passed all **six steps** in **186.5s** (236.4s including seed/start/fetch): project creation, seven immutable source uploads, three-person review/approval, single CSR catalog entry, the existing editor and eleven retained clinical tables previewed/frozen. Public CDISC bytes remain outside Git. No efficacy transcription was supplied; no efficacy results were invented.

The following manual browser rehearsal passed **three cases** in24.2s: edit§8 with a deliberate reason, confirm saveHTTP200, reopen the saved text in a separate browser storage partition, and reach the existing AnA drafting controls within the same editor. The screenshot masks editable text and tables. No generation, signing, export, agency send or deployment was requested. The temporary local runtime is now stopped; the founder's Codespace remains separate.

## Demo order

Use the existing [Codespaces manual](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md). Pull `concept2cure-v2`, then stop/start the Codespace for one clean app launch; keep forwarded port5000 private. After setup completes: **Demo access→Projects→Xanomeline TTS Phase 2 (CDISCPILOT01)→Author→CDISCPILOT01 Clinical Study Report**. Open **Build from the study's data** to show the retained tables. Open§8, edit, state a reason of at least eight trimmed characters, Save, then reopen the section.

Before showing live AnA, check the actual Codespace with `curl -sS http://127.0.0.1:5000/readyz` and rehearse a short question. A suitable general question is “Explain the purpose of ICH E3 Section8 and list the source facts needed to draft it.” Both provider keys must be in that Codespace's secret scope and require stop/start after changes. Full119-heading CSR generation runs serially and has no measured live-provider timing here; run any full build before the timed presentation.

No provider keys are available in this executor, and repository integration cannot read the founder's Codespace/secrets (403). Live AnA generation, per-request source-placement clearance, scientific review, full CSR completion and filing are not qualified by this record. Read `LAUNCHER-HANDOFF.md` for precise remaining source-tier and owner boundaries. No existing approved source was reclassified and no governance gate was relaxed.
