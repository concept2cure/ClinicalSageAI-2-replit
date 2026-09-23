# OAuth 2.1 + PKCE flow against the live connector (port 5300)

Actor: a Python script standing in for the Claude client; the user session is a dev-login platform token.

## 1. Discovery
```json
{
  "protected_resource": {
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
  },
  "authorization_server": {
    "issuer": "http://localhost:5300/",
    "authorization_endpoint": "http://localhost:5300/authorize",
    "token_endpoint": "http://localhost:5300/token",
    "registration_endpoint": "http://localhost:5300/register",
    "code_challenge_methods_supported": [
      "S256"
    ],
    "scopes_supported": [
      "c2c:read",
      "c2c:draft",
      "c2c:file"
    ]
  }
}
```

## 2. Dynamic client registration (RFC 7591) → HTTP 201
```json
{
  "redirect_uris": [
    "http://localhost:8765/callback"
  ],
  "token_endpoint_auth_method": "none",
  "grant_types": [
    "authorization_code",
    "refresh_token"
  ],
  "response_types": [
    "code"
  ],
  "client_name": "W7 evidence client",
  "client_id": "1d181352-465d-477a-af02-3c0099c5b70b",
  "client_id_issued_at": 1789949378
}
```

## 3. GET /authorize → HTTP 200 consent page (Content-Security-Policy: default-src 'none'; script-src 'nonce-dv6Xh+w1xtbuJJdx6g32cg…)
Page names client **W7 evidence client**, lists scopes: localhost:8765, c2c:read, c2c:draft; carries a signed pending-authorization assertion (547 chars).

## 4. POST /oauth/consent (allow, platform session verified by the ONE verifier) → HTTP 302
Location: `http://localhost:8765/callback?code=ehtzoserFDCXYbAeL5hQB7Wj…` (code 43 chars, state echoed: True)

## 5a. POST /token with a WRONG code_verifier → HTTP 400
```json
{"error":"invalid_grant","error_description":"code_verifier does not match the challenge"}
```

## 5b. POST /token with the RIGHT code_verifier → HTTP 200
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5\u2026",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "c2c:read c2c:draft",
  "refresh_token": "q8ngqxbNDhWhkIJJ7Bj7OAsX\u2026"
}
```

## 5c. Replay of the same code → HTTP 400
```json
{"error":"invalid_grant","error_description":"Authorization code has already been used"}
```

## 6a. tools/list with the connector-issued token → HTTP 200, 19 tools

## 6b. tools/call c2c_list_submissions → HTTP 200
```json
[
  {
    "type": "text",
    "text": "3 of 8 submission(s): #8 OQ-005 IND 20260921000258 (IND/fda); #7 OQ-005 Readiness program 20260921000258 (IND/fda); #6 OQ-004 IND 20260921000219 (IND/fda)."
  }
]
```

## 6c. tools/call c2c_file_draft_for_review with a token granted only c2c:read c2c:draft → HTTP 200
```json
{
  "content": [
    {
      "type": "text",
      "text": "Insufficient scope: c2c_file_draft_for_review requires c2c:file; this token carries [c2c:read c2c:draft]."
    }
  ],
  "structuredContent": {
    "tool": "c2c_file_draft_for_review",
    "refused": true,
    "reason": "Insufficient scope: c2c_file_draft_for_review requires c2c:file; this token carries [c2c:read c2c:draft]."
  },
  "isError": true
}
```

## 7a. POST /token grant_type=refresh_token → HTTP 200, scope `c2c:read c2c:draft`, new refresh issued: True

## 7b. Re-use of the ROTATED refresh token → HTTP 400
```json
{"error":"invalid_grant","error_description":"Refresh token has been revoked"}
```

## 7c. Refresh asking to WIDEN scope to c2c:file → HTTP 400
```json
{"error":"invalid_scope","error_description":"A refresh cannot request scopes beyond the original grant"}
```

