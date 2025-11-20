import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

const Progress = React.forwardRef(
  ({ className, value, max = 100, variant = 'primary', indicatorClassName }, ref) => {
    const percentage = value !== null ? Math.min(Math.max(0, value), max) : 0;
    const calculatedValue = (percentage / max) * 100;

    const getVariantClass = () => {
      // If indicatorClassName is provided, use it instead of variant
      if (indicatorClassName) {
        return indicatorClassName;
      }

      switch (variant) {
        case 'success':
          return 'bg-green-600';
        case 'warning':
          return 'bg-yellow-500';
        case 'error':
          return 'bg-red-500';
        case 'primary':
        default:
          return 'bg-primary';
      }
    };

    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        value={value}
        max={max}
      >
        <ProgressPrimitive.Indicator
          className={cn('h-full w-full flex-1 transition-all', getVariantClass())}
          style={{ transform: `translateX(-${100 - calculatedValue}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  }
);

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
