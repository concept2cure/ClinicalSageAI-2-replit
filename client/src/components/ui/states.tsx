/**
 * @deprecated Use `@/components/ui/statesV2` instead.
 *
 * This file is preserved only for backwards compatibility.
 * All components are re-exported from statesV2.tsx which is the single
 * canonical source of truth for UI state primitives.
 *
 * New code MUST import directly from `@/components/ui/statesV2`.
 *
 * @version DEPRECATED — replaced by statesV2 v3.0.0
 */

export {
  LoadingState,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  DataStateWrapper,
} from './statesV2';

export { default } from './statesV2';
