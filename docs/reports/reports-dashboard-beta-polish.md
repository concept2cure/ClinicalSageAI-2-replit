# Reports Dashboard — Beta Polish Guide

## Purpose
This guide standardizes **report formatting**, **content completeness**, and **operator experience** for the Reports Dashboard beta release.

## Formatting Standards

### 1) Naming and Taxonomy
- Use explicit labels: **KPI**, **KRI**, **Project**, **Task Completion**, **Client Pack**.
- Keep report module names consistent with UI sidebar entries.
- Avoid mixed naming (e.g., "risk report" vs "KRI report") in the same screen.

### 2) Client-Ready Output Formats
Supported export formats:
- **PDF**: narrative/client-friendly document.
- **XLSX**: tabular workbook for PMO/analyst workflows.
- **PPTX**: executive update deck for leadership readouts.

### 3) Report Cards and Data Blocks
Every report card should include:
- Report name.
- Audience.
- Cadence.
- Status context (KPI/KRI/health/blocked if applicable).
- Action affordance (open, export, preview).

### 4) No-Empty-State Rule
For beta demos and first-run UX:
- Always show seeded examples for each paid persona tier.
- If API data is unavailable, fallback to demo data with clear badge labeling.

## Live Data Behavior
- Live mode updates should display the last-refresh timestamp.
- Data source must be visible: **Data: API** or **Data: Demo**.
- Manual sync should be available even when polling is enabled.

## Documentation Quality Requirements
- Keep docs concise and implementation-focused.
- Reflect actual implemented behavior only; do not claim unexecuted tests.
- Update this file when adding new report modules, formats, or persona packs.

## Beta Acceptance Checklist
- [ ] Sidebar module labels match section content.
- [ ] KPI/KRI/project toggles alter visible output.
- [ ] Client pack examples are present for startup/growth/enterprise personas.
- [ ] Export format selector is visible and usable.
- [ ] Search/filter produce sensible formatted states (including empty match state).
- [ ] Live/demo badge and refresh timestamp are visible.

## Implementation Notes (Current)
- UI orchestration lives in `client/src/pages/reports/ReportsDashboard.jsx`.
- Seeded examples and formatting constants are centralized in `client/src/pages/reports/reportDashboardConfig.js`.
- Keep this split for maintainability: presentation in dashboard file, report catalog/format metadata in config.

## Downstream Stability Mitigations Implemented
- Persisted operator choices (`dataMode`, `cadence`, `persona`) in local storage so report sessions survive refreshes.
- Added page-visibility awareness to pause polling/simulation while tab is backgrounded.
- Added live API error fallback messaging so operators understand when demo-style rendering is being used.
- Added safer completion-rate math guards to avoid division-by-zero edge cases.
- Disabled manual sync when not in live mode to prevent invalid operator actions.
