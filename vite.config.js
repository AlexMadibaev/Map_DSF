import { defineConfig } from 'vite';

export default defineConfig({
  // Большой GLB хранится один раз в корне проекта и отдаётся dev-сервером Vite.
  publicDir: false,
  build: {
    chunkSizeWarningLimit: 650,
  },
});
