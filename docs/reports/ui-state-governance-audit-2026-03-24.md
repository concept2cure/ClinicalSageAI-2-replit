# UI State Governance Audit — Platform Consistency Defect Report

**Date**: 2026-03-24
**Scope**: All `client/src/concept2cure/` components (338 files)
**Verdict**: Systemic enforcement failure — canonical primitives exist but are not adopted

---

## PART 1 — THE CURRENT STATE CHAOS

### Two State Systems Exist

| System | File | Lines | Version | Components | Accessibility | Test IDs |
|--------|------|-------|---------|------------|---------------|----------|
| V1 | `client/src/components/ui/states.tsx` | 263 | 2.0.0 | 8 | None | None |
| V2 | `client/src/components/ui/statesV2.tsx` | 750 | 3.0.0 | 10 | WCAG 2.1 AA | Full |

**V1 exports**: LoadingState, EmptyState, ErrorState, Skeleton, SkeletonText, SkeletonCard, SkeletonTable, DataStateWrapper
**V2 exports**: All of V1 + InlineLoading, ProgressIndicator — with ARIA roles, `aria-live` regions, `sr-only` spans, `useId()`, `data-testid`, focus management, error codes, support links, secondary actions, custom `isEmpty` detection

**Also exists**: `client/src/components/ui/spinner.tsx` — thin wrapper around Loader2 (22 lines)

### Adoption Rate: Near Zero

| Standard | Required By | Actual Adoption |
|----------|-------------|-----------------|
| Import from `statesV2` | 338 files | **1 file (0.3%)** |
| `DataStateWrapper<T>` | All async components | **0 files (0%)** |
| `LoadingState` | All page-level loading | **0 files (0%)** |
| `ErrorState` | All error states | **0 files (0%)** |
| `apiRequest()` | All API calls | **~23% of calls** |
| `react-hook-form` | All forms | **0 explicit imports** |

### Anti-Pattern Counts

| Category | Pattern | Count | Severity |
|----------|---------|-------|----------|
| Loading | `Loader2` icon as spinner | 201 | HIGH |
| Loading | `animate-spin` manual CSS | 168 | HIGH |
| Loading | `{isLoading ?` ternary | 21 | MEDIUM |
| Loading | `{isLoading &&` conditional | 13 | MEDIUM |
| Loading | Custom "Loading..." text | 20 | MEDIUM |
| Error | `console.log/error` as handling | 194 | CRITICAL |
| Error | Silent `catch {}` blocks | 145 | CRITICAL |
| Error | `{error &&` inline blocks | 8 | MEDIUM |
| Fetch | Raw `fetch()` (not apiRequest) | 298 | CRITICAL |
| Fetch | Per-file `getAuthHeaders()` | 170 | CRITICAL |
| Form | `useState` per field (est.) | Subset of 1,270 | MEDIUM |
| **TOTAL** | | **~1,100+** | |

---

## PART 2 — CANONICAL STATE SYSTEM DECISION

### Decision: `statesV2.tsx` is the single canonical source of truth

**Rationale**:
1. V2 is a strict superset of V1 — every V1 component exists in V2 with identical API plus extensions
2. V2 has WCAG 2.1 AA accessibility (ARIA roles, live regions, screen reader support) — V1 has none
3. V2 has comprehensive `data-testid` support — V1 has none
4. V2 adds InlineLoading and ProgressIndicator — V1 lacks these
5. V2 uses `useId()` for dynamic ARIA IDs — enterprise-grade
6. V2 is already referenced in CLAUDE.md UI State Standards as the canonical import path

### Action Plan

| Action | Status |
|--------|--------|
| `statesV2.tsx` = canonical | **DECIDED** |
| `states.tsx` = deprecated | Mark with `@deprecated` JSDoc, re-export from statesV2 |
| `spinner.tsx` = keep as lightweight primitive | Already used by statesV2 internally |
| New canonical import path | `@/components/ui/statesV2` (already standard per CLAUDE.md) |

### Missing Primitives to Add to statesV2

The directive requires these states. Current coverage:

