// Constants that can be safely exposed in the browser
// These values would typically come from environment variables at build time

// API Base URL for frontend to backend communication
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

