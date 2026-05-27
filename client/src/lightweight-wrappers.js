// Simple wrapper for toast functionality to unify toast interfaces
import { useToast as useShadcnToast } from '@/hooks/use-toast';

// Create a singleton toast object that can be imported without hooks
let toastFn;

// Exposed toast API
export const toast = {
  // Standard toast methods
  success: message => {
    if (!toastFn) return console.error('Toast not initialized');
    toastFn({
      title: 'Success',
      description: message,
      variant: 'success',
    });
  },

  error: message => {
    if (!toastFn) return console.error('Toast not initialized');
    toastFn({
      title: 'Error',
      description: message,
      variant: 'destructive',
    });
  },

  info: message => {
    if (!toastFn) return console.error('Toast not initialized');
    toastFn({
      title: 'Info',
      description: message,
    });
  },

  // Promise-based toast
  promise: (promise, messages) => {
    if (!toastFn) {
      console.error('Toast not initialized');
      return promise;
    }

    // Show loading message
    toastFn({
      title: 'Loading',
      description: messages.loading,
    });

    // Handle promise resolution
    return promise
      .then(data => {
        toastFn({
          title: 'Success',
          description:
            typeof messages.success === 'function' ? messages.success(data) : messages.success,
          variant: 'success',
        });
        return data;
      })
      .catch(error => {
        toastFn({
          title: 'Error',
          description:
            typeof messages.error === 'function'
              ? messages.error(error)
              : messages.error || error.message,
          variant: 'destructive',
        });
        throw error;
      });
  },
};

// Hook to initialize toast in components
export const useToast = () => {
  const shadcnToast = useShadcnToast();

  // Initialize toast if not already done
  if (!toastFn) {
    toastFn = shadcnToast.toast;
  }

  return {
    toast: toastFn,
  };
};
