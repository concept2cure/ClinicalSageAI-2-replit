# Embedding credential readiness

The default OpenAI embedding lane currently constructs its SDK with the
placeholder `not-configured` when its credential is absent. A permitted call
then attempts transport and reports a provider failure with zero tokens. A
missing credential must instead produce the existing
`EmbeddingConfigurationError` before SDK construction or dispatch.

Keep provider resolution and startup lazy: `resolveEmbeddingProvider()` and
`getEmbeddingProvider()` remain usable without an OpenAI credential. Preserve
the current authorization order. Corpus/local-width validation and canonical
placement authorization run before `getClient()`; a tenant-policy or sensitive
placement refusal retains its existing outcome and never discloses a later
credential issue.

In the lazy `getClient()` boundary, require a nonblank credential only for the
OpenAI lane. Reject missing, empty and whitespace-only values. Inspect the
captured configuration without changing a configured credential's bytes or
validating a new key format. Throw inside the existing `embed()` try/catch so
the authorized attempt leaves its ordinary content-free failure ledger row
before the error reaches the caller. The message names the configuration
variable and contains no input text, endpoint or credential value.

Keep the configured OpenAI path, keyless local OpenAI-compatible endpoint,
native/corpus widths, memoization, model selection and election policy as they
are. There is no fallback, new provider policy, credential provisioning or live
provider request in this increment.

Verification uses the existing SDK stub and real gateway placement/ledger
logic. Capture the missing/empty/whitespace counterfactual red before the
production guard; each must refuse without SDK construction/create and leave
one content-free failure row. Preserve placement-denial priority with absent
credentials. Give existing permitted OpenAI SDK fixtures an explicit clearly
fake key; preserve their prior result, width and failure assertions. Retain a
keyless local positive. Run provider, election, placement and downstream
embedding-failure honesty suites plus scoped lint without warning growth.

This proof covers configuration, authorization order and stubbed SDK dispatch
only. It does not qualify provider availability, embedding quality, latency,
native database behavior, a compiler run or complete CI.

Verification is complete: the initial SDK-stub red had three credential cases
fail and four controls pass; final provider/election/placement/downstream
honesty suites passed all 59 tests. Scoped lint has zero errors and the same
one existing provider-fixture function-size warning. The credential cases live
in the existing election suite to retain the provider fixture's file-size
budget. Bounded logs, source pins and phase qualifications are in
[the credential-readiness evidence](../evidence/D2-PLATFORM-COMPLETION/2026-10-14/embedding-credential-readiness/README.md).
