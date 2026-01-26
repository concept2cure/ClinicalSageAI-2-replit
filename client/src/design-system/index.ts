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
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './tokens';
export * from './theme';

// ═══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

export * from './primitives/Text';
export * from './primitives/Surface';
export * from './primitives/Icon';
export * from './primitives/Spacer';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './components/Button';
export * from './components/Card';
export * from './components/Input';
export * from './components/Avatar';
export * from './components/Badge';
export * from './components/Tooltip';

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './patterns/ConversationBubble';
export * from './patterns/MetricCard';
export * from './patterns/ActionBar';
export * from './patterns/EmptyState';

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './motion';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export * from './hooks/useReducedMotion';
export * from './hooks/useTheme';
