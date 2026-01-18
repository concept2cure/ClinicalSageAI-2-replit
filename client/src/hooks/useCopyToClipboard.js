/**
 * Copy-to-clipboard hook with toast feedback
 */

import { useState } from 'react';

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const copy = async (text) => {
    if (!navigator.clipboard) {
      setError('Clipboard API not available');
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);
      
      // Reset copied state after 1.5 seconds
      setTimeout(() => setCopied(false), 1500);
      
      return true;
    } catch (err) {
      setError(err.message);
      setCopied(false);
      return false;
    }
  };

  return { copy, copied, error };
}
