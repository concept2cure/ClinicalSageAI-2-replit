# TrialSage Client Portal V2 - Testing Guide

## Overview

This document outlines the testing strategy for the TrialSage Client Portal V2, with emphasis on regulatory compliance requirements (FDA 21 CFR Part 11, ICH E6 GCP).

## Testing Framework

- **Vitest**: Test runner (fast, Vite-native)
- **React Testing Library**: Component testing
- **Playwright**: End-to-end testing
- **MSW**: API mocking

## Running Tests

```bash
# Run all tests
npm test -- src/portal-v2

# Run specific test file
npm test -- src/portal-v2/hooks/useSecurityContext.test.tsx

# Run with coverage
npm test -- src/portal-v2 --coverage

# Run E2E tests
npm run test:e2e -- --grep "portal-v2"
```

## Test Categories

### 1. Unit Tests

**Location**: Same directory as source file with `.test.ts(x)` suffix

**What to Test:**

- Pure functions (utilities, validators)
- Custom hooks (state logic)
- Business logic (compliance rules)

**Example:**

```typescript
// regulatoryCompliance.test.ts
describe('validateSoD', () => {
  it('should detect author-reviewer conflict', () => {
    const result = validateSoD(['medical_writer'], 'quality_assurance');
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});
```

### 2. Component Tests

**Location**: Same directory as component

**What to Test:**

- Rendering with various props
- User interactions
- Accessibility
- Error states

**Example:**

```typescript
// ElectronicSignature.test.tsx
describe('ElectronicSignatureGate', () => {
  it('should display meaning declaration', () => {
    render(<ElectronicSignatureGate meaning="approval" {...props} />);
    expect(screen.getByText('Approval Declaration')).toBeInTheDocument();
  });
});
```

### 3. Integration Tests

**Location**: `__tests__/integration/`

**What to Test:**

- Component interactions
- Context providers
- Data flow between components

### 4. End-to-End Tests

**Location**: `tests/e2e/`

**What to Test:**

- Critical user journeys
- Full authentication flows
- Compliance-critical paths

## Required Test Coverage

### Critical Components (Target: 90%+)

| Component            | Current | Target | Notes                  |
| -------------------- | ------- | ------ | ---------------------- |
| useSecurityContext   | -       | 90%    | Auth is critical       |
| ElectronicSignature  | -       | 85%    | Regulatory requirement |
| regulatoryCompliance | -       | 80%    | Business logic         |
| authService          | -       | 85%    | Security               |
| LoginPage            | -       | 75%    | User-facing auth       |

### Component Categories

| Category      | Target Coverage |
| ------------- | --------------- |
| Security      | 85%+            |
| Auth          | 85%+            |
| Admin         | 70%+            |
| UI Components | 60%+            |

## Unit Test Requirements

### useSecurityContext (`hooks/useSecurityContext.test.tsx`)

Must test:

- [ ] Initial state (unauthenticated)
- [ ] Authentication state after login
- [ ] Permission checking (hasPermission)
- [ ] Role checking (hasRole, hasAnyRole, hasAllRoles)
- [ ] Session time remaining
- [ ] Session expiry detection
- [ ] SoD validation
- [ ] Training currency check
- [ ] Compliance score calculation
- [ ] Organization switching
- [ ] Security event logging
- [ ] Error handling (outside provider)

### ElectronicSignature (`components/security/ElectronicSignature.test.tsx`)

Must test:

- [ ] Meaning declaration display (all 6 types)
- [ ] Password step validation
- [ ] Password visibility toggle
- [ ] MFA step progression
- [ ] MFA code validation
- [ ] Successful signature completion
- [ ] Signature hash uniqueness
- [ ] Cancel handling
- [ ] Accessibility (form labels, ARIA)
- [ ] Focus management
- [ ] 11.50(b) compliance (meaning display)
- [ ] 11.50(a) compliance (signer identification)

### regulatoryCompliance (`core/regulatoryCompliance.test.ts`)

Must test:

- [ ] validateSoD - single role
- [ ] validateSoD - conflict detection
- [ ] validateSoD - multiple roles
- [ ] validateSoD - mitigation suggestions
- [ ] hasPermission - granted
- [ ] hasPermission - denied
- [ ] hasPermission - wildcards
- [ ] ROLE_PERMISSION_PRESETS - all roles defined
- [ ] getArchetypeConfig - all archetypes
- [ ] getComplianceCategory - score boundaries
- [ ] SOD_CONFLICT_MATRIX - no self-conflicts

## End-to-End Test Requirements

