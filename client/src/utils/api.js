import axios from 'axios';
import { getAuthToken, clearAuthToken } from './authToken';

/**
 * Pre-configured axios instance for API requests
 * - Automatically includes authentication token if present
 * - Handles common error scenarios
 */

const baseURL = '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token from session storage to requests if available
api.interceptors.request.use(config => {
  const token = getAuthToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Handle common API error scenarios
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      // Handle authentication errors
      if (error.response.status === 401) {
        // If token is invalid or expired, clear it
        clearAuthToken();

        // Only redirect to login if not already on the login page
        if (window.location.pathname !== '/auth') {
          window.location.href = '/concept2cure/login';
        }
      }

      // Server returned an error response
      console.error('API Error:', error.response.data);
    } else if (error.request) {
      // Request was made but no response was received
      console.error('Network Error:', error.request);
    } else {
      // Something else caused the error
      console.error('Request Error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
