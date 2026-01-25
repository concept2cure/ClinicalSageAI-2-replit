# ADR-0005: Client Portal V2 Design Approach

## Status

**Proposed**

- Date: 2026-01-25
- Deciders: Frontend Team, Product Team, Platform Architecture
- Technical Story: Client Portal modernization initiative

## Context

The current Concept2Cure client portal has evolved organically with multiple implementations:

1. `ClientPortalDashboard.tsx` (522 lines) - Basic multi-tenant portal
2. `UnifiedClientPortal.tsx` (1012 lines) - Auth + dashboard integration
3. `ClientPortalPremium.tsx` (2138 lines) - Premium features, AI assistant
4. `ClientPortalZero.tsx` (664 lines) - Zero-dependency version

This fragmentation causes:

- Inconsistent user experience across modules
- Duplicated code and maintenance burden
- Difficult feature rollout
- Testing complexity

Requirements for V2:

- Unified experience across all regulatory modules
- Role-based UI personalization
- Multi-agency support (FDA, EMA, PMDA, Health Canada, etc.)
- Consistent design system
- Accessibility compliance (WCAG 2.1 AA)
- AI assistant integration

## Decision

**We will build Client Portal V2 as a policy-driven, component-based architecture with a centralized type system and context providers.**

### Core Architecture:

```
client/src/portal-v2/
├── core/
│   ├── portalTypes.ts      # Comprehensive TypeScript types
│   ├── portalPolicy.ts     # Role-based policy engine
│   └── portalContext.tsx   # React context provider
├── layouts/
│   ├── PortalFrame.tsx     # Main layout wrapper
│   ├── TopBar.tsx          # Header with search, notifications
│   └── SidebarNav.tsx      # Collapsible navigation
└── components/
    └── client-portal/
        ├── index.tsx       # Entry point
        ├── Dashboard.tsx   # Role-aware dashboard
        └── widgets/        # Reusable dashboard widgets
```

### Type System:

```typescript
// 10 User Roles
type UserRole =
  | 'admin'
  | 'regulatory_lead'
  | 'clinical_ops'
  | 'medical_writer'
  | 'biostatistician'
  | 'quality_assurance'
  | 'legal_counsel'
  | 'executive'
  | 'viewer'
  | 'external_partner';

// 9 Regulatory Agencies
type RegulatoryAgency =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'Health_Canada'
  | 'TGA'
  | 'MHRA'
  | 'NMPA'
  | 'ANVISA'
  | 'COFEPRIS';

// 8 Product Types
type ProductType =
  | 'drug'
  | 'biologic'
  | 'medical_device'
  | 'ivd'
  | 'cell_therapy'
  | 'gene_therapy'
  | 'vaccine'
  | 'combination_product';

// 14 Module IDs
type ModuleId =
  | 'dashboard'
  | 'vault'
  | 'ind_wizard'
  | 'cer_generator'
  | '510k_builder'
  | 'ectd_coauthor'
  | 'regulatory_intel'
  | 'cmc_platform'
  | 'clinical_trial'
  | 'safety_reporting'
  | 'quality_management'
  | 'document_control'
  | 'training'
  | 'settings';
```

### Policy Engine:

```typescript
// Centralized permission management
function getExperienceConfig(role: UserRole, agencies: RegulatoryAgency[]): ExperienceConfig {
  return {
    modules: getAccessibleModules(role),
    defaultDashboard: getDefaultDashboard(role),
    features: getEnabledFeatures(role, agencies),
    branding: getBrandingConfig(role),
  };
}
```

## Consequences

### Positive

- **Single Source of Truth**: One portal implementation
- **Type Safety**: Comprehensive TypeScript coverage
- **Role Personalization**: Users see only relevant content
- **Maintainability**: Centralized policy reduces code duplication
- **Testability**: Policy engine can be unit tested independently
- **Accessibility**: Built-in from the start

### Negative

- **Migration Effort**: Must consolidate 4 existing implementations
- **Learning Curve**: Team must understand policy-driven architecture
- **Complexity**: More abstraction than simple components

### Neutral

- Existing premium features will be migrated
- AI assistant will be integrated via LUMEN CORTEX
- Requires documentation for policy configuration

## Alternatives Considered

### Option A: Incremental Refactoring

**Description:** Gradually improve existing portal implementations

**Pros:**

- Lower risk
- No big bang migration
- Continuous delivery

**Cons:**

- Never achieves unification
- Tech debt accumulates
- Inconsistent experience persists

**Why not chosen:** Does not solve fundamental architecture issues.

### Option B: Third-Party Portal Framework

**Description:** Use Retool, Appsmith, or similar low-code platform

**Pros:**

- Rapid development
- Built-in components
- Admin tooling

**Cons:**

- Limited customization
- Vendor dependency
- May not meet regulatory requirements
- Performance concerns

**Why not chosen:** Regulatory compliance requirements demand full control.

### Option C: Micro-Frontend Architecture

**Description:** Separate each module as independent micro-frontend

**Pros:**

- Team autonomy
- Independent deployment
- Technology flexibility

**Cons:**

- Extreme complexity
- Integration challenges
- Inconsistent UX risk
- Performance overhead

**Why not chosen:** Over-engineering for current scale.

## Implementation Notes

### Phase 1: Foundation (Week 1-2)

- [ ] Set up portal-v2 directory structure
- [ ] Implement core type system
- [ ] Build policy engine
- [ ] Create layout components

### Phase 2: Core Features (Week 3-4)

- [ ] Dashboard with role-aware widgets
- [ ] Navigation with permission filtering
- [ ] Search functionality
- [ ] Notification system

### Phase 3: Module Integration (Week 5-6)

- [ ] Wire existing modules to V2 routes
- [ ] Implement module-specific dashboards
- [ ] Add AI assistant panel

### Phase 4: Migration (Week 7-8)

- [ ] Feature flag rollout
- [ ] User acceptance testing
- [ ] Deprecate legacy portals
- [ ] Documentation update

## Related Decisions

- ADR-0002 - Multi-tenant architecture (portal respects tenant boundaries)
- ADR-0004 - LUMEN CORTEX (AI assistant integration)

## References

- [React Context API](https://react.dev/reference/react/createContext)
- [Policy-Based Design](https://www.oreilly.com/library/view/software-architecture-patterns/9781491971437/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## Revision History

| Date       | Author        | Description      |
| ---------- | ------------- | ---------------- |
| 2026-01-25 | Frontend Team | Initial proposal |
