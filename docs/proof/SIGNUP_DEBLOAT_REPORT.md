# ZenSignup De-Bloat Report — Sprint 2

**Commit**: (pending)
**Branch**: concept2cure-v2
**Date**: 2026-03-27

## Summary

| Metric                    | Before | After | Delta             |
| ------------------------- | ------ | ----- | ----------------- |
| Lines                     | 1026   | 516   | **−510 (−49.7%)** |
| Views / Steps             | 5      | 2     | **−3**            |
| Raw `<button>`            | 11     | 0     | **−11**           |
| Raw `<input>`             | 4      | 0     | **−4**            |
| Raw `<select>`            | 1      | 0     | **−1**            |
| Raw `<textarea>`          | 0      | 0     | —                 |
| Governed `<Button>`       | 0      | 4     | **+4**            |
| Governed `<Input>`        | 0      | 7     | **+7**            |
| Governed `<Select>`       | 0      | 1     | **+1**            |
| Governed `<Checkbox>`     | 0      | 2     | **+2**            |
| Governed `<Label>`        | 0      | 7     | **+7**            |
| Governed `<Spinner>`      | 0      | 1     | **+1**            |
| Total governed instances  | 0      | 25    | **+25**           |
| Custom inline SVG icons   | 6      | 0     | **−6**            |
| Custom wrapper components | 2      | 0     | **−2**            |
| framer-motion import      | 1      | 0     | **−1**            |
| Scroll-to-accept blocks   | 2      | 0     | **−2**            |
| Plan picker cards         | 3      | 0     | **−3**            |
| AI learning toggle        | 1      | 0     | **−1**            |

## What Was Removed

1. **3 wizard steps** — `organization`, `plan`, `compliance` collapsed into single `account` view
2. **11 raw `<button>`** — all replaced with governed `<Button>`
3. **4 raw `<input>`** — all replaced with governed `<Input>`
4. **1 raw `<select>`** — replaced with governed Radix `<Select>`
5. **6 custom SVG icons** — replaced with lucide-react (`AlertCircle`, `CheckCircle2`, `ArrowLeft`)
6. **FormInput / FormSelect wrappers** — deleted, governed components used directly
7. **Custom stepper/progress indicator** — removed (single-page form needs no stepper)
8. **framer-motion dependency** — removed from this file entirely
9. **Scroll-to-accept legal blocks** — replaced with simple `<Checkbox>` + link text
10. **AI learning opt-in toggle** — deferred to Settings (post-signup concern)
11. **Plan picker + billing checkout** — deferred to post-signup billing page
12. **`jobTitle`, `country`, `useCase` fields** — not in backend contract, removed

## Bugs Fixed

1. **Double spinner**: Submit button rendered spinner icon twice — now uses single `<Spinner>` with `isPending` guard
2. **Wrong token key**: Was `localStorage.setItem('token', ...)` — now uses canonical `trialsage_access_token`
3. **Wrong redirect**: Was `/ai` — now `/concept2cure`

## Geometry

Matches ZenLogin split-shell layout:

- Shell: `max-w-[1160px]`, `max-h-[740px]`
- Left panel: 40% dark stone-950
- Right panel: 60% form content
- Form area: `max-w-[340px]`
- All inputs: `h-[44px]`, `rounded-[10px]`
- All buttons: `h-[44px]`, `rounded-[10px]`

## Backend Contract Compliance

POST `/api/auth/signup` sends exactly:

```json
{
  "email": "...",
  "password": "...",
  "companyName": "...",
  "industryMode": "biotech|medtech|cro|pharma|academic|regulatory|medical_writing",
  "firstName": "...",
  "lastName": "..."
}
```

All 4 required fields + 2 optional fields. No extra fields. No phantom data.
