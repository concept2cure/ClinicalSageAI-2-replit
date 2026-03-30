# Clickthrough Audit — Segment 11: Settings, Account & Billing Screens

**Date:** 2026-03-30
**Auditor:** Claude (biotech client perspective)
**Scope:** Every settings/admin screen, billing, MFA, notifications, integrations, legal pages, logout

---

## Executive Summary

The settings experience lives in a well-designed modal (`ZenSettings`) accessible via `Cmd+,` or sidebar gear icon. It has 8 sections: Profile, Organization, Notifications, Security, Appearance, Integrations, AnA Intelligence, and Help. The billing dashboard is a separate full-page route with real Stripe integration. Legal pages are fully written. However, several critical actions are **cosmetic-only** — the Sign Out button in settings has no `onClick` handler, the Security section's 2FA toggle is purely local state (not wired to the MFA API), and the "Change Password" and "Delete Account" buttons do nothing.

**Overall verdict: CONDITIONAL PASS — 6 critical defects requiring fixes before GA.**

---

## 1. User Profile / Account Settings

**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 152-311)
**API:** `GET /api/users/me` → `server/routes/users.ts:93` | `PATCH /api/users/me` → `server/routes/users.ts:178`

### What the user sees
- Avatar circle with initials (gradient background) + camera button overlay
- Editable fields: Full Name, Title/Role, Department, Bio
- Email shown as **disabled** (read-only) with note "Contact your administrator to change"
- "Save Changes" button with loading and saved/error feedback

### What works
| Action | Status | Notes |
|--------|--------|-------|
| Load profile from API | **PASS** | Fetches `GET /api/users/me`, populates fields |
| Edit name, title, department, bio | **PASS** | `PATCH /api/users/me` updates DB via Drizzle |
| Email is read-only | **PASS** | Correctly disabled |
| Save feedback (success/error) | **PASS** | Shows "Saved" or "Failed to save" |
| Also syncs to localStorage | **PASS** | Writes `concept2cure_user_profile` for context |

### Defects
| Issue | Severity | Detail |
|-------|----------|--------|
| Avatar upload button is decorative | **MEDIUM** | Camera button has no `onClick` handler — no upload functionality |
| Uses raw `<input>` instead of `<Input>` | **LOW** | Violates component registry contract (lines 243-291) |
| Uses `useState` per field instead of `useForm` | **LOW** | Violates UI state standards (should use react-hook-form) |

**Verdict: PASS** (core functionality works; avatar upload is cosmetic)

---

## 2. MFA Setup

### Login-time MFA
**File:** `client/src/concept2cure/auth/ZenLogin.tsx` (lines ~254-460)
**API:** `POST /api/auth/mfa/verify` → `server/routes/auth.ts:962`

The login flow fully supports MFA:
- After password verification, server returns `mfaRequired: true` with method info
- User enters 6-digit TOTP code or recovery code
- Supports both TOTP (authenticator app) and email OTP
- Rate-limited to 10 attempts per 15 minutes

**Verdict: PASS** (login-time MFA works correctly)

### Post-login MFA Management
**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 488-529, SecuritySection)
**Backend APIs:**
- `POST /api/auth/mfa/setup` → `server/routes/auth.ts:1145` (generates TOTP secret + QR URL)
- `POST /api/auth/mfa/enable` → `server/routes/auth.ts:1192` (confirms with initial code, returns backup codes)
- `POST /api/auth/mfa/disable` → `server/routes/auth.ts:1255` (requires current TOTP code)

| Action | Status | Notes |
|--------|--------|-------|
| 2FA toggle displayed | **FAIL** | Toggle is local `useState(true)` only — **not wired to any API** |
| MFA setup wizard (QR code) | **FAIL** | Full MFA setup component exists at `client/src/portal-v2/components/auth/MfaSetup.tsx` but is **not imported or used** in ZenSettings |
| Backend MFA APIs | **PASS** | Server routes `/mfa/setup`, `/mfa/enable`, `/mfa/disable` are fully implemented |

**Verdict: FAIL** — The security section shows a decorative toggle that does not call any API. The actual MFA setup component (`MfaSetup.tsx`) exists but is orphaned from the settings UI.

---

## 3. Organization / Team Settings

**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 317-391, OrganizationSection)

### What the user sees
- Organization name + plan tier (from localStorage)
- "Team Members" row → links to `/concept2cure/billing`
- "Billing" row → links to `/concept2cure/billing`
- "Usage" row → links to `/concept2cure/billing`

### What works
| Action | Status | Notes |
|--------|--------|-------|
| Display org info | **PASS** | Reads from localStorage (set during auth) |
| Links to billing | **PASS** | All three rows navigate to billing dashboard |
| Invite/remove users | **FAIL** | No user management UI exists in concept2cure — only billing redirect |
| Role management | **FAIL** | No role assignment UI |

