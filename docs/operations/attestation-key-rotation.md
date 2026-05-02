# AUDIT_ATTESTATION_KEY rotation procedure

**Status:** Living document. **Owner:** Backend stream + Security.
**Last revised:** 2026-05-01.

The HMAC key used to sign tenant attestation reports
(`generateAttestation` in
`server/services/tenant-export/attestation-report.service.ts`) must be
rotatable without invalidating reports that were issued under the prior
key. This doc covers the rotation contract and the step-by-step
playbook.

## Why rotate

- **Compromise.** A leaked key would let an attacker forge attestation
  reports.
- **Hygiene.** Long-lived signing keys are an audit finding waiting to
  happen. Rotate at least annually.
- **Personnel changes.** Anyone with secret-manager access who leaves
  triggers rotation.

Old keys are NOT discarded immediately — they're retained as the
`PREV` key so reports issued under them remain verifiable.

## Two-key contract

The attestation service reads two key pairs at runtime:

| Slot      | Env vars                                             | Used for                |
|-----------|------------------------------------------------------|-------------------------|
| current   | `AUDIT_ATTESTATION_KEY` + `AUDIT_ATTESTATION_KEY_ID` | Signing all NEW reports |
| previous  | `AUDIT_ATTESTATION_KEY_PREV` + `AUDIT_ATTESTATION_KEY_PREV_ID` | Verifying reports signed under the prior key id |

Every report embeds `signature.keyId`. The verifier looks up the matching
secret from the two slots above. If the id doesn't match either, the
report is rejected.

## Constraints

- **Key length ≥ 32 bytes.** Shorter keys cause
  `AttestationKeyMissingError` at signing time.
- **Key id is a free-form string.** Convention: short integer-suffix
  (`k1`, `k2`, `k3`). Don't reuse ids.
- **Both keys must be in the secret manager.** Never set them inline in a
  Kubernetes manifest.
- **Rotation is online.** No downtime needed if the steps below are
  followed.

## Rotation playbook

### Step 1 — generate the new key

```bash
openssl rand -base64 48 | tr -d '\n'
# Use the output as the new AUDIT_ATTESTATION_KEY value.
```

The next key id is the current id with a bumped suffix, e.g. `k2 → k3`.

### Step 2 — store the new key in the secret manager

Add it as a NEW secret name; do NOT overwrite the existing one yet:

- Existing: `audit-attestation-key-current` (value: old key, id: `k2`)
- Add: `audit-attestation-key-next` (value: new key, id: `k3`)

### Step 3 — deploy with the previous slot populated

Configure the BFF env vars:

```yaml
env:
  - name: AUDIT_ATTESTATION_KEY
    valueFrom: { secretKeyRef: { name: audit-attestation-key-next, key: value } }
  - name: AUDIT_ATTESTATION_KEY_ID
    value: k3
  - name: AUDIT_ATTESTATION_KEY_PREV
    valueFrom: { secretKeyRef: { name: audit-attestation-key-current, key: value } }
  - name: AUDIT_ATTESTATION_KEY_PREV_ID
    value: k2
```

Roll the deployment. From this point:

- All NEW attestation reports sign with `k3`.
- Any report that lands carrying `signature.keyId = "k2"` still verifies
  via the previous slot.
- The audit log captures `tenant.attestation.generate` events that
  document each new signing — useful for the audit forensics later.

### Step 4 — verify

Wait for at least one nightly attestation cycle, then verify:

1. Run the tenant-export attestation endpoint as a known tenant admin:
   ```
   GET /api/tenant-export/attestation
   ```
   Confirm `signature.keyId = "k3"` in the response body.
2. Take an old report (saved off-line by a customer or from the prior
   month's archive) and run it through `verifyAttestationSignature`.
   Confirm it still returns `true`.

### Step 5 — schedule decommission of the old key

Old keys stay live in the `PREV` slot for the duration of the
attestation lookback window — typically **90 days** is a safe default,
matching the customer's "request a fresh attestation if any old report
needs reverification" policy.

After 90 days, remove the `PREV` slot:

```yaml
env:
  - name: AUDIT_ATTESTATION_KEY
    valueFrom: { secretKeyRef: { name: audit-attestation-key-next, key: value } }
  - name: AUDIT_ATTESTATION_KEY_ID
    value: k3
  # AUDIT_ATTESTATION_KEY_PREV and AUDIT_ATTESTATION_KEY_PREV_ID removed.
```

Roll the deployment. From this point, only `k3`-signed reports verify;
any older report would need to be re-issued (new attestation against the
current chain) before it could be presented to an auditor.

### Step 6 — record the rotation

Log the rotation event in the central audit trail:

```typescript
auditService.logAction({
  tenantId: 0, // platform-level event
  userId: '<the engineer running the rotation>',
  action: 'attestation_key.rotate',
  resourceType: 'attestation_key',
  resourceId: 'k3',
  details: {
    previousKeyId: 'k2',
    newKeyId: 'k3',
    rotationReason: 'scheduled' | 'compromise' | 'personnel',
  },
});
```

Update this doc's revision footer with the date.

## Emergency rotation (suspected compromise)

If the current key is suspected to be compromised:

1. Rotate immediately following Steps 1-3 above.
2. **Do NOT keep the compromised key in the `PREV` slot.** Skip Step 5
   and remove the old key the same hour. Any report signed under the
   compromised key is no longer trustworthy and must be re-issued.
3. Notify any customer who holds an old attestation report that they
   need a fresh attestation.
4. File a P0 incident; trigger forensics to determine the leak scope.
5. Post-mortem must include why the key was compromised and what
   additional controls (e.g. KMS-backed signing, HSM) the team will
   add to prevent recurrence.

## Implementation notes

- The verifier's slot lookup does NOT fall back to "try every key" — it
  looks up by id. Without the id field this would degrade to a brute-
  force trust scheme.
- The signing call in `signed()` always uses the current slot. There is
  no path that signs a new report under the previous key.
- Tests:
  `server/services/tenant-export/__tests__/attestation-report.test.ts`
  covers the rotation contract: a report signed under `k1` still
  verifies after the env vars are flipped to `current=k2 / previous=k1`.

## Related

- `docs/operations/audit-log-retention-policy.md` — DB role policy +
  retention schedule.
- `docs/operations/audit-trail-coverage.md` — every governed mutation
  and its audit code.
- `docs/beta/CUSTOMER_ONBOARDING_RUNBOOK.md` — when an attestation
  report is handed off to a customer.
