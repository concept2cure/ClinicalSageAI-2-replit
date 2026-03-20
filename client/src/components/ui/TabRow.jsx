import React from 'react';
import { TabsList } from '@/components/ui/tabs';

/**
 * TabRow Component
 *
 * Creates a horizontally scrollable container for tabs that prevents wrapping
 * and overlapping even on small screens.
 *
 * Wraps children in a proper TabsList from shadcn/ui to provide
 * the required RovingFocusGroup context.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Tab triggers to display in the row
 * @param {string} props.label - Optional label to display before tabs
 * @param {string} props.className - Additional CSS classes
 */
export default function TabRow({ children, label, className = '' }) {
  return (
    <div
      className={`overflow-x-auto whitespace-nowrap bg-white border-b border-[#e8e6dc] py-2 ${className}`}
    >
      <div className="flex items-center px-6">
        {label && (
          <div className="flex items-center mr-4 flex-shrink-0">
            <span className="text-xs font-medium text-[#6b6963]">{label}</span>
          </div>
        )}
        <TabsList className="inline-flex items-center h-auto bg-transparent p-0 space-x-0">
          {React.Children.map(children, child =>
            child
              ? React.cloneElement(child, {
                  className: `${child.props.className || ''} flex-shrink-0 mx-1`,
                })
              : null
          )}
        </TabsList>
      </div>
    </div>
  );
}
