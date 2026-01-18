import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * LoadingState Component
 * 
 * Displays loading states with spinner and optional message.
 * Includes skeleton loaders for list and card views.
 * 
 * Props:
 * - message: string (default: "Loading...")
 * - variant: 'spinner' | 'skeleton-list' | 'skeleton-card' | 'skeleton-table'
 * - count: number (for skeleton variants, default: 3)
 */

export default function LoadingState({ 
  message = "Loading...", 
  variant = 'spinner',
  count = 3,
}) {
  if (variant === 'spinner') {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    );
  }

  if (variant === 'skeleton-list') {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-200" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'skeleton-card') {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-2/3 mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 rounded w-full" />
              <div className="h-4 bg-slate-100 rounded w-5/6" />
              <div className="h-4 bg-slate-100 rounded w-4/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'skeleton-table') {
    return (
      <div className="space-y-2 py-4">
        {/* Header */}
        <div className="flex gap-4 pb-3 border-b border-slate-200 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-4 bg-slate-200 rounded w-1/6" />
          <div className="h-4 bg-slate-200 rounded w-1/3" />
          <div className="h-4 bg-slate-200 rounded w-1/6" />
        </div>
        {/* Rows */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-slate-100 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-1/4" />
            <div className="h-4 bg-slate-100 rounded w-1/6" />
            <div className="h-4 bg-slate-100 rounded w-1/3" />
            <div className="h-4 bg-slate-100 rounded w-1/6" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// Preset variants for common use cases
export function SpinnerLoader({ message }) {
  return <LoadingState variant="spinner" message={message} />;
}

export function SkeletonList({ count = 5 }) {
  return <LoadingState variant="skeleton-list" count={count} />;
}

export function SkeletonCards({ count = 6 }) {
  return <LoadingState variant="skeleton-card" count={count} />;
}

export function SkeletonTable({ count = 8 }) {
  return <LoadingState variant="skeleton-table" count={count} />;
}
