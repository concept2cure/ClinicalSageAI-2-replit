import React, { useState, useEffect } from 'react';
import { AlertTriangle, Info, XCircle, CheckCircle, X } from 'lucide-react';

/**
 * GuidanceTooltip - Displays AI-powered guidance when documents are dropped into modules
 *
 * Shows rule violations, missing dependencies, and intelligent suggestions
 * based on document placement within the eCTD structure
 */
const GuidanceTooltip = ({
  isOpen,
  onClose,
  guidance = [],
  position = { top: 0, left: 0 },
  documentTitle = '',
  moduleId = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  const getSeverityIcon = severity => {
    switch (severity) {
      case 'error':
        return <XCircle size={16} className="text-red-500" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-amber-500" />;
      case 'info':
        return <Info size={16} className="text-blue-500" />;
      default:
        return <Info size={16} className="text-gray-500" />;
    }
  };

  const getOverallStatusIcon = () => {
    if (guidance.some(g => g.severity === 'error')) {
      return <XCircle size={20} className="text-red-500" />;
    } else if (guidance.some(g => g.severity === 'warning')) {
      return <AlertTriangle size={20} className="text-amber-500" />;
    } else {
      return <CheckCircle size={20} className="text-emerald-500" />;
    }
  };

  return (
    <div
      className={`fixed z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxWidth: '350px',
      }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
          <div className="flex items-center gap-2">
            {getOverallStatusIcon()}
            <span className="font-medium">Placement Guidance</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3">
          <div className="mb-3">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Document</div>
            <div className="font-medium">{documentTitle}</div>
          </div>

          <div className="mb-3">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Target Module</div>
            <div className="font-medium">{moduleId}</div>
          </div>

          {guidance.length === 0 ? (
            <div className="py-2 text-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="inline mr-1" size={16} />
              Placement looks good!
            </div>
          ) : (
            <div className="space-y-3">
              {guidance.map((item, index) => (
                <div key={index} className="text-sm">
                  <div className="flex items-start gap-2 mb-1">
                    {getSeverityIcon(item.severity)}
                    <div className="font-medium">{item.message}</div>
                  </div>
                  <div className="ml-6 text-gray-600 dark:text-gray-400">{item.suggestion}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 text-xs text-gray-500 dark:text-gray-400">
          <div>AI-powered guidance based on FDA eCTD guidelines</div>
        </div>
      </div>
    </div>
  );
};

export default GuidanceTooltip;
