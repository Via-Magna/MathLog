import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
// Handwriting font for inline answers, bundled by Vite so it works offline.
import '@fontsource/caveat/latin-500.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
