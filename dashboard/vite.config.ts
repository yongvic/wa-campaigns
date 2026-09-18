import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version: pkgVersion } = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkgVersion),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
