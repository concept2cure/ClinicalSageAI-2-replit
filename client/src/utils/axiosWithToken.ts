import axios from 'axios';
import { getAuthToken } from '@/utils/authToken';

// Create an instance of axios with default headers
const axiosWithToken = axios.create();

// Add a request interceptor to add Authorization header
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

export default axiosWithToken;
