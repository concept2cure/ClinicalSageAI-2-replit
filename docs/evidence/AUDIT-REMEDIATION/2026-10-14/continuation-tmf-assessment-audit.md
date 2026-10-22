# TMF and assessment audit continuation — 2026-10-14

Scope: O01's two discarded outcomes in `tmf-artifact-persistence.ts` and one
in `regulatory-assessment-persistence.ts`, plus the actual HTTP consumers.
No schema, dependencies, launch capability, report engine or user surface was added.

The existing business filing, removal and recorded snapshot remain durable when
their ancillary audit fails. Services return the canonical `AuditRowOutcome`;
create responses preserve their row fields and status and add `meta.auditTrail`.
TMF removal remains HTTP 204 and carries canonical audit headers. A batch carries
each completed filing's actual audit outcome and combines only writes actually
attempted. An all-invalid batch has no fabricated audit receipt. Store errors and
unexpected audit rejections are contained by the existing canonical helper.

Bulk business completion loss now stops the batch and returns HTTP 207 with the
earlier committed results, their audit outcomes, an explicitly unconfirmed item,
remaining items marked not attempted, and an authenticated trial-artifact readback
URL. An actual PostgreSQL statement refusal is distinguished from unknown
completion. No uncertain write is automatically retried or described as rolled
back. An ancillary audit outage does not stop a completed business batch.

Each `vault://` reference is checked against the actual document organization,
live programme and canonical current private-project access. Access is resolved
from the document's real programme relationship, never inferred from the trial
label. Foreign/private references produce no filing and disclose no document
identifier in bulk error results. External archive references remain explicitly
unverified by this service.

The native test also found a real integration defect: the deployed mount uses
`server/auth.ts`'s authenticator, which attached the current DB role but omitted
the existing functional-role expansion. A genuine current member therefore got
403 from `requireRole('regulatory-author')` despite unit fixtures passing. The
approved fix adds `expandRoleClaims(resolvedRole, undefined)` at that verified
identity construction. It never restores role, functional-role or platform
claims from the token. Native controls prove current member access, viewer
refusal and refusal of token-supplied admin/platform grants.

## Evidence

- `continuation-tmf-assessment-audit-red.log`: eight missing-outcome failures
  after correcting the unit authentication fixture to use canonical expansion.
- `continuation-tmf-assessment-auth-native-red.log`: two native failures with
  the previous authenticator construction, including genuine member 403.
- `continuation-tmf-bulk-native-red.log`: the prior throw-on-business-error
  batch behavior fails the completion-loss recovery case. The temporary negative
  control was removed.
- `continuation-tmf-assessment-audit-green.log`: **83 passing tests / 9 files**,
  including existing TMF/assessment contracts and adjacent authentication tests.
- `continuation-tmf-assessment-native.log`: **11 passing native cases** on the
  canonically provisioned database. The test installs no tables, policies,
  triggers or grants; it uses genuine authentication, tenant ALS, a lazy request
  connection, TLS, `app_service` with neither superuser nor bypass-RLS, and actual
  FORCE RLS business/audit refusals. Healthy rows carry actual chained audit
  identities and seals using test-only audit keys. A separate controlled thrown
  boundary covers an unexpected audit rejection. Completion loss is a real
  autocommitted INSERT whose completion signal is deliberately suppressed;
  authenticated readback proves that uncertain item exists.
- Scoped ESLint: **0 errors, 3 warnings** (existing unused helper, bulk complexity,
  native fixture setup size). `scripts/ai/verify-tests.sh` completed with existing
  repository companion-test warnings.

## Boundaries retained

The lightweight TMF store's `trial_id` is a free-text, organization-scoped label,
not a verified canonical study/project foreign key. Its count-based completeness
is not evidence of document QC, timeliness, clinical verification or regulatory
acceptance. Current project access to a Vault reference does not qualify that
document's clinical content or lifecycle.

The assessment API stores caller-provided point-in-time snapshots. Its integer
submission identifier has no established canonical parent relationship; this
change creates none and does not turn a submitted `ready` flag into a verified
engine verdict. The API is mounted, but no current client or AnA caller was
found. TMF's existing client uses `apiRequest` and the shared audit warning
transport. No new UI reachability or launch qualification is claimed.

No commit, push, deployment or live agency operation was performed.
