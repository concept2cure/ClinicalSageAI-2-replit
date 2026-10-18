# Gateway configuration and qualification contract — X01/X02, D7

2026-10-14. Credentials, installed protocol code and demonstrated agency acceptance
are independent states. Existing `configured` booleans and gateway-account `status`
remain credential-presence indicators for compatibility. They never mean the
transport has passed the agency's UAT or that a live submission is safe to file.

Read-only gateway discovery and account settings add `transportReadiness`:
`transport`, `implementation` (`implemented`, `unavailable`, or `unverified`),
`qualification: not_verified`, `qualified: false`, `reason`, and
`missingDependencies`. Sequence transmit prechecks add the same metadata for
each environment. No uploaded credential, environment flag, success-shaped
HTTP response, offline test or model statement can set `qualified: true`.
There is no reviewed environment-specific qualification record in this repository.

The UI names credential configuration separately, displays agency qualification
as not verified, and shows missing transport prerequisites. AnA context receives
these distinct facts rather than equating credentials with transmit ability.
AS2 engineering is a separate workstream with actual CMS/MDN offline checks:
[as2-contract.md](as2-contract.md). Its passing fixtures do not substitute for
agency-issued endpoint/certificates, account onboarding, current protocol
confirmation, successful agency UAT and a cryptographically verified agency
receipt tied to a known message and environment.

Safe local preflight uses existing mocked tests, installed-dependency checks,
pinned asset checks and cryptographic offline fixtures. No live agency request,
provider charge, credential generation or qualification assertion is authorized
by this remediation. The external activation dependency is a named, reviewed
UAT package with agency-issued configuration and preserved receipt evidence.

Known unsourced regional adapters (MHRA, NMPA, TGA, Swissmedic, ANVISA, CDSCO,
MFDS and HSA) now refuse in the canonical `getGateway` transmit guard before
package access, transmittal creation or wire calls. Their existing market-support
channel was already `none`; the code now enforces that stated capability. The
typed pre-wire refusal lets sequence callers release never-sent claims rather
than strand them as in-flight. Eight added negative checks failed first and pass
with the guard; supported FDA/EMA lanes are not relabeled qualified.

Receipt dates are now nullable when unrecorded; a separately generated platform
summary has `generatedAt`, not an invented agency receipt timestamp. Receipt
download headers preserve this distinction. Manual signed-MDN ingestion verifies
the pinned signer, actual message ID and MIC before any receipt state update;
its receipt-upload UI never asks a user to select an ACK stage or claim center
acceptance. The ingestion contract and proof are in the AS2 workstream evidence.

The current attempt has its own server UUID (`transmit_attempt_id`), separate
from the signature action ID. Each claim locks the sequence and then re-reads
the canonical spent/void ledger before proceeding. Receipt settlement consumes
the signature in that same governed transaction and matches both the retained
signature and UUID; an older differently framed signed MDN cannot resolve a
newer attempt even if it reused an action ID. This is an exact-attempt guard,
not an assumption that a signature string is intrinsically a unique attempt.
