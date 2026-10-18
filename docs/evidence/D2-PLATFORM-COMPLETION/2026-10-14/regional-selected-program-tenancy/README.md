# Explicit selected-program tenancy — follow-up evidence

The overview now verifies an explicit selected program belongs to the actual
requester’s organization before looking up its project anchor. Foreign, missing
and deleted identities return the existing generic 404. A positively verified
own-organization program awaiting an anchor retains its 200 unanchored view.
Verification storage failures return typed generic access-unavailable 503.

The approved [design addendum](../../../../design/REGIONAL_REPORT_APPLICABILITY_SELECTED_PROGRAM.md)
was filed first. Canonical `programInOrganization` runs on `requestPgClient(req)`
with the selected UUID and authenticated organization. No pool fallback,
client-posted organization or change to filing/entitlement policy is involved.
Existing fresh current-project and before-delivery checks remain in place.

Actual new unit red: four failures / 27 passes, 4.57s. Final existing and new
regional overview/catalog controls: 58 passes across four files, zero skips,
12.38s. Forced scoped lint: zero errors and zero warnings. The bounded helper
also preserves no-growth complexity limits. Existing denial assertions were
retained; new controls prove lookup order and exact executor parameters, generic
foreign/missing refusal, genuine unanchored behavior and closed storage failure.

The auth owner independently reran the unchanged ten-case native suite against
this frozen route: ten passes, zero skips, 11.85s. That real auth/app_service/RLS
proof and the original nine-pass/one-failure phase are recorded in
[separate native evidence](../regional-filing-native-final/README.md).
No native assertion was weakened. The route hash is
`427eb63e2746d9580e9de61925006f39d8cd9f7cb650ee0a33f49e1c61ba021d`.

`manifest.json` pins six follow-up source/test/design files and seven raw
artifacts. Earlier regional applicability manifests and source snapshots remain
unchanged; they qualify their earlier phase. This follow-up changes no UI source.
Compiler, complete application boot, platform coverage and publication remain
root-owned and are not claimed by these bounded unit checks.
