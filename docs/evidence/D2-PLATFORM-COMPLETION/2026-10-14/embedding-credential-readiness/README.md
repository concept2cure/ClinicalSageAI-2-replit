# Embedding credential readiness

The default OpenAI embedding lane now refuses a missing, empty or whitespace-only credential with `EmbeddingConfigurationError` before SDK construction/create. This check remains lazy in `getClient()`, after canonical placement authorization and within the existing `embed()` try/catch, so an authorized but unconfigured attempt leaves its ordinary content-free failure ledger row. The error names `OPENAI_API_KEY` and includes no credential, endpoint or input text.

The configured OpenAI path and keyless local endpoint retain their existing SDK options, model/native/corpus widths, caching and election policy. No key format is introduced; a configured credential is passed unchanged. Resolution/keyless boot remains available. The local lane is unaffected by the OpenAI-only check. There is no fallback or new provider policy.

| Phase | Result | Qualification |
| --- | --- | --- |
| SDK-stub counterfactual before production guard | 3 failed / 4 passed; 29 deselected; 2.27 s | Missing/empty/whitespace incorrectly returned served vectors. Three placement-denial-priority controls and a keyless-local control passed. Production source was byte-identical to its genuine saved pre-change copy. |
| First four-file focused run | 59/59; zero skips; 6.47 s | Provider/election/placement and downstream innovation failure-honesty suites, SDK/embedding stubs only. |
| First scoped lint | Zero errors; two warnings | Existing function-size warning plus a new provider-fixture file-size warning. Preserved; no baseline increase accepted. |
| Final same four-file focused run | 59/59; zero skips; 10.84 s | Six credential/priority cases moved to the existing smaller election suite; keyless-local control stays in provider suite. Existing positive fixtures explicitly declare a fake SDK key. |
| Final three-file lint and original baseline comparison | Zero errors; one existing warning; zero new warning occurrences | Source/election have zero warnings. Provider fixture retains its existing function-size occurrence; original127→final130 lines and line148→149 are recorded honestly. New file-size warning is eliminated. |

Production change: `server/services/ai-gateway/embeddings/embedding-provider.ts`. Tests: its existing provider and election suites. Six old permitted OpenAI fixtures now supply the explicit non-secret `fixture-embedding-sdk-stub-only`; their prior output, width and upstream-failure assertions remain. Missing credentials still resolve a provider without an SDK client. Tests require no construction/create for each refused call, one failure row with zero tokens and no input/key content, and tenant-placement refusal priority. The keyless local positive verifies the existing `not-required` option, native1024 request and corpus1536 padding with its success ledger. The existing placement and failure-honesty suites retain their controls.

The initial seven new cases were located together in the provider fixture. The actual first lint JSON captured that unchanged first-phase test source before relocation; its source field is preserved privately and extracted to a pinned private snapshot. This is an actual captured fixture, not reconstructed code. The genuine production pre-change source is also privately pinned. Final exact source/test pins qualify the final green phase; both raw green runs and the initial raw red remain unchanged.

Copied new text removes ANSI/URL text and trailing whitespace; exact raw `/tmp` byte digests remain in `source-manifest.json`. Full lint JSON/source snapshots stay private and only bounded summaries are published. Earlier sealed evidence is untouched.

No real SDK transport, model/provider call, new key, dependency, native database, Docker build, compiler or complete-CI claim belongs to this phase. Its SDK stub proves configuration/admission order and ledger behavior, not embedding quality, provider availability or latency. Heavy unit slot #2 is released.

Design: [EMBEDDING_CREDENTIAL_READINESS.md](../../../../design/EMBEDDING_CREDENTIAL_READINESS.md).
