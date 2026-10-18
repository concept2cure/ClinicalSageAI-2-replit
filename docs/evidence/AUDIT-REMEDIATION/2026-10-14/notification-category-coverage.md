# D08 active producer preference coverage

Nine existing notification producer spellings were absent from the shared
catalog. Their notices could be created in the shared inbox, but the preference
screen offered no control for them and its PUT route refused their category.
The canonical catalog now retains the original 13 names and adds these nine,
with labels used directly by the mounted preference screen. No stored category
is renamed, no schema or data migration is needed, and unknown categories remain
outside the supported HTTP/AnA input vocabulary.

| Existing spelling | Label | Active shared-inbox source |
| --- | --- | --- |
| `task_assigned` | Task assignments | Task assignment routes and AnA command executor, through `task-side-effects.ts` |
| `task_blocked` | Blocked tasks | Task block/status routes, through `task-side-effects.ts` |
| `task_completed` | Task completions | Both canonical task routers, through `task-side-effects.ts` |
| `task_update` | Task updates and reminders | Task cascade and `jobs/taskDueSweep.ts` |
| `collaboration` | Collaboration messages and lock changes | Task collaboration/message routes and realtime authoring lock takeover |
| `schedule_goal_reset` | Program goal resets | `projects/schedule-of-events/service.ts`, `resetProjectGoals` |
| `schedule_milestone_slip` | Slipped milestones | `projects/schedule-of-events/service.ts`, `reviewScheduleHealth` |
| `schedule_milestone_at_risk` | Milestones at risk | `projects/schedule-of-events/service.ts`, `reviewScheduleHealth` |
| `proactive_digest` | AnA proactive digests | `digest/proactive-digest.ts`, `PROACTIVE_DIGEST_CATEGORY` |

The census followed imports of the shared `notification-service`, its sole
`mdx_notifications` INSERT, and `notifyTaskEvent` callers. Scheduled report
delivery uses the existing `system` category. The separate C2C/project-section
notification stores and task classification fields are not shared-inbox
categories and were not folded into this catalog.

`shared/constants/notifications.ts` is the only vocabulary/label source.
`NotificationPreferences`, the preference PUT/create route schemas,
`FIRE_NOTIFICATION` input schema and its registered handler already derive
their vocabulary from it; no duplicated enum or AnA monolith edit was added.
The notification service comment now points to this shared contract.

## Before/after qualification

`notification-categories-native-red.log` records 9 missing-category failures
with 10 controls; `notification-categories-ui-red.log` records 2 absent mounted
controls. `notification-categories-native-green.log` records 19 passing tests
against actual local PostgreSQL under a non-super/non-bypass role and FORCE RLS:
every added producer category saves and reads back, suppresses its notice only
for the current recipient, leaves another member's inbox intact, and keeps an
unknown preference/notice rejected. Existing request-binding and verified-ALS
controls remain green, and synthetic notices/preferences/membership are cleaned
or restored after the suite.

`notification-categories-compatibility-green.log` records 48 passing tests in
5 files, including actual mounted task/schedule preference controls, save,
server readback, recipient policy, target resolver and tray behavior.
`notification-categories-schema-green.log` records 2 passing AnA schema tests,
covering the nine advertised producer spellings and the unknown negative.
`notification-categories-lint.log` is clean, as are whitespace checks.

Runtime scope qualification is described separately in
`notification-native-binding.md`: the original instrumented pool already binds
verified ALS scope. This category correction does not imply an unscoped
production pool or an authenticated delivery outage. No real credentials,
external message delivery, production transaction, commit, push or deployment
was used. Production source is frozen for integrated qualification.
