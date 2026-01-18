# Iteration 2 Visual Guide

**What the User Sees After Implementation**

---

## 1. ExportsView (`/cerv2/workbench/{programId}/exports`)

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Exports                                [Generate Export] Button │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Filename      │ Created     │ Size  │ SHA256   │ Fingerprint││ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ claims_2026.. │ Jan 18,3:30 │ 1.2MB │ abcdef..│ 123456..   ││ │
│ │               │             │       │ [Copy]  │ [Copy]      ││ │
│ │               │             │       │         │ [Download]  ││ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features
✅ **SHA256 column**: `abcdef…uvwxyz` (truncated) + [Copy] button  
✅ **Fingerprint column**: `123456…xyz789` (truncated) + [Copy] button  
✅ **Download button**: Opens file in new tab  
✅ **Copy feedback**: Button shows "Copied" for 1.5 seconds  

### Empty State
```
┌─────────────────────────────────────────────────────────────────┐
│ Exports                                [Generate Export] Button │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│                         📥                                        │
│                                                                   │
│              No exports generated yet                            │
│                                                                   │
│     Exports are auditable snapshots with checksums               │
│     and evidence fingerprints. Every export creates              │
│     a timeline event for regulatory compliance.                  │
│                                                                   │
│               [Generate your first export]                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. AuditTimeline (`/cerv2/workbench/{programId}/audit`)

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Audit Timeline                               [Refresh] Button   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─ Filters ──────────────────────────────────────────────────┐  │
│ │ [All Actions ▼] [All Types ▼] [From Date] [To Date]        │  │
│ └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ ┌─ EXPORT_GENERATED ────────────────────────────────────┐ Jan18 │
│ │ 📥 Export Generated                                    │ 3:30  │
│ │                                                         │       │
│ │ File: claims_matrix_2026_01_18.xlsx  Size: 1.2 MB     │       │
│ │                                                         │       │
│ │ SHA256: abcdef12…wxyz90        [Copy]                  │       │
│ │ Fingerprint: 123456ab…ef7890   [Copy]                  │       │
│ │                                                         │       │
│ │                          [Download Export]             │       │
│ └─────────────────────────────────────────────────────────┘       │
│                                                                   │
│ ┌─ EVIDENCE_LINKED_BULK ────────────────────────────────┐ Jan18 │
│ │ 🔗 Bulk Evidence Linked · CLAIM                        │ 3:25  │
│ │                                                         │       │
│ │ [5 items]                                              │       │
│ └─────────────────────────────────────────────────────────┘       │
│                                                                   │
│ ┌─ EVIDENCE_UPLOADED ───────────────────────────────────┐ Jan18 │
│ │ ⬆️ Evidence Uploaded                                    │ 3:20  │
│ │                                                         │       │
│ │ clinical_study_report.pdf (2.5 MB)                     │       │
│ └─────────────────────────────────────────────────────────┘       │
│                                                                   │
│ Showing 3 of 3 events                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Event Card Color Coding
- 🟪 **Purple** = EXPORT_GENERATED (with download button)
- 🟦 **Blue** = EVIDENCE_UPLOADED
- 🟩 **Green** = EVIDENCE_LINKED_BULK
- 🟥 **Red** = EVIDENCE_UNLINKED_BULK
- ⬜ **Gray** = STATUS_UPDATED, other events

### EXPORT_GENERATED Card Features
✅ **Filename + size** displayed  
✅ **SHA256** with copy button  
✅ **Evidence set fingerprint** with copy button  
✅ **Download button** (same as ExportsView)  
✅ **Purple theme** (distinguishes from other events)  

---

## 3. Generate Export Modal

```
┌──────────────────────────────────────────────────┐
│  Generate Export                           [X]   │
├──────────────────────────────────────────────────┤
│                                                  │
│  ○ Claims Matrix                                 │
│    Excel matrix of claims with linked evidence  │
│                                                  │
│  ● Standards Coverage                            │
│    Coverage report for regulatory standards     │
│                                                  │
│  ○ Outcomes Substantiation                       │
│    Clinical outcomes with supporting evidence   │
│                                                  │
│  ○ Defense Pack (ZIP)                            │
│    Complete evidence package with all files     │
│                                                  │
│           [Cancel]        [✓ Generate]           │
└──────────────────────────────────────────────────┘
```

### User Flow
1. User clicks "Generate Export" button
2. Modal appears with 4 radio options
3. User selects export type (default: Claims Matrix)
4. User clicks "Generate"
5. Modal shows spinner: "Generating..."
6. Modal closes on success
7. **Exports table updates** (new row appears)
8. **Audit timeline updates** (purple card appears)
9. ✅ **Zero page refresh required**

---

## 4. Copy Button Interaction

### Before Click
```
SHA256: abcdef12…wxyz90  [📋 Copy]
```

### After Click (1.5 seconds)
```
SHA256: abcdef12…wxyz90  [✓ Copied]
```

### After 1.5 Seconds
```
SHA256: abcdef12…wxyz90  [📋 Copy]
```

**Clipboard contains:** `abcdef1234567890...full hash...wxyz90`

---

## 5. Loading States

### ExportsView Loading
```
┌─────────────────────────────────────────────────────────────────┐
│ Exports                                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  (skeleton row)  │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                   │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### AuditTimeline Loading
```
┌─────────────────────────────────────────────────────────────────┐
│ Audit Timeline                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ░░░░░░░░░░░░░░░░░░░░░░░  (skeleton card)                        │
│ ░░░░░░░░░░░░░░░░░░░░░░░                                          │
│ ░░░░░░░░░░░░░░░░░░░░░░░                                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Error States

### Network Error
```
┌─────────────────────────────────────────────────────────────────┐
│ Exports                                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│                         ⚠️                                        │
│                                                                   │
│              Something went wrong                                │
│                                                                   │
│     Failed to load exports: Network request failed               │
│                                                                   │
│                    [Try Again]                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Retry Flow
1. User clicks "Try Again"
2. Loading state appears
3. On success: Populated state appears
4. On failure: Error state appears again

