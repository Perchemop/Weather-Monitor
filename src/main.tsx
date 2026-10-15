import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import { STATIC_MODE, BASE_PATH } from './static/mode.ts';
import './index.css';

async function boot() {
  // In the static (GitHub Pages) build there is no backend: install the
  // in-browser API backend before first render so the app's initial API calls
  // resolve against local data + Open-Meteo.
  if (STATIC_MODE) {
    const { installStaticBackend } = await import('./static/install.ts');
    await installStaticBackend();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </StrictMode>
  );

  // Register the offline service worker in production builds only. In dev, Vite
  // serves unbundled modules and a caching SW would interfere with HMR. The
  // path honours the configured base so the SW also works under a subpath
  // (e.g. GitHub Pages `/<repo>/`).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      // BASE_PATH always ends with '/', so this yields '/sw.js' or '/<repo>/sw.js'.
      const swUrl = `${BASE_PATH}sw.js`;
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
    });
  }
}

void boot();
