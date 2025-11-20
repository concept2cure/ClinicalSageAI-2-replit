import { useEffect } from 'react';

/**
 * useTitle hook - Sets the document title with an optional suffix
 * @param title - The title to set
 */
export function useTitle(title: string) {
  useEffect(() => {
    // Keep original title to restore on cleanup
    const originalTitle = document.title;

    // Set the new title
    document.title = title;

    // Restore the original title on cleanup
    return () => {
      document.title = originalTitle;
    };
  }, [title]);
}

export default useTitle;
