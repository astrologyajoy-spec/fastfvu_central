// Base backend configuration - defaults to relative path for Vercel Serverless / Same-Origin
export const BACKEND_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

// Specific API routes
export const AUTH_GOOGLE_URL = `${BACKEND_URL}/api/auth/google`;
export const AUTH_REGISTER_URL = `${BACKEND_URL}/api/auth/register`;
export const FVU_VALIDATE_URL = `${BACKEND_URL}/api/fvu/validate`;
export const FVU_GENERATE_URL = `${BACKEND_URL}/api/v1/fvu/generate`;
export const FVU_LOGS_URL = `${BACKEND_URL}/api/fvu/logs`;
