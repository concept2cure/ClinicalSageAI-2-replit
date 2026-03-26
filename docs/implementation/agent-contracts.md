# Agent Contracts

## Artifact UX + governed output agent contract
- Input: plan/execute draft proposal
- Output: proposal records with accept/reject transitions and version rail payload
- Boundary: no direct transcript overwrite

## Retrieval agent contract
- Input: source text, tags, query scope
- Output: chunked index + scoped chunk retrieval
- Boundary: retrieval only, no mutation of artifacts

## Tool gate agent contract
- Input: conversation id + mode + tool manifest
- Output: allow/block decisions + auditable events
- Boundary: enforce stricter mutating permissions

## Scout agent contract
- Input: objective + optional tags
- Output: compact findings with promote flag
- Boundary: read-only behavior

## Orchestration agent contract
- Input: task objective
- Output: classifier, step trace, draft
- Boundary: hard tasks force retrieve->execute pathway

## Quality loop agent contract
- Input: draft + required contract keywords
- Output: pass/fail + bounded revisions
- Boundary: bounded iterations, easy-task bypass
