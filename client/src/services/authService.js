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
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  },

  getToken() {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('auth_token')
    );
  },

  setToken(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('authToken', token);
    localStorage.setItem('auth_token', token);
    // Persist organizationId from user payload for API headers
    if (user?.organizationId) {
      localStorage.setItem('organizationId', String(user.organizationId));
      localStorage.setItem('currentOrganizationId', String(user.organizationId));
    }
  },

  clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth_token');
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
