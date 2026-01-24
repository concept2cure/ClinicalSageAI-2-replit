import { useState, useEffect } from 'react';

/**
 * A custom hook that tracks window dimensions
 * @returns {{ width: number, height: number }} Current window dimensions
 */
export default function useWindowSize() {
  // Initialize with reasonable defaults for SSR
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    // Only execute this on the client
    if (typeof window === 'undefined') return;

    // Handler to call on window resize
    function handleResize() {
      // Set window dimensions in state
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty array ensures effect runs only on mount and unmount

  return windowSize;
}
