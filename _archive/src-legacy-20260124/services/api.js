import axios from 'axios';

// Create a configured axios instance
const api = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor for handling authentication tokens if needed
api.interceptors.request.use(
  config => {
    // You can add auth tokens here if needed
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for common error handling
api.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    // Handle common errors here
    if (error.response) {
      // Server responded with a status code outside the 2xx range
      console.error('API Error:', error.response.status, error.response.data);

      // Handle specific status codes
      if (error.response.status === 401) {
        // Unauthorized - could redirect to login page
        console.warn('Authentication required');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API No Response:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('API Request Error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
