import React, { useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * NavigationBlocker Component
 *
 * Prevents accidental navigation away from the page during critical operations
 * by intercepting browser navigation events and showing a confirmation dialog.
 *
 * @param {Object} props
 * @param {boolean} props.isBlocking - Whether to block navigation
 * @param {string} props.message - Optional custom message to display
 * @returns {null} Component doesn't render any UI
 */
const NavigationBlocker = ({
  isBlocking = false,
  message = 'Changes you made may not be saved. Are you sure you want to leave?',
}) => {
  const blockingRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    blockingRef.current = isBlocking;

    // Handle before unload event to prevent leaving page
    const handleBeforeUnload = e => {
      if (blockingRef.current) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    // For single-page app navigation
    const handlePopState = () => {
      if (blockingRef.current) {
        // Show a toast notification instead of a native dialog
        toast({
          title: 'Navigation Blocked',
          description: 'Please complete the current operation before navigating away',
          variant: 'destructive',
        });

        // Prevent navigation by pushing current state back
        window.history.pushState(null, '', window.location.pathname);
        return false;
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Intercepting initial navigation attempt
    if (isBlocking) {
      window.history.pushState(null, '', window.location.pathname);
    }

    // Clean up
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isBlocking, message, toast]);

  return null;
};

export default NavigationBlocker;
