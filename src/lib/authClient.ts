/**
 * Authentication API Client
 * 
 * Provides methods to interact with the authentication API endpoints.
 */

const API_BASE_URL = '/api/auth';

interface RegisterData {
  email: string;
  username: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface AuthResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    username: string;
  };
  message?: string;
}

interface UserProfile {
  id: string;
  email: string;
  username: string;
  created_at: string;
  is_active: boolean;
  email_verified: boolean;
}

/**
 * Store tokens in localStorage
 */
function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

/**
 * Get access token from localStorage
 */
export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

/**
 * Get refresh token from localStorage
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

/**
 * Clear tokens from localStorage
 */
function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

/**
 * Register a new user
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Registration failed');
  }

  return result;
}

/**
 * Login user
 */
export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Login failed');
  }

  // Store tokens
  if (result.accessToken && result.refreshToken) {
    setTokens(result.accessToken, result.refreshToken);
  }

  return result;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
  }

  clearTokens();
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      clearTokens();
      return null;
    }

    // Store new tokens
    if (result.accessToken && result.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
      return result.accessToken;
    }

    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearTokens();
    return null;
  }
}

/**
 * Request password reset
 */
export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Password reset request failed');
  }

  return result;
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, newPassword }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Password reset failed');
  }

  return result;
}

/**
 * Get current user profile
 */
export async function getProfile(): Promise<UserProfile> {
  const accessToken = getAccessToken();
  
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}/profile`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const result = await response.json();
  
  if (!response.ok) {
    // Try to refresh token if unauthorized
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry with new token
        return getProfile();
      }
    }
    throw new Error(result.message || 'Failed to get profile');
  }

  return result.user;
}

/**
 * Make an authenticated API request with automatic token refresh
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = getAccessToken();
  
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  // Add authorization header
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`,
  };

  let response = await fetch(url, { ...options, headers });

  // If unauthorized, try refreshing token
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    
    if (newToken) {
      // Retry with new token
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    }
  }

  return response;
}

export default {
  register,
  login,
  logout,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  getProfile,
  getAccessToken,
  getRefreshToken,
  authenticatedFetch,
};
