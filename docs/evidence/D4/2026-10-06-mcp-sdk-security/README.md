# D4 dependency security: MCP SDK issuer binding

The Security Scan job on published commit `0e0bb7ec416731db7caaaa139e5a4616404321bd` failed on GHSA-6qxp-vccf-f47h against the direct, pinned `@modelcontextprotocol/sdk@1.30.0`. Both Trivy steps and the security contracts passed. The exact npm evidence from run 37506231487 is retained in `ci-before-audit.json`.

Upstream advisory: https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h . Affected SDK versions are >=1.12.0 and <1.31.0. The application now pins 1.32.1 (https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.1), preserving the existing v1 API and dependency graph; this is an existing dependency security update, with no new production package.

The application uses SDK server OAuth/resource discovery and stateless server transports. Its SDK client calls use explicit bearer headers. A source search across server/shared/scripts/client found no `authProvider`, `withOAuth`, direct SDK client-auth import, or bundled SDK OAuth client provider requiring issuer migration. This is a source assessment, not a claim about clients outside this repository.

Validation: the live lockfile audit gate passes under Node 22.16.0; mechanical resealing verified that the three existing reviewed High findings are unchanged. No exception or risk disposition was added. Five connector suites pass (40 tests). Two installed-SDK runtime tests prove mismatched issuer rejection with zero fetch calls and successful token exchange against the bound issuer; CI runs them independently in Security Contract Tests.

The same issuer test was run against the cached 1.30.0 package in an isolated temporary directory: the mismatched-issuer case fails because it reaches the injected fetch callback; the bound-issuer control passes. See `before-issuer-tests.txt`. The patched version passes both cases. All 32 dependency-risk and vulnerability behavior self-tests pass.

This fixes the dependency failure observed in candidate CI. Complete CI on the patched commit and live database connector qualification remain separate gates. Document-data disposition UI/API enforcement remains the next implementation workstream.
