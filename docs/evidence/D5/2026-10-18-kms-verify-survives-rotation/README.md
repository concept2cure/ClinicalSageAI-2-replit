# The KMS verifier would have failed every release signed before the first key rotation

**Row:** D5(b) — *"a KMS-backed signer behind the existing signer seam"*.
**Session:** `…01P6GWSv`. **Date:** 2026-10-18. **Found by** the D5 audit
workflow (lead #3), verified by hand at HEAD `155783880`.

## What was wrong

`verifyPayloadSignature` (`server/services/signature/payload-signer.ts`) — the
path SOP-SEC-001 §7 names as authoritative — verified every envelope against
`posture.kms.keyId`, the **current** signing key, and treated the envelope's own
`keyId` as *"recorded for inspection only"*.

`docs/SOP_KEY_MANAGEMENT.md` §5, a controlled document, says the opposite:

> *"Rotation = create the next year's key, point `CONCEPT2CURE_SIGNER_KMS_KEY_ID`
> at it, keep the previous key enabled for Verify only... Every stored envelope
> carries the key ARN it was signed under (`payloadSignature.keyId`), **so old
> signatures verify against the old key.**"*

They did not. AWS KMS asymmetric keys do not auto-rotate; rotation is a new key.
The deployment names an **alias** whose name carries the year —
`terraform/stack/release_signing.tf` sets `CONCEPT2CURE_SIGNER_KMS_KEY_ID` to
`local.release_signing_key_alias`, and `.env.example` shows
`alias/fda-signing-key-2026`. Following the SOP's own procedure would have moved
that alias to the 2027 key, and from then on every release signed in 2026 would
verify `failed` online and its export would block — while the SOP told an
inspector they still verified.

A regulated release is kept for the retention period, often far longer than a
year. A signing system that invalidates its own earlier signatures at its first
scheduled rotation does not meet §11.10(c).

**Latent, not yet live.** The SOP records the KMS signer as *"implemented in code
with a fake KMS in tests; unexecuted against live KMS"*. No real signature was
affected. This is the cheapest moment the fix will ever have.

## Why the obvious fix was wrong

The code's refusal to trust the envelope's key is correct and was kept:

> *"an attacker who can rewrite the envelope can also point it at a key they
> control."*

So "verify with `envelope.keyId`" is out. "Verify with `envelope.keyId` if it is
on an allowlist" looks right, and would have **broken every signature made
today**: the posture names the *alias*, while the envelope records the *ARN* KMS
returns from `Sign` (`kms-signer.ts` stores `out.KeyId`, which AWS always returns
resolved). The two strings never agree, even for the current key. The existing
tests already modelled that split — posture `alias/fda-signing-key-2026`,
envelope `keyId` the fake's ARN.

## The change

`trustedKeyForEnvelope` picks the key by **public-key fingerprint**, among the
keys the **posture** trusts:

- the candidates are the current key, then every key listed in the new
  `CONCEPT2CURE_SIGNER_KMS_VERIFY_KEY_IDS` — never the envelope's key;
- among those, the one whose public key fingerprints to the envelope's
  `publicKeySha256` is used for `kms.verify`;
- the fingerprint comes from key *material*, so alias-vs-ARN naming cannot
  mismatch; it is the same check the offline verifier already makes.

The envelope's fingerprint can only **select** among trusted keys; it cannot add
one, and selecting a trusted key does not make a forged signature valid — KMS
still has to verify it. A retained key that cannot be read is skipped (it can
only matter to envelopes it signed, which then fail closed); the current key
being unreadable still fails, as before.

`signer-mode.ts` parses the new variable — comma-separated, trimmed, the current
key dropped from it — and **omits** the field when nothing is listed, so every
existing deployment's posture is byte-identical to what it was.

SOP §5 now includes the step that makes the fix take effect (add the previous
key to `CONCEPT2CURE_SIGNER_KMS_VERIFY_KEY_IDS`), explains why the verifier never
trusts an envelope's key, states that an unlisted previous key fails closed, and
carries a dated correction note. `.env.example` documents the variable.

## Proof

New suite `payload-signer-rotation.test.ts`: two fake KMS keys behind a router,
the alias moving from the 2026 key to the 2027 key as SOP §5 does it.

| Case | Original verifier | Fixed |
|---|---|---|
| before rotation, signed under the alias | ok | ok |
| **after rotation, previous key retained: the 2026 release** | **failed** | **ok** |
| after rotation, a 2027 release | ok | ok |
| after rotation, previous key NOT retained: the 2026 release | failed | failed (fails closed) |
| a retained key unreadable, a current-key release | ok | ok |
| an attacker's own key, named by the envelope | failed | failed |
| an attacker borrowing a trusted key's fingerprint for a forged signature | failed | failed |
| a retained key never signs | ✓ | ✓ |

Run against the **original** verifier: **1 failed, 7 passed** — and the one is
exactly *"after rotation, with the previous key retained for Verify: the 2026
release still verifies."* That isolates what the change fixes. The two security
cases pass on **both**, so the change preserves the property rather than
depending on it.

All signer suites: **36/36** (the original 27, unchanged; 8 rotation; 1 parsing).
