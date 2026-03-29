import axios from 'axios';

// Create an instance of axios with default headers
const axiosWithToken = axios.create();

// Add a request interceptor to add Authorization header
axiosWithToken.interceptors.request.use(
  config => {
    // Check for token in localStorage
    const token = localStorage.getItem('auth_token');

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default axiosWithToken;