### Defects
| Issue | Severity | Detail |
|-------|----------|--------|
| No team member management | **HIGH** | Admin cannot invite, remove, or change roles of team members from settings |
| Org data from localStorage only | **MEDIUM** | No API call to fetch real-time org data — relies on stale auth data |

**Verdict: FAIL** — Organization section is read-only display with billing redirects. No actual team management capability.

---

## 4. Billing Page

**Route:** `/concept2cure/billing`
**Router:** `client/src/concept2cure/router/ZenRouter.tsx` (lines 406-416)
**Component:** `client/src/pages/billing/BillingDashboard.tsx` (1207 lines)
**Backend routes:**
- `server/routes/billing.ts` — Stripe checkout, portal, status, pricing, webhooks
- `server/routes/billing-dashboard.ts` — usage, invoices, budgets, alerts, rate limits

### What the user sees
A full 5-tab billing dashboard:
1. **Overview** — Plan name, price, billing cycle, MTD spend, credits remaining, seats used/total, recent activity
2. **Usage** — Daily/weekly/monthly usage charts (Recharts), by-module breakdown, detailed records table
3. **Invoices** — Paginated invoice list from Stripe, status badges, PDF download links
4. **Budget & Alerts** — Monthly budget setting, alert thresholds, notification preferences, alert history
5. **Plan & Rate Limits** — Current plan features, rate limits per module, upgrade plan cards

### What works
| Action | Status | Notes |
|--------|--------|-------|
| Load billing status | **PASS** | `GET /api/billing/status` with Stripe integration |
| Manage Subscription button | **PASS** | `POST /api/billing/portal` → redirects to Stripe Customer Portal |
| Usage data & charts | **PASS** | `GET /api/billing/usage` with date range + granularity |
| Invoice listing | **PASS** | `GET /api/billing/invoices` with pagination |
| Budget management | **PASS** | `GET/POST /api/billing/budget` |
| Rate limits display | **PASS** | `GET /api/billing/rate-limits` |
| Stripe webhook processing | **PASS** | `POST /webhooks/stripe` in billing.ts |

### Defects
| Issue | Severity | Detail |
|-------|----------|--------|
| Uses raw `fetch()` via `apiFetch` helper | **LOW** | Should use `apiRequest()` per codebase standards (line 176) |
| Loading state is plain text | **LOW** | "Loading billing overview..." instead of `<LoadingState>` component |
| No back navigation to main app | **LOW** | Full-page route with no breadcrumb or back button to workspace |

**Verdict: PASS** — Comprehensive billing dashboard with real Stripe integration. Professional quality.

---

## 5. Notifications

### Notification Preferences (Settings)
**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 397-482, NotificationsSection)
**API:** `GET/PATCH /api/users/me/notifications` → `server/routes/users.ts:237,288`

| Action | Status | Notes |
|--------|--------|-------|
| Load notification prefs | **PASS** | Fetches from API, falls back to defaults |
| Toggle email notifications | **PASS** | Mentions, approvals, compliance, system |
| Toggle in-app notifications | **PASS** | Mentions, approvals, toast popups, sound |
| Save preferences | **PASS** | PATCH to API on button click |
| Save button only shows when dirty | **PASS** | Good UX — button hidden until changes made |

### Notification Center (Bell Icon)
**File:** `client/src/concept2cure/components/workspace/NotificationCenter.tsx`
**API:** `GET /api/concept2cure/notifications/my` | `POST /api/concept2cure/notifications/:id/read`

| Action | Status | Notes |
|--------|--------|-------|
| Bell icon with unread badge | **PASS** | Shows count, polls every 30s |
| Dropdown notification list | **PASS** | Unread/all tabs, time-ago formatting |
| Mark as read | **PASS** | POST call, updates local state + count |
| Mark all read | **PASS** | Batch mark-read endpoint |
| Click outside to close | **PASS** | Document mousedown listener |
| Notification types | **PASS** | Assignment, due_soon, overdue, approval, thread, escalation |

**Verdict: PASS** — Both notification preferences and notification center are fully functional.

---

## 6. API Keys / Integrations

### Integrations Panel (Settings)
**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 596-1148, IntegrationsSection)

### What the user sees
10 enterprise integrations with configuration panels:

| Category | Integrations |
|----------|-------------|
| Clinical & Regulatory | Medidata Rave, Veeva Vault, Veeva CRM |
| Content & Documents | Adobe Experience Cloud, DocuSign |
| Cloud Storage | Google Drive, OneDrive, SharePoint |
| Collaboration | Slack, Jira |

