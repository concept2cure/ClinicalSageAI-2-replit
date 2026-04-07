import axios from 'axios';
import { getAuthToken, clearAuthToken } from './authToken';

/**
 * Axios instance configured with authentication token for secure API calls
 * Used by the ValidatorRunner component to communicate with the backend validation service
 */
const axiosWithToken = axios.create({
  baseURL: '', // Empty baseURL to use relative URLs
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the token to every request
axiosWithToken.interceptors.request.use(
  config => {
    const token = getAuthToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
axiosWithToken.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response.status === 401) {
        // Unauthorized - token is invalid or expired
        console.log('Unauthorized access, redirecting to login');
        // Optional: redirect to login page or refresh token
        clearAuthToken();
        window.location.href = '/concept2cure/login';
      }

      if (error.response.status === 403) {
        // Forbidden - user doesn't have permission
        console.log('Forbidden access');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.log('Network error, no response received');
    } else {
      // Something else triggered an error
      console.log('Error', error.message);
    }

    return Promise.reject(error);
  }
);

export default axiosWithToken;
