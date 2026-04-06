# ZenSignup Surface Inventory — Sprint 2 Phase 1

**File**: `client/src/concept2cure/auth/ZenSignup.tsx`
**Audit Date**: 2026-03-27
**Auditor**: AI Agent (Premium Build Law)

## Pre-Convergence Baseline (v1.0.0)

| Metric                        | Count                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Total lines                   | 1026                                                                            |
| Views / Steps                 | 5 (`info`, `organization`, `plan`, `compliance`, `submitted`)                   |
| Raw `<button>`                | 11                                                                              |
| Raw `<input>`                 | 4                                                                               |
| Raw `<select>`                | 1                                                                               |
| Raw `<textarea>`              | 0                                                                               |
| Governed `<Button>`           | 0                                                                               |
| Governed `<Input>`            | 0                                                                               |
| Governed `<Select>`           | 0                                                                               |
| Governed `<Checkbox>`         | 0                                                                               |
| Custom inline SVG icons       | 6 (LogoIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, SpinnerIcon, ShieldIcon) |
| Custom wrapper components     | 2 (FormInput, FormSelect — both raw HTML inside)                                |
| framer-motion AnimatePresence | 1 (step transitions)                                                            |
| Scroll-to-accept legal blocks | 2 (Terms, Privacy — with scroll tracking state)                                 |
| AI learning opt-in toggle     | 1 (custom, not governed Switch)                                                 |
| Plan picker cards             | 3 (DTC_PLANS: free, standard=$499/mo, professional=$1499/mo)                    |
| External API calls            | 2 (`/api/auth/signup`, `/api/billing/dtc-checkout`)                             |

## Backend Contract (server/routes/auth.ts lines 109-125)

```typescript
signupSchema = z.object({
  email: z.string().email(), // REQUIRED
  password: z.string().min(12), // REQUIRED
  companyName: z.string().min(2), // REQUIRED
  industryMode: z.enum([
    // REQUIRED
    'biotech',
    'medtech',
    'cro',
    'pharma',
    'academic',
    'regulatory',
    'medical_writing',
  ]),
  firstName: z.string().optional(), // OPTIONAL
  lastName: z.string().optional(), // OPTIONAL
});
```

## Fields NOT in Backend Contract (BLOAT)

- `jobTitle` — collected but never sent
- `country` — collected but never sent
- `useCase` — collected but never sent
- `selectedPlan` — sent to `/api/billing/dtc-checkout`, not to `/api/auth/signup`
- `acceptedTerms` — frontend-only validation
- `acceptedPrivacy` — frontend-only validation (separate from acceptedTerms)
- `acceptedCompliance` — frontend-only validation

## Bugs Found

- **Line ~890**: Submit button renders spinner icon TWICE (`{isLoading ? <SpinnerIcon /> : ...} {isLoading ? <SpinnerIcon /> : 'Create Account'}`)
- **Token storage**: Uses `localStorage.setItem('token', data.token)` — WRONG key. Canonical key is `trialsage_access_token`
- **Redirect path**: Success redirects to `/ai` — should be `/concept2cure`
