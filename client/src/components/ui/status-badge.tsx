import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'Processing' | 'Processed' | 'Failed';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusStyles = {
    Processed: 'bg-green-100 text-green-800',
    Processing: 'bg-amber-100 text-amber-800',
    Failed: 'bg-red-100 text-red-800',
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
