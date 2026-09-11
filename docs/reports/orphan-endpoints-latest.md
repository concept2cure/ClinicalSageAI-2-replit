# Orphan-endpoint inventory

Generated: 2026-09-11T03:29:04.792Z

## Summary

- Declared server endpoints: **865**
- Consumed (client + server-to-server, heuristic): **379**
- Orphans (no caller reference): **486**

## Orphans by owner

| Owner | Count |
| --- | ---: |
| Platform API Gateway | 361 |
| CMC Platform | 65 |
| Identity Access | 36 |
| Regulatory Intelligence | 24 |

## Orphans by suggested decision

| Decision | Count | Meaning |
| --- | ---: | --- |
| keep-server-only | 4 | Webhook / callback / health / export — legitimately not called from the client UI |
| retire-candidate | 6 | Path or comment suggests test / demo / scaffold — review for removal |
| needs-review | 476 | Heuristic could not classify — manual triage required |

## Methodology + caveats

- Client consumption is detected by string-matching `/api/...` literals in client/src/. Dynamic path construction (`fetch(\`/api/${id}/foo\`)`) is matched on the static prefix.
- Server-to-server calls (worker → API, route → route) are not tracked. An endpoint flagged here may still be in use.
- Express path params are normalized to a prefix for comparison: `/api/projects/:id/foo` is considered consumed if the client references anything starting with `/api/projects/`.
- The `decision` field is a heuristic suggestion, not a verdict. Owners should review their lane.

## Detail

See `orphan-endpoints-latest.json` for the full per-endpoint list with file:line references.
