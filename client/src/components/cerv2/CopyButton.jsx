/**
 * CopyButton Component
 * 
 * Button that copies text to clipboard with visual feedback
 */

import { Copy, Check } from 'lucide-react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

export function CopyButton({ text, label }) {
  const { copy, copied, error } = useCopyToClipboard();

  const handleClick = async () => {
    await copy(text);
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
      title={label || 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
