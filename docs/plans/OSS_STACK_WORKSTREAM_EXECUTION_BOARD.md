# OSS Stack Workstream Execution Board (Supervisor-Led)

## Operating mode
Use one control-tower supervisor and a small number of focused implementation agents working in separate worktrees.

## Active workstream slots (max 3 at a time)
1. Control tower (always on)
2. Ingestion plane
3. Governance/observability plane

When contracts stabilize, rotate in retrieval/workflow/eval planes.

## Step-by-step swarm loop
1. **Plan lock (supervisor)**
   - confirm contract dependencies
   - confirm no-go boundaries
   - confirm feature flags + rollback notes
2. **Build slice (implementation agent)**
   - implement one small contract-aligned slice
   - keep new paths flag-off by default
3. **Self-check (implementation agent)**
   - run local checks
   - prepare delta summary with risk notes
4. **Supervisor audit (control tower)**
   - run `npm run oss:supervisor:audit`
   - verify no-break surfaces untouched/bounded
   - verify docs/contracts updated if interfaces changed
5. **Checkpoint record (supervisor)**
   - create checkpoint artifact under `docs/audits/checkpoints/`
   - record go/no-go for merge

## Merge policy
- No checkpoint + no supervisor sign-off = no merge.
- Failures route back to implementation agent with specific remediation items.
- At least one checkpoint per merged slice.

## Workstream IDs
- `control-tower`
- `ingestion-plane`
- `governance-observability-plane`
- `retrieval-evidence-plane`
- `workflow-compute-plane`
- `eval-release-plane`
