# Selected program tenancy before regional catalog anchor lookup

Status: Approved bounded follow-up to REGIONAL_REPORT_APPLICABILITY.md.
Owner: reporting backend; native qualification owner: auth workstream.

The actual authenticated native regional suite passed nine cases and failed one:
an explicit foreign program returned 200 with an empty, unanchored view. No
filing metadata was read, but the selected-program contract requires the same
404 for foreign and missing identities. pickLead treated any absent anchor as
an own-organization program awaiting a project relationship.

For every explicit selected program, call canonical programInOrganization on
requestPgClient(req), binding the actual authenticated organization, before the
anchor lookup. A false result returns the existing generic Program not found
404, with no anchor, filing or title supplied. A verification storage failure
returns the generic typed access-unavailable 503. Missing request context keeps
its existing typed failure. No shared-pool or caller-posted identity substitutes.

A positively verified own-organization program without a project anchor retains
its current 200 openProgram.state=unanchored behavior. The existing lead filing
read still mints canonical current project access, verifies the exact anchor,
and performs its fresh final recheck before delivery. No filing, entitlement,
engine, sharing, clinical or CTD policy changes are included.

Retain all prior denial assertions and the original native 9-pass/1-fail
observation. Add bounded unit controls for foreign/missing selection, own-org
unanchored selection, exact executor/parameter/order and verification failure.
Rerun the same ten native cases after the production source is frozen. File a
separate evidence increment; preserve earlier regional phase manifests/pins.
