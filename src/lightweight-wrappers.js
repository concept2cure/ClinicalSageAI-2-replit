// Simple wrapper for toast functionality to unify toast interfaces
import { useToast as useShadcnToast } from '@/hooks/use-toast';

// Create a singleton toast object that can be imported without hooks
let toastFn;

// Initialize the toast function
const initializeToast = () => {
  const { toast: shadcnToast } = useShadcnToast();
  toastFn = shadcnToast;
};

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

  promise: (promise, messages) => {
    if (!toastFn) {
      console.error('Toast not initialized');
      return promise;
    }

    toastFn({
      title: 'Loading',
      description: messages.loading,
    });

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

export const useToast = () => {
  const shadcnToast = useShadcnToast();

  if (!toastFn) {
    toastFn = shadcnToast.toast;
  }

  return {
    toast: toastFn,
  };
};

export const Sparklines = ({ children, data }) => {
  return children || null;
};

export const SparklinesLine = ({ color = '#000', dataKey = 'value' }) => {
  return null;
};
