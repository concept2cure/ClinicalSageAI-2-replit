import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Simple Rich Text Editor Component
 *
 * This is a basic rich text editor component that can be used for editing and
 * displaying formatted text content. For a real implementation, consider using
 * a more robust library like TipTap, ProseMirror, or Slate.
 */
export const Editor = ({
  value = '',
  onChange,
  placeholder = 'Write something...',
  className = '',
  readOnly = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  // Initialize editor
  useEffect(() => {
    // In a real implementation, we would initialize a rich text editor here
  }, []);

  // Handle content changes
  const handleInput = e => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  return (
    <div className={cn('w-full h-full flex flex-col relative', className)}>
      <textarea
        value={value}
        onChange={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn(
          'flex flex-1 w-full h-full min-h-[200px] p-3 rounded-md text-sm resize-none outline-none border-0',
          'bg-transparent focus:ring-0',
          isFocused ? 'bg-muted/40' : '',
          readOnly ? 'cursor-default' : ''
        )}
      />
    </div>
  );
};

export default Editor;