| Required State | statesV2 Has It? | Notes |
|---------------|-------------------|-------|
| PageLoadingState | Yes → `LoadingState` with `fullScreen` | Already exists |
| SectionLoadingState | Yes → `LoadingState` with `size="md"` | Already exists |
| InlineLoadingState | Yes → `InlineLoading` | Already exists |
| SkeletonState | Yes → `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTable` | Already exists |
| PageErrorState | Yes → `ErrorState` with `fullScreen` | Already exists |
| SectionErrorState | Yes → `ErrorState` | Already exists |
| InlineErrorState | **NO** — needs adding | Small inline error for field-level |
| EmptyState | Yes → `EmptyState` | Already exists |
| NoResultsState | **NO** — needs adding | Search-specific empty with query context |
| BlockedState | **NO** — needs adding | Permission denied / locked |
| MissingConfigurationState | **NO** — needs adding | Setup required / not configured |
| RetryAction | Partial — `ErrorState` has retry | Standalone retry button needed |
| RecoveryAction | **NO** — needs adding | Generic recovery action |
| ProgressIndicator | Yes → `ProgressIndicator` | Already exists |

**4 new components needed**: InlineErrorState, NoResultsState, BlockedState, MissingConfigurationState

---

## PART 3 — TOP 20 HIGHEST-VISIBILITY COMPONENTS TO MIGRATE

Ranked by user visibility × violation count:

| # | Component | File | Violations | Why First |
|---|-----------|------|-----------|-----------|
| 1 | **AnaPersistentPanel** | `components/chat/AnaPersistentPanel.tsx` | 21 fetch, 15 silent catch | Main AI chat — every user session |
| 2 | **ZenLogin** | `auth/ZenLogin.tsx` | 6 isLoading ternaries, 2 fetch | Auth gate — 100% of users |
| 3 | **EditorPanel** | `components/editor/EditorPanel.tsx` | 16 fetch, 12 silent catch | Core authoring surface |
| 4 | **ZenApp** (Suspense fallbacks) | `ZenApp.tsx` | 10 Loader2, 10 animate-spin | App shell — wraps everything |
| 5 | **PrecedentIntelligenceDashboard** | `components/precedent/PrecedentIntelligenceDashboard.tsx` | 10 Loader2, 9 animate-spin | Intelligence workspace |
| 6 | **IntelligentReportGenerator** | `components/reports/IntelligentReportGenerator.tsx` | 15 fetch | Report generation surface |
| 7 | **ProjectWorkspaceShell** | `components/workspace/ProjectWorkspaceShell.tsx` | 9 fetch, 10 silent catch | Workspace orchestrator |
| 8 | **ReviewThreadsPanel** | `components/workspace/ReviewThreadsPanel.tsx` | 11 fetch, 6 Loader2 | Review workflow |
| 9 | **RegulatoryIntelligencePanel** | `components/intelligence/RegulatoryIntelligencePanel.tsx` | 9 Loader2, 7 isLoading, 8 animate-spin | RI panel |
| 10 | **ZenChat** | `components/chat/ZenChat.tsx` | 3 isLoading, 2 fetch | Chat interface |
| 11 | **PackBuilderPanel** | `components/regulatory/PackBuilderPanel.tsx` | 8 Loader2, 7 animate-spin | Regulatory packaging |
| 12 | **GovernedDocumentPanel** | `components/workspace/GovernedDocumentPanel.tsx` | 6 fetch | Governed authoring |
| 13 | **CommandCenter** | `components/control-plane/CommandCenter.tsx` | 7 fetch, 3 useQuery | Admin surface |
| 14 | **NotificationCenter** | `components/workspace/NotificationCenter.tsx` | 5 fetch | Always-visible |
| 15 | **RegulatoryPrecedentIntelligence** | `pages/RegulatoryPrecedentIntelligence.tsx` | 11 fetch, 12 useQuery | RI page |
| 16 | **ZenSettings** | `components/settings/ZenSettings.tsx` | 4 fetch | Settings panel |
| 17 | **DocumentProvenancePanel** | `components/provenance/DocumentProvenancePanel.tsx` | 5 fetch | Audit trail (Part 11) |
| 18 | **ClinicalEvidenceTracker** | `components/regulatory/ClinicalEvidenceTracker.tsx` | 4 fetch | Evidence management |
| 19 | **InlineApprovalPanel** | `components/editor/InlineApprovalPanel.tsx` | 4 fetch, 6 useQuery | Approval workflow |
| 20 | **CTDProjectWizard** | `components/onboarding/CTDProjectWizard.tsx` | 4 fetch | Onboarding funnel |

