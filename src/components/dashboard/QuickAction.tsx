import React, { ReactNode } from 'react';

interface QuickActionProps {
  title: string;
  description: string;
  icon: ReactNode;
  buttonText: string;
  onClick: () => void;
  buttonClassName?: string;
}

export function QuickAction({
  title,
  description,
  icon,
  buttonText,
  onClick,
  buttonClassName = 'bg-primary hover:bg-primary-dark focus:ring-primary',
}: QuickActionProps) {
  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
      <h3 className="text-lg font-medium text-slate-800 mb-4">{title}</h3>
      <p className="text-sm text-slate-600 mb-4">{description}</p>
      <button
        onClick={onClick}
        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${buttonClassName} focus:outline-none focus:ring-2 focus:ring-offset-2`}
      >
        {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5 mr-2' })}
        {buttonText}
      </button>
    </div>
  );
}
