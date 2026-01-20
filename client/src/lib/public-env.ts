// Constants that can be safely exposed in the browser.
// These values should be provided at build time via Vite environment variables.

// API Base URL for frontend to backend communication
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

