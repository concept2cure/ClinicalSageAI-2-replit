# Product Audit API - Quick Reference

## 🚀 Quick Start

### Endpoints
```
GET  /api/product-audit/responses  # Get audit responses
POST /api/product-audit/responses  # Save audit responses
```

### Authentication
All endpoints require:
- `Authorization: Bearer <JWT_TOKEN>` header
- Valid organization context

## 📝 Request/Response Examples

### GET Responses
```bash
curl -X GET http://localhost:3000/api/product-audit/responses \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organizationId": 100,
    "responses": {
      "1.1": {
        "questionId": "1.1",
        "status": "yes",
        "notes": "Verified",
        "severity": "verified",
        "updatedAt": "2025-01-24T10:30:00Z"
      }
    },
    "lastUpdated": "2025-01-24T10:30:00Z",
    "auditor": "user@example.com"
  }
}
```

### POST Responses
```bash
curl -X POST http://localhost:3000/api/product-audit/responses \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "responses": {
      "1.1": {
        "questionId": "1.1",
        "status": "yes",
        "notes": "All requirements met",
        "severity": "verified",
        "updatedAt": "2025-01-24T10:30:00Z"
      },
      "2.3": {
        "questionId": "2.3",
        "status": "partial",
        "notes": "Missing documentation",
        "severity": "p1",
        "updatedAt": "2025-01-24T10:35:00Z"
      }
    },
    "auditor": "qa@example.com"
  }'
```

## 📊 Data Types

### Status Values
| Value | Meaning |
|-------|---------|
| `yes` | Fully satisfied |
| `no` | Not satisfied |
| `partial` | Partially satisfied |
| `in_progress` | Assessment in progress |
| `null` | Not evaluated |

### Severity Levels
| Value | Priority | Meaning |
|-------|----------|---------|
| `p0` | Critical | Blocking issue |
| `p1` | High | Major issue |
| `p2` | Medium | Moderate issue |
| `p3` | Low | Minor issue |
| `verified` | - | Verified & compliant |
| `null` | - | Not assessed |

## 🔧 TypeScript Integration

```typescript
interface AuditResponse {
  questionId: string;
  status: 'yes' | 'no' | 'partial' | 'in_progress' | null;
  notes: string;
  severity: 'p0' | 'p1' | 'p2' | 'p3' | 'verified' | null;
  updatedAt: string; // ISO 8601
}

interface AuditState {
  organizationId: number;
  responses: Record<string, AuditResponse>;
  lastUpdated: string;
  auditor: string;
}

// GET /api/product-audit/responses
const response = await fetch('/api/product-audit/responses', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data }: { data: AuditState } = await response.json();

// POST /api/product-audit/responses
const saveResponse = await fetch('/api/product-audit/responses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    responses: {
      '1.1': {
        questionId: '1.1',
        status: 'yes',
        notes: 'Verified',
        severity: 'verified',
        updatedAt: new Date().toISOString()
      }
    },
    auditor: 'user@example.com'
  })
});
```

## ⚠️ Important Notes

### In-Memory Storage
- Data is stored in-memory (Map)
- **Data is lost on server restart**
- Suitable for development/MVP only
- Migrate to database for production

### Response Merging
- POST merges with existing responses
- Updates existing question responses
- Adds new question responses
- Preserves unchanged responses

### Organization Isolation
- Each organization has separate audit state
- Users can only access their own org's data
- Enforced by middleware

## ❌ Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid request data",
  "details": [...]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 500 Server Error
```json
{
  "success": false,
  "error": "Failed to save audit responses"
}
```

## 📚 Full Documentation

- API Docs: `docs/api/product-audit.md`
- Implementation: `docs/implementation/product-audit-api-summary.md`
- Source: `server/routes/product-audit.ts`
- Tests: `server/routes/__tests__/product-audit.test.ts`

## 🧪 Testing

Run tests:
```bash
npm test -- product-audit.test.ts
```

Manual test with curl:
```bash
# 1. Login to get token
TOKEN="your_jwt_token"

# 2. Get current state
curl -X GET http://localhost:3000/api/product-audit/responses \
  -H "Authorization: Bearer $TOKEN"

# 3. Save responses
curl -X POST http://localhost:3000/api/product-audit/responses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"responses": {"1.1": {"questionId": "1.1", "status": "yes", "notes": "OK", "severity": "verified", "updatedAt": "2025-01-24T10:00:00Z"}}}'

# 4. Verify save
curl -X GET http://localhost:3000/api/product-audit/responses \
  -H "Authorization: Bearer $TOKEN"
```

## 🔐 Security

✅ JWT authentication required  
✅ Organization context validated  
✅ Input validation with Zod  
✅ Type-safe TypeScript  
✅ No SQL injection (in-memory)  
✅ XSS prevention (JSON encoding)  

## 🚦 Status

**Current**: ✅ Implemented and tested  
**Production Ready**: ⚠️ Requires database migration  
**Next Steps**: Frontend integration  
