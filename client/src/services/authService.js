import { clearAuthToken, getAuthToken, setAuthToken } from '../utils/authToken';

export const authService = {
  async login(credentials) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.error || 'Login failed');
    }

    return response.json();
  },

  async logout() {
    clearAuthToken();
    window.location.href = '/login';
  },

  getToken() {
    return getAuthToken();
  },

  setToken(token, user) {
    setAuthToken(token);
    // Persist organizationId from user payload for API headers
    if (user?.organizationId) {
      localStorage.setItem('organizationId', String(user.organizationId));
      localStorage.setItem('currentOrganizationId', String(user.organizationId));
    }
    // Persist email for silent token refresh
    if (user?.email) {
      localStorage.setItem('userEmail', user.email);
    }
  },

  clearToken() {
    clearAuthToken();
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async verifyToken() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
