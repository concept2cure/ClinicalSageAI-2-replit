# Classic host qualification — D2 / W2

## What already exists

`server/services/ana/AnaToolExecutor.ts` already dispatches calls, allocates,
guards and settles reads, then stages framed bodies and notifies a detached
observer. `read-receipts.ts` and the existing in-memory Vault fixture exercise
receipt identity and source refusal. This suite extends qualification of those
paths, without a second executor or receipt implementation.

Seven native-host tests first produced six intended failures and one passing
actual-read control. Exact command, hashes, selected baseline pins and raw log
are in `freeze.json`, `red-summary.json` and `red.txt`. An earlier invented
handler was correctly held by the authorization boundary; the corrected fixture
uses an existing classified read tool. That earlier flawed attempt remains
labeled, and supplies no claimed qualification.

Native dispatch, allocator, guard, settlement, framing and scripted gateway
requests qualify ordinary crowding, irreducible initial overflow, replan bypass,
and exact accepted-body staging. Late-growth fixtures replace only the budget
candidate seam with a near-limit array, then exercise actual guard/settlement
growth; an earlier written legacy receipt remains acknowledged. Explicit Vault,
actor/source-admission and writer fixtures replace live services; no live DB,
provider delivery or current-source admission is claimed.

After the initial successful full regression, root split only the long
`describe` wrapper to remove a lint warning. Assertions and fixtures are
unchanged. The original frozen source and exact diff are under
`../layout-review/`. Root repeated this suite and the receipt suite against the
original production baseline, verified all baseline pins unchanged, and froze
the revised layouts in `../frozen-tests.json` before restoring production bytes
exactly. The original owner freeze remains historical evidence.
