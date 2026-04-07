import React from 'react';

export function AsyncBlock({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error?: string;
  children: any;
}) {
  if (loading) return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  if (error)
    return (
      <div className="p-3 rounded border border-red-300 text-red-700 bg-red-50 text-sm">
        {error}
      </div>
    );
  return children;
}
