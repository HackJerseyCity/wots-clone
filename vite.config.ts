import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server runs on 5173 with HMR. Anything the React SPA doesn't own —
// the API, static assets served by Fastify, and the legacy Eta routes that
// haven't been ported yet — is proxied to the Fastify server on 3000 so
// developers only need to visit one origin.
const API_TARGET = 'http://localhost:3000';
const LEGACY_ROUTES = ['/api', '/img', '/data', '/report', '/new'];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      LEGACY_ROUTES.map((p) => [p, { target: API_TARGET, changeOrigin: true }])
    ),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
