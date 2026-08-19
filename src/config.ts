// Base backend configuration for Render backend & API services
export const BACKEND_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'https://fastfvu.onrender.com';

// Specific endpoints
export const AUTH_GOOGLE_URL = `${BACKEND_URL}/api/auth/google`;
export const AUTH_REGISTER_URL = `${BACKEND_URL}/api/auth/register`;
export const FVU_VALIDATE_URL = `${BACKEND_URL}/api/fvu/validate`;
export const FVU_GENERATE_URL = `${BACKEND_URL}/api/v1/fvu/generate`;
export const FVU_LOGS_URL = `${BACKEND_URL}/api/fvu/logs`;
