import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// Using a fallback string if env variable is not set
const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '517384935957-14rlq2ost4h9hmnv0l1ftm36lj434947.apps.googleusercontent.com';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
