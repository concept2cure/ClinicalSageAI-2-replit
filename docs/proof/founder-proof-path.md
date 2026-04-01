# Founder Proof Path

## Deterministic run path
1. Login/entry at `/concept2cure`.
2. Toggle **External testing: ON**.
3. Select project.
4. Navigate project home/workspace path.
5. Enter 510(k) module route (`/concept2cure/project/:id/510k`).
6. Open/edit document in workspace.
7. Inspect consequence/review panel state.
8. Validate vault handoff route.
9. Validate submission handoff path.

## Expected policy behavior
- Any non-allowlisted route is redirected to fallback.
- Founder panel reports why route was redirected.

## Evidence artifacts
- Policy and normalization docs in `docs/proof/` and `docs/audits/`.
- Screenshot capture was not produced in this environment because `browser_container` tooling was unavailable.
