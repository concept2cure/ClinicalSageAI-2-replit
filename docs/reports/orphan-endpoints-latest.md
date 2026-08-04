# Orphan-endpoint inventory

Generated: 2026-08-04T19:02:24.643Z

## Summary

- Declared server endpoints: **915**
- Consumed (client + server-to-server, heuristic): **314**
- Orphans (no caller reference): **601**

## Orphans by owner

| Owner | Count |
| --- | ---: |
| Platform API Gateway | 410 |
| CMC Platform | 101 |
| Identity Access | 54 |
| Regulatory Intelligence | 24 |
| Submission Workflows | 12 |

## Orphans by suggested decision

| Decision | Count | Meaning |
| --- | ---: | --- |
| keep-server-only | 5 | Webhook / callback / health / export — legitimately not called from the client UI |
| retire-candidate | 8 | Path or comment suggests test / demo / scaffold — review for removal |
| needs-review | 588 | Heuristic could not classify — manual triage required |

## Methodology + caveats

- Client consumption is detected by string-matching `/api/...` literals in client/src/. Dynamic path construction (`fetch(\`/api/${id}/foo\`)`) is matched on the static prefix.
- Server-to-server calls (worker → API, route → route) are not tracked. An endpoint flagged here may still be in use.
- Express path params are normalized to a prefix for comparison: `/api/projects/:id/foo` is considered consumed if the client references anything starting with `/api/projects/`.
- The `decision` field is a heuristic suggestion, not a verdict. Owners should review their lane.

## Detail

See `orphan-endpoints-latest.json` for the full per-endpoint list with file:line references.
