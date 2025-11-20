/**
 * Safe Navigation Utilities
 * Provides error-resistant navigation and button click handlers
 */

export const safeNavigate = (setLocation, path, fallbackPath = '/client-portal') => {
  return () => {
    try {
      setLocation(path);
    } catch (error) {
      console.error('Navigation error:', error);
      try {
        window.location.href = path;
      } catch (fallbackError) {
        console.error('Fallback navigation error:', fallbackError);
        window.location.href = fallbackPath;
      }
    }
  };
};

export const safeClick = (handler, fallbackHandler = null) => {
  return event => {
    try {
      if (handler) {
        handler(event);
      }
    } catch (error) {
      console.error('Click handler error:', error);
      if (fallbackHandler) {
        try {
          fallbackHandler(event);
        } catch (fallbackError) {
          console.error('Fallback click handler error:', fallbackError);
        }
      }
    }
  };
};

export const safeHistoryNavigation = (direction = 'back', fallbackPath = '/client-portal') => {
  return () => {
    try {
      if (direction === 'back') {
        window.history.back();
      } else if (direction === 'forward') {
        window.history.forward();
      }
    } catch (error) {
      console.error(`History ${direction} navigation error:`, error);
      window.location.href = fallbackPath;
    }
  };
};

export const safeAsyncClick = (asyncHandler, fallbackHandler = null) => {
  return async event => {
    try {
      if (asyncHandler) {
        await asyncHandler(event);
      }
    } catch (error) {
      console.error('Async click handler error:', error);
      if (fallbackHandler) {
        try {
          await fallbackHandler(event);
        } catch (fallbackError) {
          console.error('Fallback async click handler error:', fallbackError);
        }
      }
    }
  };
};

export const safeFormSubmit = (submitHandler, fallbackHandler = null) => {
  return async formData => {
    try {
      if (submitHandler) {
        return await submitHandler(formData);
      }
    } catch (error) {
      console.error('Form submit error:', error);
      if (fallbackHandler) {
        try {
          return await fallbackHandler(formData);
        } catch (fallbackError) {
          console.error('Fallback form submit error:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  };
};
