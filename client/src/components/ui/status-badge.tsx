import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'Processing' | 'Processed' | 'Failed';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusStyles = {
    Processed: 'bg-stone-100 text-stone-800',
    Processing: 'bg-stone-100 text-stone-800',
    Failed: 'bg-stone-100 text-stone-800',
  };

  return (
    <span
      className={cn(
        'px-2 inline-flex text-xs leading-5 font-semibold rounded-full py-1',
        statusStyles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
