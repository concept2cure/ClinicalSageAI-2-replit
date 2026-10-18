# MCP validation adapter discovery metadata

Owned change: `server/mcp/tools/validation.ts` and focused registered-tool fixture `server/mcp/__tests__/mcp-validation-adapter-metadata.test.ts`. No dispatch gate, qualification runner, input schema, access policy or structural-validator result changes.

The tool now reports the server-selected adapter `kind`, discovery `adapterAvailable`, external-only `configuredExternal` and compatibility `configured`, `execution: not_run`, `ran: false`, and `qualification: not_assessed`. Resolver/configuration failures and unexpected classification/availability values remain unknown. The summary says “Validation adapter”; an available FDA subset remains internal, and an external path/endpoint configuration does not establish a licence or qualified coverage. This tool never executes the selected adapter.

Verification used Node 22 at `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node` with the repository Vitest and ESLint installations:

- `mcp-validator-red.txt`: 7 metadata assertions failed on the original tool; structural-result preservation and read-scope denial passed.
- `mcp-validator-invalid-red.txt`: independent review prompted 2 unexpected-value fixtures; both failed before normalization, while the prior 9 passed.
- `mcp-validator-green.txt`: all 11 registered-tool cases pass after the change. Tests use the actual structural validator and MCP wrapper, stubbing only adapter discovery and audit persistence. They assert the adapter execution method is never called and preserve scope denial before discovery.
- `mcp-validator-lint.txt`: initial scoped ESLint exited 0 but contained **one new complexity warning** (`run` complexity 19, limit 15). A zero exit code did not establish zero warnings; root's baseline comparison caught the regression.
- `mcp-validator-refactor-green.txt`: all 11 registered-tool cases pass after moving discovery/metadata/copy into the private `validationAdapterDiscovery` helper in the same owned file. Behaviour, trusted kind, strict availability, not-run fields, compatibility metadata and access policy are unchanged.
- `mcp-validator-refactor-lint.txt`: scoped ESLint with `--max-warnings 0` exits 0, proving **zero errors and zero warnings** for the owned tool/test. Owned-file `git diff --check` also exits 0.

These are local metadata and policy regression results, not licensed-engine execution, independent package qualification, agency acceptance or a deployment claim. Other concurrent work and the deferred qualification-runner classification are outside this change.
