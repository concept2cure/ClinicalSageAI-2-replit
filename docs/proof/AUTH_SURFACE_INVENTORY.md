# AUTH SURFACE INVENTORY — ZenLogin Convergence Sprint

**Date:** 2026-04-03  
**Branch:** concept2cure-v2  
**File:** client/src/concept2cure/auth/ZenLogin.tsx  
**Baseline:** 1004 lines, 8 view states, 10 raw `<button>`, 1 raw `<textarea>`, 7 governed `<Button>`

---

## Classification Table

| Surface Element | Classification | Disposition |
|---|---|---|
| **sign-in** view | A — KEEP AS CANONICAL | Preserved. Core login form with email/password. |
| **mfa** view | A — KEEP AS CANONICAL | Preserved. 6-digit code entry + resend + recovery codes. |
| **forgot-password** view | A — KEEP AS CANONICAL | Preserved. Email entry + send reset link. |
| **reset-password** view | A — KEEP AS CANONICAL | Preserved. New password + confirm + save. |
| **reset-sent** view | A — KEEP AS CANONICAL | Preserved. Confirmation screen after reset request. |
| **success** view | A — KEEP AS CANONICAL | Preserved. Redirect spinner after auth. |
| **request-license** view | C — REMOVE FROM AUTH SURFACE | Removed. License request moved to `/concept2cure/signup` (ZenSignup.tsx, 1026 lines, already exists). |
| **license-sent** view | C — REMOVE FROM AUTH SURFACE | Removed. Confirmation for license request — handled by ZenSignup. |
| **dev-login button** | A — KEEP AS CANONICAL | Preserved. Dev-only, gated behind `import.meta.env.MODE === 'development'`. |
| **left-panel pill/badge** ("Regulatory Intelligence Platform") | D — RETIRE COMPLETELY | Removed. Visual clutter with no functional purpose. |
| **left-panel trust/compliance row** (21 CFR / SOC 2 / HIPAA) | D — RETIRE COMPLETELY | Removed. Sales-signaling junk on a login page. |
| **left-panel AnA 1.0 RI headline** | A — KEEP AS CANONICAL | Preserved. Restrained brand presence. |
| **left-panel subtitle** | A — KEEP AS CANONICAL | Preserved. Single supporting line. |
| **inline SSO buttons** (Google / Microsoft) | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="outline">`. |
| **password-toggle control** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="ghost" size="sm">`. |
| **raw textarea** (license-request message) | D — RETIRE COMPLETELY | Removed entirely (license-request view deleted). |
| **"Back to sign in" link** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="ghost" size="sm">`. |
| **"Create an account" link** | B — KEEP BUT CONVERGE | Merged with "request a license". Now single `<Button variant="link">` → "Request access" → navigates to `/concept2cure/signup`. |
| **"request a license" link** | C — REMOVE FROM AUTH SURFACE | Removed from sign-in subtitle. Access path consolidated into "Request access" → ZenSignup. |
| **"Forgot password?" link** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="link">`. |
| **"Resend code" link** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="link">`. |
| **"Use a recovery code" link** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="link">`. |
| **Dev login "Demo Access" button** | B — KEEP BUT CONVERGE | Converged from raw `<button>` to governed `<Button variant="ghost">`. |

---

## Summary

| Category | Count |
|---|---|
| A — KEEP AS CANONICAL | 8 |
| B — KEEP BUT CONVERGE (to governed primitives) | 8 |
| C — REMOVE FROM AUTH SURFACE | 3 |
| D — RETIRE COMPLETELY | 3 |
