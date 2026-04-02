# Click-Through Audit: Segment 1 — Login, Auth & Onboarding

## 1. Landing Page (`/`)

- **Component**: `LandingPageRoute` (lazy loaded in `ZenRouter.tsx:307`)
- **What user sees**: Public landing page for unauthenticated visitors
- **CTAs**: Links to `/concept2cure/login` and `/concept2cure/signup`
- **Verdict**: **PASS** — Route exists, redirects work (`/login` → `/concept2cure/login`)

---

## 2. Login Page (`/concept2cure/login`)

- **Component**: `ZenLogin` (`client/src/concept2cure/auth/ZenLogin.tsx:246`)
- **Route**: `ZenRouter.tsx:279`, wrapped in `<AuthRoute>`

### Step 1: Email Entry
- **Fields**: Email input with validation
- **Handler**: `handleEmailContinue` (line 293) — validates format, transitions to password step
- **API call**: None — email validation is client-side only
- **Issue**: `await new Promise(resolve => setTimeout(resolve, 500))` at line 307 — simulates a server check but doesn't actually verify email exists. Not a blocker, just cosmetic delay.
- **Verdict**: **PASS**

### Step 2: Password Entry
- **Handler**: `handleLogin` (line 313)
- **API call**: `login({ email, password, rememberDevice })` → `authService.login()` (authService.tsx:485) → `POST ${baseUrl}/login`
- **Server route**: `server/routes/auth.ts:261` — `POST /api/auth/login`
  - Real Drizzle query: `db.select().from(users).where(eq(users.email, normalizedEmail))`
  - bcrypt password comparison: `bcrypt.compare(password, userData.passwordHash)` (line 307)
  - Account lockout: `isAccountLocked(userData.id)` (line 287) — real DB check
  - Failed login tracking: `recordFailedLogin(userData.id)` (line 310)
  - JWT generation on success with org membership lookup
- **Verdict**: **PASS** — Full production auth with bcrypt, lockout, rate limiting (`loginLimiter`)

### Step 3: MFA (if required)
- **Handler**: `handleMfaVerify` (line 366)
- **API call**: `verifyMfa({ method, code })` → `authService.verifyMfa()` (authService.tsx:550) → `POST ${baseUrl}/mfa/verify`
- **Server route**: `server/routes/auth.ts:962` — `POST /api/auth/mfa/verify`
- **MFA code input**: Custom 6-digit OTP input with auto-focus (MfaCodeInput component, line 170)
- **Recovery codes**: `handleRecoveryCodeVerify` (line 425) — calls `verifyMfa({ method: 'backup_code', code })`
- **Resend OTP**: `handleResendOtp` (line 408) → `authService.resendLoginOtp()` → `POST /api/auth/mfa/resend` (auth.ts:1097)
- **Verdict**: **PASS** — Full MFA flow with TOTP, recovery codes, resend with 60s cooldown

### Step 4: Success & Redirect
- **Handler**: After successful login/MFA, `setStep('success')` shows checkmark animation
- **Redirect**: `setTimeout(() => setLocation(computeRedirect(...)), 1000)` (line 351)
- **Redirect logic**: `computeRedirect` in `redirectUtils.ts` — checks user role, onboarding status
- **Verdict**: **PASS**

### SSO Buttons (Microsoft, Google)
- **Handler**: `handleSsoLogin` (line 576)
- **Dev mode**: Calls `GET /api/auth/sso/${provider}/callback?code=dev-sso-code` — works in dev
- **Production mode**: Lines 607-615 — `await new Promise(resolve => setTimeout(resolve, 500))` then **fakes success** with no real OAuth redirect
- **Verdict**: **FAIL** — SSO is decorative in production. No OAuth redirect URL, no real provider flow. Dev mode has a helper endpoint but prod just fakes it.

### Forgot Password
- **Handler**: `handleForgotPassword` (line 463)
- **API call**: `authService.requestPasswordReset({ email })` → `POST /api/auth/forgot-password` (auth.ts:1479)
- **Server**: Real implementation with email sending logic
- **Verdict**: **PASS**

