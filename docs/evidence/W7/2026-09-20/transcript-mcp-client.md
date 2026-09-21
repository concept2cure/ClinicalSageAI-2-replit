# MCP client transcript — 2026-09-21T00:09:06.763Z

Server: http://localhost:5300/mcp  
Client: @modelcontextprotocol/sdk Client over StreamableHTTPClientTransport (separate process, bearer from dev-login)

## Unauthenticated POST /mcp

```json
{
  "status": 401,
  "www-authenticate": "Bearer error=\"invalid_token\", error_description=\"Missing Authorization header\", resource_metadata=\"http://localhost:5300/.well-known/oauth-protected-resource/mcp\""
}
```

## GET /.well-known/oauth-protected-resource/mcp

```json
{
  "resource": "http://localhost:5300/mcp",
  "authorization_servers": [
    "http://localhost:5300/"
  ],
  "scopes_supported": [
    "c2c:read",
    "c2c:draft",
    "c2c:file"
  ],
  "resource_name": "Concept2Cure",
  "resource_documentation": "http://localhost:5300/concept2cure/connector"
}
```

## initialize → server

```json
{
  "server": {
    "name": "concept2cure",
    "title": "Concept2Cure",
    "version": "1.0.0"
  },
  "instructions": "Concept2Cure is the regulatory operating system behind these tools. Claude drafts; Concept2Cure governs, validates and submits. Every number, verdict and readiness state returned here is computed by a deterministic platform engine — report it verbatim and never estimate one yourself. An error result is a refusal from the platform (no licence, no credentials, no data, wrong tenant); relay it, do not work around it. The only write, c2c_file_draft_for_review, creates a DRAFT leaf; signing, freezing and transmitting a sequence happen in the Concept2Cure app behind 21 CFR Part 11 electronic signature."
}
```

## tools/list

```json
[
  {
    "name": "c2c_list_projects",
    "title": "List projects",
    "annotations": {
      "title": "List projects",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_list_submissions",
    "title": "List submissions",
    "annotations": {
      "title": "List submissions",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_list_sequences",
    "title": "List eCTD sequences",
    "annotations": {
      "title": "List eCTD sequences",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_get_sequence_status",
    "title": "Get sequence status",
    "annotations": {
      "title": "Get sequence status",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_assess_sequence_readiness",
    "title": "Assess sequence readiness",
    "annotations": {
      "title": "Assess sequence readiness",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_readiness_overview",
    "title": "Organisation readiness overview",
    "annotations": {
      "title": "Organisation readiness overview",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_validate_ectd_structure",
    "title": "Validate eCTD structure",
    "annotations": {
      "title": "Validate eCTD structure",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_sweep_contradictions",
    "title": "Sweep claims for contradictions",
    "annotations": {
      "title": "Sweep claims for contradictions",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_lookup_ich_guideline",
    "title": "Look up ICH guideline",
    "annotations": {
      "title": "Look up ICH guideline",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_check_regulatory_currency",
    "title": "Check regulatory currency",
    "annotations": {
      "title": "Check regulatory currency",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_lookup_submission_deficiencies",
    "title": "Look up submission deficiencies",
    "annotations": {
      "title": "Look up submission deficiencies",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_run_crl_premortem",
    "title": "Run CRL/RTF pre-mortem",
    "annotations": {
      "title": "Run CRL/RTF pre-mortem",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_search_precedents",
    "title": "Search regulatory precedents",
    "annotations": {
      "title": "Search regulatory precedents",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_list_vault_documents",
    "title": "List vault documents",
    "annotations": {
      "title": "List vault documents",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_search_vault_documents",
    "title": "Search vault documents",
    "annotations": {
      "title": "Search vault documents",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": true
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_ga_readiness_probe",
    "title": "Deployment readiness probe",
    "annotations": {
      "title": "Deployment readiness probe",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:read",
    "governed": false
  },
  {
    "name": "c2c_draft_cover_letter",
    "title": "Draft cover letter",
    "annotations": {
      "title": "Draft cover letter",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "scope": "c2c:draft",
    "governed": false
  },
  {
    "name": "c2c_draft_agency_response",
    "title": "Draft agency response narrative",
    "annotations": {
      "title": "Draft agency response narrative",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": false,
      "openWorldHint": true
    },
    "scope": "c2c:draft",
    "governed": false
  },
  {
    "name": "c2c_file_draft_for_review",
    "title": "File draft into sequence for review",
    "annotations": {
      "title": "File draft into sequence for review",
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": false,
      "openWorldHint": false
    },
    "scope": "c2c:file",
    "governed": true
  }
]
```

## tools/call c2c_list_projects

