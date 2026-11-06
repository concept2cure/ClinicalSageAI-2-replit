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

In progress. This executor is a local replica, not the founder's GitHub Codespace. It has no provider keys; no live AnA/complete CSR readiness is claimed. Current API secret setup was asked of the founder; credentials are never requested in chat.


## Observed startup blocker

Actual `npm run dev` with Codespaces flags and the non-owner local runtime role passes the real database/auth/RLS doctor and selects port5100, then exits before serving: `bash: line1: tsx: command not found` (`npm-dev-red.log.gz`, outer rehearsal exit1). Both `dev` and `dev:local` wrap the command in a login shell (`bash -lc`), which discards npm's local executable PATH on this host. Complete those existing launch commands with a non-login shell, preserving the same preflight, command, inspector and warning flags. No dependency or runtime policy changes.


## Launcher verified

The real six-case launcher regression is RED2/4controls before the change and GREEN6/6 afterwards. Tests use a tiny preflight fixture to isolate shell/PATH behavior and the real repositorytsx/Node executable; they do not claim database-policy coverage. Both preflight source23 andmain17 refusals still stop the server. Combined current launch/doctor suite is46/46.

Actual `npm run dev` with Codespaces flags, `app_service` only, RLSon, generated signing secrets and the real Codespaces doctor now serves the existing nativefixture on5100 (`startup-green`,23.893s). In realChromium, actualDemoaccess signs in `ana.author@concept2cure.pro` and Projects opens (two cases,9.823s). This is a local Codespaces replica; the founder's actual GitHub session/secrets are not accessible through the repository integration. Database/schema/storage are ready; AnA is503/no_provider here.

Normal direct publication pending. The launcher fix changes only `bash -lc` to `bash -c` in dev/dev:local; lock/dependencies, inspector, warnings, preflight and productUI are unchanged. Full CSRpreparation will be rehearsed after the urgent source push.