### Account Lockout Display
- **Server returns**: HTTP 423 with generic message (line 289-296 in auth.ts)
- **Client displays**: Error message from response
- **Verdict**: **PASS** — Security-conscious (doesn't leak lockout timestamp)

---

## 3. Signup Page (`/concept2cure/signup`)

- **Component**: `ZenSignup` (`client/src/concept2cure/auth/ZenSignup.tsx`)
- **Route**: `ZenRouter.tsx:290`

### Steps: info → organization → plan → compliance → submitted
- **Fields**: firstName, lastName, email, password, confirmPassword, jobTitle, organization, organizationType, country, useCase, selectedPlan, 3 compliance checkboxes
- **Handler**: `handleSubmit` (line 231)
- **API call**: `fetch('/api/auth/signup', { method: 'POST', ... })` (line 248) — **uses raw fetch, not apiRequest()**
- **Payload**: email, password, companyName, industryMode, firstName, lastName
- **On success**: Stores token in localStorage (line 270), transitions to 'submitted' step
- **Verdict**: **CONDITIONAL PASS** — Real API call to real signup endpoint, but uses raw `fetch()` instead of `apiRequest()`. Functional but violates code standards.

---

## 4. Password Reset (`/concept2cure/password-reset`)

- **Component**: `PasswordResetPage` (lazy loaded from `@/portal-v2/components/auth/PasswordReset`)
- **Route**: `ZenRouter.tsx:318`
- **File exists**: `client/src/portal-v2/components/auth/PasswordReset.tsx`
- **Server endpoints**: `POST /api/auth/forgot-password` (auth.ts:1479) and `POST /api/auth/reset-password` (auth.ts:1482)
- **Verdict**: **PASS** — Component exists, server endpoints exist

---

## 5. Onboarding (`/concept2cure/onboarding`)

- **Component**: `ZenOnboarding` (`client/src/concept2cure/auth/ZenOnboarding.tsx`)
- **Route**: `ZenRouter.tsx:333`, wrapped in `<ProtectedRoute>`

### Steps: welcome → workspace → preferences → tour → ready
- **Data collected**: projectName, submissionType, emailNotifications, aiSuggestions, compactMode
- **Handler**: `handleComplete` (line 252)
- **API call**: **NONE** — `await new Promise(resolve => setTimeout(resolve, 1000))` then `localStorage.setItem('concept2cure_onboarded', 'true')` then redirect
- **Skip**: `handleSkip` (line 267) — also just sets localStorage flag
- **Verdict**: **FAIL** — Onboarding data is never sent to the server. No API call, no DB persistence. All preferences collected are thrown away. The project name, submission type, and notification preferences entered during onboarding are completely lost.

---

## 6. Auth Service (`authService.tsx`)

- **File**: `client/src/portal-v2/services/authService.tsx`
- **Base URL**: Configurable, defaults to `/api/auth`
- **Key methods**:
  - `login()` → `POST /api/auth/login` — real API call ✓
  - `verifyMfa()` → `POST /api/auth/mfa/verify` — real API call ✓
  - `logout()` → `POST /api/auth/logout` — real API call ✓
  - `requestPasswordReset()` → `POST /api/auth/forgot-password` — real API call ✓
- **Token storage**: `SecureStorage` wrapper (localStorage with key prefix)
- **Token refresh**: Auto-refresh before expiry
- **Verdict**: **PASS** — Production-quality auth service

---

## 7. Server Auth Routes (`server/routes/auth.ts`)

- **Endpoints verified**:
  - `POST /login` (line 261) — bcrypt, lockout, JWT ✓
  - `POST /dev-login` (line 429) — dev-only quick login ✓
  - `POST /mfa/verify` (line 962) — MFA verification ✓
  - `POST /mfa/resend` (line 1097) — OTP resend ✓
  - `POST /mfa/setup` (line 1145) — TOTP secret generation ✓
  - `POST /mfa/enable` (line 1192) — Enable MFA ✓
  - `POST /mfa/disable` (line 1255) — Disable MFA ✓
  - `POST /forgot-password` (line 1479) — Password reset request ✓
  - `POST /reset-password` (line 1482) — Password reset confirm ✓
- **Rate limiting**: `loginLimiter`, `mfaLimiter`, `passwordResetLimiter` — all present
- **Account lockout**: `isAccountLocked()`, `recordFailedLogin()`, `resetFailedLogins()` — real DB functions
- **Verdict**: **PASS** — Comprehensive, production-ready auth with proper security

---

## Summary

| Screen | Verdict | Issue |
|--------|---------|-------|
| Landing Page | **PASS** | — |
| Login (email) | **PASS** | Fake 500ms delay simulating server check |
| Login (password) | **PASS** | Real bcrypt + lockout + rate limiting |
| Login (MFA) | **PASS** | Real TOTP + recovery codes + resend |
| Login (redirect) | **PASS** | computeRedirect with role-based routing |
| SSO (Microsoft/Google) | **FAIL** | Decorative in production — no real OAuth |
| Forgot Password | **PASS** | Real API endpoint |
| Signup | **CONDITIONAL PASS** | Real API call but uses raw fetch() |
| Password Reset | **PASS** | Component + endpoints exist |
| Onboarding | **FAIL** | Data never sent to server — localStorage only |
| Auth Service | **PASS** | Production-quality JWT + refresh |
| Server Auth Routes | **PASS** | Full suite with bcrypt, lockout, MFA, rate limiting |

**Critical Issues**:
1. **SSO is fake in production** — buttons show but do nothing real
2. **Onboarding data is thrown away** — no API persistence
3. **Signup uses raw fetch()** — violates apiRequest() standard
