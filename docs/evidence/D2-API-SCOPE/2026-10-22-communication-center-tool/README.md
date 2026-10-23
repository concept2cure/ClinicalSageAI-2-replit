# D2: AnA's launch-scope inventory no longer calls a launch surface hidden (2026-10-22)

A fix to an existing file. No tool's behaviour changes.

## What already exists

- `shared/constants/launch-scope.ts:62` has listed `communication-center` among
  the Projects surfaces since `327bc9fb6` (2026-10-16).
- `server/services/ana/ana-launch-scope.ts` `anaCapabilityInLaunchScope`
  re-checks each hidden entry's surfaces against `LAUNCH_SURFACE_IDS`. So
  `create_ha_interaction` was offered in production from that commit on.
- `server/services/ana/ana-launch-scope.inventory.json` still filed
  `create_ha_interaction` (agency-meetings, communication-center) under
  `hiddenApp`. Its own rule says a tool that touches a launch surface is
  `inScope`. Communication Center reads `ha_interactions`
  (`server/routes/c2c/communication-center.ts:98,138`).
- `ana-launch-scope.test.ts` failed on trunk on both counts: the inventory
  named a launch surface as hidden, and the production toolset was one larger
  than the inventory said (618, not 617).

## The change

The inventory moves `create_ha_interaction` to `inScope` and records the
amendment in its `$note`, as the 2026-10-12 CMC amendment did.
`prepare_meeting_package` and `review_ha_interaction` serve agency-meetings
only, and they stay hidden.

## Evidence

- `01-red.txt`: the two failures at trunk `6b63513e4`.
- `02-green.txt`: the suite passes with the amended inventory.
