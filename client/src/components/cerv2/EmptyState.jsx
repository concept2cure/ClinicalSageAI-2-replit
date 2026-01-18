/**
 * EmptyState Component
 * 
 * Clean empty state with single next action
 */

import { FileX, Download, Upload, FileText } from 'lucide-react';

const icons = {
  exports: Download,
  evidence: Upload,
  audit: FileText,
  generic: FileX,
};

export function EmptyState({ type = 'generic', title, description, action }) {
  const Icon = icons[type] || icons.generic;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-gray-600 mb-6 max-w-md">
          {description}
        </p>
      )}
      
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
}