### Critical Path: Login → E-sign → Audit

```typescript
// tests/e2e/portal-v2/auth-esign-audit.spec.ts

test('Complete regulatory workflow', async ({ page }) => {
  // 1. Login
  await page.goto('/auth/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'SecurePassword123!');
  await page.click('button[type="submit"]');

  // 2. MFA (if required)
  await expect(page.locator('text=Verification Code')).toBeVisible();
  await page.fill('[name="mfaCode"]', '123456');
  await page.click('button:has-text("Verify")');

  // 3. Navigate to document
  await page.goto('/documents/doc-123');

  // 4. Initiate signature
  await page.click('button:has-text("Approve")');

  // 5. Complete e-signature
  await expect(page.locator('text=Approval Declaration')).toBeVisible();
  await page.fill('[name="password"]', 'SecurePassword123!');
  await page.click('button:has-text("Continue")');
  await page.fill('[name="mfaCode"]', '654321');
  await page.click('button:has-text("Sign")');

  // 6. Verify audit trail
  await page.goto('/admin/compliance/audit');
  await expect(page.locator('text=document_approval')).toBeVisible();
});
```

### Other E2E Tests Needed

1. **User Management Flow**
   - Invite user
   - Assign roles (with SoD check)
   - Deactivate user

2. **Role Assignment with SoD**
   - Add conflicting role
   - See warning
   - Provide justification

3. **Session Management**
   - Login
   - Session timeout warning
   - Forced logout

4. **Training Compliance**
   - Access restricted feature
   - Training prompt
   - Complete training
   - Access granted

## Mocking Strategy

### API Mocking with MSW

```typescript
// mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.post('/api/v1/auth/login', (req, res, ctx) => {
    return res(
      ctx.json({
        accessToken: 'mock_token',
        user: mockUser,
      })
    );
  }),
];
```

### Context Mocking

```typescript
const MockSecurityProvider = ({ children }) => (
  <SecurityProvider
    initialUser={mockUser}
    initialMembership={mockMembership}
  >
    {children}
  </SecurityProvider>
);
```

## Accessibility Testing

All components must pass:

- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Color contrast requirements

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('should have no accessibility violations', async () => {
  const { container } = render(<LoginPage {...props} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Compliance-Specific Testing

### 21 CFR Part 11 Requirements

| Requirement                    | Test Location            | Status |
| ------------------------------ | ------------------------ | ------ |
| 11.10(a) System validation     | E2E                      | ⬜     |
| 11.10(d) Access controls       | useSecurityContext.test  | ✅     |
| 11.10(e) Audit trail           | AuditTrailViewer.test    | ⬜     |
| 11.50(a) Signer identification | ElectronicSignature.test | ✅     |
| 11.50(b) Signature meaning     | ElectronicSignature.test | ✅     |

### ICH E6 GCP Requirements

| Requirement              | Test Location              | Status |
| ------------------------ | -------------------------- | ------ |
| Training documentation   | TrainingManagement.test    | ⬜     |
| Role-based access        | RolePermissionManager.test | ⬜     |
| Audit trail completeness | AuditTrailViewer.test      | ⬜     |

## Continuous Integration

Tests run on:

- Every PR
- Pre-merge to main
- Nightly full suite

```yaml
# .github/workflows/portal-v2-tests.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run unit tests
        run: npm test -- src/portal-v2 --coverage
      - name: Run E2E tests
        run: npm run test:e2e -- --grep "portal-v2"
```

## Test Data Management

### Mock Data Location

```
portal-v2/
├── __mocks__/
│   ├── users.ts          # Mock user data
│   ├── organizations.ts  # Mock org data
│   ├── permissions.ts    # Mock permissions
│   └── handlers.ts       # MSW handlers
```

### Test Fixtures

Use consistent fixtures across tests:

```typescript
import { mockUser, mockMembership, mockSession } from '../__mocks__/users';
```

## Debugging Tests

```bash
# Run in watch mode
npm test -- src/portal-v2 --watch

# Run with verbose output
npm test -- src/portal-v2 --verbose

# Debug in browser
npm test -- src/portal-v2 --ui
```

## Common Issues

### 1. Context not available

Wrap component in appropriate provider:

```typescript
render(
  <SecurityProvider>
    <Component />
  </SecurityProvider>
);
```

### 2. Async state updates

Use `waitFor` for async operations:

```typescript
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

### 3. Router dependency

Mock routing:

```typescript
import { MemoryRouter } from 'react-router-dom';

render(
  <MemoryRouter>
    <Component />
  </MemoryRouter>
);
```