---

## 7. Filter Interaction (Audit Timeline)

### Filter Bar
```
┌─ Filters ────────────────────────────────────────────────────┐
│ [All Actions ▼] [All Types ▼] [From Date] [To Date]   (2)   │
│ [✕ Clear filters]                                             │
└───────────────────────────────────────────────────────────────┘
```

### Active Filters
- Badge shows count: `(2)` = 2 active filters
- URL updates: `?action=EXPORT_GENERATED&entityType=CLAIM`
- "Clear filters" button appears
- Event list filters in real-time

### Shareable URLs
User can copy URL with filters and share:
```
/cerv2/workbench/program-123/audit?action=EXPORT_GENERATED&dateFrom=2026-01-01
```
**Result:** Colleague sees same filtered view

---

## 8. Deterministic Truncation

### SHA256 Display
**Full hash:** `abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`  
**Displayed:** `abcdef…567890` (first 6 + last 6 chars)  
**Copy:** Full hash copied to clipboard

### Why This Matters
- User can visually verify first/last chars
- Prevents "which hash is this?" confusion
- Consistent across all views
- Saves horizontal space

---

## 9. Responsive Design

### Desktop (1920px)
```
┌──────────────────────────────────────────────────────────────┐
│ Filename     │ Created    │ Size │ SHA256  │ Fingerprint │ Action │
└──────────────────────────────────────────────────────────────┘
```

### Tablet (768px)
```
┌────────────────────────────────┐
│ Filename     │ Created  │ Action │
│ Size, SHA256, Fingerprint below │
└────────────────────────────────┘
```

(Note: Current implementation is desktop-first; mobile optimization is Iteration 3)

---

## 10. Navigation

### Workbench Tabs
```
[Overview] [Evidence] [Claims] [Standards] [Outcomes] [Exports] [Audit]
                                                        ^^^^^^^^^
                                                        New in Iteration 2
```

### Breadcrumb
```
Home > CERv2 > Program XYZ > Exports
```

---

## Summary: What Changed from Iteration 1

| Feature | Iteration 1 (Backend) | Iteration 2 (Frontend) |
|---------|----------------------|------------------------|
| Exports endpoint | ✅ Returns sha256 + fingerprint | ✅ **Displays** in table + audit |
| Audit events | ✅ EXPORT_GENERATED emitted | ✅ **Rendered** with purple card |
| Download | ✅ URL endpoint exists | ✅ **Button** in 2 places (Exports + Audit) |
| Copy hashes | ❌ Not possible | ✅ **Copy buttons** with feedback |
| UI updates | ❌ Manual refresh | ✅ **Auto-refresh** via React Query |
| Empty states | ❌ Undefined behavior | ✅ **Clean empties** with CTAs |
| Loading | ❌ No indication | ✅ **Skeleton loaders** |
| Errors | ❌ Console logs | ✅ **Error UI** with retry |

**Result:** Users can now **see and use** the backend features that were "technically working but invisible"
