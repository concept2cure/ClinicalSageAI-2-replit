# W3 / D4 — native fixture platform standing

Four native fixtures now provide the platform authority the unchanged
production guard requires. Tenant membership alone remains insufficient.

- Licensing trials: its existing authenticated identity stub uses an exact
  owner bootstrap allowlist, saved before setup and restored before teardown
  awaits, including a failed cleanup path.
- Enterprise requests: the real fixture owner receives a `super_admin`
  platform grant; cleanup removes grants before their users.
- Module access requests: the real owner receives `super_admin`; the existing
  support designation and all lesser-privilege identities are unchanged.
- Organization writes: the existing grant helper designates the fixture staff
  member; explicit grant teardown covers these users whose default organization
  is unset, before their user records are removed.

The actual parent-source native run executed 150 files and 1,582 cases:
1,544 passed, 38 failed, none pending. Thirty-six failed assertions belong to
these fixtures. `NATIVE-RED.json` records their original failure messages and
the two independent inventory failures. This change does not claim that 36
assertions passed on a native database after editing: that rerun is pending.

| Local verification | Actual result |
| --- | --- |
| Existing authorization/security suites | 6 files, 110 cases passed; process exit 0 |
| Scoped lint | 4 files, zero errors; five existing warnings before and after |
| Database isolation guard | 150 files run unmocked; mocked projects exclude them |
| AST comparison with parent | All assertions and other statements unchanged outside the named fixture changes |
| Source/guard pins | 34 unchanged blobs, including guards, routes, native setup/configuration, scientific engines, CI and baselines |

The local security controls include successful exact allowlist admission and
active platform grants, refusal of tenant `super_admin` membership without a
grant, commercial-owner separation from support, federated-identity limits,
revocations and fail-closed grant lookups. They verify the production standing
rules; they are not a substitute for the four native PostgreSQL suites.

`PARENT-REMOTE-CI-GREEN.txt` preserves the preceding publication's actual
whole-tree compiler (zero errors, exit 0) and 233 remote Node CI controls.
That evidence belongs to `4d1252f`, not to the new fixture publication.
No full local compiler ran on the 8-GiB host. The new exact-source semantic
compiler and native PostgreSQL rerun remain required remote gates.

The report registry ordering and tenant-export column inventory failures are
preserved for separate deliveries. Full workflow/release qualification remains
open. Only the fixture correction and its local verification are complete.
