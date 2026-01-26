# Portal-V2 Refactor List

**Generated:** January 25, 2026
**Status:** Active
**Priority:** Pre-Production Deployment

---

## High Priority (Blocking Production)

### 1. Router Dependency Resolution

**Issue:** `AdminPortalIndex.tsx` imports from `react-router-dom` but project uses `wouter@3.3.5`

**Files Affected:**

- `components/AdminPortalIndex.tsx`

**Options:**

**Option A: Install react-router-dom (Recommended if migration planned)**

```bash
npm install react-router-dom
```

**Option B: Migrate to wouter (Recommended for consistency)**

```tsx
// Change:
import { Routes, Route, Navigate } from 'react-router-dom';
// To:
import { Switch, Route, Redirect } from 'wouter';
```

**Current Workaround:** `@ts-expect-error` directive added (temporary)

---

### 2. Type Definition Alignment

**Issue:** Mock data in components doesn't match `securityTypes.ts` interfaces

**Error Count:** ~150 errors

**Files to Fix:**

#### `components/admin/UserManagement.tsx` (~40 errors)

| Property      | Expected Type                                        | Actual Type | Fix                    |
| ------------- | ---------------------------------------------------- | ----------- | ---------------------- |
| `status`      | `'active' \| 'inactive' \| 'suspended' \| 'pending'` | `string`    | Cast or update mock    |
| `lastLogin`   | `Date \| null`                                       | `string`    | Convert to Date        |
| `createdAt`   | `Date`                                               | `string`    | Convert to Date        |
| `permissions` | `Permission[]`                                       | `string[]`  | Use Permission objects |

**Fix Example:**

```tsx
// Before
const mockUsers = [{ status: 'active', lastLogin: '2024-01-15' }];

// After
const mockUsers: User[] = [{ status: 'active' as const, lastLogin: new Date('2024-01-15') }];
```

#### `components/audit/AuditTrailViewer.tsx` (~35 errors)

| Property    | Expected Type  | Actual Type           | Fix                  |
| ----------- | -------------- | --------------------- | -------------------- |
| `action`    | `AuditAction`  | `string`              | Use AuditAction enum |
| `timestamp` | `Date`         | `string`              | Convert to Date      |
| `details`   | `AuditDetails` | `Record<string, any>` | Type properly        |

#### `components/admin/OrganizationManagement.tsx` (~30 errors)

| Property    | Expected Type          | Actual Type | Fix             |
| ----------- | ---------------------- | ----------- | --------------- |
| `tier`      | `OrganizationTier`     | `string`    | Use enum value  |
| `createdAt` | `Date`                 | `string`    | Convert to Date |
| `settings`  | `OrganizationSettings` | `object`    | Type properly   |

#### `components/admin/RolePermissionManager.tsx` (~25 errors)

| Property      | Expected Type  | Actual Type | Fix                      |
| ------------- | -------------- | ----------- | ------------------------ |
| `permissions` | `Permission[]` | `string[]`  | Use Permission interface |
| `roleType`    | `RoleType`     | `string`    | Use RoleType enum        |

---

### 3. Implicit `any` Types

**Error Count:** 8 errors (TS7006)

**Files Affected:**

- `components/AdminPortalIndex.tsx`

**Fix Pattern:**

```tsx
// Before
items.map((item) => ...)

// After
items.map((item: ItemType) => ...)
```

---

## Medium Priority (Technical Debt)

### 4. Enum vs String Literal Alignment

**Issue:** Some components use string literals where enums are defined

**Files Affected:**

- `core/regulatoryCompliance.ts`
- `hooks/useSecurityContext.tsx`

**Pattern:**

```tsx
// Type definition uses
type Status = 'active' | 'inactive';

// But interface expects
status: UserStatus; // enum

// Fix: Align to one approach (prefer enums for runtime checking)
```

---

### 5. Optional Property Handling

**Issue:** Components access optional properties without null checks

**Error Count:** ~20 errors (TS2532)

**Fix Pattern:**

```tsx
// Before
user.organization.name;

// After
user.organization?.name ?? 'Unknown';
```

---

### 6. Date Handling Inconsistency

**Issue:** Dates represented as strings in some places, Date objects in others

**Recommendation:** Standardize on ISO strings from API, Date objects in state

```tsx
// API response
interface ApiUser {
  createdAt: string; // ISO string
}

// Domain model
interface User {
  createdAt: Date;
}

// Transform in service layer
const user: User = {
  ...apiUser,
  createdAt: new Date(apiUser.createdAt),
};
```

---

## Low Priority (Future Improvements)

### 7. Component Prop Types

**Issue:** Some components have inline type definitions instead of exported interfaces

**Recommendation:** Move all prop types to `securityTypes.ts`

```tsx
// Before (inline)
const UserCard: React.FC<{ user: User; onEdit: () => void }> = ...

// After (exported)
// In securityTypes.ts
export interface UserCardProps {
  user: User;
  onEdit: () => void;
}
// In component
const UserCard: React.FC<UserCardProps> = ...
```

---

### 8. Test Type Safety

**Issue:** Test files use mocks that may drift from actual types

**Recommendation:** Use `satisfies` operator in test mocks

```tsx
const mockUser = {
  id: '1',
  name: 'Test',
} satisfies Partial<User>;
```

---

## Error Resolution Checklist

### Phase 1: Critical Path (Estimated: 4 hours)

- [ ] Decide on router: react-router-dom vs wouter migration
- [ ] Implement router fix
- [ ] Fix `UserManagement.tsx` type errors
- [ ] Fix `AuditTrailViewer.tsx` type errors
- [ ] Remove `@ts-expect-error` directives

### Phase 2: Type Alignment (Estimated: 6 hours)

- [ ] Update all mock data to use proper types
- [ ] Add null checks for optional properties
- [ ] Standardize date handling across components
- [ ] Fix enum usage in components

### Phase 3: Polish (Estimated: 2 hours)

- [ ] Add explicit types to all callbacks
- [ ] Export component prop interfaces
- [ ] Update test mocks for type safety
- [ ] Run final `tsc --noEmit` verification

---

## Validation Command

After fixes, verify with:

```bash
npx tsc --noEmit 2>&1 | grep -E "portal-v2.*error TS" | wc -l
# Target: 0
```

---

## Notes

- Do NOT modify files outside `src/portal-v2`
- All changes must maintain backward compatibility
- Test each component after type fixes
- Update `VALIDATION_REPORT.md` after resolution
