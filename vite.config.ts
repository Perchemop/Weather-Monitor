import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // The static (serverless) build targets GitHub Pages and runs entirely in the
  // browser. It is emitted to a separate output directory so it never clobbers
  // the server-hosted `dist/` bundle, and it honours a configurable base path
  // (e.g. '/Weather-Monitor/' when served from a project subpath).
  const isStatic = process.env.VITE_APP_MODE === 'static';
  const base = process.env.VITE_BASE || '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: isStatic ? 'dist-static' : 'dist',
      // Match the TS/browser target we actually support.
      target: 'es2022',
      // Skip the (unused) gzip/brotli size report to keep builds fast.
      reportCompressedSize: false,
      // Split large third-party libraries into their own long-cached chunks so a
      // code change doesn't invalidate the React runtime, and recharts only
      // loads with the chart views.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'react';
            return 'vendor';
          }
        }
      },
      chunkSizeWarningLimit: 900
    }
  };
});
