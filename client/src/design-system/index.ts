/**
 * Concept2Cure Design System - Enterprise Excellence
 *
 * A thoughtfully crafted design system inspired by Claude.AI and Gemini,
 * delivering elegant, accessible, and performant user experiences.
 *
 * Design Principles:
 * 1. Clarity - Information hierarchy through typography and spacing
 * 2. Calm - Muted, professional palette with purposeful accent colors
 * 3. Confidence - Consistent patterns that build user trust
 * 4. Conversation - Interfaces that feel like a dialogue
 *
 * @version 3.1.0
 * @author Concept2Cure Engineering
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './tokens';

// NOTE: ./theme, ./primitives/*, ./components/* were removed in v3.1.0.
// The canonical UI primitives live in @/components/ui/ (shadcn/Radix).
// Do NOT recreate design-system/primitives or design-system/components —
// use the mapped shadcn components listed in figma.connect.ts instead.

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERNS (compound, domain-specific components)
// ═══════════════════════════════════════════════════════════════════════════════

export * from './patterns/ConversationBubble';
export * from './patterns/MetricCard';
export * from './patterns/ActionBar';
export * from './patterns/EmptyState';

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './motion';
