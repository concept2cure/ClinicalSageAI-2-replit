# WO-4 Customize AnA — Proof

**Date:** 2026-04-06

## Sidebar Entry
- "Customize AnA" added to Zone A in BOTH expanded and collapsed sidebar
- Position: between Search and the Zone B divider
- Icon: `SlidersHorizontal` from lucide-react
- Triggers `onNavigate('customize')` which is handled in ZenApp

## Navigation Wiring
In `ZenApp.tsx` sidebar onNavigate handler, added new case:
```typescript
case 'customize':
  setSettingsSection('ana-intelligence');
  setSettingsOpen(true);
  break;
```
- `settingsSection` state already existed and is wired to `ZenSettings.initialSection` prop
- `setSettingsOpen(true)` opens the modal
- `setSettingsSection('ana-intelligence')` ensures it opens directly to the AnA Intelligence section (not the default Profile)

## Three Configuration Tiers

### Tier 1: My Profile (User Level)
- Component: `UserContextEditor`
- Role, regulatory expertise areas (CMC, Clinical, Nonclinical, Regulatory Strategy, Biostatistics, Medical Writing, Quality, Manufacturing, Pharmacovigilance, Labeling), response style, custom context
- Persisted via `/api/client-intelligence/ana/user-profile`
- Enriches every AnA response with user expertise context

### Tier 2: Organization (Client Level)
- Component: `CompanyContextEditor`
- Company name, industry, regulatory markets (FDA, EMA, PMDA, Health Canada, MHRA, TGA, NMPA, ANVISA), pipeline assets
- Agency relationships, team, quality SOPs, cross-project patterns
- Enriches AnA responses with organizational regulatory posture

### Tier 3: Active Project (Project Level)
- Component: `ProjectContextEditor`
- Submission type (IND/NDA/BLA/510k/PMA/etc.), development phase, drug/device details, target agencies
- Clinical design, project instructions, decisions log, risk factors, open questions, submission timeline
- Enriches AnA responses with submission-specific strategy and constraints

## Tab Labels Updated (in ZenSettings.tsx)
| Old | New |
|---|---|
| "Personal Preferences" | "My Profile" |
| "Company Context" | "Organization" |
| "Project Context" | "Active Project" |

Descriptions updated to be domain-specific:
- My Profile: "Your role, expertise, and how AnA drafts for you"
- Organization: "Company regulatory posture, markets, pipeline, and SOPs"
- Active Project: "Submission-specific strategy, agencies, risks, and instructions"

## Section Header Updated
- Title: `"AnA Intelligence"` → `"Customize AnA"`
- Description: domain-specific regulatory workflow description

## Empty State (Active Project tab, no project)
- Old: "Select a project first to configure project-specific context."
- New: Two-line guidance with bold heading "No active project" and explanation of what they'll configure (submission type, target agencies, regulatory strategy, risk factors, custom instructions)

## Files Modified
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` — added SlidersHorizontal import + 2 nav entries (collapsed + expanded) + header comment
- `client/src/concept2cure/ZenApp.tsx` — added 'customize' case to sidebar onNavigate handler
- `client/src/concept2cure/components/settings/ZenSettings.tsx` — renamed 3 tab labels, updated section header, improved empty state
- `config/ui-surface-registry.json` — added customize entry