Each integration card shows:
- Name, description, auth type badge (OAuth 2.0, API Key, SAML)
- Configure button → reveals credential input fields
- "Test Connection" button
- "Save & Connect" / "Disconnect" buttons
- Connected status badge

### What works
| Action | Status | Notes |
|--------|--------|-------|
| Filter by category | **PASS** | Tabs: All, Clinical, Content, Cloud, Collaboration |
| Configure credentials | **PASS** | Input fields per integration (URL, client ID, secret, etc.) |
| Test connection | **FAIL** | **Simulated only** — `setTimeout` with fake result (lines 956-964) |
| Save & Connect | **FAIL** | **localStorage only** — no backend API call (lines 931-935) |
| Disconnect | **FAIL** | **localStorage only** — no backend API call (lines 938-943) |
| Connected count display | **PASS** | Shows "X of 10 connected" |

### API Keys
There is a backend public API system (`server/routes/public-api.ts`, `server/services/api-key-service.ts`) but **no UI** for users to create/manage API keys.

### Defects
| Issue | Severity | Detail |
|-------|----------|--------|
| All integrations are localStorage-only | **HIGH** | No backend persistence — credentials lost on cache clear |
| Test connection is simulated | **HIGH** | Fake setTimeout, no actual connectivity test |
| Credential fields stored in localStorage | **CRITICAL** | OAuth secrets, API keys stored in unencrypted browser storage |
| No API key management UI | **MEDIUM** | Backend API key service exists but no user-facing management |

**Verdict: FAIL** — Integrations section is entirely cosmetic. No real backend, credentials in localStorage, simulated tests.

---

## 7. Legal Pages

**Router:** `client/src/concept2cure/router/ZenRouter.tsx` (lines 421-483)
**Layout:** `client/src/concept2cure/pages/legal/LegalPageLayout.tsx` (shared branded layout)
**Status:** All 7 legal pages are **public** (no auth required)

| Route | Component | Content | Verdict |
|-------|-----------|---------|---------|
| `/concept2cure/legal/terms` | `TermsOfService.tsx` | Full legal terms (acceptance, service description, permitted use, IP, liability, 21 CFR Part 11) | **PASS** |
| `/concept2cure/legal/privacy` | `PrivacyPolicy.tsx` | Full privacy policy (GDPR, HIPAA, data collection, retention, rights) | **PASS** |
| `/concept2cure/legal/dpa` | `DataProcessingAgreement.tsx` | Full DPA (GDPR Art 28, sub-processors, data transfers) | **PASS** |
| `/concept2cure/legal/baa` | `BusinessAssociateAgreement.tsx` | Full BAA (HIPAA, PHI obligations, breach notification) | **PASS** |
| `/concept2cure/legal/sla` | `ServiceLevelAgreement.tsx` | Full SLA (uptime targets by tier, service credits, exclusions) | **PASS** |
| `/concept2cure/legal/cookies` | `CookiePolicy.tsx` | Full cookie policy (categories, consent, controls) | **PASS** |
| `/concept2cure/legal/aup` | `AcceptableUsePolicy.tsx` | Full acceptable use policy (prohibited conduct, enforcement) | **PASS** |

### Layout quality
- Branded header with Concept2Cure logo and "Back to Platform" link
- Professional typography (Lora serif for document body, Poppins for UI elements)
- Cross-links to all other legal pages in footer
- Last updated date shown (March 19, 2026)
- Copyright footer with company name

**Verdict: PASS** — All 7 legal pages have real, comprehensive legal content with professional layout.

---

## 8. Logout

### Mechanism
**Client:** `client/src/portal-v2/services/authService.tsx` (lines 588-597)
**Server:** `server/routes/auth.ts` (lines 715-730)

### Flow
1. Client calls `authService.logout()` → `POST /api/auth/logout`
2. Server blacklists JWT access token and refresh token
3. Client calls `clearAuth()` → wipes all tokens from `sessionStorage` + `localStorage` via `SecureStorage.clear()`
4. Client nulls refresh timer
5. Auth event `'logout'` emitted → `AuthProvider` sets `user = null`
6. `ProtectedRoute` in `ZenRouter` detects `!isAuthenticated` → redirects to `/concept2cure/login`

### What works
| Action | Status | Notes |
|--------|--------|-------|
| Server token blacklisting | **PASS** | Both access and refresh tokens blacklisted |
| Client token clearing | **PASS** | `SecureStorage.clear()` wipes all auth storage keys |
| Redirect to login | **PASS** | `ProtectedRoute` useEffect redirects when user is null |
| Auth state cleanup | **PASS** | Refresh timer cleared, user state nulled |

