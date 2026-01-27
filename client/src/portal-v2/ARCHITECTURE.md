# TrialSage Client Portal V2 - Architecture

## Overview

The TrialSage Client Portal V2 is an enterprise-grade React application designed for regulatory compliance in life sciences. This document explains key architectural decisions and patterns used throughout the codebase.

## Directory Structure

```
portal-v2/
├── core/                    # Core types, configs, and business logic
│   ├── portalTypes.ts       # All TypeScript type definitions
│   ├── securityTypes.ts     # Security-specific types
│   └── regulatoryCompliance.ts  # Compliance utilities
├── hooks/                   # Custom React hooks
│   └── useSecurityContext.tsx   # Security state management
├── services/                # API and service layers
│   └── authService.tsx      # Authentication service
├── components/              # UI components
│   ├── admin/              # Admin portal components
│   ├── auth/               # Authentication components
│   ├── security/           # Security features
│   ├── compliance/         # Compliance monitoring
│   ├── monitoring/         # Activity monitoring
│   └── ...
└── utils/                   # Utilities
    └── logger.ts           # Structured logging
```

## Core Architectural Decisions

### 1. Context vs Props

**Decision**: Use React Context for cross-cutting concerns, Props for component-specific data.

**Context is used for:**

- **SecurityContext** (`useSecurityContext`): User authentication state, permissions, session management
- Rationale: This data is needed by many components at various levels of the tree

**Props are used for:**

- Component configuration
- Event handlers
- Data specific to a single component or its direct children

**Why not Redux?**

- The app has well-defined data boundaries (security, user, organization)
- Context API provides sufficient state management without additional complexity
- Compliance requirements benefit from explicit data flow patterns

### 2. Tenant Isolation

**Multi-tenant Architecture:**

```
User
 └── belongs to Organization(s)
      └── has Membership with Roles & Permissions
           └── scoped to specific Organization
```

**How it works:**

1. **Authentication Layer** (`authService.tsx`):
   - JWT tokens contain organization context
   - Token refresh maintains session continuity
   - Device fingerprinting for security

2. **Security Context** (`useSecurityContext.tsx`):
   - Maintains current organization context
   - Filters permissions by organization
   - Enforces organization-specific compliance rules

3. **Permission Checking**:

   ```typescript
   // Permission scopes: 'organization' | 'project' | 'document'
   const canEdit = hasPermission(permissions, 'write', 'documents');
   ```

4. **Organization Switching**:
   - Users can belong to multiple organizations
   - Switching triggers full permission recalculation
   - Session maintains organization affinity

### 3. E-Signature Flow (FDA 21 CFR Part 11)

**Component:** `ElectronicSignature.tsx`

**Flow:**

```
1. Action Trigger
   └── Display Meaning Declaration (11.50(b))
       └── Password Authentication (11.10(d))
           └── MFA Verification (if required)
               └── Generate Signature Hash
                   └── Record to Audit Trail (11.10(e))
                       └── Return Signature Object
```

**Signature Components:**

- `ElectronicSignatureGate`: Modal flow for signing
- `SignatureDisplay`: Shows signature details
- `SignatureVerificationBadge`: Validity indicator

**Hash Generation:**

```typescript
// Includes: userId, recordId, recordType, meaning, timestamp
// Uses Web Crypto API or crypto-js for SHA-256
const hash = generateSignatureHash(userId, recordId, meaning, timestamp);
```

**Meaning Declarations (11.50(b)):**

- Authorship: "I am the author..."
- Review: "I have reviewed..."
- Approval: "I approve..."
- Verification: "I verify..."
- Amendment: "I acknowledge this amendment..."
- Release: "I authorize release..."

### 4. Role-Based Access Control (RBAC)

**Predefined Roles:**

```typescript
type UserRole =
  | 'admin' // Full system access
  | 'regulatory_lead' // Submission management
  | 'clinical_ops' // Trial management
  | 'medical_writer' // Document authoring
  | 'biostatistician' // Statistical analysis
  | 'quality_assurance' // Compliance oversight
  | 'legal_counsel' // Legal review
  | 'executive' // Strategic oversight
  | 'cmc_specialist' // Manufacturing
  | 'safety_officer' // Pharmacovigilance
  | 'project_manager' // Coordination
  | 'viewer' // Read-only
  | 'external_partner'; // Limited collaboration
```

**Permission Structure:**

```typescript
interface Permission {
  resource: ResourceType; // 'documents', 'users', 'submissions', etc.
  action: PermissionAction; // 'read', 'write', 'delete', 'approve', '*'
  scope: PermissionScope; // 'organization', 'project', 'document'
  conditions?: Record<string, unknown>; // Additional constraints
}
```

### 5. Segregation of Duties (SoD)

**Conflict Detection:**

```typescript
const validation = validateSoD(existingRoles, newRole);
if (!validation.isValid) {
  // Show conflicts to user
  // Require manager approval or mitigation
}
```

**Common Conflicts:**

- Author ↔ Reviewer (same document)
- Preparer ↔ Approver (same submission)
- Developer ↔ Validator (same system)

**Mitigation Options:**

- Documented business justification
- Compensating controls
- Manager approval with audit trail

## Component Patterns

### Lazy Loading

All major components use React.lazy for code splitting:

```typescript
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));

// Usage with Suspense
<Suspense fallback={<LoadingFallback />}>
  <AdminDashboard />
</Suspense>
```

### Error Boundaries

Wrap critical sections with error boundaries:

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <CriticalComponent />
</ErrorBoundary>
```

### Form Handling

Use controlled components with validation:

```typescript
const [form, setForm] = useState({ email: '', password: '' });
const [errors, setErrors] = useState({});

const validate = () => {
  // Validation logic
};
```

## State Management Patterns

### Local State

- Component-specific UI state
- Form inputs
- Modal visibility

### Context State (useSecurityContext)

- User authentication
- Current organization
- Permissions
- Session information

### Server State (planned)

- React Query for API data
- Automatic cache invalidation
- Optimistic updates

## Styling Approach

- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Component library with Radix primitives
- **Consistent spacing**: Using Tailwind's spacing scale
- **Color tokens**: Defined in theme.json

## Compliance Integration

### Audit Logging

All significant actions are logged:

```typescript
import { adminLogger, auditLogger } from '../utils/logger';

// Usage
adminLogger.audit('User role changed', {
  userId,
  oldRoles,
  newRoles,
  changedBy: currentUser.id,
});
```

### Training Verification

Before certain actions:

```typescript
const isTrainingCurrent = securityContext.isTrainingCurrent();
if (!isTrainingCurrent) {
  // Block action, show training requirement
}
```

## Performance Considerations

1. **Code Splitting**: Lazy load all route-level components
2. **Memoization**: Use useMemo/useCallback for expensive computations
3. **Virtual Lists**: For large data tables (planned)
4. **Optimistic Updates**: For better UX on mutations

## Testing Strategy

See [TESTING.md](./TESTING.md) for detailed testing guidelines.

## Future Enhancements

1. **Offline Support**: Service worker for offline capability
2. **Real-time Updates**: WebSocket for live data
3. **Advanced Analytics**: User behavior tracking
4. **Mobile App**: React Native companion app