### Already Migrated

| Component | File | Status |
|-----------|------|--------|
| **RICopilotHome** | `components/intelligence/RICopilotHome.tsx` | DONE — statesV2 imported, DataStateWrapper patterns, apiRequest |

---

## PART 4 — TOP OFFENDER SERVICE FILES (Silent Failures)

These service files use `console.error` as the ONLY error handling — users never see failures:

| File | console.error count | Impact |
|------|-------------------|--------|
| `services/documentIntelligenceService.ts` | 54 | Document intelligence silently fails |
| `services/medicalDeviceService.ts` | 38 | MedTech workflows silently fail |
| `services/cmcService.ts` | 38 | CMC workflows silently fail |
| `services/regulatoryIntelligenceService.ts` | 16 | RI queries silently fail |
| `services/cortexService.ts` | 13 | CORTEX operations silently fail |

---

## PART 5 — ENFORCEMENT PLAN

### ESLint Rules (New)

Create `eslint-rules/no-inline-state-patterns.js`:

```
Rules to enforce:
1. no-restricted-imports: Ban imports of `states.tsx` (deprecated)
2. no-restricted-syntax: Ban `{isLoading && <` JSX patterns
3. no-restricted-syntax: Ban `Loader2` from lucide-react in JSX return blocks
4. no-restricted-syntax: Ban `animate-spin` in className when paired with Loader2
5. no-restricted-syntax: Ban raw `fetch(` in concept2cure/ components
6. no-restricted-syntax: Ban `getAuthHeaders` function declarations
7. no-restricted-syntax: Ban empty catch blocks `catch {}`
8. no-restricted-syntax: Ban `console.log`/`console.error` in catch blocks
```

### .eslintrc.cjs additions

```js
rules: {
  'no-restricted-imports': ['error', {
    paths: [{
      name: '@/components/ui/states',
      message: 'Use @/components/ui/statesV2 instead. states.tsx is deprecated.'
    }],
  }],
  'no-console': ['warn', { allow: ['warn'] }],
}
```

### CI Check

Add to CI pipeline:
```bash
# Fail build if new inline state patterns appear in concept2cure/
grep -rn "isLoading && <\|isLoading ?\|Loader2.*animate-spin\|catch {" \
  --include="*.tsx" client/src/concept2cure/ \
  | wc -l > /tmp/inline-state-count.txt

# Compare against baseline (current count) — fail if increased
```

### Deprecation Map

| Deprecated | Replacement | Auto-replaceable? |
|------------|------------|-------------------|
| `import { ... } from '@/components/ui/states'` | `import { ... } from '@/components/ui/statesV2'` | YES — safe regex |
| `<Loader2 className="... animate-spin" />` | `<Spinner size="sm" />` | YES — safe regex |
| `{isLoading && <div>Loading...</div>}` | `<DataStateWrapper>` | NO — needs manual |
| `{error && <div>Error...</div>}` | `<ErrorState>` | NO — needs manual |
| `const headers = getAuthHeaders()` | `apiRequest()` | NO — needs manual |
| `catch { /* silent */ }` | `catch (e) { toast({ title: '...', variant: 'destructive' }) }` | NO — needs context |
| `console.error('Failed:', e)` | `toast({ title: '...', variant: 'destructive' })` | PARTIAL — needs context |

---

## PART 6 — STATE COPY & TONE STANDARDS

| State | Copy Pattern | Example |
|-------|-------------|---------|
| Loading (page) | `Loading [noun]...` | "Loading project data..." |
| Loading (section) | `[Verb]ing [noun]...` | "Analyzing regulatory risk..." |
| Loading (inline) | No text — spinner only | `<Spinner size="sm" />` |
| Error (recoverable) | `Failed to [verb] [noun].` + Retry | "Failed to load precedents." [Retry] |
| Error (unrecoverable) | `Unable to [verb] [noun]. Contact support.` | "Unable to connect to the analysis engine." |
| Empty (no data yet) | `No [noun] yet.` + optional CTA | "No documents yet." [Create Document] |
| No results (search) | `No results for "[query]".` + suggestion | "No results for 'aspirin'. Try broadening your search." |
| Blocked (permission) | `You don't have access to [noun].` | "You don't have access to this project." |
| Not configured | `[Noun] is not configured.` + setup CTA | "AI gateway is not configured." [Configure] |
| Success (after action) | Toast: `[Noun] [verbed] successfully.` | "Document saved successfully." |
| Partial failure | Toast: `[Noun] [verbed] with warnings.` | "Report generated with 2 warnings." |

**Tone rules**: Clear, calm, concise, operator-grade. No apologies, no exclamation marks, no emoji, no "Oops", no "Something went wrong".

---

## PART 7 — MIGRATION BATCHES

### Batch 1: Immediate (This Sprint)
Already done: RICopilotHome + usePrecedentEngine + useWorkspaceIntelligence

Next targets (by impact):
1. **ZenApp.tsx** — Replace 10 Suspense `<Loader2>` fallbacks with `<LoadingState>`
2. **PrecedentIntelligenceDashboard** — 10 Loader2 → statesV2 primitives
3. **RegulatoryIntelligencePanel** — 9 Loader2, 7 isLoading → DataStateWrapper
4. **PackBuilderPanel** — 8 Loader2 → Spinner/LoadingState

### Batch 2: High-Visibility Surfaces (Next Sprint)
5. **AnaPersistentPanel** — 21 fetch → apiRequest + error toasts
6. **EditorPanel** — 16 fetch → apiRequest + error toasts
7. **ProjectWorkspaceShell** — 9 fetch → apiRequest
8. **ZenLogin** — 6 isLoading ternaries → proper state handling

### Batch 3: Report & Review (Following Sprint)
9. **IntelligentReportGenerator** — 15 fetch → apiRequest
10. **ReviewThreadsPanel** — 11 fetch → apiRequest
11. **RegulatoryPrecedentIntelligence** — 11 fetch → apiRequest
12. **GovernedDocumentPanel** — 6 fetch → apiRequest

### Batch 4: Remaining (Ongoing)
13–20: CommandCenter, NotificationCenter, ZenSettings, DocumentProvenancePanel, ClinicalEvidenceTracker, InlineApprovalPanel, CTDProjectWizard, ZenChat

---

## DEFINITION OF DONE

The state UX system is "done" when:

1. **Top 20 high-visibility routes use canonical statesV2 primitives** — 0 inline loading/error patterns
2. **Raw fetch() reduced by 80%+** across concept2cure/ — replaced with apiRequest()
3. **Silent catch blocks reduced by 80%+** — replaced with toast() or ErrorState
4. **ESLint rules active** — new inline state patterns fail lint
5. **CI baseline check active** — inline pattern count cannot increase
6. **states.tsx deprecated** — all imports point to statesV2
7. **4 new primitives added** — InlineErrorState, NoResultsState, BlockedState, MissingConfigurationState
8. **Copy tone standardized** — consistent messaging across all state surfaces

---

## APPENDIX: Files With Zero statesV2 Adoption (Full List of Top Offenders)

```
client/src/concept2cure/ZenApp.tsx                                    — 10 Loader2, 10 animate-spin
client/src/concept2cure/components/chat/AnaPersistentPanel.tsx        — 21 fetch, 15 silent catch
client/src/concept2cure/components/editor/EditorPanel.tsx             — 16 fetch, 12 silent catch
client/src/concept2cure/components/reports/IntelligentReportGenerator.tsx — 15 fetch
client/src/concept2cure/components/workspace/ReviewThreadsPanel.tsx   — 11 fetch, 6 Loader2
client/src/concept2cure/components/precedent/PrecedentIntelligenceDashboard.tsx — 10 Loader2
client/src/concept2cure/components/intelligence/RegulatoryIntelligencePanel.tsx — 9 Loader2, 7 isLoading
client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx — 9 fetch, 10 silent catch
client/src/concept2cure/components/regulatory/PackBuilderPanel.tsx    — 8 Loader2, 7 animate-spin
client/src/concept2cure/auth/ZenLogin.tsx                             — 6 isLoading ternaries
client/src/concept2cure/services/documentIntelligenceService.ts       — 54 console.error
client/src/concept2cure/services/medicalDeviceService.ts              — 38 console.error
client/src/concept2cure/services/cmcService.ts                       — 38 console.error
```