### Defects
| Issue | Severity | Detail |
|-------|----------|--------|
| Settings "Sign Out" button has no `onClick` handler | **CRITICAL** | Button at line 1438 is purely decorative — clicking it does nothing |
| IndustryAwareApp LogOut button has no handler | **MEDIUM** | `LogOut` icon at line 292 is also decorative |
| No explicit navigation to login in logout() | **LOW** | Relies on ProtectedRoute redirect chain rather than explicit `window.location` |

**Verdict: CONDITIONAL PASS** — Logout mechanism is fully implemented but the visible "Sign Out" button in Settings does not trigger it.

---

## 9. Appearance Section (Bonus)

**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 535-590)

| Action | Status | Notes |
|--------|--------|-------|
| Theme selector (Light/Dark/System) | **FAIL** | Local state only — no persistence, no actual theme application |
| Compact Mode toggle | **FAIL** | Local state only — no effect on UI |
| Show Tips toggle | **FAIL** | Local state only — no effect on UI |

**Verdict: FAIL** — Appearance section is entirely cosmetic. No settings are persisted or applied.

---

## 10. AnA Intelligence Section (Bonus)

**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` (lines 1267-1346)
**Components:** Lazy-loaded `UserContextEditor`, `CompanyContextEditor`, `ProjectContextEditor`

| Action | Status | Notes |
|--------|--------|-------|
| Personal Preferences tab | **PASS** | `UserContextEditor` allows editing personal AI context |
| Company Context tab | **PASS** | `CompanyContextEditor` for org-wide intelligence |
| Project Context tab | **PASS** | `ProjectContextEditor` — requires active project selection |
| Project tab disabled without project | **PASS** | Clear "Select a project first" message |

**Verdict: PASS** — AnA Intelligence settings are functional and properly gated.

---

## Critical Defect Summary

| # | Defect | Severity | File | Line |
|---|--------|----------|------|------|
| 1 | **Sign Out button has no onClick handler** | CRITICAL | `ZenSettings.tsx` | 1438 |
| 2 | **Integration credentials stored in localStorage** | CRITICAL | `ZenSettings.tsx` | 934, 953 |
| 3 | **2FA toggle not wired to MFA API** | HIGH | `ZenSettings.tsx` | 489 |
| 4 | **No team member management UI** | HIGH | `ZenSettings.tsx` | 317-391 |
| 5 | **Integration connections are simulated** | HIGH | `ZenSettings.tsx` | 956-964 |
| 6 | **Password Change button has no handler** | HIGH | `ZenSettings.tsx` | 501 |
| 7 | **Delete Account button has no handler** | HIGH | `ZenSettings.tsx` | 522-524 |
| 8 | **Export All Data button has no handler** | HIGH | `ZenSettings.tsx` | 519-521 |
| 9 | **Active Sessions View has no handler** | MEDIUM | `ZenSettings.tsx` | 505-508 |
| 10 | **Appearance settings not persisted** | MEDIUM | `ZenSettings.tsx` | 535-590 |
| 11 | **Avatar upload not implemented** | MEDIUM | `ZenSettings.tsx` | 226-231 |
| 12 | **No API key management UI** | MEDIUM | N/A | Backend exists, no frontend |

---

## Scorecard

| Screen | Verdict | Notes |
|--------|---------|-------|
| Profile Settings | **PASS** | Core edit + save works; avatar upload missing |
| MFA Setup (login) | **PASS** | Full TOTP + email OTP + recovery code support |
| MFA Setup (settings) | **FAIL** | Toggle is decorative; MfaSetup.tsx orphaned |
| Organization | **FAIL** | Read-only display; no team management |
| Billing Dashboard | **PASS** | Full Stripe integration, 5 tabs, professional |
| Notifications (prefs) | **PASS** | Full API-backed toggle preferences |
| Notifications (center) | **PASS** | Bell icon, polling, mark-read, dropdown |
| Integrations | **FAIL** | localStorage-only, simulated tests, no backend |
| Legal Pages (all 7) | **PASS** | Real comprehensive legal content |
| Logout (mechanism) | **PASS** | Token blacklist + storage clear + redirect |
| Logout (UI button) | **FAIL** | Sign Out button in settings does nothing |
| Appearance | **FAIL** | Decorative only — no persistence or effect |
| AnA Intelligence | **PASS** | Context editors load and function |
| Security (password) | **FAIL** | "Change" button has no handler |
| Security (2FA) | **FAIL** | Toggle is local state only |
| Security (sessions) | **FAIL** | "View" button has no handler |
| Security (danger zone) | **FAIL** | Both buttons are decorative |

**Passing: 8/17 | Failing: 9/17**

The billing dashboard and legal pages are production-ready. The notification system is solid. Profile editing works. But the Security section and Integrations section are facades — they look polished but have no backend wiring. The Sign Out button in settings is the most critical gap since it is a primary user expectation.