```json
{
  "content": [
    {
      "type": "text",
      "text": "5 of 6 program(s): ORP2 (ind), OSP2 (ind), OAP2 (ind), OVP2 (ind), OIP2-B7S8 (ind)."
    }
  ],
  "structuredContent": {
    "tool": "c2c_list_projects",
    "organizationId": 2,
    "total": 6,
    "projects": [
      {
        "id": "ab582b38-7e13-4c9b-8762-f7389e8f0022",
        "code": "ORP2",
        "name": "OQ-005 Readiness program 20260921000258",
        "programType": "ind",
        "productType": "biologic",
        "productName": "OQ-005 Readiness program 20260921000258",
        "primaryAgency": "FDA",
        "status": "active",
        "phase": "planning",
        "leadUserName": "JM Smith",
        "targetSubmissionDate": null,
        "updatedAt": "2026-09-21T00:02:58.895Z"
      },
      {
        "id": "af3550dc-b857-4eae-8f3a-84e5cecf3222",
        "code": "OSP2",
        "name": "OQ-004 Submission program 20260921000219",
        "programType": "ind",
        "productType": "biologic",
        "productName": "OQ-004 Submission program 20260921000219",
        "primaryAgency": "FDA",
        "status": "active",
        "phase": "planning",
        "leadUserName": "JM Smith",
        "targetSubmissionDate": null,
        "updatedAt": "2026-09-21T00:02:19.615Z"
      },
      {
        "id": "4b92e28e-8283-4cb1-96b4-e92ffcf87044",
        "code": "OAP2",
        "name": "OQ-003 Authoring program 20260921000212",
        "programType": "ind",
        "productType": "biologic",
        "productName": "OQ-003 Authoring program 20260921000212",
        "primaryAgency": "FDA",
        "status": "active",
        "phase": "planning",
        "leadUserName": "JM Smith",
        "targetSubmissionDate": null,
        "updatedAt": "2026-09-21T00:02:12.373Z"
      },
      {
        "id": "ab4cce3e-a0d1-45b3-a6a4-fb36a06bb766",
        "code": "OVP2",
        "name": "OQ-002 Vault program 20260921000132",
        "programType": "ind",
        "productType": "biologic",
        "productName": "OQ-002 Vault program 20260921000132",
        "primaryAgency": "FDA",
        "status": "active",
        "phase": "planning",
        "leadUserName": "JM Smith",
        "targetSubmissionDate": null,
        "updatedAt": "2026-09-21T00:01:32.371Z"
      },
      {
        "id": "607fe5e3-f382-408b-a5fb-caff05389667",
        "code": "OIP2-B7S8",
        "name": "OQ-001 IND program 20260921000014",
        "programType": "ind",
        "productType": "biologic",
        "productName": "OQ-001 IND program 20260921000014",
        "primaryAgency": "FDA",
        "status": "active",
        "phase": "planning",
        "leadUserName": "JM Smith",
        "targetSubmissionDate": null,
        "updatedAt": "2026-09-21T00:00:18.728Z"
      }
    ]
  }
}
```

## tools/call c2c_assess_sequence_readiness

```json
{
  "content": [
    {
      "type": "text",
      "text": "c2c_assess_sequence_readiness failed: The requested module '../../../shared/regulatory/region-identity.js' does not provide an export named 'canonicalRegionOf'"
    }
  ],
  "structuredContent": {
    "tool": "c2c_assess_sequence_readiness",
    "refused": true,
    "reason": "c2c_assess_sequence_readiness failed: The requested module '../../../shared/regulatory/region-identity.js' does not provide an export named 'canonicalRegionOf'"
  },
  "isError": true
}
```

## tools/call c2c_get_sequence_status

```json
{
  "content": [
    {
      "type": "text",
      "text": "Sequence 0000 (fda) is draft with 1 leaf/leaves; release signature: undetermined."
    }
  ],
  "structuredContent": {
    "tool": "c2c_get_sequence_status",
    "sequence": {
      "id": 1,
      "submissionId": 6,
      "region": "fda",
      "sequenceNumber": "0000",
      "type": "original",
      "status": "draft",
      "validationStatus": null,
      "dispatchStatus": null,
      "frozenAt": null
    },
    "leafCount": 1,
    "leaves": [
      {
        "id": 1,
        "sectionCode": "m1.2",
        "title": "Cover letter",
        "lifecycleOp": "new",
        "documentTable": "vault_documents",
        "documentId": null,
        "documentUuid": "f37490b1-72f3-4935-b01d-8bb591f5bd66",
        "documentType": null
      }
    ],
    "releaseSignature": {
      "verdict": "undetermined",
      "detail": "signature lookup failed: The requested module '../../../shared/regulatory/region-identity.js' does not provide an export named 'canonicalRegionOf'"
    },
    "signOff": {
      "url": "http://localhost:5300/concept2cure/submission-center",
      "note": "Freeze, sign and dispatch happen in Submission Center behind 21 CFR Part 11 electronic signature."
    }
  }
}
```

## tools/call c2c_draft_agency_response (no provider key — expect verbatim refusal)

```json
{
  "content": [
    {
      "type": "text",
      "text": "[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly."
    }
  ],
  "structuredContent": {
    "tool": "c2c_draft_agency_response",
    "refused": true,
    "reason": "[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly.",
    "provider": null
  },
  "isError": true
}
```
