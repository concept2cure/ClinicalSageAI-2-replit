# Supported Node.js runtime

The sole supported application runtime is **Node.js 22 LTS** (`>=22.0.0 <23.0.0`)
with **npm 10 or later**. Node 23 and later are not supported until this contract
is explicitly reviewed and advanced. The repository uses the Node 22 LTS major
selector so CI, developer version managers, deployment platforms, and container rebuilds receive current
security and patch releases within that LTS line.

## Active runtime contracts

The runtime is declared by:

- `package.json`, `.npmrc` (fail-closed engine enforcement), and the root lockfile package metadata;
- `.nvmrc`, `.node-version`, `.replit`, and `.devcontainer/devcontainer.json`;
- every workflow under `.github/workflows/` that installs Node;
- `Dockerfile.optimized` for build and production container stages;
- `app.yaml` for the App Engine deployment path; and
- the current IQ/OQ protocol and installation templates under `docs/validation/`
  and `docs/beta/validation/`; and
- active architecture and operator prerequisites under `docs/architecture/` and
  `docs/guides/`.

Run `npm run ci:node-runtime` to validate these contracts. CI runs the same
check. `npm run ci:node-runtime:self-test` proves that the guard rejects a
simulated downgrade to Node 20.

Historical audit reports, evidence logs, changelogs, and vendored test fixtures
may describe the runtime that existed when they were produced. They are records,
not active runtime contracts, and must not be rewritten to conceal that history.
Updating an IQ/OQ requirement does not execute, approve, or qualify it; qualified
personnel must complete the controlled protocols before any qualification claim.
