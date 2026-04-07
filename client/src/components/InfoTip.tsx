import React, { useState } from 'react';

export default function InfoTip({
  children,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  'aria-label': string;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        className="w-4 h-4 rounded-full bg-slate-300 text-xs flex items-center justify-center hover:bg-slate-400 transition-colors"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        aria-label={ariaLabel}
      >
        ?
      </button>

      {showTip && (
        <div className="absolute z-50 left-0 top-6 w-64 p-3 bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
