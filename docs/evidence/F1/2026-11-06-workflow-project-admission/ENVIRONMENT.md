# Execution restored

The shell, filesystem writes and local test runner are usable again. This is a
fresh workspace: the October working tree and its local archives were not found.
The current public source was cloned into `/workspace/Concept2cure-v2`, on the
sole branch `concept2cure-v2`, at `21a21849d7cfb8a35794489a87fad2b849c7011c`.
The complete branch history is present, with Git's blob filter; the deleted-file
inventory can run locally. No alternative branch or worktree was created.

## Tooling checks

- Node 22.23.4 was installed with `npm exec --package=node@22`; the system's
  Node 24 is outside this repository's engines range and is not used for checks.
- `npm ci --no-audit --no-fund` completed with 2,421 packages in 42 seconds.
  Package and lockfile bytes did not change. Husky uses `.husky/_`.
- Vitest 4.1.7 runs locally under Node 22. The initial smoke run passed eight
  existing workflow-template/audit-transaction tests across two files.
- The managed Docker daemon is available. PostgreSQL 16 runs in disposable
  container `c2c-workflow-repair-postgres`, loopback port 55432, database
  `c2c_workflow_dbtest`. `pg_isready` confirmed readiness. Its password is a
  throwaway local fixture value. No production credential was configured.
- The native fixture provisions a separate NOSUPERUSER/NOBYPASSRLS runtime role
  and a disposable schema through the existing scheduler harness. The owner is
  used only for test setup and assertions. FORCE tenant RLS remains enabled.

## Reproduction

A fresh checkout uses the same source branch:

```sh
git clone --filter=blob:none --single-branch --branch concept2cure-v2 https://github.com/concept2cure/ClinicalSageAI-2-replit.git /workspace/Concept2cure-v2
cd /workspace/Concept2cure-v2
task_node_bin="$(npm exec --yes --package=node@22 -- node -p 'require("node:path").dirname(process.execPath)')"
PATH="$task_node_bin:$PATH" npm ci --no-audit --no-fund
PATH="$task_node_bin:$PATH" node node_modules/vitest/vitest.mjs run server/services/tasking/__tests__/workflow-templates.test.ts server/services/tasking/__tests__/task-audit-transaction.test.ts
```

The native suite also needs a disposable PostgreSQL database with permission to
create roles and schemas. The final verification records its exact command and
source hashes. This setup is a local test environment, not a production deploy
or a full login/UI qualification.
