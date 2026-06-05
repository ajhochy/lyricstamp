import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
      },
      outDir: 'out/main',
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'client'),
    publicDir: path.resolve(__dirname, 'client/public'),
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: path.resolve(__dirname, 'client/index.html'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': { target: 'http://localhost:7878', changeOrigin: true },
        '/live': { target: 'http://localhost:7878', changeOrigin: true, ws: true },
      },
    },
  },
});
