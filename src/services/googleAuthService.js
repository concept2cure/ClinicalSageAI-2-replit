/**
 * Google Authentication Service
 * Handles Google OAuth integration for eCTD Co-Author
 */

let isAuthenticated = false;
let userInfo = null;

export const signIn = async () => {
  try {
    // In a real implementation, this would integrate with Google OAuth
    isAuthenticated = true;
    userInfo = {
      email: 'user@example.com',
      name: 'Demo User',
    };
    return { success: true, user: userInfo };
  } catch (error) {
    console.error('Google sign-in error:', error);
    return { success: false, error: error.message };
  }
};

export const signOut = async () => {
  try {
    isAuthenticated = false;
    userInfo = null;
    return { success: true };
  } catch (error) {
    console.error('Google sign-out error:', error);
    return { success: false, error: error.message };
  }
};

export const isGoogleAuthenticated = () => {
  return isAuthenticated;
};

export const getCurrentUser = () => {
  return userInfo;
};

export const getAuthStatus = () => {
  return {
    authenticated: isAuthenticated,
    user: userInfo,
  };
};
// Alias exports for compatibility
export const signInWithGoogle = signIn;
export const signOutFromGoogle = signOut;