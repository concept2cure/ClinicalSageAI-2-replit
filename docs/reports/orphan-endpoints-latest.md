# Orphan-endpoint inventory

Generated: 2026-05-07T05:43:04.046Z

## Summary

- Declared server endpoints: **1184**
- Consumed by client (heuristic): **272**
- Orphans (no client reference): **912**

## Orphans by owner

| Owner | Count |
| --- | ---: |
| Platform API Gateway | 603 |
| CMC Platform | 113 |
| Regulatory Intelligence | 74 |
| Identity Access | 47 |
| Platform Kernel | 47 |
| Submission Workflows | 21 |
| Reporting Intelligence | 4 |
| Authoring Governance | 2 |
| AI Platform | 1 |

## Orphans by suggested decision

| Decision | Count | Meaning |
| --- | ---: | --- |
| keep-server-only | 9 | Webhook / callback / health / export — legitimately not called from the client UI |
| retire-candidate | 10 | Path or comment suggests test / demo / scaffold — review for removal |
| needs-review | 893 | Heuristic could not classify — manual triage required |

## Methodology + caveats

- Client consumption is detected by string-matching `/api/...` literals in client/src/. Dynamic path construction (`fetch(\`/api/${id}/foo\`)`) is matched on the static prefix.
- Server-to-server calls (worker → API, route → route) are not tracked. An endpoint flagged here may still be in use.
- Express path params are normalized to a prefix for comparison: `/api/projects/:id/foo` is considered consumed if the client references anything starting with `/api/projects/`.
- The `decision` field is a heuristic suggestion, not a verdict. Owners should review their lane.

## Detail

See `orphan-endpoints-latest.json` for the full per-endpoint list with file:line references.
