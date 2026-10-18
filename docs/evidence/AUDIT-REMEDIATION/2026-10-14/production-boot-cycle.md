# Production bundle initialization remedy — 2026-10-14

The compiled production server remained alive for more than 300 seconds without listening. It stopped during module initialization, before the entrypoint reached telemetry setup or startup gates. Source typechecking, ordinary Vitest route imports, and development browser tests had passed; they did not exercise this runtime behavior.

An ignored diagnostic bundle traced returned initializer promises. CSR Builder, workflow source import, source references, and draft references settled; `authoring-export.ts` and `workflow-import-governance.ts` remained mutually pending. Their ordinary circular imports became asynchronous because CSR Builder awaited its optional unified AI client at module scope. Esbuild cached the resulting async initializer promises, and each release module waited for the other.

CSR Builder now caches that same canonical client import and awaits it inside its five existing async drafting/analysis entrypoints. Reading outline metadata or importing release controls does not load a provider client. The change preserves the gateway request fields, usage checks, statistical-content refusal, source lineage, and explicit template fallback. It adds no dependencies, configuration escape hatch, or startup-gate bypass.

A follow-up review confirmed that the reachable single-section API labelled provider failures and rejected statistical drafts as `isAI: true`. Its shared drafting helper now retains the actual content source. The single-section route returns `isAI: false` for templates, forwards its verified organization/user to the gateway, and uses the generic `ai-gateway` label rather than inventing a Claude provider. Full builds continue to retain empty model output as an incomplete empty section; on-demand requests can offer a template explicitly labelled as such.

Verification:

- [Plain-Node production-built concurrent import before remedy](production-workflow-import-red.txt): Node reports unsettled top-level await. Concurrent initialization is essential to the fixture; direct and sequential service-entry probes had passed and were discarded as insufficient reproductions.
- [Lazy-client behavior before remedy](csr-lazy-client-red.txt): reading the outline had already initialized the AI client.
- [Single-section source honesty before remedy](csr-draft-source-honesty-red.txt): four actual API assertions fail for provider refusal, empty output, refused statistics, and unrecorded provider/actor context.
- [Final focused verification](csr-production-cycle-final-green.txt): 81 tests in 10 files pass, covering the plain-Node release graph, first/concurrent drafting, retained gateway identity fields, provider refusal/template provenance, E3 requirements, full-build data-completeness status, async CSR jobs, and the actual single-section API.
- [Scoped lint](csr-production-cycle-final-lint.txt): zero errors, five existing warnings. `git diff --check` passes.
- [Diagnostic initializer settlement](production-initializer-settlement.txt) identifies the mutually pending release modules. This instrumented bundle is diagnostic evidence only; the production bundle itself was not instrumented.
- [External import probes](production-external-import-probes.json): all 72 nonbuiltin static import specifiers from esbuild metadata initialize in isolated Node 22 production-mode children within five seconds. This narrowed the cause to the application's initialization graph.

The cold-import test deliberately starts no server and calls no provider. Full listener/readiness validation must use the uninstrumented rebuilt server and the normal production gates. Its evidence is owned by the lead's integrated verification. Neither the cold-import test nor the local accepted test postures qualify a live model, durable production storage, KMS, or agency transport.

This remedy fixes initialization. The first-study clinical-observation adapter and live-service qualification remain separate open requirements in the remediation ledger.

## Integrated listener proof

The uninstrumented rebuilt `dist/index.js` reached `/readyz` with HTTP 200 after six seconds on Node 22.23.3. Its response reports database, schema and storage as ready, deterministic AnA, and Redis/worker checks as skipped. The capability registry reports pending; this proof does not assert that every optional capability has initialized.

The synthetic `c2c_audit_production_boot` database was separately provisioned by the canonical 386-migration fresh-install path. The server used the actual non-superuser `app_service` role, enforcement on, and certificate-verified local PostgreSQL TLS. Stable synthetic signing/identity secrets were retained outside the repository so subsequent startup can verify its own immutable audit chain. An earlier attempt against the development browser fixture correctly refused audit rows created under other signing keys; those rows were not rewritten or deleted to pass startup.

Accepted HMAC, local-disk and deterministic-AI configurations match the existing local/CI test posture. They qualify the startup remedy, not live providers, KMS, durable production storage or real agency acceptance. The process was stopped after the proof. See [integrated listener evidence](integrated-production-boot.txt) and [fresh-install evidence](native-production-boot-provision.txt).
