# Orphan-endpoint inventory

Generated: 2026-08-13T02:45:22.731Z

## Summary

- Declared server endpoints: **881**
- Consumed (client + server-to-server, heuristic): **326**
- Orphans (no caller reference): **555**

## Orphans by owner

| Owner | Count |
| --- | ---: |
| Platform API Gateway | 398 |
| CMC Platform | 77 |
| Identity Access | 44 |
| Regulatory Intelligence | 24 |
| Submission Workflows | 12 |

## Orphans by suggested decision

| Decision | Count | Meaning |
| --- | ---: | --- |
| keep-server-only | 5 | Webhook / callback / health / export — legitimately not called from the client UI |
| retire-candidate | 6 | Path or comment suggests test / demo / scaffold — review for removal |
| needs-review | 544 | Heuristic could not classify — manual triage required |

## Methodology + caveats

- Client consumption is detected by string-matching `/api/...` literals in client/src/. Dynamic path construction (`fetch(\`/api/${id}/foo\`)`) is matched on the static prefix.
- Server-to-server calls (worker → API, route → route) are not tracked. An endpoint flagged here may still be in use.
- Express path params are normalized to a prefix for comparison: `/api/projects/:id/foo` is considered consumed if the client references anything starting with `/api/projects/`.
- The `decision` field is a heuristic suggestion, not a verdict. Owners should review their lane.

## Detail

See `orphan-endpoints-latest.json` for the full per-endpoint list with file:line references.
